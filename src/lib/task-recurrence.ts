/**
 * Quy tắc lặp cho công việc định kỳ, dạng rút gọn của RRULE:
 *   FREQ=DAILY|WEEKLY|MONTHLY[;INTERVAL=n]
 * Ví dụ: "FREQ=WEEKLY;INTERVAL=2" = hai tuần một lần.
 *
 * Hàm thuần, không phụ thuộc DB, để kiểm thử được.
 */

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
}

export const RECURRENCE_LABELS: Record<RecurrenceFreq, string> = {
  DAILY: 'Hằng ngày',
  WEEKLY: 'Hằng tuần',
  MONTHLY: 'Hằng tháng',
};

export function parseRecurrence(rule: string | null | undefined): Recurrence | null {
  if (!rule) return null;
  const parts = Object.fromEntries(
    rule
      .split(';')
      .map((p) => p.split('=').map((x) => x.trim().toUpperCase()))
      .filter((kv) => kv.length === 2 && kv[0]),
  );
  const freq = parts.FREQ as RecurrenceFreq | undefined;
  if (!freq || !(freq in RECURRENCE_LABELS)) return null;
  const interval = Number(parts.INTERVAL ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return null;
  return { freq, interval };
}

export function formatRecurrence(r: Recurrence): string {
  return r.interval === 1 ? `FREQ=${r.freq}` : `FREQ=${r.freq};INTERVAL=${r.interval}`;
}

export function describeRecurrence(rule: string | null | undefined): string | null {
  const r = parseRecurrence(rule);
  if (!r) return null;
  if (r.interval === 1) return RECURRENCE_LABELS[r.freq];
  const unit = r.freq === 'DAILY' ? 'ngày' : r.freq === 'WEEKLY' ? 'tuần' : 'tháng';
  return `${r.interval} ${unit} một lần`;
}

/** Cộng một chu kỳ. Tháng ngắn hơn thì dừng ở ngày cuối tháng (31/01 → 28/02). */
export function addInterval(date: Date, r: Recurrence, times = 1): Date {
  const d = new Date(date.getTime());
  if (r.freq === 'DAILY') d.setDate(d.getDate() + r.interval * times);
  else if (r.freq === 'WEEKLY') d.setDate(d.getDate() + 7 * r.interval * times);
  else {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + r.interval * times);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d;
}

/**
 * Hạn của lần kế tiếp: lần đầu tiên sau `previousDue` mà không rơi vào quá khứ
 * (việc bị đóng muộn nhiều chu kỳ thì nhảy thẳng tới chu kỳ hiện tại, không đẻ
 * ra một loạt việc đã trễ hạn).
 */
export function nextDueDate(previousDue: Date, r: Recurrence, now = new Date()): Date {
  let times = 1;
  let next = addInterval(previousDue, r, times);
  // Giới hạn vòng lặp: tối đa ~10 năm chu kỳ ngày
  while (next < now && times < 4000) {
    times += 1;
    next = addInterval(previousDue, r, times);
  }
  return next;
}
