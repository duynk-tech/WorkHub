import { getSetting, setSetting } from '@/server/modules/settings/service';

export type ToolParamType = 'string' | 'number' | 'boolean';

export interface CustomToolParam {
  name: string;
  type: ToolParamType;
  description: string;
  required?: boolean;
}

export interface CustomHttpConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string; // Hỗ trợ {{param}}
  headers?: Record<string, string>;
  bodyTemplate?: string; // Hỗ trợ {{param}}
}

export interface CustomAgentTool {
  id: string;
  name: string; // Tên function cho AI (e.g. lookup_crm_order)
  title: string; // Tiêu đề hiển thị
  description: string; // Hướng dẫn AI khi nào cần dùng
  isActive: boolean;
  actionType: 'HTTP' | 'CODE';
  parameters: CustomToolParam[];
  httpConfig?: CustomHttpConfig;
  codeSnippet?: string;
  createdAt?: string;
  updatedAt?: string;
}

const SETTING_KEY = 'ai.customTools';

/** Lấy danh sách tất cả Custom Tools */
export async function getCustomTools(): Promise<CustomAgentTool[]> {
  const tools = await getSetting<CustomAgentTool[]>(SETTING_KEY, []);
  if (!Array.isArray(tools)) return [];
  return tools;
}

/** Lấy danh sách các Custom Tools đang kích hoạt */
export async function getActiveCustomTools(): Promise<CustomAgentTool[]> {
  const tools = await getCustomTools();
  return tools.filter((t) => t.isActive);
}

/** Lưu hoặc cập nhật một Custom Tool */
export async function saveCustomTool(toolData: Omit<CustomAgentTool, 'id'> & { id?: string }): Promise<CustomAgentTool> {
  const tools = await getCustomTools();
  const id = toolData.id || `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // Chuẩn hóa tên hàm cho AI (chỉ cho phép chữ cái, số, gạch dưới)
  const normalizedName = toolData.name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (!normalizedName) {
    throw new Error('Tên hàm AI không hợp lệ');
  }

  const tool: CustomAgentTool = {
    ...toolData,
    id,
    name: normalizedName,
    createdAt: toolData.id ? tools.find((t) => t.id === toolData.id)?.createdAt || now : now,
    updatedAt: now,
  };

  const existingIdx = tools.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    tools[existingIdx] = tool;
  } else {
    tools.push(tool);
  }

  await setSetting(SETTING_KEY, tools, { group: 'ai' });
  return tool;
}

/** Xóa Custom Tool */
export async function deleteCustomTool(id: string): Promise<boolean> {
  const tools = await getCustomTools();
  const filtered = tools.filter((t) => t.id !== id);
  if (filtered.length === tools.length) return false;
  await setSetting(SETTING_KEY, filtered, { group: 'ai' });
  return true;
}

/** Bật/Tắt Custom Tool */
export async function toggleCustomTool(id: string, isActive: boolean): Promise<boolean> {
  const tools = await getCustomTools();
  const target = tools.find((t) => t.id === id);
  if (!target) return false;
  target.isActive = isActive;
  target.updatedAt = new Date().toISOString();
  await setSetting(SETTING_KEY, tools, { group: 'ai' });
  return true;
}

/** Thay thế placeholder {{variable}} trong chuỗi */
function interpolate(template: string, args: Record<string, unknown>, encodeUrl = false): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = args[key];
    if (val === undefined || val === null) return '';
    const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return encodeUrl ? encodeURIComponent(strVal) : strVal;
  });
}

/**
 * Thực thi một Custom Tool với các đối số truyền vào từ AI hoặc Test runner.
 */
export async function executeCustomTool(
  tool: CustomAgentTool,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    if (tool.actionType === 'HTTP') {
      const http = tool.httpConfig;
      if (!http || !http.url) {
        return { success: false, error: 'Chưa cấu hình URL HTTP cho công cụ này' };
      }

      // Xử lý URL với tham số
      const finalUrl = interpolate(http.url, args, true);

      // Xử lý Headers
      const headers: Record<string, string> = {
        'User-Agent': 'WorkHub-AI-Agent/1.0',
      };
      if (http.headers) {
        for (const [hk, hv] of Object.entries(http.headers)) {
          headers[hk] = interpolate(hv, args, false);
        }
      }

      // Xử lý Body
      let body: string | undefined = undefined;
      const method = (http.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && http.bodyTemplate) {
        body = interpolate(http.bodyTemplate, args, false);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      // Gọi Fetch với timeout 15s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(finalUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      let responseData: unknown;
      if (contentType.includes('application/json')) {
        responseData = await res.json();
      } else {
        responseData = await res.text();
      }

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}: ${typeof responseData === 'string' ? responseData.slice(0, 300) : JSON.stringify(responseData).slice(0, 300)}`,
          data: responseData,
        };
      }

      return { success: true, data: responseData };
    }

    if (tool.actionType === 'CODE') {
      if (!tool.codeSnippet) {
        return { success: false, error: 'Chưa có mã JavaScript xử lý' };
      }

      // Chạy code JavaScript với args truyền vào
      // Code có dạng: "return { result: args.x + 1 };"
      const runner = new Function('args', `
        "use strict";
        ${tool.codeSnippet}
      `);

      const result = await Promise.resolve(runner(args));
      return { success: true, data: result };
    }

    return { success: false, error: `Loại hành động "${tool.actionType}" không được hỗ trợ` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Thực thi thất bại: ${message}` };
  }
}
