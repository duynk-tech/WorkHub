/**
 * Nhóm công cụ MCP theo phân hệ nghiệp vụ.
 *
 * File này giữ thuần dữ liệu để màn hình cấu hình (client) import được; phần đọc
 * cấu hình từ database nằm ở ./module-config.
 *
 * Mỗi lần triển khai chỉ dùng một phần phân hệ. Tắt một phân hệ sẽ gỡ toàn bộ
 * công cụ của nó khỏi MCP, OpenAPI và trợ lý Zalo — trợ lý không còn "biết" tới
 * nghiệp vụ đó nữa, thay vì gọi rồi báo lỗi thiếu quyền.
 */

export type McpModuleKey = 'hr' | 'task' | 'sales' | 'equipment' | 'inventory';

export const MCP_MODULES: Record<McpModuleKey, { label: string; description: string }> = {
  hr: {
    label: 'Nhân sự & Chấm công',
    description: 'Tra cứu nhân sự, phòng ban, quỹ phép, đơn nghỉ và bảng công',
  },
  task: {
    label: 'Công việc',
    description: 'Xem, tạo và cập nhật trạng thái công việc',
  },
  sales: {
    label: 'Bán hàng',
    description: 'Khách hàng, báo giá, đơn hàng và công nợ phải thu',
  },
  equipment: {
    label: 'Thiết bị & Dịch vụ',
    description: 'Máy móc F&B tại khách và phiếu sự cố sửa chữa',
  },
  inventory: {
    label: 'Kho phụ tùng',
    description: 'Danh mục phụ tùng và tồn kho theo từng kho',
  },
};

export const MCP_MODULE_KEYS = Object.keys(MCP_MODULES) as McpModuleKey[];

/** Khóa cấu hình lưu danh sách phân hệ bị tắt. */
export const DISABLED_MCP_MODULES_KEY = 'mcp.disabledModules';

/** Bỏ khóa lạ để phân hệ đã đổi tên không khóa nhầm phân hệ đang dùng. */
export function sanitizeDisabledModules(raw: unknown): McpModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is McpModuleKey => typeof k === 'string' && k in MCP_MODULES);
}
