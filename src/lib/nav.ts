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
    title: 'Công việc',
    items: [
      { href: '/tasks', label: 'Công việc', icon: 'ListChecks', permission: 'MENU_TASKS', badgeKey: 'myTasks' },
      { href: '/approvals', label: 'Chờ duyệt', icon: 'CheckSquare', permission: 'MENU_APPROVALS', badgeKey: 'pendingApprovals' },
    ],
  },
  {
    title: 'Nhân sự',
    items: [
      { href: '/leaves', label: 'Nghỉ phép', icon: 'CalendarDays', permission: 'MENU_LEAVES' },
      { href: '/attendance', label: 'Chấm công', icon: 'Clock', permission: 'MENU_ATTENDANCE' },
      { href: '/employees', label: 'Nhân sự', icon: 'Users', permission: 'MENU_EMPLOYEES' },
      { href: '/departments', label: 'Phòng ban', icon: 'Network', permission: 'MENU_DEPARTMENTS' },
    ],
  },
  {
    title: 'Thiết bị & Dịch vụ',
    items: [
      { href: '/spare-parts', label: 'Máy móc & Phụ tùng', icon: 'Boxes', permission: 'MENU_EQUIPMENT' },
      { href: '/purchases', label: 'Mua hàng NCC', icon: 'Plane', permission: 'MENU_EQUIPMENT' },
      { href: '/tickets', label: 'Sự cố & Sửa chữa', icon: 'Wrench', permission: 'MENU_EQUIPMENT' },
      { href: '/customers', label: 'Khách hàng', icon: 'Building2', permission: 'MENU_CUSTOMERS' },
      { href: '/quotations', label: 'Báo giá', icon: 'FileText', permission: 'MENU_CUSTOMERS' },
      { href: '/sales', label: 'Bán hàng', icon: 'ShoppingCart', permission: 'MENU_CUSTOMERS' },
      { href: '/assets', label: 'Thiết bị văn phòng', icon: 'Laptop', permission: 'MENU_ASSETS' },
      { href: '/media', label: 'Thư viện Media', icon: 'Image', permission: 'MENU_EQUIPMENT' },
    ],
  },
  {
    title: 'Phân tích',
    items: [
      { href: '/documents', label: 'Sổ chứng từ', icon: 'ScrollText', permission: 'MENU_REPORTS' },
      { href: '/reports', label: 'Báo cáo', icon: 'BarChart3', permission: 'MENU_REPORTS' },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      { href: '/settings/workflows', label: 'Quy trình duyệt', icon: 'GitBranch', permission: 'MENU_WORKFLOW' },
      { href: '/settings/roles', label: 'Phân quyền', icon: 'ShieldCheck', permission: 'MENU_ROLES' },
      { href: '/settings/accounts', label: 'Tài khoản', icon: 'UserCog', permission: 'MENU_ACCOUNTS' },
      { href: '/settings/integrations', label: 'Tích hợp & MCP', icon: 'Plug', permission: 'MENU_INTEGRATIONS' },
      { href: '/settings', label: 'Cấu hình hệ thống', icon: 'Settings', permission: 'MENU_SETTINGS' },
      { href: '/settings/audit', label: 'Nhật ký', icon: 'ScrollText', permission: 'MENU_AUDIT' },
    ],
  },
];
