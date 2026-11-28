export type DashboardWidgetGroup =
  | 'Kinh doanh'
  | 'Kho'
  | 'Mua hàng'
  | 'Dịch vụ'
  | 'Công việc'
  | 'Nhân sự';

export interface DashboardWidgetDef {
  key: string;
  label: string;
  description: string;
  group: DashboardWidgetGroup;
  /** Để rỗng = mọi nhân sự đã đăng nhập đều xem được (trong phạm vi dữ liệu của họ). */
  requiredPermissions: string[];
  /** Nguồn dữ liệu server cần nạp để render widget này. */
  dataSource: 'sales' | 'stock' | 'service' | 'work';
}

export const DASHBOARD_WIDGET_GROUPS: DashboardWidgetGroup[] = [
  'Kinh doanh',
  'Kho',
  'Mua hàng',
  'Dịch vụ',
  'Công việc',
  'Nhân sự',
];

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  // ── Kinh doanh ──
  {
    key: 'sales_stats',
    label: 'Chỉ số Kinh doanh',
    description: 'Đơn chưa hoàn tất, báo giá đang mở, công nợ phải thu và chăm sóc khách',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_chart',
    label: 'Biểu đồ cột Đơn hàng & Tiền thu (Bar)',
    description: 'So sánh giá trị đơn bán và tiền thực thu theo tháng dạng cột',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_trend_area',
    label: 'Biểu đồ miền Xu hướng Doanh thu (Area)',
    description: 'Đường xu hướng giá trị đơn hàng và thực thu 6 tháng gần nhất',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_status_pie',
    label: 'Biểu đồ tròn Trạng thái đơn hàng (Pie)',
    description: 'Tỷ trọng đơn bán theo từng trạng thái xử lý',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_orders',
    label: 'Đơn hàng cần xử lý',
    description: 'Danh sách đơn bán đang mở, chờ hàng hoặc chờ giao',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_quotations',
    label: 'Báo giá đang mở',
    description: 'Báo giá nháp và đã gửi khách hàng chưa chốt',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_kpis',
    label: 'Hiệu quả kinh doanh',
    description: 'Doanh số tháng theo nhân viên KD, tuổi nợ phải thu và tỉ lệ chốt báo giá',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },
  {
    key: 'sales_care',
    label: 'Khách hàng cần chăm sóc',
    description: 'Gợi ý liên hệ định kỳ, sắp hết bảo hành hoặc quá hạn công nợ',
    group: 'Kinh doanh',
    requiredPermissions: ['FEATURE_CUSTOMER_MANAGE'],
    dataSource: 'sales',
  },

  // ── Kho ──
  {
    key: 'stock_stats',
    label: 'Chỉ số Kho vận',
    description: 'Mặt hàng dưới tồn tối thiểu và phiếu kho chờ duyệt',
    group: 'Kho',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },
  {
    key: 'stock_low',
    label: 'Vật tư dưới mức tồn an toàn',
    description: 'Danh sách phụ tùng / hàng hóa sắp hết cần bổ sung',
    group: 'Kho',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },
  {
    key: 'stock_transactions',
    label: 'Phiếu nhập / xuất kho gần đây',
    description: 'Phiếu kho mới phát sinh và phiếu đang chờ phê duyệt',
    group: 'Kho',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },

  // ── Mua hàng ──
  {
    key: 'purchase_stats',
    label: 'Chỉ số Mua hàng (PO)',
    description: 'Đơn mua hàng đang mở, hàng đang về và công nợ nhà cung cấp',
    group: 'Mua hàng',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },
  {
    key: 'purchase_chart',
    label: 'Biểu đồ Nhập / Xuất kho (6 tháng)',
    description: 'Xu hướng giá trị nhập hàng và xuất kho theo tháng',
    group: 'Mua hàng',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },
  {
    key: 'purchase_orders',
    label: 'Đơn mua hàng đang theo dõi',
    description: 'Danh sách PO đang đặt NCC, vận chuyển hoặc chờ nhập kho',
    group: 'Mua hàng',
    requiredPermissions: ['FEATURE_SPARE_PARTS_MANAGE'],
    dataSource: 'stock',
  },

  // ── Dịch vụ ──
  {
    key: 'service_stats',
    label: 'Chỉ số Dịch vụ & Bảo trì',
    description: 'Phiếu sự cố đang mở, đang xử lý và hoàn tất trong tháng',
    group: 'Dịch vụ',
    requiredPermissions: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],
    dataSource: 'service',
  },
  {
    key: 'service_chart',
    label: 'Biểu đồ cột Phiếu sự cố (Bar)',
    description: 'Số lượng phiếu tiếp nhận và phiếu xử lý xong theo tháng',
    group: 'Dịch vụ',
    requiredPermissions: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],
    dataSource: 'service',
  },
  {
    key: 'service_status_pie',
    label: 'Biểu đồ tròn Trạng thái sự cố (Pie)',
    description: 'Tỷ trọng phiếu sự cố đang mở, đang xử lý và hoàn tất',
    group: 'Dịch vụ',
    requiredPermissions: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],
    dataSource: 'service',
  },
  {
    key: 'service_tickets',
    label: 'Phiếu sự cố đang mở & mới hoàn tất',
    description: 'Theo dõi phiếu sửa chữa ưu tiên và lịch sử xử lý gần nhất',
    group: 'Dịch vụ',
    requiredPermissions: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],
    dataSource: 'service',
  },

  // ── Công việc ──
  {
    key: 'work_stats',
    label: 'Chỉ số Công việc & Phép',
    description: 'Việc của tôi, quá hạn, đơn chờ duyệt và ngày phép còn lại',
    group: 'Công việc',
    requiredPermissions: [],
    dataSource: 'work',
  },
  {
    key: 'work_tasks',
    label: 'Công việc của tôi',
    description: 'Danh sách việc đang làm sắp đến hạn ưu tiên cao',
    group: 'Công việc',
    requiredPermissions: [],
    dataSource: 'work',
  },
  {
    key: 'work_status_pie',
    label: 'Biểu đồ tròn Cơ cấu Công việc (Pie)',
    description: 'Biểu đồ Donut phân bổ công việc theo từng trạng thái',
    group: 'Công việc',
    requiredPermissions: [],
    dataSource: 'work',
  },
  {
    key: 'work_team',
    label: 'Tiến độ công việc toàn đội (Thanh tiến độ)',
    description: 'Phân bổ trạng thái công việc dạng thanh tiến độ chi tiết',
    group: 'Công việc',
    requiredPermissions: [],
    dataSource: 'work',
  },

  // ── Nhân sự ──
  {
    key: 'hr_leaves',
    label: 'Nghỉ phép hôm nay & sắp tới',
    description: 'Ai đang nghỉ phép hôm nay và lịch nghỉ đã duyệt sắp tới',
    group: 'Nhân sự',
    requiredPermissions: [],
    dataSource: 'work',
  },
];

