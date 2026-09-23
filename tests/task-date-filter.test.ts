import { describe, it, expect } from 'vitest';
import {
  resolveDateRange, describeDateFilter, ymd,
  TASK_DATE_FIELDS, TASK_DATE_PRESETS,
} from '@/server/modules/task/date-filter';

// Thứ Ba 22/09/2026 — giữa tuần, giữa tháng, quý 3
const TUE = new Date(2026, 8, 22);

describe('bộ lọc thời gian công việc', () => {
  it('ymd theo giờ máy chủ, không lệch múi giờ như toISOString', () => {
    expect(ymd(new Date(2026, 4, 1))).toBe('2026-05-01');
    expect(ymd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('hôm nay và ngày mai là khoảng một ngày', () => {
    expect(resolveDateRange('TODAY', {}, TUE)).toEqual({ from: '2026-09-22', to: '2026-09-22', noDate: false });
    expect(resolveDateRange('TOMORROW', {}, TUE)).toEqual({ from: '2026-09-23', to: '2026-09-23', noDate: false });
  });

  it('tuần này tính từ thứ Hai đến Chủ nhật', () => {
    expect(resolveDateRange('THIS_WEEK', {}, TUE)).toEqual({ from: '2026-09-21', to: '2026-09-27', noDate: false });
  });

  it('Chủ nhật vẫn thuộc tuần đang chạy, không nhảy sang tuần sau', () => {
    const sun = new Date(2026, 8, 27);
    expect(resolveDateRange('THIS_WEEK', {}, sun)).toEqual({ from: '2026-09-21', to: '2026-09-27', noDate: false });
  });

  it('7 ngày tới tính từ hôm nay', () => {
    expect(resolveDateRange('NEXT_7', {}, TUE)).toEqual({ from: '2026-09-22', to: '2026-09-28', noDate: false });
  });

  it('tháng này và tháng trước lấy đúng ngày cuối tháng', () => {
    expect(resolveDateRange('THIS_MONTH', {}, TUE)).toEqual({ from: '2026-09-01', to: '2026-09-30', noDate: false });
    expect(resolveDateRange('LAST_MONTH', {}, TUE)).toEqual({ from: '2026-08-01', to: '2026-08-31', noDate: false });
  });

  it('tháng trước của tháng 1 lùi sang tháng 12 năm ngoái', () => {
    const jan = new Date(2026, 0, 15);
    expect(resolveDateRange('LAST_MONTH', {}, jan)).toEqual({ from: '2025-12-01', to: '2025-12-31', noDate: false });
  });

  it('quý và năm lấy trọn kỳ', () => {
    expect(resolveDateRange('THIS_QUARTER', {}, TUE)).toEqual({ from: '2026-07-01', to: '2026-09-30', noDate: false });
    expect(resolveDateRange('THIS_YEAR', {}, TUE)).toEqual({ from: '2026-01-01', to: '2026-12-31', noDate: false });
  });

  it('"chưa đặt ngày" không sinh khoảng, chỉ bật cờ noDate', () => {
    expect(resolveDateRange('NO_DATE', {}, TUE)).toEqual({ from: null, to: null, noDate: true });
  });

  it('khoảng cụ thể lấy nguyên giá trị nhập, thiếu một đầu vẫn chấp nhận', () => {
    expect(resolveDateRange('CUSTOM', { from: '2026-03-01', to: '2026-03-15' }, TUE))
      .toEqual({ from: '2026-03-01', to: '2026-03-15', noDate: false });
    expect(resolveDateRange('CUSTOM', { from: '2026-03-01' }, TUE))
      .toEqual({ from: '2026-03-01', to: null, noDate: false });
  });

  it('"mọi thời điểm" không lọc gì', () => {
    expect(resolveDateRange('ALL', {}, TUE)).toEqual({ from: null, to: null, noDate: false });
  });

  it('nhãn mô tả đọc được bằng tiếng Việt', () => {
    const week = resolveDateRange('THIS_WEEK', {}, TUE);
    expect(describeDateFilter('dueDate', 'THIS_WEEK', week)).toBe('Ngày đến hạn: 21/09/2026 – 27/09/2026');
    expect(describeDateFilter('createdAt', 'TODAY', resolveDateRange('TODAY', {}, TUE))).toBe('Ngày tạo: 22/09/2026');
    expect(describeDateFilter('dueDate', 'NO_DATE', resolveDateRange('NO_DATE', {}, TUE))).toBe('Ngày đến hạn: chưa đặt');
    expect(describeDateFilter('dueDate', 'ALL', resolveDateRange('ALL', {}, TUE))).toBeNull();
  });

  it('mọi trường ngày và preset đều có nhãn', () => {
    for (const label of Object.values(TASK_DATE_FIELDS)) expect(label).toBeTruthy();
    for (const label of Object.values(TASK_DATE_PRESETS)) expect(label).toBeTruthy();
  });
});
