import type { PrismaClient } from '@prisma/client';

/** Fail before destructive seed work when the cost/discount migration is pending. */
export async function assertDemoSeedSchema(db: PrismaClient) {
  const columns = await db.$queryRaw<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        (TABLE_NAME = 'InventoryItem' AND COLUMN_NAME IN ('avgBaseCost', 'avgShippingCost', 'avgOtherCost'))
        OR (TABLE_NAME = 'InventoryTransactionItem' AND COLUMN_NAME IN ('baseUnitCost', 'shippingUnitCost', 'otherUnitCost'))
        OR (TABLE_NAME = 'CustomerOrderItem' AND COLUMN_NAME = 'discountAmount')
      )
  `;
  const found = new Set(columns.map((column) => `${column.TABLE_NAME}.${column.COLUMN_NAME}`));
  const required = [
    'InventoryItem.avgBaseCost',
    'InventoryItem.avgShippingCost',
    'InventoryItem.avgOtherCost',
    'InventoryTransactionItem.baseUnitCost',
    'InventoryTransactionItem.shippingUnitCost',
    'InventoryTransactionItem.otherUnitCost',
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
