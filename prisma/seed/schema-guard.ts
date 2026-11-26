import type { PrismaClient } from '@prisma/client';

/** Fail before destructive seed work when the cost/discount migration is pending. */
export async function assertDemoSeedSchema(db: PrismaClient) {
  const columns = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
        (table_name = 'InventoryItem' AND column_name IN ('avgBaseCost', 'avgShippingCost', 'avgOtherCost'))
        OR (table_name = 'InventoryTransactionItem' AND column_name IN ('baseUnitCost', 'shippingUnitCost', 'otherUnitCost'))
        OR (table_name = 'SparePartOrderItem' AND column_name IN ('shippingFee', 'customsFee'))
        OR (table_name = 'CustomerOrderItem' AND column_name = 'discountAmount')
      )
  `;
  const found = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  const required = [
    'InventoryItem.avgBaseCost',
    'InventoryItem.avgShippingCost',
    'InventoryItem.avgOtherCost',
    'InventoryTransactionItem.baseUnitCost',
    'InventoryTransactionItem.shippingUnitCost',
    'InventoryTransactionItem.otherUnitCost',
    'SparePartOrderItem.shippingFee',
    'SparePartOrderItem.customsFee',
    'CustomerOrderItem.discountAmount',
  ];
  const missing = required.filter((column) => !found.has(column));
  if (missing.length) {
    throw new Error(
      `Database chưa có các cột snapshot cần cho seed: ${missing.join(', ')}. ` +
      'Hãy chạy npm run db:deploy rồi mới reset/nạp dữ liệu demo.',
    );
  }
}
