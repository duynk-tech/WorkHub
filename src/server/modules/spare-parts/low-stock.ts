import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Hàng dưới ngưỡng an toàn và số lượng nên đặt thêm.
 * Không import server-only: job `low-stock` gọi trực tiếp dưới tsx.
 */

export interface LowStockItem {
  id: number;
  itemCode: string;
  name: string;
  unit: string;
  minStockAlert: number;
  stock: number;
  /** Đang trên đường về (PO chưa nhập kho). */
  onOrder: number;
  suggestedQty: number;
}

/** PO còn mở — hàng chưa vào kho nhưng đã đặt, không gợi ý đặt trùng. */
export const OPEN_PO_STATUSES = ['REQUESTED', 'ORDERED_SUPPLIER', 'SHIPPING_INTL', 'CUSTOMS_CLEARING', 'ARRIVED_WAREHOUSE', 'INSPECTING'];

/** Đặt đủ lên gấp đôi ngưỡng, trừ phần đang tồn và đang về. */
export function suggestReorderQty(minStockAlert: number, stock: number, onOrder: number): number {
  return Math.max(0, minStockAlert * 2 - Math.max(0, stock) - Math.max(0, onOrder));
}

export async function findLowStockItems(limit = 200): Promise<LowStockItem[]> {
  const rows = await prisma.$queryRaw<{ id: number; itemCode: string; name: string; unit: string; minStockAlert: number; stock: bigint; onOrder: bigint }[]>(Prisma.sql`
    SELECT i."id", i."itemCode", i."name", i."unit", i."minStockAlert",
           COALESCE(s.qty, 0) AS "stock",
           COALESCE(o.qty, 0) AS "onOrder"
    FROM "InventoryItem" i
    LEFT JOIN (SELECT "itemId", SUM("quantity") AS qty FROM "InventoryStock" GROUP BY "itemId") s ON s."itemId" = i."id"
    LEFT JOIN (
      SELECT oi."itemId", SUM(oi."quantity") AS qty
      FROM "SparePartOrderItem" oi JOIN "SparePartOrder" po ON po."id" = oi."orderId"
      WHERE po."status" IN (${Prisma.join(OPEN_PO_STATUSES)})
      GROUP BY oi."itemId"
    ) o ON o."itemId" = i."id"
    WHERE i."status" = 'ACTIVE'
      AND i."supplyType" = 'READY_STOCK'
      AND i."minStockAlert" > 0
      AND COALESCE(s.qty, 0) <= i."minStockAlert"
    ORDER BY (COALESCE(s.qty, 0)::float / NULLIF(i."minStockAlert", 0)) ASC, i."name" ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => {
    const stock = Number(r.stock);
    const onOrder = Number(r.onOrder);
    return { ...r, stock, onOrder, suggestedQty: suggestReorderQty(r.minStockAlert, stock, onOrder) };
  });
}
