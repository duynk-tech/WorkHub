import { describe, it, expect } from 'vitest';
import { ORDER_STATUSES } from '@/server/modules/customer/types';
import { summarizeOrder } from '@/server/modules/customer/service';
import { ORDER_STATUSES as SUPPLIER_ORDER_STATUSES } from '@/server/modules/spare-parts/types';

describe('Vòng đời giao hàng của đơn hàng khách', () => {
  it('có đủ các chặng từ lúc chốt đơn tới lúc giao xong', () => {
    const ladder = [
      'PENDING',
      'CONFIRMED',
      'AWAITING_STOCK',
      'READY_TO_DELIVER',
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
    ];
    for (const code of ladder) {
      expect(ORDER_STATUSES[code], `thiếu trạng thái ${code}`).toBeDefined();
      expect(ORDER_STATUSES[code].label.length).toBeGreaterThan(0);
    }
  });

  it('hai chặng chờ hàng có nhãn tiếng Việt rõ nghĩa cho sale', () => {
    expect(ORDER_STATUSES.AWAITING_STOCK.label).toBe('Chờ hàng về');
    expect(ORDER_STATUSES.READY_TO_DELIVER.label).toBe('Đã có hàng, chờ giao');
  });

  it('tổng đơn hàng gồm tiền hàng, cước và VAT — khớp với báo giá', () => {
    const s = summarizeOrder([{ quantity: 2, unitPrice: 9_500_000 }], 8, 4_500_000);
    expect(s.goodsAmount).toBe(19_000_000);
    expect(s.shippingFee).toBe(4_500_000);
    // VAT tính trên cả tiền hàng lẫn cước
    expect(s.vatAmount).toBe(1_880_000);
    expect(s.totalAmount).toBe(25_380_000);
  });

  it('đơn không cước không VAT thì tổng đúng bằng tiền hàng', () => {
    const s = summarizeOrder([{ quantity: 1, unitPrice: 5_000_000 }]);
    expect(s.totalAmount).toBe(5_000_000);
    expect(s.vatAmount).toBe(0);
  });

  it('đơn không cước vận chuyển, VAT 8% tính thuần trên giá bán', () => {
    const s = summarizeOrder([{ quantity: 2, unitPrice: 5_000_000 }], 8, 0);
    expect(s.goodsAmount).toBe(10_000_000);
    expect(s.shippingFee).toBe(0);
    // VAT 8% chỉ tính trên giá bán 10.000.000₫
    expect(s.vatAmount).toBe(800_000);
    expect(s.totalAmount).toBe(10_800_000);
  });

  it('trạng thái phiếu nhà cung cấp vẫn giữ mốc về kho để kích hoạt nhập kho', () => {
    expect(SUPPLIER_ORDER_STATUSES.ARRIVED_WAREHOUSE).toBeDefined();
    expect(SUPPLIER_ORDER_STATUSES.COMPLETED).toBeDefined();
  });
});
