import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { pageMeta, type ListQuery } from '@/lib/list-query';
import { canViewSalesOrders, mapSalesRows, SALES_ROW_SELECT } from './service';

/**
 * Danh sách đơn bán phân trang phía server.
 *
 * Các nhóm lọc (chưa hoàn tất, còn phải thu...) phụ thuộc công nợ tính từ ba cột
 * nên lọc bằng SQL: lấy id của đúng trang cần xem, rồi mới nạp chi tiết bằng
 * Prisma cho chừng ấy dòng. Công thức công nợ khớp computeOrderDebt.
 */

export const SALES_SORTS = ['date', 'date_asc', 'code', 'total', 'remaining'] as const;
export type SalesSort = (typeof SALES_SORTS)[number];

export const SALES_CHIPS = ['ALL', 'OPEN', 'AWAITING', 'DEBT', 'OVERDUE'] as const;
export type SalesChip = (typeof SALES_CHIPS)[number];

export interface SalesListFilter {
  chip: SalesChip;
  orderType?: string;
  customerId?: number | null;
  salespersonId?: number | null;
  from?: Date | null;
  to?: Date | null;
}

const TOTAL = Prisma.sql`(CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE COALESCE(o."totalAmount", 0) END)`;
const REMAINING = Prisma.sql`GREATEST(0, ${TOTAL} - LEAST(${TOTAL}, GREATEST(0, o."returnedAmount")) - o."paidAmount")`;
const TODAY_VN = Prisma.sql`(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const CLOSED = Prisma.sql`(o.status IN ('COMPLETED', 'CANCELLED') OR (o."stockIssuedAt" IS NOT NULL AND ${REMAINING} <= 0))`;
const AWAITING = Prisma.sql`(o."stockIssuedAt" IS NULL AND o.status IN ('AWAITING_STOCK', 'READY_TO_DELIVER'))`;
const OVERDUE = Prisma.sql`(${REMAINING} > 0 AND o."dueDate" IS NOT NULL AND o."dueDate" < ${TODAY_VN})`;

function chipSql(chip: SalesChip): Prisma.Sql {
  switch (chip) {
    case 'OPEN': return Prisma.sql`NOT ${CLOSED}`;
    case 'AWAITING': return AWAITING;
    case 'DEBT': return Prisma.sql`${REMAINING} > 0`;
    case 'OVERDUE': return OVERDUE;
    default: return Prisma.sql`TRUE`;
  }
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Điều kiện chung (trừ nhóm lọc) — dùng cho cả danh sách lẫn số đếm từng nhóm. */
function baseWhere(q: string, f: SalesListFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    parts.push(Prisma.sql`(o."orderCode" ILIKE ${like} OR c.name ILIKE ${like} OR c.code ILIKE ${like} OR c.phone ILIKE ${like})`);
  }
  if (f.orderType) parts.push(Prisma.sql`o."orderType" = ${f.orderType}`);
  if (f.customerId) parts.push(Prisma.sql`o."customerId" = ${f.customerId}`);
  if (f.salespersonId) parts.push(Prisma.sql`o."salespersonId" = ${f.salespersonId}`);
  if (f.from) parts.push(Prisma.sql`o."orderDate" >= ${f.from}::date`);
  if (f.to) parts.push(Prisma.sql`o."orderDate" <= ${f.to}::date`);
  return Prisma.join(parts, ' AND ');
}

function orderBySql(sort: SalesSort): Prisma.Sql {
  switch (sort) {
    case 'date_asc': return Prisma.sql`o."orderDate" ASC, o.id ASC`;
    case 'code': return Prisma.sql`o."orderCode" DESC`;
    case 'total': return Prisma.sql`${TOTAL} DESC, o.id DESC`;
    case 'remaining': return Prisma.sql`${REMAINING} DESC, o.id DESC`;
    default: return Prisma.sql`o."orderDate" DESC, o.id DESC`;
  }
}

export interface SalesSummary {
  open: number;
  awaiting: number;
  revenue: number;
  remaining: number;
  overdue: number;
  chipCounts: Record<SalesChip, number>;
}

const EMPTY_SUMMARY: SalesSummary = {
  open: 0, awaiting: 0, revenue: 0, remaining: 0, overdue: 0,
  chipCounts: { ALL: 0, OPEN: 0, AWAITING: 0, DEBT: 0, OVERDUE: 0 },
};

export async function listSalesOrdersPage(ctx: AuthContext, query: ListQuery<SalesSort>, filter: SalesListFilter) {
  if (!canViewSalesOrders(ctx)) {
    return { rows: [], summary: EMPTY_SUMMARY, ...pageMeta(0, 1, query.pageSize) };
  }

  const where = baseWhere(query.q, filter);
  const listWhere = Prisma.sql`${where} AND ${chipSql(filter.chip)}`;
  const from = Prisma.sql`FROM "CustomerOrder" o JOIN "Customer" c ON c.id = o."customerId"`;

  const [idRows, summaryRows] = await Promise.all([
    prisma.$queryRaw<{ id: number; total_count: bigint }[]>`
      SELECT o.id, COUNT(*) OVER () AS total_count ${from}
       WHERE ${listWhere}
       ORDER BY ${orderBySql(query.sort)}
       LIMIT ${query.take} OFFSET ${query.skip}`,
    // Thẻ số liệu và số đếm từng nhóm tính theo tìm kiếm/loại đơn đang chọn, không theo nhóm
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COUNT(*) AS all_count,
        COUNT(*) FILTER (WHERE NOT ${CLOSED}) AS open_count,
        COUNT(*) FILTER (WHERE ${AWAITING}) AS awaiting_count,
        COUNT(*) FILTER (WHERE ${REMAINING} > 0) AS debt_count,
        COUNT(*) FILTER (WHERE ${OVERDUE}) AS overdue_count,
        COALESCE(SUM(${TOTAL}), 0) AS revenue,
        COALESCE(SUM(${REMAINING}), 0) AS remaining,
        COALESCE(SUM(${REMAINING}) FILTER (WHERE ${OVERDUE}), 0) AS overdue_amount
      ${from}
      WHERE ${where}`,
  ]);

  let total = Number(idRows[0]?.total_count ?? 0);
  let ids = idRows.map((r) => r.id);

  // Trang vượt quá số trang (vd. vừa lọc hẹp lại): kéo về trang cuối thay vì trang trống
  let page = query.page;
  if (!ids.length && query.page > 1) {
    const count = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n ${from} WHERE ${listWhere}`;
    total = Number(count[0]?.n ?? 0);
    if (total > 0) {
      page = Math.max(1, Math.ceil(total / query.pageSize));
      const retry = await prisma.$queryRaw<{ id: number }[]>`
        SELECT o.id ${from} WHERE ${listWhere}
         ORDER BY ${orderBySql(query.sort)}
         LIMIT ${query.take} OFFSET ${(page - 1) * query.pageSize}`;
      ids = retry.map((r) => r.id);
    }
  }

  const details = ids.length
    ? await prisma.customerOrder.findMany({ where: { id: { in: ids } }, select: SALES_ROW_SELECT })
    : [];
  const byId = new Map(details.map((d) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const rows = await mapSalesRows(ordered);

  const s = summaryRows[0] ?? {};
  const n = (k: string) => Number(s[k] ?? 0);
  const summary: SalesSummary = {
    open: n('open_count'),
    awaiting: n('awaiting_count'),
    revenue: n('revenue'),
    remaining: n('remaining'),
    overdue: n('overdue_amount'),
    chipCounts: {
      ALL: n('all_count'),
      OPEN: n('open_count'),
      AWAITING: n('awaiting_count'),
      DEBT: n('debt_count'),
      OVERDUE: n('overdue_count'),
    },
  };

  return { rows, summary, ...pageMeta(total, page, query.pageSize) };
}