export const WIDGET_BY_KEY = new Map(DASHBOARD_WIDGETS.map((w) => [w.key, w]));

export function canSeeDashboardWidget(
  permissions: ReadonlySet<string>,
  isAdmin: boolean,
  widgetKey: string,
): boolean {
  const def = WIDGET_BY_KEY.get(widgetKey);
  if (!def) return false;
  if (isAdmin || def.requiredPermissions.length === 0) return true;
  return def.requiredPermissions.some((code) => permissions.has(code));
}

export type DashboardWidgetColSpan = 4 | 6 | 8 | 12;

export interface DashboardWidgetLayoutItem {
  key: string;
  colSpan: DashboardWidgetColSpan;
}

export function defaultColSpanForWidget(key: string): DashboardWidgetColSpan {
  if (key.endsWith('_stats')) return 12;
  if (key === 'purchase_chart') return 12;
  return 6;
}

export function clampColSpan(val: unknown, key: string): DashboardWidgetColSpan {
  const n = Number(val);
  if (n === 4 || n === 6 || n === 8 || n === 12) return n;
  return defaultColSpanForWidget(key);
}

/** Chuẩn hóa widgetsJson (tương thích cả mảng string cũ và mảng object { key, colSpan } mới). */
export function normalizeWidgetLayout(raw: unknown): DashboardWidgetLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DashboardWidgetLayoutItem[] = [];
  for (const item of raw) {
    let key = '';
    let colSpan: DashboardWidgetColSpan = 6;
    if (typeof item === 'string') {
      key = item;
      colSpan = defaultColSpanForWidget(key);
    } else if (item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string') {
      key = (item as { key: string }).key;
      colSpan = clampColSpan((item as { colSpan?: unknown }).colSpan, key);
    }
    if (!key || seen.has(key) || !WIDGET_BY_KEY.has(key)) continue;
    seen.add(key);
    out.push({ key, colSpan });
  }
  return out;
}

export function filterPermittedWidgetLayout(
  raw: unknown,
  permissions: ReadonlySet<string>,
  isAdmin: boolean,
): DashboardWidgetLayoutItem[] {
  return normalizeWidgetLayout(raw).filter((item) =>
    canSeeDashboardWidget(permissions, isAdmin, item.key),
  );
}

export function filterPermittedWidgetKeys(
  keys: unknown,
  permissions: ReadonlySet<string>,
  isAdmin: boolean,
): string[] {
  return filterPermittedWidgetLayout(keys, permissions, isAdmin).map((item) => item.key);
}
