export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  badgeKey?: 'pendingApprovals' | 'myTasks';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Cấu trúc sidebar. Mục nào thiếu quyền sẽ bị lọc bỏ ở server. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Tổng quan', icon: 'LayoutDashboard', permission: 'MENU_DASHBOARD' },
    ],
  },
  {
    title: 'Kinh doanh',
    items: [
      { href: '/sales', label: 'Bán hàng', icon: 'ShoppingCart', permission: 'MENU_CUSTOMERS' },
      { href: '/quotations', label: 'Báo giá', icon: 'FileText', permission: 'MENU_CUSTOMERS' },
      { href: '/customers', label: 'Khách hàng', icon: 'Building2', permission: 'MENU_CUSTOMERS' },
      { href: '/inventory-report', label: 'Báo cáo doanh thu', icon: 'BarChart3', permission: 'FEATURE_REPORT_INVENTORY' },
    ],
  },
  {
    title: 'Mua hàng & Kho',
    items: [
      { href: '/purchases', label: 'Mua hàng', icon: 'ClipboardList', permission: 'MENU_EQUIPMENT' },
      { href: '/spare-parts', label: 'Hàng hóa & Kho', icon: 'Boxes', permission: 'MENU_EQUIPMENT' },
    ],
  },
  {
    title: 'Dịch vụ',
    items: [
      { href: '/tickets', label: 'Sửa chữa & Bảo trì', icon: 'Wrench', permission: 'MENU_EQUIPMENT' },
    ],
  },
  {
    title: 'Công việc',
    items: [
      { href: '/tasks', label: 'Công việc', icon: 'ListChecks', permission: 'MENU_TASKS', badgeKey: 'myTasks' },
      { href: '/approvals', label: 'Chờ duyệt', icon: 'CheckSquare', permission: 'MENU_APPROVALS', badgeKey: 'pendingApprovals' },
    ],
  },
  {
    title: 'Nhân sự',
    items: [
      { href: '/employees', label: 'Nhân viên', icon: 'Users', permission: 'MENU_EMPLOYEES' },
      { href: '/attendance', label: 'Chấm công', icon: 'Clock', permission: 'MENU_ATTENDANCE' },
      { href: '/leaves', label: 'Nghỉ phép', icon: 'CalendarDays', permission: 'MENU_LEAVES' },
      { href: '/departments', label: 'Phòng ban', icon: 'Network', permission: 'MENU_DEPARTMENTS' },
    ],
  },
  {
    title: 'Báo cáo',
    items: [
      { href: '/reports', label: 'Báo cáo', icon: 'BarChart3', permission: 'MENU_REPORTS' },
      { href: '/documents', label: 'Sổ chứng từ', icon: 'ScrollText', permission: 'MENU_REPORTS' },
    ],
  },
  {
    title: 'Tiện ích',
    items: [
      { href: '/assets', label: 'Thiết bị văn phòng', icon: 'Laptop', permission: 'MENU_ASSETS' },
      { href: '/media', label: 'Thư viện Media', icon: 'Image', permission: 'MENU_EQUIPMENT' },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      { href: '/settings', label: 'Cấu hình hệ thống', icon: 'Settings', permission: 'MENU_SETTINGS' },
      { href: '/settings/workflows', label: 'Quy trình duyệt', icon: 'GitBranch', permission: 'MENU_WORKFLOW' },
      { href: '/settings/roles', label: 'Phân quyền', icon: 'ShieldCheck', permission: 'MENU_ROLES' },
      { href: '/settings/accounts', label: 'Tài khoản', icon: 'UserCog', permission: 'MENU_ACCOUNTS' },
      { href: '/settings/integrations', label: 'Tích hợp & MCP', icon: 'Plug', permission: 'MENU_INTEGRATIONS' },
      { href: '/settings/audit', label: 'Nhật ký', icon: 'ScrollText', permission: 'MENU_AUDIT' },
    ],
  },
];
