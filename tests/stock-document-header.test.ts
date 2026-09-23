import { describe, it, expect } from 'vitest';
import { SaveStockTransactionSchema } from '@/server/modules/spare-parts/types';

const base = {
  type: 'IN' as const,
  reasonCode: 'OTHER_IN',
  targetWarehouseId: 1,
  reason: 'Nhập hàng',
  items: [{ itemId: 1, quantity: 1 }],
};

/** Ngày chứng từ chốt vào 12h trưa để đọc lại theo UTC không lệch ngày. */
const toDocDate = (ymd?: string | null) => (ymd ? new Date(`${ymd}T12:00:00`) : new Date());

describe('phần đầu chứng từ kho', () => {
  it('nhận đủ ngày chứng từ, đối tác, số hóa đơn, người giao nhận', () => {
    const parsed = SaveStockTransactionSchema.parse({
      ...base,
      transDate: '2026-08-15',
      partnerName: 'Công ty TNHH Selmi Việt Nam',
      refNo: 'HD-0012345',
      deliveredBy: 'Trần Văn Giao',
      receivedBy: 'Lê Thủ Kho',
    });
    expect(parsed.transDate).toBe('2026-08-15');
    expect(parsed.partnerName).toBe('Công ty TNHH Selmi Việt Nam');
    expect(parsed.refNo).toBe('HD-0012345');
    expect(parsed.deliveredBy).toBe('Trần Văn Giao');
    expect(parsed.receivedBy).toBe('Lê Thủ Kho');
  });

  it('các trường mới đều không bắt buộc — phiếu tối giản vẫn lưu được', () => {
    const parsed = SaveStockTransactionSchema.parse(base);
    expect(parsed.transDate).toBeUndefined();
    expect(parsed.partnerName).toBeUndefined();
  });

  it('lý do vẫn bắt buộc như cũ', () => {
    expect(() => SaveStockTransactionSchema.parse({ ...base, reason: '' })).toThrow();
  });

  it('ngày chứng từ giữ nguyên ngày địa phương, không lùi khi đọc theo UTC', () => {
    expect(toDocDate('2026-08-15').toISOString().slice(0, 10)).toBe('2026-08-15');
    expect(toDocDate('2026-01-01').toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(toDocDate('2026-12-31').toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('bỏ trống ngày chứng từ thì lấy hôm nay', () => {
    const d = toDocDate(null);
    expect(d.toDateString()).toBe(new Date().toDateString());
  });

  it('phiếu điều chuyển không cần đối tác vì hai đầu đều là kho nhà', () => {
    const parsed = SaveStockTransactionSchema.parse({
      ...base, type: 'TRANSFER', reasonCode: 'WAREHOUSE_TRANSFER',
      sourceWarehouseId: 1, targetWarehouseId: 2, transDate: '2026-09-22',
    });
    expect(parsed.partnerName).toBeUndefined();
    expect(parsed.type).toBe('TRANSFER');
  });
});
