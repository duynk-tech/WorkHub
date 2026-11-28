import { describe, it, expect } from 'vitest';
import { addInterval, describeRecurrence, formatRecurrence, nextDueDate, parseRecurrence } from '@/lib/task-recurrence';
import { shouldEscalate } from '@/server/modules/workflow/escalation';
import { normalizeReportRange } from '@/server/modules/report/service';
import { isTaskOverdue } from '@/lib/task-state';
import { extractMentions } from '@/lib/mentions';
import { mapLimit } from '@/lib/concurrency';

describe('Quy tắc lặp công việc', () => {
  it('đọc và ghi lại quy tắc', () => {
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=2')).toEqual({ freq: 'WEEKLY', interval: 2 });
    expect(parseRecurrence('freq=daily')).toEqual({ freq: 'DAILY', interval: 1 });
    expect(formatRecurrence({ freq: 'MONTHLY', interval: 1 })).toBe('FREQ=MONTHLY');
    expect(describeRecurrence('FREQ=MONTHLY;INTERVAL=3')).toBe('3 tháng một lần');
  });

  it('bỏ quy tắc sai', () => {
    expect(parseRecurrence('FREQ=YEARLY')).toBeNull();
    expect(parseRecurrence('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRecurrence('')).toBeNull();
  });

  it('cộng tháng dừng ở ngày cuối tháng', () => {
    const d = addInterval(new Date(2026, 0, 31, 9), { freq: 'MONTHLY', interval: 1 });
    expect([d.getMonth(), d.getDate()]).toEqual([1, 28]);
  });

  it('đóng trễ nhiều chu kỳ thì nhảy tới chu kỳ chưa qua, không đẻ việc đã trễ', () => {
    const now = new Date(2026, 10, 28, 12);
    const next = nextDueDate(new Date(2026, 10, 1, 17), { freq: 'WEEKLY', interval: 1 }, now);
    expect(next >= now).toBe(true);
    expect(next.getDay()).toBe(new Date(2026, 10, 1).getDay());
    expect(next.getTime() - now.getTime()).toBeLessThan(7 * 86_400_000);
  });

  it('đúng hạn thì chỉ cộng một chu kỳ', () => {
    const now = new Date(2026, 10, 28, 8);
    const next = nextDueDate(new Date(2026, 10, 28, 17), { freq: 'DAILY', interval: 1 }, now);
    expect(next.getDate()).toBe(29);
  });
});

describe('Leo thang SLA phê duyệt', () => {
  const due = new Date('2026-11-28T00:00:00Z');
  it('chỉ chuyển cấp khi đã quá thêm một khoảng SLA', () => {
    expect(shouldEscalate({ dueAt: due, slaHours: 24 }, new Date('2026-11-28T23:00:00Z'))).toBe(false);
    expect(shouldEscalate({ dueAt: due, slaHours: 24 }, new Date('2026-11-29T00:00:00Z'))).toBe(true);
  });
  it('bước không có SLA thì không chuyển', () => {
    expect(shouldEscalate({ dueAt: due, slaHours: null }, new Date('2027-01-01'))).toBe(false);
    expect(shouldEscalate({ dueAt: null, slaHours: 8 }, new Date('2027-01-01'))).toBe(false);
  });
});

describe('Khoảng ngày báo cáo', () => {
  const today = new Date('2026-11-28T05:00:00Z');
  it('ngày sai định dạng rơi về đầu năm → hôm nay', () => {
    expect(normalizeReportRange('abc', undefined, today)).toMatchObject({ from: '2026-01-01', to: '2026-11-28' });
  });
  it('đảo ngược thì hoán đổi', () => {
    expect(normalizeReportRange('2026-05-01', '2026-03-01', today)).toMatchObject({ from: '2026-03-01', to: '2026-05-01' });
  });
  it('dài quá 366 ngày thì cắt bớt đầu', () => {
    const r = normalizeReportRange('2000-01-01', '2026-11-28', today);
    expect(r.clamped).toBe(true);
    expect(r.from).toBe('2025-11-27');
    expect(r.to).toBe('2026-11-28');
  });
});

describe('Tiện ích', () => {
  it('quá hạn chỉ tính việc chưa đóng', () => {
    const now = new Date('2026-11-28');
    expect(isTaskOverdue({ dueDate: '2026-11-01', status: 'IN_PROGRESS' }, now)).toBe(true);
    expect(isTaskOverdue({ dueDate: '2026-11-01', status: 'DONE' }, now)).toBe(false);
    expect(isTaskOverdue({ dueDate: null, status: 'TODO' }, now)).toBe(false);
  });

  it('tách @mention, bỏ email và dấu chấm cuối câu', () => {
    expect(extractMentions('Nhờ @an.nguyen và @Binh xem giúp. Gửi mail a@b.com, cảm ơn @an.nguyen.')).toEqual(['an.nguyen', 'binh']);
  });

  it('mapLimit giữ thứ tự và không vượt giới hạn song song', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
