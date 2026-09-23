import { describe, it, expect } from 'vitest';
import { PAYMENT_METHODS } from '@/server/modules/customer/types';
import { orderDebt, summarizeCustomerDebt } from '@/server/modules/customer/service';

const yesterday = new Date(Date.now() - 86_400_000);
const tomorrow = new Date(Date.now() + 86_400_000);

describe('Công nợ khách hàng', () => {
  it('có đủ hình thức thanh toán thường dùng', () => {
    expect(PAYMENT_METHODS.TRANSFER.label).toBe('Chuyển khoản');
    expect(PAYMENT_METHODS.CASH.label).toBe('Tiền mặt');
    expect(PAYMENT_METHODS.OFFSET.label).toBe('Cấn trừ công nợ');
  });

  it('đơn thu một phần thì còn nợ đúng phần chênh', () => {
    const d = orderDebt({ totalAmount: 10_000_000, paidAmount: 4_000_000 });
    expect(d.remaining).toBe(6_000_000);
    expect(d.overdue).toBe(false);
  });

  it('thu dư không làm công nợ âm', () => {
    const d = orderDebt({ totalAmount: 5_000_000, paidAmount: 6_000_000 });
    expect(d.remaining).toBe(0);
  });

  it('đơn đã hủy không tính vào công nợ', () => {
    const d = orderDebt({ totalAmount: 9_000_000, paidAmount: 0, status: 'CANCELLED' });
    expect(d.total).toBe(0);
    expect(d.remaining).toBe(0);
  });

  it('quá hạn khi còn nợ và đã qua ngày hạn', () => {
    expect(orderDebt({ totalAmount: 1_000_000, paidAmount: 0, dueDate: yesterday }).overdue).toBe(true);
    expect(orderDebt({ totalAmount: 1_000_000, paidAmount: 0, dueDate: tomorrow }).overdue).toBe(false);
    // Đã thu đủ thì dù quá ngày cũng không còn là nợ quá hạn
    expect(orderDebt({ totalAmount: 1_000_000, paidAmount: 1_000_000, dueDate: yesterday }).overdue).toBe(false);
  });

  it('tổng hợp công nợ cả khách hàng, tách riêng phần quá hạn', () => {
    const s = summarizeCustomerDebt([
      { totalAmount: 10_000_000, paidAmount: 10_000_000 },
      { totalAmount: 20_000_000, paidAmount: 5_000_000, dueDate: yesterday },
      { totalAmount: 8_000_000, paidAmount: 0, dueDate: tomorrow },
      { totalAmount: 3_000_000, paidAmount: 0, status: 'CANCELLED' },
    ]);
    expect(s.totalBilled).toBe(38_000_000);
    expect(s.totalPaid).toBe(15_000_000);
    expect(s.outstanding).toBe(23_000_000);
    expect(s.overdue).toBe(15_000_000);
    expect(s.overdueOrders).toBe(1);
  });
});
