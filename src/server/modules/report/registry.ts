/**
 * Danh mục báo cáo của hệ thống.
 *
 * File này phải giữ thuần dữ liệu để màn hình client import được; phần đọc cấu
 * hình từ database nằm ở ./config.
 *
 * Mỗi lần triển khai cho một công ty chỉ dùng một phần tính năng, nên báo cáo
 * được khai báo tập trung ở đây và bật/tắt trong Cấu hình hệ thống. Tắt một báo
 * cáo chỉ ẩn nó khỏi màn hình, dữ liệu và quyền không bị đụng tới.
 */

export type ReportGroupKey = 'WORK' | 'SALES' | 'HR';

export const REPORT_GROUPS: Record<ReportGroupKey, { label: string; description: string }> = {
  WORK: {
    label: 'Công việc',
    description: 'Tiến độ và khối lượng công việc của các nhóm',
  },
  SALES: {
    label: 'Bán hàng',
    description: 'Nhập hàng, doanh thu, giá vốn, lãi gộp và công nợ khách',
  },
  HR: {
    label: 'Nhân sự',
    description: 'Chấm công, giờ công và nghỉ phép',
  },
};

export interface ReportDef {
  key: string;
  group: ReportGroupKey;
  label: string;
  description: string;
  /** Quyền cần có để xem; bỏ trống là ai vào được màn hình báo cáo đều xem được. */
  permission?: string;
}

export const REPORTS: ReportDef[] = [
  {
    key: 'task',
    group: 'WORK',
    label: 'Tiến độ công việc',
    description: 'Việc hoàn thành, quá hạn và khối lượng theo người phụ trách',
  },
  {
    key: 'sales-inventory',
    group: 'SALES',
    label: 'Nhập – Bán – Lãi gộp',
    description: 'Giá trị nhập kho, doanh thu bán ra, giá vốn và lãi gộp theo kỳ',
  },
  {
    key: 'customer-debt',
    group: 'SALES',
    label: 'Công nợ khách hàng',
    description: 'Số phải thu của từng khách, phần quá hạn và tuổi nợ',
  },
  {
    key: 'attendance',
    group: 'HR',
    label: 'Chấm công',
    description: 'Số công, lượt đi muộn, lượt vắng và giờ công theo phòng ban',
  },
  {
    key: 'leave',
    group: 'HR',
    label: 'Nghỉ phép',
    description: 'Ngày nghỉ đã dùng và còn lại theo loại phép',
  },
];

export const REPORT_KEYS = REPORTS.map((r) => r.key);

/** Khóa cấu hình lưu danh sách báo cáo bị tắt. */
export const DISABLED_REPORTS_KEY = 'reports.disabled';

/**
 * Lọc giá trị đọc từ cấu hình: bỏ khóa lạ để báo cáo đã xóa khỏi danh mục không
 * còn ảnh hưởng gì.
 */
export function sanitizeDisabledKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === 'string' && REPORT_KEYS.includes(k));
}

/** Lọc danh mục báo cáo theo cấu hình bật/tắt và quyền của người đang đăng nhập. */
export function visibleReports(
  disabled: string[],
  hasPermission: (permission: string) => boolean,
): ReportDef[] {
  return REPORTS.filter(
    (r) => !disabled.includes(r.key) && (!r.permission || hasPermission(r.permission)),
  );
}

/** Các nhóm còn ít nhất một báo cáo để hiển thị, giữ nguyên thứ tự khai báo. */
export function visibleGroups(reports: ReportDef[]): ReportGroupKey[] {
  return (Object.keys(REPORT_GROUPS) as ReportGroupKey[]).filter((g) =>
    reports.some((r) => r.group === g),
  );
}
