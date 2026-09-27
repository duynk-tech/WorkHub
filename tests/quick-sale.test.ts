import { afterEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { completeQuickSale } from '@/server/modules/customer/quick-sale';
afterEach(() => vi.restoreAllMocks());
const input = { requestId: 'e5fe4f0a-5650-4d1d-9f24-c50b84d94bb4', warehouseId: 1, vatRate: 8, cash: 100, transfer: 116, items: [{ itemId: 2, quantity: 2, unitPrice: 100, discount: 0 }] };
function setup(stock = 1) {
  const tx = {
    customerOrder: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 1, orderCode: 'POS-TEST' }) },
    warehouse: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) },
    inventoryItem: { findMany: vi.fn().mockResolvedValue([{ id: 2, name: 'Lõi lọc', avgCost: 50 }]) },
    customer: { upsert: vi.fn().mockResolvedValue({ id: 1, name: 'Khách lẻ' }) },
    inventoryStock: { updateMany: vi.fn().mockResolvedValue({ count: stock }) },
    inventoryTransaction: { create: vi.fn() }, customerPayment: { create: vi.fn() }, auditLog: { create: vi.fn() },
  };
  vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
  return tx;
}
it('thu đủ tiền, lưu hai khoản phân bổ và giá vốn phiếu xuất', async () => {
  const tx = setup(); await completeQuickSale(input, 7);
  expect(tx.customerPayment.create).toHaveBeenCalledTimes(2);
  expect(tx.customerOrder.create.mock.calls[0][0].data).toMatchObject({ paidAmount: 216, totalAmount: 216, status: 'COMPLETED' });
  expect(tx.inventoryTransaction.create.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitCost: 50, quantity: 2 });
});
it('thiếu tồn không tạo đơn hoặc phiếu tiền', async () => {
  const tx = setup(0); await expect(completeQuickSale(input, 7)).rejects.toThrow('Không đủ tồn');
  expect(tx.customerOrder.create).not.toHaveBeenCalled(); expect(tx.customerPayment.create).not.toHaveBeenCalled();
});
it('chặn thiếu tiền và dòng trùng trước khi ghi DB', async () => {
  const tx = setup(); await expect(completeQuickSale({ ...input, cash: 0 }, 7)).rejects.toThrow('thu đủ');
  await expect(completeQuickSale({ ...input, items: [...input.items, ...input.items] }, 7)).rejects.toThrow('trùng');
  expect(tx.inventoryStock.updateMany).not.toHaveBeenCalled();
});
it('gửi lại cùng yêu cầu không xuất hoặc thu lần hai', async () => {
  const tx = setup(); await completeQuickSale(input, 7);
  const saved = tx.customerOrder.create.mock.calls[0][0].data;
  tx.customerOrder.findUnique.mockResolvedValue({ id: 1, ...saved });
  await completeQuickSale(input, 7);
  expect(tx.customerOrder.create).toHaveBeenCalledTimes(1);
  expect(tx.customerPayment.create).toHaveBeenCalledTimes(2);
  await expect(completeQuickSale({ ...input, cash: 216, transfer: 0 }, 7)).rejects.toThrow('nội dung khác');
});
