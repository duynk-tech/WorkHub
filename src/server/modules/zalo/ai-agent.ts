import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';
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
      permissions: new Set(['MENU_TASKS', 'MENU_LEAVES', 'FEATURE_ATTENDANCE_CHECKIN']),
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

/** Gọi API LLM thông qua endpoint OpenAI compatibility (Google Gemini, OpenRouter, Claude proxy, OpenAI) */
async function callGeminiApi(apiKey: string, body: unknown) {
  const baseUrl = (await getSetting<string>('ai.baseUrl', '')) || process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const completionsUrl = cleanBaseUrl.endsWith('/chat/completions') ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`;

  const res = await fetch(completionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM API error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  return await res.json();
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
          required,
        },
      },
    };
  });

  const tools = [...mcpGeminiTools, ...customGeminiTools];

  const systemPrompt = `Bạn là trợ lý AI nội bộ của WorkHub, đang hỗ trợ nhân sự "${ctx.fullName}" (${ctx.positionName || 'Nhân viên'}, phòng ${ctx.departmentName || 'Chung'}) qua Zalo.
Quyền hạn: ${ctx.isAdmin ? 'Toàn quyền quản trị (ADMIN)' : `Phạm vi dữ liệu ${ctx.dataScope}`}.
Ngày hiện tại: ${fmtDate(new Date())}.

Quy tắc bắt buộc:
1. Trả lời bằng tiếng Việt, ngắn gọn, lịch sự, thân thiện, rõ ràng, định dạng Markdown hỗ trợ trên Zalo (dùng **in đậm**, _in nghiêng_, \`mã code\`, danh sách gạch đầu dòng -, và emoji nhẹ nhàng: 📋, 🟢, 🏖, ⏱...). Không dùng tiêu đề '#' mà hãy dùng dòng in đậm '**Tiêu đề**'.
2. Khi người dùng hỏi thông tin (công việc, nhân sự, nghỉ phép, duyệt đơn, hoặc các tra cứu qua custom tool...), LUÔN LUÔN gọi công cụ phù hợp để tra cứu dữ liệu thực tế trước khi trả lời.
3. Không bịa đặt thông tin không có trong kết quả trả về từ công cụ.
4. Nếu thực hiện thao tác (tạo việc, đổi trạng thái việc, duyệt đơn...), hãy xác nhận rõ kết quả thao tác.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const payload = {
      model: selectedModel,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.2,
    };

    const data = await callGeminiApi(apiKey, payload);
    const choice = data.choices?.[0];
    if (!choice) {
      return 'Xin lỗi, không nhận được phản hồi từ AI.';
    }

    const assistantMsg = choice.message as ChatMessage;
    messages.push(assistantMsg);

    // Nếu AI yêu cầu gọi Tool
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const call of assistantMsg.tool_calls) {
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
          toolResultStr = `Lỗi: Công cụ "${toolName}" không tồn tại.`;
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolResultStr,
        });
      }
      // Tiếp tục vòng lặp để AI phân tích kết quả trả về từ Tool
      continue;
    }

    // AI đã trả về câu trả lời hoàn chỉnh
    return assistantMsg.content || 'Đã xử lý xong yêu cầu của bạn.';
  }

  return 'Yêu cầu của bạn mất quá nhiều bước xử lý, vui lòng thử lại câu hỏi cụ thể hơn.';
}
