import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { deleteCustomerOrder } from '@/server/modules/customer/service';

afterEach(() => vi.restoreAllMocks());
describe('Bảo toàn chứng từ đơn bán', () => {
  const base = { id: 1, status: 'PENDING', paidAmount: 0, returnedAmount: 0, stockIssuedAt: null, _count: { payments: 0, returns: 0, allocations: 0 } };
  function mock(order: any, stockCount = 0) {
    const tx = { customerOrder: { findUnique: vi.fn().mockResolvedValue(order), delete: vi.fn().mockResolvedValue(order) }, inventoryTransaction: { count: vi.fn().mockResolvedValue(stockCount) } };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    return tx;
  }
  it.each([
    { ...base, status: 'COMPLETED' },
    { ...base, paidAmount: 100 },
    { ...base, _count: { payments: 0, returns: 0, allocations: 1 } },
    { ...base, returnedAmount: 100 },
  ])('chặn đơn đã có nghiệp vụ', async (order) => {
    const tx = mock(order);
    await expect(deleteCustomerOrder(1)).rejects.toThrow('Chỉ được xóa');
    expect(tx.customerOrder.delete).not.toHaveBeenCalled();
  });
  it('giữ đơn có phiếu kho kể cả chưa thu tiền', async () => {
    const tx = mock(base, 1);
    await expect(deleteCustomerOrder(1)).rejects.toThrow('Chỉ được xóa');
    expect(tx.customerOrder.delete).not.toHaveBeenCalled();
  });
  it('cho phép xóa đơn chờ xác nhận chưa phát sinh', async () => {
    mock(base);
    await expect(deleteCustomerOrder(1)).resolves.toEqual(base);
  });
});
