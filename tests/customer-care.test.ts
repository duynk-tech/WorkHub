import { describe, it, expect } from 'vitest';
import { classifyMachine, daysUntil, CARE_REASONS } from '@/server/modules/customer/care';

const TODAY = new Date(2026, 8, 22); // 22/09/2026
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('đếm ngày tới hạn', () => {
  it('hôm nay là 0, mai là 1, hôm qua là -1', () => {
    expect(daysUntil(d(2026, 9, 22), TODAY)).toBe(0);
    expect(daysUntil(d(2026, 9, 23), TODAY)).toBe(1);
    expect(daysUntil(d(2026, 9, 21), TODAY)).toBe(-1);
  });

  it('không có ngày thì trả null, không phải 0', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
  });

  it('so theo ngày, không theo giờ — 23h hôm nay vẫn là 0 ngày', () => {
    expect(daysUntil(new Date(2026, 8, 22, 23, 59), TODAY)).toBe(0);
  });
});

describe('máy nào cần chăm sóc', () => {
  const classify = (w: Date | null, pm: Date | null, within = 30) =>
    classifyMachine({ warrantyExpiresAt: w, nextPmDate: pm }, within, 30, TODAY);

  it('bảo hành hết trong 30 ngày thì vào danh sách', () => {
    const r = classify(d(2026, 10, 10), null);
    expect(r?.reasons).toEqual(['WARRANTY_SOON']);
    expect(r?.daysLeft).toBe(18);
  });

  it('bảo hành còn xa thì bỏ qua', () => {
    expect(classify(d(2027, 5, 1), null)).toBeNull();
  });

  it('bảo hành vừa hết trong 30 ngày qua vẫn phải gọi', () => {
    const r = classify(d(2026, 9, 10), null);
    expect(r?.reasons).toEqual(['WARRANTY_JUST_EXPIRED']);
    expect(r?.daysLeft).toBe(-12);
  });

  it('bảo hành hết quá lâu thì thôi, không gọi nữa', () => {
    expect(classify(d(2026, 1, 1), null)).toBeNull();
  });

  it('bảo dưỡng quá hạn luôn được nhắc, dù trễ bao lâu', () => {
    const r = classify(null, d(2025, 1, 1));
    expect(r?.reasons).toEqual(['PM_OVERDUE']);
    expect(r!.daysLeft).toBeLessThan(-300);
  });

  it('một máy có thể vướng cả hai lý do cùng lúc', () => {
    const r = classify(d(2026, 10, 5), d(2026, 9, 25));
    expect(r?.reasons.sort()).toEqual(['PM_DUE', 'WARRANTY_SOON']);
    // Lấy mốc gấp nhất để xếp thứ tự gọi
    expect(r?.daysLeft).toBe(3);
  });

  it('máy không có mốc nào thì không vào danh sách', () => {
    expect(classify(null, null)).toBeNull();
  });

  it('đổi cửa sổ theo dõi thì phạm vi đổi theo', () => {
    expect(classify(d(2026, 11, 20), null, 30)).toBeNull();
    expect(classify(d(2026, 11, 20), null, 90)?.reasons).toEqual(['WARRANTY_SOON']);
  });

  it('hết hạn đúng hôm nay vẫn tính là sắp hết, không phải đã hết', () => {
    expect(classify(d(2026, 9, 22), null)?.reasons).toEqual(['WARRANTY_SOON']);
  });

  it('mọi lý do đều có nhãn tiếng Việt', () => {
    for (const cfg of Object.values(CARE_REASONS)) expect(cfg.label).toBeTruthy();
  });
});
