'use server';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { completeQuickSale } from './quick-sale';
async function authorize() {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE') || !can(ctx, 'FEATURE_SPARE_PARTS_MANAGE')) throw new Error('Cần quyền bán hàng và xuất kho để bán nhanh.');
  return ctx;
}
export async function quickSaleCatalogAction() {
  await authorize();
  const [warehouses, items] = await Promise.all([
    prisma.warehouse.findMany({ select: { id: true, name: true } }),
    prisma.inventoryItem.findMany({ where: { status: 'ACTIVE', category: { in: ['SPARE_PART', 'CONSUMABLE'] } }, select: { id: true, itemCode: true, name: true, sellingPrice: true, stocks: { select: { warehouseId: true, quantity: true } } } }),
  ]);
  return { warehouses, items: items.map(i => ({ ...i, sellingPrice: Number(i.sellingPrice ?? 0) })) };
}
export async function quickSaleAction(input: unknown) {
  const ctx = await authorize();
  try {
    const order = await completeQuickSale(input, ctx.userId);
    for (const path of ['/sales', '/customers', '/spare-parts', '/reports', '/dashboard']) revalidatePath(path);
    return { ok: true as const, order };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Không thể thanh toán.' };
  }
}
