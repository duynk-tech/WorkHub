/**
 * Công thức công nợ của MỘT đơn bán, dùng chung cho danh sách bán hàng, hồ sơ
 * khách, báo cáo công nợ, dashboard và phân bổ tiền. Trước đây mỗi nơi tự viết
 * một bản và lệch nhau (nơi chặn returned theo total, nơi không; nơi lấy "hôm
 * nay" theo giờ máy, nơi theo giờ Việt Nam).
 *
 *   phải thu = tổng đơn (đơn hủy = 0)
 *   đã trả hàng = min(tổng, giá trị hàng trả lại)
 *   còn nợ = max(0, phải thu − đã trả hàng − đã thanh toán)
 *   quá hạn = còn nợ > 0 và hạn thanh toán < hôm nay (giờ Việt Nam)
 */

export const BUSINESS_TZ = 'Asia/Ho_Chi_Minh';

type Num = number | string | { toString(): string } | null | undefined;

export interface DebtInput {
  totalAmount?: Num;
  paidAmount?: Num;
  returnedAmount?: Num;
  dueDate?: Date | string | null;
  status?: string | null;
}

export interface OrderDebt {
  total: number;
  paid: number;
  returned: number;
  remaining: number;
  overdue: boolean;
  dueDate: Date | null;
  /** Số ngày quá hạn (0 nếu chưa tới hạn hoặc đã hết nợ). */
  overdueDays: number;
}

function num(v: Num): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Ngày hôm nay (yyyy-mm-dd) theo giờ Việt Nam. */
export function businessToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
}

/** Cột @db.Date đọc ra là nửa đêm UTC: lấy phần ngày theo UTC để không lệch 1 ngày. */
export function dateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function computeOrderDebt(order: DebtInput, now = new Date()): OrderDebt {
  const total = order.status === 'CANCELLED' ? 0 : num(order.totalAmount);
  const paid = num(order.paidAmount);
  const returned = Math.min(total, Math.max(0, num(order.returnedAmount)));
  const remaining = Math.max(0, total - returned - paid);
  const due = order.dueDate ? new Date(order.dueDate) : null;
  const validDue = due && !Number.isNaN(due.getTime()) ? due : null;

  let overdueDays = 0;
  if (remaining > 0 && validDue) {
    overdueDays = Math.max(0, daysBetween(dateKey(validDue), businessToday(now)));
  }

  return { total, paid, returned, remaining, overdue: overdueDays > 0, dueDate: validDue, overdueDays };
}
