/**
 * Danh mục quyền của WorkHub.
 * MENU_*    — quyết định mục hiển thị trên sidebar.
 * FEATURE_* — quyết định thao tác được phép trong màn hình.
 * Đây là nguồn sự thật: seed sẽ upsert bảng Permission theo danh sách này.
 */

export type PermissionCategory = 'MENU' | 'FEATURE';

export interface PermissionDef {
  code: string;
  name: string;
  group: string;
  category: PermissionCategory;
  description?: string;
  sortOrder: number;
}

export const PERMISSIONS: PermissionDef[] = [
  // ── Tổng quan ──
  { code: 'MENU_DASHBOARD', name: 'Trang tổng quan', group: 'Tổng quan', category: 'MENU', sortOrder: 10 },

  // ── Công việc ──
  { code: 'MENU_TASKS', name: 'Menu Công việc', group: 'Công việc', category: 'MENU', sortOrder: 100 },
  { code: 'FEATURE_TASK_CREATE', name: 'Tạo công việc', group: 'Công việc', category: 'FEATURE', sortOrder: 101 },
  { code: 'FEATURE_TASK_EDIT', name: 'Sửa công việc', group: 'Công việc', category: 'FEATURE', description: 'Sửa mọi công việc trong phạm vi dữ liệu', sortOrder: 102 },
  { code: 'FEATURE_TASK_DELETE', name: 'Xóa công việc', group: 'Công việc', category: 'FEATURE', sortOrder: 103 },
  { code: 'FEATURE_TASK_ASSIGN', name: 'Giao việc cho người khác', group: 'Công việc', category: 'FEATURE', sortOrder: 104 },
  { code: 'FEATURE_TASK_EXPORT', name: 'Xuất danh sách công việc', group: 'Công việc', category: 'FEATURE', sortOrder: 105 },
  { code: 'FEATURE_TASK_REMINDER', name: 'Cấu hình nhắc việc', group: 'Công việc', category: 'FEATURE', sortOrder: 106 },

  // ── Nghỉ phép ──
  { code: 'MENU_LEAVES', name: 'Menu Nghỉ phép', group: 'Nghỉ phép', category: 'MENU', sortOrder: 200 },
  { code: 'FEATURE_LEAVE_REQUEST', name: 'Tạo đơn xin nghỉ', group: 'Nghỉ phép', category: 'FEATURE', sortOrder: 201 },
  { code: 'FEATURE_LEAVE_APPROVE', name: 'Duyệt đơn nghỉ phép', group: 'Nghỉ phép', category: 'FEATURE', description: 'Xử lý các bước duyệt được giao', sortOrder: 202 },
  { code: 'FEATURE_LEAVE_BALANCE_MANAGE', name: 'Quản lý quỹ phép', group: 'Nghỉ phép', category: 'FEATURE', sortOrder: 203 },
  { code: 'FEATURE_LEAVE_TYPE_MANAGE', name: 'Quản lý loại nghỉ phép', group: 'Nghỉ phép', category: 'FEATURE', sortOrder: 204 },
  { code: 'FEATURE_LEAVE_FORCE_CLOSE', name: 'Can thiệp đơn đang duyệt', group: 'Nghỉ phép', category: 'FEATURE', description: 'Hủy hoặc cưỡng chế kết thúc đơn bị kẹt', sortOrder: 205 },

  // ── Chấm công ──
  { code: 'MENU_ATTENDANCE', name: 'Menu Chấm công', group: 'Chấm công', category: 'MENU', sortOrder: 300 },
  { code: 'FEATURE_ATTENDANCE_CHECKIN', name: 'Check-in / Check-out', group: 'Chấm công', category: 'FEATURE', sortOrder: 301 },
  { code: 'FEATURE_ATTENDANCE_EDIT', name: 'Sửa dữ liệu chấm công', group: 'Chấm công', category: 'FEATURE', sortOrder: 302 },
  { code: 'FEATURE_ATTENDANCE_IMPORT', name: 'Import máy chấm công', group: 'Chấm công', category: 'FEATURE', sortOrder: 303 },
  { code: 'FEATURE_ATTENDANCE_SHIFT_MANAGE', name: 'Quản lý ca làm việc', group: 'Chấm công', category: 'FEATURE', sortOrder: 304 },

  // ── Phê duyệt ──
  { code: 'MENU_APPROVALS', name: 'Menu Chờ duyệt', group: 'Phê duyệt', category: 'MENU', sortOrder: 400 },
  { code: 'MENU_WORKFLOW', name: 'Menu Quy trình duyệt', group: 'Phê duyệt', category: 'MENU', sortOrder: 410 },
  { code: 'FEATURE_WORKFLOW_MANAGE', name: 'Thiết kế quy trình duyệt', group: 'Phê duyệt', category: 'FEATURE', sortOrder: 411 },

  // ── Tổ chức ──
  { code: 'MENU_DEPARTMENTS', name: 'Menu Phòng ban', group: 'Tổ chức', category: 'MENU', sortOrder: 500 },
  { code: 'FEATURE_DEPARTMENT_MANAGE', name: 'Quản lý phòng ban', group: 'Tổ chức', category: 'FEATURE', sortOrder: 501 },
  { code: 'MENU_EMPLOYEES', name: 'Menu Nhân sự', group: 'Tổ chức', category: 'MENU', sortOrder: 510 },
  { code: 'FEATURE_EMPLOYEE_MANAGE', name: 'Quản lý hồ sơ nhân sự', group: 'Tổ chức', category: 'FEATURE', sortOrder: 511 },
  { code: 'MENU_ACCOUNTS', name: 'Menu Tài khoản', group: 'Tổ chức', category: 'MENU', sortOrder: 520 },
  { code: 'FEATURE_ACCOUNT_MANAGE', name: 'Quản lý tài khoản đăng nhập', group: 'Tổ chức', category: 'FEATURE', sortOrder: 521 },
  { code: 'FEATURE_ACCOUNT_RESET_PASSWORD', name: 'Đặt lại mật khẩu', group: 'Tổ chức', category: 'FEATURE', sortOrder: 522 },
  { code: 'MENU_ROLES', name: 'Menu Phân quyền', group: 'Tổ chức', category: 'MENU', sortOrder: 530 },
  { code: 'FEATURE_ROLE_MANAGE', name: 'Cấu hình vai trò & quyền', group: 'Tổ chức', category: 'FEATURE', sortOrder: 531 },

  // ── Thiết bị F&B & Dịch vụ Kỹ thuật ──
  { code: 'MENU_EQUIPMENT', name: 'Menu Thiết bị & Phụ tùng', group: 'Thiết bị & Dịch vụ', category: 'MENU', sortOrder: 540 },
  { code: 'FEATURE_EQUIPMENT_MANAGE', name: 'Quản lý thiết bị F&B', group: 'Thiết bị F&B', category: 'FEATURE', sortOrder: 541 },
  { code: 'FEATURE_EQUIPMENT_MAINTENANCE', name: 'Bảo dưỡng & Sửa chữa thiết bị F&B', group: 'Thiết bị F&B', category: 'FEATURE', sortOrder: 542 },
  { code: 'MENU_CUSTOMERS', name: 'Menu Khách hàng', group: 'Thiết bị & Dịch vụ', category: 'MENU', sortOrder: 543 },
  { code: 'FEATURE_CUSTOMER_MANAGE', name: 'Quản lý khách hàng', group: 'Thiết bị & Dịch vụ', category: 'FEATURE', sortOrder: 544 },
  { code: 'MENU_SPARE_PARTS', name: 'Menu Quản lý Phụ tùng', group: 'Thiết bị & Dịch vụ', category: 'MENU', sortOrder: 545 },
  { code: 'FEATURE_SPARE_PARTS_MANAGE', name: 'Quản lý phụ tùng & kho linh kiện', group: 'Thiết bị & Dịch vụ', category: 'FEATURE', sortOrder: 546 },
  { code: 'FEATURE_SPARE_PARTS_APPROVE', name: 'Duyệt phiếu hủy / thanh lý / kiểm kê kho', group: 'Thiết bị & Dịch vụ', category: 'FEATURE', sortOrder: 547 },

  // ── Thiết bị & Tài sản Văn phòng ──
  { code: 'MENU_ASSETS', name: 'Menu Thiết bị văn phòng', group: 'Thiết bị', category: 'MENU', sortOrder: 550 },
  { code: 'FEATURE_ASSET_CREATE', name: 'Thêm thiết bị mới', group: 'Thiết bị', category: 'FEATURE', sortOrder: 551 },
  { code: 'FEATURE_ASSET_EDIT', name: 'Sửa thông tin thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 552 },
  { code: 'FEATURE_ASSET_ASSIGN', name: 'Cấp phát & Thu hồi thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 553 },
  { code: 'FEATURE_ASSET_UPGRADE', name: 'Nâng cấp phần cứng thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 554 },
  { code: 'FEATURE_ASSET_MAINTENANCE', name: 'Bảo hành & Sửa chữa thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 555 },
  { code: 'FEATURE_ASSET_LIQUIDATE', name: 'Thanh lý thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 556 },
  { code: 'FEATURE_ASSET_DELETE', name: 'Xóa thiết bị', group: 'Thiết bị', category: 'FEATURE', sortOrder: 557 },

  // ── Báo cáo ──
  { code: 'MENU_REPORTS', name: 'Menu Báo cáo', group: 'Báo cáo', category: 'MENU', sortOrder: 600 },
  { code: 'FEATURE_REPORT_ATTENDANCE', name: 'Báo cáo chấm công', group: 'Báo cáo', category: 'FEATURE', sortOrder: 601 },
  { code: 'FEATURE_REPORT_TASK', name: 'Báo cáo công việc', group: 'Báo cáo', category: 'FEATURE', sortOrder: 602 },
  { code: 'FEATURE_REPORT_LEAVE', name: 'Báo cáo nghỉ phép', group: 'Báo cáo', category: 'FEATURE', sortOrder: 603 },
  { code: 'FEATURE_REPORT_INVENTORY', name: 'Báo cáo kho & lãi gộp phụ tùng', group: 'Báo cáo', category: 'FEATURE', sortOrder: 604 },
  { code: 'FEATURE_REPORT_EXPORT', name: 'Xuất báo cáo Excel/PDF', group: 'Báo cáo', category: 'FEATURE', sortOrder: 605 },
  { code: 'FEATURE_REPORT_SCHEDULE', name: 'Lịch gửi báo cáo tự động', group: 'Báo cáo', category: 'FEATURE', sortOrder: 605 },

  // ── Hệ thống ──
  // ── TIM Space (Không gian 3D) ──
  { code: 'FEATURE_SPACE_DESIGN', name: 'Thiết kế TIM Space (kéo thả bố cục, nội thất, kệ hàng)', group: 'TIM Space', category: 'FEATURE', sortOrder: 690 },

  { code: 'MENU_SETTINGS', name: 'Menu Cấu hình hệ thống', group: 'Hệ thống', category: 'MENU', sortOrder: 700 },
  { code: 'FEATURE_SETTING_GENERAL', name: 'Cấu hình chung', group: 'Hệ thống', category: 'FEATURE', sortOrder: 701 },
  { code: 'FEATURE_SETTING_ZALO', name: 'Cấu hình Zalo Bot', group: 'Hệ thống', category: 'FEATURE', sortOrder: 702 },
  { code: 'FEATURE_SETTING_NOTIFICATION', name: 'Quản lý mẫu thông báo', group: 'Hệ thống', category: 'FEATURE', sortOrder: 703 },
  { code: 'FEATURE_SETTING_HOLIDAY', name: 'Quản lý ngày lễ', group: 'Hệ thống', category: 'FEATURE', sortOrder: 704 },
  { code: 'MENU_INTEGRATIONS', name: 'Menu Tích hợp (MCP/Webhook)', group: 'Hệ thống', category: 'MENU', sortOrder: 710 },
  { code: 'FEATURE_MCP_MANAGE', name: 'Quản lý MCP client & webhook', group: 'Hệ thống', category: 'FEATURE', sortOrder: 711 },
  { code: 'MENU_AUDIT', name: 'Menu Nhật ký hệ thống', group: 'Hệ thống', category: 'MENU', sortOrder: 720 },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const PERMISSION_GROUPS = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

/** Vai trò hệ thống mặc định — seed tạo sẵn, không cho xóa. */
export const SYSTEM_ROLES = [
  {
    code: 'ADMIN',
    name: 'Quản trị hệ thống',
    description: 'Toàn quyền trên toàn bộ dữ liệu và cấu hình',
    dataScope: 'ALL' as const,
    sortOrder: 10,
    permissions: PERMISSION_CODES,
  },
  {
    code: 'HR',
    name: 'Nhân sự (HR)',
    description: 'Quản lý nhân sự, nghỉ phép, chấm công và báo cáo toàn công ty',
    dataScope: 'ALL' as const,
    sortOrder: 20,
    permissions: [
      'MENU_DASHBOARD', 'MENU_TASKS', 'FEATURE_TASK_CREATE', 'FEATURE_TASK_EDIT', 'FEATURE_TASK_ASSIGN', 'FEATURE_TASK_EXPORT',
      'MENU_LEAVES', 'FEATURE_LEAVE_REQUEST', 'FEATURE_LEAVE_APPROVE', 'FEATURE_LEAVE_BALANCE_MANAGE', 'FEATURE_LEAVE_TYPE_MANAGE',
      'MENU_ATTENDANCE', 'FEATURE_ATTENDANCE_CHECKIN', 'FEATURE_ATTENDANCE_EDIT', 'FEATURE_ATTENDANCE_IMPORT', 'FEATURE_ATTENDANCE_SHIFT_MANAGE',
      'MENU_APPROVALS', 'MENU_DEPARTMENTS', 'MENU_EMPLOYEES', 'FEATURE_EMPLOYEE_MANAGE',
      'MENU_ASSETS', 'FEATURE_ASSET_CREATE', 'FEATURE_ASSET_EDIT', 'FEATURE_ASSET_ASSIGN', 'FEATURE_ASSET_UPGRADE', 'FEATURE_ASSET_MAINTENANCE', 'FEATURE_ASSET_LIQUIDATE',
      'MENU_REPORTS', 'FEATURE_REPORT_ATTENDANCE', 'FEATURE_REPORT_TASK', 'FEATURE_REPORT_LEAVE', 'FEATURE_REPORT_EXPORT',
      'FEATURE_SETTING_HOLIDAY',
    ],
  },
  {
    code: 'MANAGER',
    name: 'Quản lý phòng ban',
    description: 'Quản lý công việc, duyệt nghỉ phép và xem báo cáo trong phạm vi phòng ban của mình',
    dataScope: 'DEPT_TREE' as const,
    sortOrder: 30,
    permissions: [
      'MENU_DASHBOARD', 'MENU_TASKS', 'FEATURE_TASK_CREATE', 'FEATURE_TASK_EDIT', 'FEATURE_TASK_DELETE', 'FEATURE_TASK_ASSIGN',
      'FEATURE_TASK_EXPORT', 'FEATURE_TASK_REMINDER',
      'MENU_LEAVES', 'FEATURE_LEAVE_REQUEST', 'FEATURE_LEAVE_APPROVE',
      'MENU_ATTENDANCE', 'FEATURE_ATTENDANCE_CHECKIN',
      'MENU_ASSETS', 'FEATURE_ASSET_ASSIGN',
      'MENU_APPROVALS', 'MENU_EMPLOYEES',
      'MENU_REPORTS', 'FEATURE_REPORT_ATTENDANCE', 'FEATURE_REPORT_TASK', 'FEATURE_REPORT_LEAVE', 'FEATURE_REPORT_EXPORT',
    ],
  },
  {
    code: 'EMPLOYEE',
    name: 'Nhân viên',
    description: 'Xem và xử lý công việc của mình, xin nghỉ phép, chấm công',
    dataScope: 'SELF' as const,
    sortOrder: 40,
    permissions: [
      'MENU_DASHBOARD', 'MENU_TASKS', 'FEATURE_TASK_CREATE',
      'MENU_LEAVES', 'FEATURE_LEAVE_REQUEST',
      'MENU_ATTENDANCE', 'FEATURE_ATTENDANCE_CHECKIN',
      'MENU_ASSETS',
    ],
  },
];
