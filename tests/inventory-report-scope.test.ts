import { afterEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getInventoryProfitReport, resolveRange } from '@/server/modules/spare-parts/report';
afterEach(() => vi.restoreAllMocks());
it('không biến hàng chiết khấu 100% thành doanh thu và chỉ đọc phiếu đã ghi sổ', async () => {
  vi.spyOn(prisma.sparePartOrder, 'findMany').mockResolvedValue([]);
  const vouchers = vi.spyOn(prisma.inventoryTransaction, 'findMany').mockResolvedValue([]);
  vi.spyOn(prisma.inventoryStock, 'groupBy').mockResolvedValue([] as any);
  vi.spyOn(prisma.customerOrder, 'findMany').mockResolvedValue([
    { goodsAmount: 0, shippingFee: 0, vatAmount: 0, returnedAmount: 0, items: [{ quantity: 1, unitPrice: 100, totalPrice: 0, inventoryItem: { id: 1, itemCode: 'A', name: 'A', unit: 'cái', costPrice: 10 } }] },
    { goodsAmount: 1000, vatAmount: 80, items: [{ quantity: 1, totalPrice: 1000, inventoryItem: null }] },
  ] as any);
  const range = resolveRange('MONTH', new Date(2026, 8, 1));
  const report = await getInventoryProfitReport(range);
  expect(vouchers.mock.calls[0][0]?.where).toEqual({ status: 'COMPLETED', transDate: { gte: range.from, lte: range.to } });
  expect(report.summary).toMatchObject({ revenue: 0, discount: 100, vatAmount: 0, orderCount: 1 });
});
