import { format, parseISO, startOfDay, endOfDay, eachDayOfInterval, differenceInMinutes } from 'date-fns';
import { vi } from 'date-fns/locale';

export const TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

export function fmtDate(value?: Date | string | null, pattern = 'dd/MM/yyyy') {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, pattern, { locale: vi });
}

export const fmtDateTime = (v?: Date | string | null) => fmtDate(v, 'dd/MM/yyyy HH:mm');
export const fmtTime = (v?: Date | string | null) => fmtDate(v, 'HH:mm');
export const fmtMonth = (v?: Date | string | null) => fmtDate(v, 'MM/yyyy');
export const fmtDayName = (v?: Date | string | null) => fmtDate(v, 'EEEE, dd/MM/yyyy');

/** "2 giờ trước", "3 ngày trước" */
export function fmtRelative(value?: Date | string | null) {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  const mins = differenceInMinutes(new Date(), d);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(d);
}

/** Date-only (UTC midnight) để lưu cột @db.Date, tránh lệch múi giờ */
export function dateOnly(value: Date | string): Date {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function dateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return format(d, 'yyyy-MM-dd');
}

export function daysBetween(start: Date | string, end: Date | string): Date[] {
  return eachDayOfInterval({
    start: startOfDay(typeof start === 'string' ? new Date(start) : start),
    end: endOfDay(typeof end === 'string' ? new Date(end) : end),
  });
}

/** Bitmask ca làm việc: bit0=CN, bit1=T2 … bit6=T7 */
export function isWorkDay(date: Date, workDays: number): boolean {
  return (workDays & (1 << date.getDay())) !== 0;
}

export const WORKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function workDaysToLabels(mask: number): string {
  const active = WORKDAY_LABELS.filter((_, i) => (mask & (1 << i)) !== 0);
  return active.length ? active.join(', ') : 'Không có';
}

/** "08:30" + phút → Date của ngày chỉ định */
export function timeOnDate(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export function minutesBetweenTimes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // ca qua đêm
  return diff;
}

export { startOfDay, endOfDay };
