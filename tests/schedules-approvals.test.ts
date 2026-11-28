import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/modules/notify/service', () => ({ notify: vi.fn() }));
vi.mock('@/server/modules/settings/branding', () => ({ getAppBranding: vi.fn() }));
vi.mock('@/server/modules/report/excel-sheets', () => ({ buildReportSheets: vi.fn() }));

import { isScheduleDue, periodFor } from '@/server/modules/report/schedules';
import { signActionToken, verifyActionToken } from '@/server/lib/action-token';

// 2026-03-02 là thứ Hai; 08:00 giờ VN = 01:00 UTC
const MON = new Date('2026-03-02T01:00:00Z');

describe('Lịch gửi báo cáo', () => {
  it('đến hạn theo ngày/thứ/ngày trong tháng và không gửi hai lần trong ngày', () => {
    expect(isScheduleDue('daily', null, MON)).toBe(true);
    expect(isScheduleDue('daily', new Date('2026-03-02T00:30:00Z'), MON)).toBe(false); // đã chạy 07:30 VN cùng ngày
    expect(isScheduleDue('daily', new Date('2026-03-01T10:00:00Z'), MON)).toBe(true);
    expect(isScheduleDue('weekly:1', null, MON)).toBe(true);
    expect(isScheduleDue('weekly:5', null, MON)).toBe(false);
    expect(isScheduleDue('monthly:2', null, MON)).toBe(true);
    expect(isScheduleDue('monthly:1', null, MON)).toBe(false);
  });

  it('ngày 31 rơi vào ngày cuối của tháng ngắn', () => {
    expect(isScheduleDue('monthly:31', null, new Date('2026-02-28T01:00:00Z'))).toBe(true);
  });

  it('kỳ báo cáo khớp tần suất', () => {
    expect(periodFor('daily', MON)).toMatchObject({ from: '2026-03-01', to: '2026-03-01' });
    expect(periodFor('weekly:1', MON)).toMatchObject({ from: '2026-02-23', to: '2026-03-01' });
    expect(periodFor('monthly:1', MON)).toMatchObject({ month: '2026-02', from: '2026-02-01', to: '2026-02-28', year: 2026 });
  });
});

describe('Token duyệt nhanh', () => {
  beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-at-least-16-chars'; });
  it('ký và kiểm đúng loại, sai loại thì từ chối', async () => {
    const t = await signActionToken({ kind: 'workflow', id: 42 });
    expect(await verifyActionToken(t, 'workflow')).toEqual({ id: 42 });
    expect(await verifyActionToken(t, 'other')).toBeNull();
    expect(await verifyActionToken(`${t}x`, 'workflow')).toBeNull();
  });
});
