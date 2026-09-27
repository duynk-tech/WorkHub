import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createHash } from 'node:crypto';

export const quickSaleSchema = z.object({
  note: z.string().max(2000).optional(), invoiceNo: z.string().max(32).optional(), invoiceSerial: z.string().max(32).optional(), invoiceDate: z.string().date().optional(),
  requestId: z.string().uuid(), warehouseId: z.number().int().positive(),
  vatRate: z.number().min(0).max(100),
  cash: z.number().int().min(0).max(1e12), transfer: z.number().int().min(0).max(1e12),
  items: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.number().int().positive().max(100000), unitPrice: z.number().int().min(0).max(1e10), discount: z.number().int().min(0).max(1e12) })).min(1).max(100),
});
export async function completeQuickSale(raw: unknown, userId: number) {
  const input = quickSaleSchema.parse(raw);
  if (new Set(input.items.map(i => i.itemId)).size !== input.items.length) throw new Error('Mặt hàng bị trùng.');
  const goods = input.items.reduce((s, i) => {
    const gross = i.quantity * i.unitPrice;
    if (i.discount > gross) throw new Error('Chiết khấu vượt tiền hàng.');
    return s + gross - i.discount;
  }, 0);
  const vat = Math.round(goods * input.vatRate / 100);
  const total = goods + vat;
  if (total <= 0 || total > 1e12 || input.cash + input.transfer !== total) throw new Error('Bán nhanh yêu cầu thu đủ đúng tổng tiền hàng và VAT.');
  const code = `POS-${input.requestId}`;
  const fingerprint = createHash('sha256').update(JSON.stringify({ userId, input })).digest('hex');
  const note = `POS:${fingerprint}${input.note ? '\n' + input.note : ''}`;
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const previous = await tx.customerOrder.findUnique({ where: { orderCode: code } });
        if (previous) {
          if (previous.notes !== note) throw new Error('Yêu cầu thanh toán đã được dùng cho nội dung khác.');
          return { id: previous.id, orderCode: previous.orderCode };
        }
        await tx.warehouse.findUniqueOrThrow({ where: { id: input.warehouseId } });
        const products = await tx.inventoryItem.findMany({ where: { id: { in: input.items.map(i => i.itemId) }, status: 'ACTIVE', category: { in: ['SPARE_PART', 'CONSUMABLE'] } } });
        if (products.length !== input.items.length) throw new Error('Mặt hàng không tồn tại hoặc ngừng bán.');
        const customer = await tx.customer.upsert({ where: { code: 'POS-WALK-IN' }, update: {}, create: { code: 'POS-WALK-IN', name: 'Khách lẻ', phone: '', notes: 'Khách bán vãng lai' } });
        for (const line of input.items) {
          const changed = await tx.inventoryStock.updateMany({ where: { warehouseId: input.warehouseId, itemId: line.itemId, quantity: { gte: line.quantity } }, data: { quantity: { decrement: line.quantity } } });
          if (changed.count !== 1) throw new Error('Không đủ tồn kho. Vui lòng kiểm tra lại số lượng.');
        }
        const now = new Date();
        const order = await tx.customerOrder.create({ data: {
          invoiceNo: input.invoiceNo, invoiceSerial: input.invoiceSerial, invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
          orderCode: code, customerId: customer.id, orderType: 'SPARE_PART', status: 'COMPLETED', goodsAmount: goods,
          vatRate: input.vatRate, vatAmount: vat, totalAmount: total, paidAmount: total, stockIssuedAt: now, deliveryDate: now, notes: note,
          items: { create: input.items.map(i => ({ inventoryItemId: i.itemId, itemType: 'SPARE_PART', name: products.find(p => p.id === i.itemId)!.name, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.quantity * i.unitPrice - i.discount })) },
        } });
        const cost = (id: number) => { const p = products.find(p => p.id === id)!; return Number(p.avgCost ?? p.costPrice ?? 0); };
        await tx.inventoryTransaction.create({ data: {
          transCode: `X-${code}`, type: 'OUT', sourceWarehouseId: input.warehouseId, customerOrderId: order.id, reasonCode: 'SALE', status: 'COMPLETED', createdById: userId, partnerName: customer.name,
          totalValue: input.items.reduce((s, i) => s + cost(i.itemId) * i.quantity, 0),
          items: { create: input.items.map(i => ({ itemId: i.itemId, quantity: i.quantity, unitCost: cost(i.itemId), unitPrice: i.unitPrice })) },
        } });
        for (const [method, amount] of [['CASH', input.cash], ['TRANSFER', input.transfer]] as const) {
          if (!amount) continue;
          await tx.customerPayment.create({ data: { paymentCode: `${method === 'CASH' ? 'C' : 'T'}-${code}`, customerId: customer.id, orderId: order.id, amount, method, paidAt: now, createdById: userId, allocationVersion: 1, allocations: { create: { orderId: order.id, amount } } } });
        }
        await tx.auditLog.create({ data: { entityType: 'CustomerOrder', entityId: String(order.id), action: 'QUICK_SALE', diffJson: { userId, orderCode: code, total, warehouseId: input.warehouseId } } });
        return { id: order.id, orderCode: order.orderCode };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (attempt < 2 && ['P2034', 'P2002'].includes((error as { code?: string }).code ?? '')) continue;
      throw error;
    }
  }
}
