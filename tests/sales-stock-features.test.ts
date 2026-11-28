import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/modules/notify/service', () => ({ notify: vi.fn() }));
vi.mock('@/server/modules/settings/service', () => ({ getSetting: vi.fn() }));
vi.mock('@/server/modules/settings/branding', () => ({ getAppBranding: vi.fn() }));

import { suggestReorderQty } from '@/server/modules/spare-parts/low-stock';
import { targetProgress, vnDayOfMonth } from '@/lib/sales-target';
import { shouldRemindDebt } from '@/server/modules/customer/debt-reminders';
import { parseImportRows, cellText } from '@/server/modules/import/parse';
import { CUSTOMER_IMPORT, SPARE_PART_IMPORT, normalizeHeader } from '@/server/modules/import/definitions';

describe('Gợi ý đặt hàng', () => {
  it('đặt đủ lên gấp đôi ngưỡng, trừ tồn và hàng đang về', () => {
    expect(suggestReorderQty(5, 2, 0)).toBe(8);
    expect(suggestReorderQty(5, 2, 6)).toBe(2);
    expect(suggestReorderQty(5, 0, 20)).toBe(0);
    expect(suggestReorderQty(3, -4, 0)).toBe(6);
  });
});

describe('Chỉ tiêu doanh số', () => {
  it('tính % và dự báo cuối tháng theo tốc độ hiện tại', () => {
    const p = targetProgress(30_000_000, 100_000_000, 10, 30);
    expect(p.pct).toBeCloseTo(0.3);
    expect(p.forecast).toBe(90_000_000);
    expect(p.forecastPct).toBeCloseTo(0.9);
    expect(p.remaining).toBe(70_000_000);
  });
  it('chưa đặt chỉ tiêu thì không có %', () => {
    expect(targetProgress(5, 0, 1, 31).pct).toBeNull();
  });
  it('ngày theo giờ Việt Nam', () => {
    // 2026-01-31 18:00 UTC = 01:00 ngày 1/2 ở VN
    expect(vnDayOfMonth(new Date('2026-01-31T18:00:00Z'))).toEqual({ year: 2026, month: 2, day: 1, daysInMonth: 28 });
  });
});

describe('Nhắc công nợ', () => {
  it('nhắc ở mốc 1/7/15 rồi mỗi 15 ngày', () => {
    const days = Array.from({ length: 61 }, (_, i) => i).filter(shouldRemindDebt);
    expect(days).toEqual([1, 7, 15, 30, 45, 60]);
  });
});

describe('Nhập Excel', () => {
  it('khớp tiêu đề không dấu, báo lỗi theo số dòng và mã trùng trong file', () => {
    const rows = [
      ['Mã khách hàng *', 'TÊN KHÁCH HÀNG', 'SĐT', 'Email'],
      ['KH-1', 'Quán A', '0905123456', 'a@x.vn'],
      ['', '', '', ''],
      ['KH-2', '', '0905000000', ''],
      ['kh-1', 'Quán B', '0905999999', ''],
      ['KH-3', 'Quán C', 'abc', 'sai-email'],
    ];
    const r = parseImportRows(rows, CUSTOMER_IMPORT);
    expect(r.missingColumns).toEqual([]);
    expect(r.totalRows).toBe(4);
    expect(r.valid.map((v) => v.row)).toEqual([2]);
    expect(r.errors.map((e) => e.row)).toEqual([4, 5, 6]);
    expect(r.errors[1].message).toContain('trùng với dòng 2');
  });

  it('thiếu cột bắt buộc thì dừng ngay', () => {
    expect(parseImportRows([['Tên khách hàng']], CUSTOMER_IMPORT).missingColumns).toEqual(['Số điện thoại']);
  });

  it('phụ tùng: đọc số kiểu Việt Nam và loại bằng chữ', () => {
    const r = parseImportRows(
      [['Mã phụ tùng', 'Tên phụ tùng', 'Loại', 'ĐVT', 'Giá vốn (VND)', 'Ngưỡng tồn an toàn'], ['PT-1', 'Gioăng', 'Vật tư', 'Cái', '120.000', '3'], ['PT-2', 'Ốc', '', 'Cái', 'abc', '']],
      SPARE_PART_IMPORT,
    );
    expect(r.valid[0].data).toMatchObject({ itemCode: 'PT-1', category: 'CONSUMABLE', costPrice: 120000, minStockAlert: 3 });
    expect(r.errors[0]).toMatchObject({ row: 3 });
  });

  it('đọc ô công thức, rich text, ngày', () => {
    expect(cellText({ result: 42 })).toBe('42');
    expect(cellText({ richText: [{ text: 'Ab' }, { text: 'c ' }] })).toBe('Abc');
    expect(cellText(new Date('2026-03-04T00:00:00Z'))).toBe('2026-03-04');
    expect(normalizeHeader(' Đơn vị tính * ')).toBe('don vi tinh');
  });
});
