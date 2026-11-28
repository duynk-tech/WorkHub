import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { pageMeta, type ListQuery } from '@/lib/list-query';

/** Danh sách phiếu mua NCC (PO) phân trang phía server. */

export const PURCHASE_SORTS = ['created', 'eta', 'total'] as const;
export type PurchaseSort = (typeof PURCHASE_SORTS)[number];

export interface PurchaseListFilter {
  kind: 'ALL' | 'CUSTOMER' | 'STOCK';
  status?: string;
}

const IN_TRANSIT = ['ORDERED_SUPPLIER', 'SHIPPING_INTL', 'CUSTOMS_CLEARING', 'ARRIVED_WAREHOUSE'];
const IN_STOCKING = ['INSPECTING', 'STOCKED'];

const ROW_INCLUDE = {
  items: {
    include: {
      item: {
        select: {
          id: true, itemCode: true, name: true, unit: true, category: true, supplyType: true,
          costPrice: true, avgCost: true, sellingPrice: true, priceEur: true,
        },
      },
    },
  },
  targetWarehouse: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, code: true, name: true } },
  customerOrder: { select: { id: true, orderCode: true, customerId: true } },
  equipment: { select: { id: true, machineCode: true, name: true } },
  supplierPayments: {
    select: { id: true, paymentCode: true, amount: true, method: true, paidAt: true, reference: true, note: true },
    orderBy: { paidAt: 'desc' },
  },
} satisfies Prisma.SparePartOrderInclude;

function searchWhere(q: string): Prisma.SparePartOrderWhereInput {
  if (!q) return {};
  return {
    OR: [
      { orderCode: { contains: q, mode: 'insensitive' } },
      { supplier: { contains: q, mode: 'insensitive' } },
      { trackingNumber: { contains: q, mode: 'insensitive' } },
      { targetWarehouse: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
    ],
  };
}

function kindWhere(kind: PurchaseListFilter['kind']): Prisma.SparePartOrderWhereInput {
  if (kind === 'CUSTOMER') return { customerOrderId: { not: null } };
  if (kind === 'STOCK') return { customerOrderId: null };
  return {};
}

function orderBy(sort: PurchaseSort): Prisma.SparePartOrderOrderByWithRelationInput[] {
  if (sort === 'eta') return [{ etaDate: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }];
  if (sort === 'total') return [{ totalVnd: 'desc' }, { id: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}

export async function listPurchaseOrdersPage(query: ListQuery<PurchaseSort>, filter: PurchaseListFilter) {
  const search = searchWhere(query.q);
  const statusWhere: Prisma.SparePartOrderWhereInput = filter.status && filter.status !== 'ALL' ? { status: filter.status } : {};
  const where: Prisma.SparePartOrderWhereInput = { AND: [search, kindWhere(filter.kind), statusWhere] };

  const like = query.q ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const searchSql = like
    ? Prisma.sql`AND (o."orderCode" ILIKE ${like} OR o.supplier ILIKE ${like} OR o."trackingNumber" ILIKE ${like}
        OR w.name ILIKE ${like} OR c.name ILIKE ${like})`
    : Prisma.empty;

  const [rows, total, kindCounts, statusGroups, money] = await Promise.all([
    prisma.sparePartOrder.findMany({ where, include: ROW_INCLUDE, orderBy: orderBy(query.sort), skip: query.skip, take: query.take }),
    prisma.sparePartOrder.count({ where }),
    Promise.all([
      prisma.sparePartOrder.count({ where: search }),
      prisma.sparePartOrder.count({ where: { AND: [search, kindWhere('CUSTOMER')] } }),
    ]),
    prisma.sparePartOrder.groupBy({ by: ['status'], where: search, _count: { _all: true } }),
    // Giá vốn và công nợ NCC: cost = subtotal (nếu có) hoặc tổng; nợ = cost − đã trả, bỏ phiếu hủy
    prisma.$queryRaw<{ total_cost: unknown; total_debt: unknown }[]>`
      SELECT COALESCE(SUM(o."totalVnd"), 0) AS total_cost,
             COALESCE(SUM(GREATEST(0, (CASE WHEN o."subtotalVnd" > 0 THEN o."subtotalVnd" ELSE o."totalVnd" END) - o."paidAmount"))
               FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total_debt
        FROM "SparePartOrder" o
        LEFT JOIN "Warehouse" w ON w.id = o."targetWarehouseId"
        LEFT JOIN "Customer" c ON c.id = o."customerId"
       WHERE TRUE ${searchSql}`,
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const sumOf = (keys: string[]) => keys.reduce((s, k) => s + (byStatus[k] ?? 0), 0);
  const [all, forCustomer] = kindCounts;

  return {
    rows,
    summary: {
      all,
      forCustomer,
      forStock: all - forCustomer,
      inTransit: sumOf(IN_TRANSIT),
      inStocking: sumOf(IN_STOCKING),
      totalCost: Number(money[0]?.total_cost ?? 0),
      totalDebt: Number(money[0]?.total_debt ?? 0),
      statusCounts: byStatus,
    },
    ...pageMeta(total, query.page, query.pageSize),
  };
}
