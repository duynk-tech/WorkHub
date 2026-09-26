import { describe, it, expect } from 'vitest';
import { orderDebt, summarizeCustomerDebt } from '@/server/modules/customer/service';
import { supplierOrderDebt, summarizeSupplierDebt } from '@/server/modules/spare-parts/service';

describe('Công nợ nhà cung cấp', () => {
  const yesterday = new Date(Date.now() - 86_400_000);

  it('phiếu trả một phần thì còn nợ đúng phần chênh', () => {
    const d = supplierOrderDebt({ totalVnd: 50_000_000, paidAmount: 20_000_000 });
    expect(d.remaining).toBe(30_000_000);
    expect(d.overdue).toBe(false);
  });

  it('phiếu đã hủy không tính vào công nợ phải trả', () => {
    const d = supplierOrderDebt({ totalVnd: 50_000_000, paidAmount: 0, status: 'CANCELLED' });
    expect(d.total).toBe(0);
    expect(d.remaining).toBe(0);
  });

  it('quá hạn khi còn nợ và đã qua ngày hạn', () => {
    expect(supplierOrderDebt({ totalVnd: 1_000_000, paidAmount: 0, dueDate: yesterday }).overdue).toBe(true);
    expect(supplierOrderDebt({ totalVnd: 1_000_000, paidAmount: 1_000_000, dueDate: yesterday }).overdue).toBe(false);
  });

  it('tổng hợp công nợ phải trả theo nhiều phiếu', () => {
    const s = summarizeSupplierDebt([
      { totalVnd: 30_000_000, paidAmount: 30_000_000 },
      { totalVnd: 20_000_000, paidAmount: 5_000_000, dueDate: yesterday },
    ]);
    expect(s.totalBilled).toBe(50_000_000);
    expect(s.outstanding).toBe(15_000_000);
    expect(s.overdue).toBe(15_000_000);
    expect(s.overdueOrders).toBe(1);
  });

  it('phần trả nhà cung cấp tính theo giá vốn tiền hàng (subtotal - discount), không tính cước và hải quan', () => {
    const d = supplierOrderDebt({
      subtotalVnd: 56_000_000,
      discountVnd: 0,
      shippingFee: 6_500_000,
      customsFee: 2_200_000,
      totalVnd: 64_700_000,
      paidAmount: 32_000_000,
    });
    expect(d.total).toBe(56_000_000);
    expect(d.remaining).toBe(24_000_000);
  });
});

describe('Trả hàng ảnh hưởng công nợ', () => {
  it('khách chưa trả tiền: trả hàng làm giảm khoản phải thu', () => {
    const d = orderDebt({ totalAmount: 10_000_000, paidAmount: 0, returnedAmount: 3_000_000 });
    expect(d.returned).toBe(3_000_000);
    expect(d.remaining).toBe(7_000_000);
  });

  it('khách đã trả đủ rồi hoàn tiền: công nợ về 0, không âm', () => {
    // Hoàn tiền đã ghi phiếu chi nên paidAmount giảm còn 7tr
    const d = orderDebt({ totalAmount: 10_000_000, paidAmount: 7_000_000, returnedAmount: 3_000_000 });
    expect(d.remaining).toBe(0);
  });

  it('giá trị trả không vượt quá giá trị đơn', () => {
    const d = orderDebt({ totalAmount: 5_000_000, paidAmount: 0, returnedAmount: 9_000_000 });
    expect(d.returned).toBe(5_000_000);
    expect(d.remaining).toBe(0);
  });

  it('tổng hợp công nợ khách có tách riêng phần hàng trả lại', () => {
    const s = summarizeCustomerDebt([
      { totalAmount: 10_000_000, paidAmount: 0, returnedAmount: 2_000_000 },
      { totalAmount: 5_000_000, paidAmount: 5_000_000 },
    ]);
    expect(s.totalReturned).toBe(2_000_000);
    expect(s.outstanding).toBe(8_000_000);
  });
});
