/**
 * Bộ lọc thời gian dùng chung cho công việc.
 *
 * Chọn được cả TRƯỜNG ngày (ngày đến hạn, ngày bắt đầu, ngày tạo, ngày hoàn thành)
 * lẫn KHOẢNG ngày, nên một bộ điều khiển phục vụ được nhiều câu hỏi khác nhau:
 * "việc đến hạn tuần này", "việc tạo trong tháng", "việc xong quý trước"...
 *
 * File thuần tính toán để màn hình client import và kiểm thử được.
 */

export type TaskDateField = 'dueDate' | 'startDate' | 'createdAt' | 'completedAt';

export const TASK_DATE_FIELDS: Record<TaskDateField, string> = {
  dueDate: 'Ngày đến hạn',
  startDate: 'Ngày bắt đầu',
  createdAt: 'Ngày tạo',
  completedAt: 'Ngày hoàn thành',
};

export type TaskDatePreset =
  | 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'NEXT_7' | 'THIS_MONTH'
  | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'NO_DATE' | 'CUSTOM';

export const TASK_DATE_PRESETS: Record<TaskDatePreset, string> = {
  ALL: 'Mọi thời điểm',
  TODAY: 'Hôm nay',
  TOMORROW: 'Ngày mai',
  THIS_WEEK: 'Tuần này',
  NEXT_7: '7 ngày tới',
  THIS_MONTH: 'Tháng này',
  LAST_MONTH: 'Tháng trước',
  THIS_QUARTER: 'Quý này',
  THIS_YEAR: 'Năm nay',
  NO_DATE: 'Chưa đặt ngày',
  CUSTOM: 'Khoảng cụ thể',
};

/** Ngày dạng YYYY-MM-DD theo giờ máy chủ — không dùng toISOString vì lệch múi giờ. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const shift = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Quy đổi preset thành khoảng ngày cụ thể.
 * `null` nghĩa là không chặn đầu đó; cả hai `null` là không lọc.
 * Tuần bắt đầu từ thứ Hai theo thông lệ Việt Nam.
 */
export function resolveDateRange(
  preset: TaskDatePreset,
  custom: { from?: string; to?: string } = {},
  today = new Date(),
): { from: string | null; to: string | null; noDate: boolean } {
  const none = { from: null, to: null, noDate: false };

  switch (preset) {
    case 'TODAY':
      return { from: ymd(today), to: ymd(today), noDate: false };

    case 'TOMORROW': {
      const t = ymd(shift(today, 1));
      return { from: t, to: t, noDate: false };
    }

    case 'THIS_WEEK': {
      // getDay(): 0 = Chủ nhật, nên Chủ nhật lùi 6 ngày mới về thứ Hai
      const offset = today.getDay() === 0 ? -6 : 1 - today.getDay();
      const monday = shift(today, offset);
      return { from: ymd(monday), to: ymd(shift(monday, 6)), noDate: false };
    }

    case 'NEXT_7':
      return { from: ymd(today), to: ymd(shift(today, 6)), noDate: false };

    case 'THIS_MONTH': {
      const y = today.getFullYear();
      const m = today.getMonth();
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)), noDate: false };
    }

    case 'LAST_MONTH': {
      const y = today.getFullYear();
      const m = today.getMonth() - 1;
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)), noDate: false };
    }

    case 'THIS_QUARTER': {
      const y = today.getFullYear();
      const q = Math.floor(today.getMonth() / 3);
      return { from: ymd(new Date(y, q * 3, 1)), to: ymd(new Date(y, q * 3 + 3, 0)), noDate: false };
    }

    case 'THIS_YEAR': {
      const y = today.getFullYear();
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)), noDate: false };
    }

    case 'NO_DATE':
      return { from: null, to: null, noDate: true };

    case 'CUSTOM':
      return { from: custom.from || null, to: custom.to || null, noDate: false };

    default:
      return none;
  }
}

/** Nhãn gọn để hiển thị lại lựa chọn đang áp dụng. */
export function describeDateFilter(
  field: TaskDateField,
  preset: TaskDatePreset,
  range: { from: string | null; to: string | null; noDate: boolean },
): string | null {
  if (preset === 'ALL') return null;
  if (range.noDate) return `${TASK_DATE_FIELDS[field]}: chưa đặt`;
  if (!range.from && !range.to) return null;

  const vn = (iso: string) => iso.split('-').reverse().join('/');
  if (range.from && range.to) {
    return range.from === range.to
      ? `${TASK_DATE_FIELDS[field]}: ${vn(range.from)}`
      : `${TASK_DATE_FIELDS[field]}: ${vn(range.from)} – ${vn(range.to)}`;
  }
  return range.from
    ? `${TASK_DATE_FIELDS[field]}: từ ${vn(range.from)}`
    : `${TASK_DATE_FIELDS[field]}: đến ${vn(range.to!)}`;
}
