import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { MCP_TOOLS, TOOLS_BY_NAME } from '@/server/mcp/tools';
import type { McpIdentity } from '@/server/mcp/auth';
import { can, type AuthContext } from '@/server/auth/context';
import { fmtDate } from '@/lib/date';
import type { DataScope } from '@prisma/client';
import { getActiveCustomTools, executeCustomTool, type CustomAgentTool } from './custom-tools';

const SCOPE_RANK: Record<DataScope, number> = {
  ALL: 4,
  DEPT_TREE: 3,
  DEPT: 2,
  CUSTOM: 2,
  SELF: 1,
};

/** Dựng AuthContext cho nhân sự dựa trên tài khoản user liên kết */
export async function buildAuthContextForEmployee(employeeId: number): Promise<AuthContext | null> {
  const user = await prisma.user.findFirst({
    where: { employeeId, isActive: true },
    include: {
      employee: {
        include: {
          department: { select: { id: true, name: true, path: true } },
          position: { select: { name: true } },
        },
      },
      roles: {
        include: {
          role: {
            include: {
              permissions: { select: { permissionCode: true } },
              deptScopes: { select: { departmentId: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    // Nếu nhân sự chưa có tài khoản User đăng nhập web, tạo context cơ bản quyền SELF
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: { select: { id: true, name: true, path: true } },
        position: { select: { name: true } },
      },
    });
    if (!emp) return null;

    return {
      userId: 0,
      username: emp.code,
      employeeId: emp.id,
      fullName: emp.fullName,
      email: emp.email,
      avatarUrl: emp.avatarUrl,
      departmentId: emp.departmentId,
      departmentName: emp.department?.name ?? null,
      departmentPath: emp.department?.path ?? null,
      positionName: emp.position?.name ?? null,
      managerId: emp.managerId,
      zaloLinked: Boolean(emp.zaloUserId),
      roleCodes: [],
      roleNames: [],
      permissions: new Set(['MENU_TASKS', 'FEATURE_TASK_CREATE', 'MENU_LEAVES', 'FEATURE_LEAVE_REQUEST', 'FEATURE_ATTENDANCE_CHECKIN']),
      dataScope: 'SELF',
      customDeptIds: [],
      isAdmin: false,
    };
  }

  const permissions = new Set<string>();
  const customDeptIds = new Set<number>();
  let dataScope: DataScope = 'SELF';

  for (const { role } of user.roles) {
    role.permissions.forEach((p) => permissions.add(p.permissionCode));
    role.deptScopes.forEach((d) => customDeptIds.add(d.departmentId));
    if (SCOPE_RANK[role.dataScope] > SCOPE_RANK[dataScope]) dataScope = role.dataScope;
  }

  const roleCodes = user.roles.map((r) => r.role.code);

  return {
    userId: user.id,
    username: user.username,
    employeeId: user.employeeId,
    fullName: user.employee.fullName,
    email: user.employee.email,
    avatarUrl: user.employee.avatarUrl,
    departmentId: user.employee.departmentId,
    departmentName: user.employee.department?.name ?? null,
    departmentPath: user.employee.department?.path ?? null,
    positionName: user.employee.position?.name ?? null,
    managerId: user.employee.managerId,
    zaloLinked: Boolean(user.employee.zaloUserId),
    roleCodes,
    roleNames: user.roles.map((r) => r.role.name),
    permissions,
    dataScope,
    customDeptIds: Array.from(customDeptIds),
    isAdmin: roleCodes.includes('ADMIN'),
  };
}

import {
  PROMPT_VARIABLES,
  DEFAULT_SYSTEM_PROMPT,
  PRESET_PROMPT_TEMPLATES,
  renderSystemPrompt,
  type PromptVariable,
  type PromptTemplate,
  type AiAgentTestStep,
  type AiAgentTestResult,
} from '@/lib/ai-prompt';

export {
  PROMPT_VARIABLES,
  DEFAULT_SYSTEM_PROMPT,
  PRESET_PROMPT_TEMPLATES,
  renderSystemPrompt,
  type PromptVariable,
  type PromptTemplate,
  type AiAgentTestStep,
  type AiAgentTestResult,
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Danh sách model dự phòng khi model chính bị 503 (High Demand / Overloaded)
 */
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gọi API LLM thông qua endpoint OpenAI compatibility kèm Exponential Backoff Retry & Model Fallback */
async function callGeminiApi(
  apiKey: string,
  body: Record<string, any>,
  options?: { allowFallback?: boolean },
) {
  const baseUrl =
    (await getSetting<string>('ai.baseUrl', '')) ||
    process.env.AI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai';
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const completionsUrl = cleanBaseUrl.endsWith('/chat/completions')
    ? cleanBaseUrl
    : `${cleanBaseUrl}/chat/completions`;

  const maxRetries = 3;
  let attempt = 0;
  let currentBody = { ...body };
  const originalModel = currentBody.model || 'gemini-1.5-flash';

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(completionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(currentBody),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return await res.json();
      }

      const errorText = await res.text();
      const isRetryable = res.status === 503 || res.status === 429 || res.status === 500;

      if (isRetryable && attempt < maxRetries) {
        attempt++;
        // Exponential backoff: 1s, 2.5s, 4.5s kèm jitter
        const delay = Math.round(1000 * Math.pow(1.8, attempt - 1) + Math.random() * 500);
        console.warn(
          `[LLM API] Gặp lỗi ${res.status} ("${errorText.slice(0, 120)}"). Đang tự động thử lại lần ${attempt}/${maxRetries} sau ${delay}ms...`,
        );
        await sleep(delay);
        continue;
      }

      // Nếu đã thử lại nhiều lần trên model chính mà vẫn bị 503, tự động chuyển sang model fallback
      if (options?.allowFallback !== false && isRetryable && res.status === 503) {
        const nextFallback = FALLBACK_MODELS.find((m) => m !== originalModel);
        if (nextFallback && currentBody.model !== nextFallback) {
          console.warn(
            `[LLM API] Model "${originalModel}" bị quá tải 503 liên tục. Đang tự động fallback sang model "${nextFallback}"...`,
          );
          currentBody = { ...currentBody, model: nextFallback };
          attempt = 0; // reset retry counter cho model fallback
          options = { allowFallback: false }; // chỉ fallback 1 lần duy nhất
          await sleep(1000);
          continue;
        }
      }

      throw new Error(`LLM API error (${res.status}): ${errorText.slice(0, 300)}`);
    } catch (err: any) {
      if (attempt < maxRetries && (err.name === 'TimeoutError' || err.message?.includes('fetch failed'))) {
        attempt++;
        const delay = 1500 * attempt;
        console.warn(`[LLM API Network Error] ${err.message}. Đang thử lại lần ${attempt}/${maxRetries}...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Xử lý tin nhắn tự nhiên từ Zalo bằng Gemini AI Agent kết hợp MCP Tools.
 */
export async function handleZaloAiQuery(employeeId: number, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || (await getSetting<string>('ai.geminiApiKey', ''));
  if (!apiKey) {
    return '⚠️ Chưa cấu hình GEMINI_API_KEY cho hệ thống. Quản trị viên vui lòng cấu hình trong Cài đặt hệ thống hoặc file .env.';
  }

  const selectedModel = (await getSetting<string>('ai.model', '')) || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const configuredTemp = await getSetting<number>('ai.temperature', 0.2);
  const temperature = Math.min(1.0, Math.max(0.0, Number(configuredTemp) || 0.2));
  const configuredMaxIterations = await getSetting<number>('ai.maxIterations', 5);
  const maxIterations = Math.min(10, Math.max(1, Number(configuredMaxIterations) || 5));

  const ctx = await buildAuthContextForEmployee(employeeId);
  if (!ctx) {
    return '❌ Không tìm thấy thông tin nhân sự để xác thực quyền truy cập.';
  }

  const identity: McpIdentity = {
    clientId: 0,
    clientName: 'ZaloBotAgent',
    readOnly: false,
    scopes: [],
    ctx,
  };

  // Lọc danh sách MCP tool theo quyền hạn của nhân sự
  const allowedTools = MCP_TOOLS.filter((t) => !t.permission || can(ctx, t.permission));

  const mcpGeminiTools = allowedTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: `${t.title}: ${t.description}`,
      parameters: t.inputSchema,
    },
  }));

  // Nạp thêm các Custom Tools do người dùng tạo
  const customTools = await getActiveCustomTools();
  const customToolsMap = new Map<string, CustomAgentTool>();
  const customGeminiTools = customTools.map((ct) => {
    customToolsMap.set(ct.name, ct);
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];
    for (const p of ct.parameters) {
      properties[p.name] = {
        type: p.type || 'string',
        description: p.description,
      };
      if (p.required) required.push(p.name);
    }
    return {
      type: 'function' as const,
      function: {
        name: ct.name,
        description: `${ct.title}: ${ct.description}`,
        parameters: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      },
    };
  });

  const tools = [...mcpGeminiTools, ...customGeminiTools];

  // Render System Prompt tùy chỉnh với các biến ngữ cảnh
  const branding = await getAppBranding();
  const customTemplate = await getSetting<string>('ai.systemPrompt', '');
  const allToolNames = tools.map((t) => t.function.name).join(', ');
  const promptVars: Record<string, string> = {
    user_name: ctx.fullName,
    user_position: ctx.positionName || 'Nhân viên',
    user_department: ctx.departmentName || 'Chung',
    user_role: ctx.isAdmin ? 'Toàn quyền quản trị (ADMIN)' : (ctx.roleNames.join(', ') || 'Nhân viên'),
    data_scope: ctx.dataScope,
    current_date: fmtDate(new Date()),
    company_name: branding.name,
    tools_list: allToolNames || 'Không có',
  };

  const systemPrompt = renderSystemPrompt(customTemplate, promptVars);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let iterations = 0;
  let forceStopTools = false;
  const startTime = Date.now();
  const maxExecutionTimeMs = 25000; // Giới hạn tổng thời gian 25s

  try {
    while (iterations < maxIterations) {
      iterations++;

      // Nếu sắp hết thời gian thực thi hoặc ở bước gần cuối, ép dừng gọi tool để AI sinh câu trả lời
      if (Date.now() - startTime > maxExecutionTimeMs || iterations >= maxIterations) {
        forceStopTools = true;
      }

      const payload: Record<string, any> = {
        model: selectedModel,
        messages,
        temperature,
      };

      if (tools.length > 0) {
        payload.tools = tools;
        if (forceStopTools) {
          payload.tool_choice = 'none';
        }
      }

      const data = await callGeminiApi(apiKey, payload);
      const choice = data.choices?.[0];
      if (!choice) {
        return 'Xin lỗi, không nhận được phản hồi từ AI.';
      }

      const assistantMsg = choice.message as ChatMessage;
      if (assistantMsg.content === undefined) {
        assistantMsg.content = '';
      }
      messages.push(assistantMsg);

      // Nếu AI yêu cầu gọi Tool
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        let hasInvalidTool = false;
        for (let i = 0; i < assistantMsg.tool_calls.length; i++) {
          const call = assistantMsg.tool_calls[i];
          if (!call.id) {
            call.id = `call_${call.function?.name || 'tool'}_${i}_${Date.now()}`;
          }
          const toolName = call.function.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(call.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          let toolResultStr = '';
          const customTool = customToolsMap.get(toolName);
          const mcpTool = TOOLS_BY_NAME.get(toolName);

          if (customTool) {
            try {
              const res = await executeCustomTool(customTool, toolArgs);
              toolResultStr = JSON.stringify(res);
            } catch (err) {
              toolResultStr = `Lỗi khi thực thi Custom Tool "${toolName}": ${err instanceof Error ? err.message : String(err)}`;
            }
          } else if (mcpTool) {
            if (mcpTool.permission && !can(ctx, mcpTool.permission)) {
              toolResultStr = `Lỗi: Bạn không có quyền "${mcpTool.permission}" để thực hiện công cụ này.`;
            } else {
              try {
                const res = await mcpTool.handler(toolArgs, identity);
                toolResultStr = JSON.stringify(res);
              } catch (err) {
                toolResultStr = `Lỗi khi thực thi: ${err instanceof Error ? err.message : String(err)}`;
              }
            }
          } else {
            hasInvalidTool = true;
            toolResultStr = `Lỗi: Công cụ "${toolName}" không tồn tại trong hệ thống. Hãy dừng gọi công cụ và trả lời trực tiếp cho người dùng.`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolResultStr,
          });
        }

        // Nếu model gọi công cụ không tồn tại hoặc đã sắp hết bước, ở vòng tiếp theo ép buộc trả lời bằng văn bản
        if (hasInvalidTool || iterations >= maxIterations - 1) {
          forceStopTools = true;
        }

        continue;
      }

      return assistantMsg.content || 'Đã xử lý xong yêu cầu của bạn.';
    }

    // Nếu sau maxIterations vẫn chưa có nội dung trả lời, thử gọi 1 lần cuối không tool để tóm tắt
    try {
      const finalPayload = {
        model: selectedModel,
        messages,
        temperature,
      };
      const finalData = await callGeminiApi(apiKey, finalPayload);
      const finalChoice = finalData.choices?.[0];
      if (finalChoice?.message?.content) {
        return finalChoice.message.content;
      }
    } catch {
      // bỏ qua lỗi lượt cuối
    }

    return `Xin lỗi, yêu cầu này cần thêm thông tin hoặc nằm ngoài phạm vi các công cụ nội bộ của ${branding.name} (công việc, chấm công, nghỉ phép). Bạn vui lòng đặt câu hỏi cụ thể hơn nhé!`;
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Zalo AI Query Error]:', errMsg);
    if (errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE')) {
      return '⚠️ Máy chủ AI của Google hiện đang có lượng truy cập tăng đột biến. Hệ thống đã tự động thử lại nhưng chưa nhận được phản hồi. Bạn vui lòng gửi lại câu hỏi sau ít giây nhé!';
    }
    if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RATE_LIMIT')) {
      return '⚠️ Hạn mức gọi AI tạm thời bị giới hạn (Rate Limit). Vui lòng thử lại sau 1 phút.';
    }
    return `⚠️ Đã có lỗi xảy ra khi kết nối với trợ lý AI: ${errMsg.slice(0, 150)}`;
  }
}

/**
 * Chạy kiểm thử AI Agent phục vụ n8n-style Playground
 * Trả về chi tiết các bước gọi tool và câu trả lời hoàn chỉnh.
 */
export async function runAiAgentTest(
  userPrompt: string,
  targetEmployeeId?: number,
): Promise<AiAgentTestResult> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY || (await getSetting<string>('ai.geminiApiKey', ''));
  if (!apiKey) {
    return {
      ok: false,
      reply: '',
      model: '',
      temperature: 0,
      durationMs: Date.now() - startTime,
      steps: [],
      error: 'Chưa cấu hình API Key (Google Gemini hoặc LLM Provider)',
    };
  }

  const selectedModel = (await getSetting<string>('ai.model', '')) || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const configuredTemp = await getSetting<number>('ai.temperature', 0.2);
  const temperature = Math.min(1.0, Math.max(0.0, Number(configuredTemp) || 0.2));
  const configuredMaxIterations = await getSetting<number>('ai.maxIterations', 5);
  const maxIterations = Math.min(10, Math.max(1, Number(configuredMaxIterations) || 5));

  // Lấy nhân sự đại diện để test
  let empId = targetEmployeeId;
  if (!empId) {
    const firstEmp = await prisma.employee.findFirst({ select: { id: true } });
    empId = firstEmp?.id || 1;
  }

  const ctx = await buildAuthContextForEmployee(empId);
  if (!ctx) {
    return {
      ok: false,
      reply: '',
      model: selectedModel,
      temperature,
      durationMs: Date.now() - startTime,
      steps: [],
      error: 'Không tìm thấy hồ sơ nhân sự đại diện để chạy kiểm thử',
    };
  }

  const identity: McpIdentity = {
    clientId: 0,
    clientName: 'PlaygroundTester',
    readOnly: false,
    scopes: [],
    ctx,
  };

  const allowedTools = MCP_TOOLS.filter((t) => !t.permission || can(ctx, t.permission));
  const mcpGeminiTools = allowedTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: `${t.title}: ${t.description}`,
      parameters: t.inputSchema,
    },
  }));

  const customTools = await getActiveCustomTools();
  const customToolsMap = new Map<string, CustomAgentTool>();
  const customGeminiTools = customTools.map((ct) => {
    customToolsMap.set(ct.name, ct);
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];
    for (const p of ct.parameters) {
      properties[p.name] = {
        type: p.type || 'string',
        description: p.description,
      };
      if (p.required) required.push(p.name);
    }
    return {
      type: 'function' as const,
      function: {
        name: ct.name,
        description: `${ct.title}: ${ct.description}`,
        parameters: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      },
    };
  });

  const tools = [...mcpGeminiTools, ...customGeminiTools];
  const branding = await getAppBranding();
  const customTemplate = await getSetting<string>('ai.systemPrompt', '');
  const allToolNames = tools.map((t) => t.function.name).join(', ');
  const promptVars: Record<string, string> = {
    user_name: ctx.fullName,
    user_position: ctx.positionName || 'Nhân viên',
    user_department: ctx.departmentName || 'Chung',
    user_role: ctx.isAdmin ? 'Toàn quyền quản trị (ADMIN)' : (ctx.roleNames.join(', ') || 'Nhân viên'),
    data_scope: ctx.dataScope,
    current_date: fmtDate(new Date()),
    company_name: branding.name,
    tools_list: allToolNames || 'Không có',
  };

  const systemPrompt = renderSystemPrompt(customTemplate, promptVars);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const steps: AiAgentTestStep[] = [];
  let iterations = 0;
  let forceStopTools = false;
  const maxExecutionTimeMs = 25000;

  try {
    while (iterations < maxIterations) {
      iterations++;

      if (Date.now() - startTime > maxExecutionTimeMs || iterations >= maxIterations) {
        forceStopTools = true;
      }

      const payload: Record<string, any> = {
        model: selectedModel,
        messages,
        temperature,
      };

      if (tools.length > 0) {
        payload.tools = tools;
        if (forceStopTools) {
          payload.tool_choice = 'none';
        }
      }

      const data = await callGeminiApi(apiKey, payload);
      const choice = data.choices?.[0];
      if (!choice) {
        return {
          ok: false,
          reply: 'Không nhận được phản hồi từ mô hình LLM.',
          model: selectedModel,
          temperature,
          durationMs: Date.now() - startTime,
          steps,
        };
      }

      const assistantMsg = choice.message as ChatMessage;
      if (assistantMsg.content === undefined) {
        assistantMsg.content = '';
      }
      messages.push(assistantMsg);

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        let hasInvalidTool = false;
        for (let i = 0; i < assistantMsg.tool_calls.length; i++) {
          const call = assistantMsg.tool_calls[i];
          if (!call.id) {
            call.id = `call_${call.function?.name || 'tool'}_${i}_${Date.now()}`;
          }
          const stepStart = Date.now();
          const toolName = call.function.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(call.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          let toolResultRaw: unknown = null;
          let toolResultStr = '';
          const customTool = customToolsMap.get(toolName);
          const mcpTool = TOOLS_BY_NAME.get(toolName);

          if (customTool) {
            try {
              toolResultRaw = await executeCustomTool(customTool, toolArgs);
              toolResultStr = JSON.stringify(toolResultRaw);
            } catch (err) {
              toolResultRaw = { error: err instanceof Error ? err.message : String(err) };
              toolResultStr = JSON.stringify(toolResultRaw);
            }
          } else if (mcpTool) {
            if (mcpTool.permission && !can(ctx, mcpTool.permission)) {
              toolResultRaw = { error: `Không có quyền "${mcpTool.permission}"` };
              toolResultStr = JSON.stringify(toolResultRaw);
            } else {
              try {
                toolResultRaw = await mcpTool.handler(toolArgs, identity);
                toolResultStr = JSON.stringify(toolResultRaw);
              } catch (err) {
                toolResultRaw = { error: err instanceof Error ? err.message : String(err) };
                toolResultStr = JSON.stringify(toolResultRaw);
              }
            }
          } else {
            hasInvalidTool = true;
            toolResultRaw = { error: `Công cụ "${toolName}" không tồn tại trong hệ thống. Hãy dừng gọi công cụ và trả lời người dùng.` };
            toolResultStr = JSON.stringify(toolResultRaw);
          }

          steps.push({
            toolName,
            args: toolArgs,
            result: toolResultRaw,
            durationMs: Date.now() - stepStart,
          });

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolResultStr,
          });
        }

        if (hasInvalidTool || iterations >= maxIterations - 1) {
          forceStopTools = true;
        }

        continue;
      }

      return {
        ok: true,
        reply: assistantMsg.content || 'Đã xử lý xong.',
        model: selectedModel,
        temperature,
        durationMs: Date.now() - startTime,
        steps,
      };
    }

    // Nếu sau maxIterations vẫn chưa có reply, thử gọi 1 lần cuối không tool
    try {
      const finalPayload = {
        model: selectedModel,
        messages,
        temperature,
      };
      const finalData = await callGeminiApi(apiKey, finalPayload);
      const finalChoice = finalData.choices?.[0];
      if (finalChoice?.message?.content) {
        return {
          ok: true,
          reply: finalChoice.message.content,
          model: selectedModel,
          temperature,
          durationMs: Date.now() - startTime,
          steps,
        };
      }
    } catch {
      // ignore
    }

    return {
      ok: true,
      reply: `Yêu cầu này cần thêm thông tin hoặc nằm ngoài phạm vi các công cụ nội bộ của ${branding.name} (công việc, chấm công, nghỉ phép). Bạn vui lòng đặt câu hỏi cụ thể hơn nhé!`,
      model: selectedModel,
      temperature,
      durationMs: Date.now() - startTime,
      steps,
    };
  } catch (err) {
    return {
      ok: false,
      reply: '',
      model: selectedModel,
      temperature,
      durationMs: Date.now() - startTime,
      steps,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
