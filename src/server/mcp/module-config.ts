import { getSetting } from '@/server/modules/settings/service';
import { DISABLED_MCP_MODULES_KEY, sanitizeDisabledModules, type McpModuleKey } from './modules';

/**
 * Đọc danh sách phân hệ MCP bị tắt.
 *
 * Lưu danh sách bị TẮT chứ không phải danh sách được bật, để phân hệ thêm mới về
 * sau tự có hiệu lực thay vì im lặng vắng mặt ở hệ thống đã cấu hình từ trước.
 */
export async function getDisabledMcpModules(): Promise<McpModuleKey[]> {
  return sanitizeDisabledModules(await getSetting<unknown>(DISABLED_MCP_MODULES_KEY, []));
}
