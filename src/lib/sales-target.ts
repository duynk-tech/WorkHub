/**
 * Tiến độ chỉ tiêu doanh số trong tháng: % đã đạt và dự báo cuối tháng nếu giữ
 * tốc độ bán hiện tại. Ngày tính theo giờ Việt Nam để tháng không lệch ở biên.
 */

export interface TargetProgress {
  /** Đã đạt bao nhiêu phần chỉ tiêu (0.42 = 42%). null khi chưa đặt chỉ tiêu. */
  pct: number | null;
  /** Doanh số dự kiến tới hết tháng theo tốc độ trung bình mỗi ngày đã qua. */
  forecast: number;
  forecastPct: number | null;
  /** Còn thiếu bao nhiêu để đạt chỉ tiêu (0 khi đã đạt). */
  remaining: number;
}

export function vnDayOfMonth(now = new Date()): { year: number; month: number; day: number; daysInMonth: number } {
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).split('-').map(Number);
  return { year: y, month: m, day: d, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

export function targetProgress(billed: number, target: number | null | undefined, day: number, daysInMonth: number): TargetProgress {
  const safeDay = Math.min(Math.max(day, 1), daysInMonth);
  const forecast = Math.round((billed / safeDay) * daysInMonth);
  if (!target || target <= 0) return { pct: null, forecast, forecastPct: null, remaining: 0 };
  return {
    pct: billed / target,
    forecast,
    forecastPct: forecast / target,
    remaining: Math.max(0, target - billed),
  };
}
