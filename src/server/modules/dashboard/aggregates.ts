import { unstable_cache, revalidateTag } from 'next/cache';
import { vnDayOfMonth } from '@/lib/sales-target';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Số liệu tổng hợp cho Dashboard, tính thẳng trong DB (GROUP BY / SUM) thay vì
 * tải hàng nghìn dòng về rồi cộng bằng JS. Các con số này giống nhau với mọi
 * người xem nên cache chung 60 giây (tag `dashboard`); danh sách "6 dòng mới
 * nhất" vẫn đọc trực tiếp vì rẻ và cần tươi.
 *
 * Mọi giá trị trả về là số/chuỗi thuần để qua được JSON của Data Cache.
 */

export const DASHBOARD_CACHE_TAG = 'dashboard';
const TTL_SECONDS = 60;

function cached<T>(key: string, fn: () => Promise<T>): () => Promise<T> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return fn;
  return () => {
    try {
      return unstable_cache(fn, [DASHBOARD_CACHE_TAG, key], { revalidate: TTL_SECONDS, tags: [DASHBOARD_CACHE_TAG] })();
    } catch {
      // Ngoài vòng đời request của Next (script/CLI) thì đọc thẳng
      return fn();
    }
  };
}

/** Gọi sau thao tác làm số liệu dashboard đổi đáng kể (không bắt buộc: cache tự hết hạn sau 60s). */
export function invalidateDashboard() {
  try {
    revalidateTag(DASHBOARD_CACHE_TAG);
  } catch {
    // ngoài request lifecycle
  }
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export interface MonthBucket {
  key: string; // yyyy-mm
}

/** yyyy-mm của 6 (hoặc `count`) tháng gần nhất, cũ → mới. */
export function monthKeys(count = 6, today = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function firstOfMonth(key: string) {
  return `${key}-01`;
}

// Mốc thời gian (timestamp lưu UTC) quy về tháng theo giờ Việt Nam
const vnMonth = (col: Prisma.Sql) =>
  Prisma.sql`to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;

// ── Kinh doanh ────────────────────────────────────────────────

const ORDER_TOTAL = Prisma.sql`(CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE COALESCE(o."totalAmount", 0) END)`;
const ORDER_REMAINING = Prisma.sql`GREATEST(0, ${ORDER_TOTAL} - LEAST(${ORDER_TOTAL}, GREATEST(0, o."returnedAmount")) - o."paidAmount")`;
const TODAY_VN = Prisma.sql`(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

export interface SalesAggregates {
  revenueByMonth: { key: string; billed: number; collected: number }[];
  outstanding: number;
  overdue: number;
  debtors: number;
  debtList: { customerId: number; name: string; code: string | null; orderCount: number; outstanding: number; overdue: number; maxOverdueDays: number }[];
}

async function loadSalesAggregates(): Promise<SalesAggregates> {
  const keys = monthKeys(6);
  const from = firstOfMonth(keys[0]);

  const [monthly, totals, top] = await Promise.all([
    prisma.$queryRaw<{ k: string; billed: unknown; collected: unknown }[]>`
      SELECT to_char(o."orderDate", 'YYYY-MM') AS k,
             SUM(COALESCE(o."totalAmount", o."goodsAmount", 0)) AS billed,
             SUM(o."paidAmount") AS collected
        FROM "CustomerOrder" o
       WHERE o.status <> 'CANCELLED' AND o."orderDate" >= ${from}::date
       GROUP BY 1`,
    prisma.$queryRaw<{ outstanding: unknown; overdue: unknown; debtors: unknown }[]>`
      SELECT COALESCE(SUM(${ORDER_REMAINING}), 0) AS outstanding,
             COALESCE(SUM(${ORDER_REMAINING}) FILTER (WHERE o."dueDate" < ${TODAY_VN}), 0) AS overdue,
             COUNT(DISTINCT o."customerId") FILTER (WHERE ${ORDER_REMAINING} > 0) AS debtors
        FROM "CustomerOrder" o
       WHERE o.status <> 'CANCELLED'`,
    prisma.$queryRaw<{ id: number; name: string; code: string | null; order_count: unknown; outstanding: unknown; overdue: unknown; max_days: unknown }[]>`
      SELECT c.id, c.name, c.code,
             COUNT(*) AS order_count,
             SUM(${ORDER_REMAINING}) AS outstanding,
             COALESCE(SUM(${ORDER_REMAINING}) FILTER (WHERE o."dueDate" < ${TODAY_VN}), 0) AS overdue,
             COALESCE(MAX(${TODAY_VN} - o."dueDate") FILTER (WHERE ${ORDER_REMAINING} > 0 AND o."dueDate" < ${TODAY_VN}), 0) AS max_days
        FROM "CustomerOrder" o
        JOIN "Customer" c ON c.id = o."customerId"
       WHERE o.status <> 'CANCELLED'
       GROUP BY c.id
      HAVING SUM(${ORDER_REMAINING}) > 0
       ORDER BY outstanding DESC
       LIMIT 5`,
  ]);

  const byKey = new Map(monthly.map((m) => [m.k, m]));
  return {
    revenueByMonth: keys.map((key) => ({ key, billed: n(byKey.get(key)?.billed), collected: n(byKey.get(key)?.collected) })),
    outstanding: n(totals[0]?.outstanding),
    overdue: n(totals[0]?.overdue),
    debtors: n(totals[0]?.debtors),
    debtList: top.map((r) => ({
      customerId: r.id,
      name: r.name,
      code: r.code,
      orderCount: n(r.order_count),
      outstanding: n(r.outstanding),
      overdue: n(r.overdue),
      maxOverdueDays: n(r.max_days),
    })),
  };
}

export const getSalesAggregates = cached('sales', loadSalesAggregates);

export interface SalesKpis {
  /** Doanh số tháng hiện tại theo nhân viên KD (đơn không hủy, theo ngày đặt). */
  bySalesperson: { employeeId: number | null; name: string; orders: number; billed: number; collected: number; target: number | null }[];
  /** Ngày hiện tại trong tháng (giờ VN) — để tính dự báo cuối tháng. */
  monthDay: { day: number; daysInMonth: number };
  /** Dư nợ theo tuổi nợ. */
  aging: { current: number; d1to30: number; d31to60: number; d61to90: number; over90: number };
  /** Báo giá 90 ngày gần nhất: tỉ lệ chốt và số ngày trung bình từ lúc lập tới lúc chốt. */
  quotes: { won: number; lost: number; open: number; winRate: number | null; avgDaysToWin: number | null };
}

async function loadSalesKpis(): Promise<SalesKpis> {
  const vn = vnDayOfMonth();
  const monthStart = `${vn.year}-${String(vn.month).padStart(2, '0')}-01`;
  const [sellers, aging, quotes, targets] = await Promise.all([
    prisma.$queryRaw<{ id: number | null; name: string | null; orders: unknown; billed: unknown; collected: unknown }[]>`
      SELECT e.id, e."fullName" AS name, COUNT(*) AS orders,
             SUM(COALESCE(o."totalAmount", 0)) AS billed, SUM(o."paidAmount") AS collected
        FROM "CustomerOrder" o
        LEFT JOIN "Employee" e ON e.id = o."salespersonId"
       WHERE o.status <> 'CANCELLED' AND o."orderDate" >= ${monthStart}::date
       GROUP BY e.id, e."fullName"
       ORDER BY billed DESC
       LIMIT 8`,
    prisma.$queryRaw<{ current: unknown; d1to30: unknown; d31to60: unknown; d61to90: unknown; over90: unknown }[]>`
      SELECT
        COALESCE(SUM(r) FILTER (WHERE d IS NULL OR d <= 0), 0) AS current,
        COALESCE(SUM(r) FILTER (WHERE d BETWEEN 1 AND 30), 0) AS d1to30,
        COALESCE(SUM(r) FILTER (WHERE d BETWEEN 31 AND 60), 0) AS d31to60,
        COALESCE(SUM(r) FILTER (WHERE d BETWEEN 61 AND 90), 0) AS d61to90,
        COALESCE(SUM(r) FILTER (WHERE d > 90), 0) AS over90
      FROM (
        SELECT ${ORDER_REMAINING} AS r, (${TODAY_VN} - o."dueDate") AS d
          FROM "CustomerOrder" o
         WHERE o.status <> 'CANCELLED'
      ) x
      WHERE r > 0`,
    prisma.$queryRaw<{ won: unknown; lost: unknown; open: unknown; avg_days: unknown }[]>`
      SELECT
        COUNT(*) FILTER (WHERE q.status = 'ACCEPTED') AS won,
        COUNT(*) FILTER (WHERE q.status IN ('REJECTED', 'EXPIRED')) AS lost,
        COUNT(*) FILTER (WHERE q.status IN ('DRAFT', 'SENT')) AS open,
        AVG(EXTRACT(EPOCH FROM (o."createdAt" - q."createdAt")) / 86400) FILTER (WHERE q.status = 'ACCEPTED') AS avg_days
      FROM "CustomerQuotation" q
      LEFT JOIN LATERAL (
        SELECT MIN(co."createdAt") AS "createdAt" FROM "CustomerOrder" co WHERE co."quotationId" = q.id
      ) o ON TRUE
      WHERE q."createdAt" >= NOW() - INTERVAL '90 days'`,
    prisma.salesTarget.findMany({
      where: { year: vn.year, month: vn.month },
      select: { employeeId: true, amount: true, employee: { select: { fullName: true } } },
    }),
  ]);
  const targetBy = new Map(targets.map((t) => [t.employeeId, Number(t.amount)]));

  const a = aging[0] ?? {};
  const q = quotes[0] ?? { won: 0, lost: 0, open: 0, avg_days: null };
  const won = n(q.won);
  const lost = n(q.lost);
  return {
    bySalesperson: [
      ...sellers.map((r) => ({
        employeeId: r.id,
        name: r.name ?? 'Chưa gán nhân viên',
        orders: n(r.orders),
        billed: n(r.billed),
        collected: n(r.collected),
        target: r.id !== null ? targetBy.get(r.id) ?? null : null,
      })),
      // Có chỉ tiêu nhưng chưa bán được đơn nào trong tháng vẫn phải hiện để thấy 0%
      ...targets
        .filter((t) => !sellers.some((r) => r.id === t.employeeId))
        .map((t) => ({ employeeId: t.employeeId, name: t.employee.fullName, orders: 0, billed: 0, collected: 0, target: Number(t.amount) })),
    ],
    monthDay: { day: vn.day, daysInMonth: vn.daysInMonth },
    aging: {
      current: n(a.current), d1to30: n(a.d1to30), d31to60: n(a.d31to60), d61to90: n(a.d61to90), over90: n(a.over90),
    },
    quotes: {
      won,
      lost,
      open: n(q.open),
      winRate: won + lost > 0 ? won / (won + lost) : null,
      avgDaysToWin: q.avg_days === null || q.avg_days === undefined ? null : Math.round(n(q.avg_days) * 10) / 10,
    },
  };
}

export const getSalesKpis = cached('sales-kpis', loadSalesKpis);

// ── Kho ───────────────────────────────────────────────────────

export interface StockAggregates {
  skuCount: number;
  lowStock: number;
  stockValue: number;
  lowStockList: { id: number; itemCode: string; name: string; unit: string; onHand: number; min: number }[];
  flowByMonth: { key: string; in: number; out: number }[];
}

async function loadStockAggregates(): Promise<StockAggregates> {
  const keys = monthKeys(6);
  const from = firstOfMonth(keys[0]);

  // Tồn mỗi mã = tổng các kho; giá trị theo giá vốn bình quân, chưa có thì lấy giá vốn danh mục
  const onHand = Prisma.sql`
    SELECT i.id, i."itemCode", i.name, i.unit, i."minStockAlert" AS min,
           COALESCE(NULLIF(i."avgCost", 0), i."costPrice", 0) AS cost,
           COALESCE(SUM(st.quantity), 0) AS on_hand
      FROM "InventoryItem" i
      LEFT JOIN "InventoryStock" st ON st."itemId" = i.id
     WHERE i.status = 'ACTIVE'
     GROUP BY i.id`;

  const [totals, low, flow] = await Promise.all([
    prisma.$queryRaw<{ sku: unknown; low: unknown; value: unknown }[]>`
      SELECT COUNT(*) AS sku,
             COUNT(*) FILTER (WHERE s.on_hand < s.min) AS low,
             COALESCE(SUM(s.on_hand * s.cost), 0) AS value
        FROM (${onHand}) s`,
    prisma.$queryRaw<{ id: number; itemCode: string; name: string; unit: string; on_hand: unknown; min: unknown }[]>`
      SELECT s.id, s."itemCode", s.name, s.unit, s.on_hand, s.min
        FROM (${onHand}) s
       WHERE s.on_hand < s.min
       ORDER BY (s.min - s.on_hand) DESC
       LIMIT 6`,
    // Điều chuyển không đổi tổng tồn nên không tính vào nhập hay xuất
    prisma.$queryRaw<{ k: string; type: string; total: unknown }[]>`
      SELECT ${vnMonth(Prisma.sql`t."transDate"`)} AS k, t.type, SUM(t."totalValue") AS total
        FROM "InventoryTransaction" t
       WHERE t.status = 'COMPLETED' AND t.type IN ('IN', 'OUT') AND t."transDate" >= ${from}::date - INTERVAL '1 day'
       GROUP BY 1, 2`,
  ]);

  const flowMap = new Map<string, { in: number; out: number }>();
  for (const r of flow) {
    const cur = flowMap.get(r.k) ?? { in: 0, out: 0 };
    if (r.type === 'IN') cur.in += n(r.total);
    else cur.out += n(r.total);
    flowMap.set(r.k, cur);
  }

  return {
    skuCount: n(totals[0]?.sku),
    lowStock: n(totals[0]?.low),
    stockValue: n(totals[0]?.value),
    lowStockList: low.map((r) => ({ id: r.id, itemCode: r.itemCode, name: r.name, unit: r.unit, onHand: n(r.on_hand), min: n(r.min) })),
    flowByMonth: keys.map((key) => ({ key, in: flowMap.get(key)?.in ?? 0, out: flowMap.get(key)?.out ?? 0 })),
  };
}

export const getStockAggregates = cached('stock', loadStockAggregates);

// ── Dịch vụ ───────────────────────────────────────────────────

async function loadTicketsByMonth(): Promise<{ key: string; opened: number; resolved: number }[]> {
  const keys = monthKeys(6);
  const from = firstOfMonth(keys[0]);
  // Một phiếu có thể rơi vào hai tháng: mở tháng này, xong tháng sau — đếm riêng từng mốc
  const [opened, resolved] = await Promise.all([
    prisma.$queryRaw<{ k: string; c: unknown }[]>`
      SELECT ${vnMonth(Prisma.sql`"createdAt"`)} AS k, COUNT(*) AS c
        FROM "ServiceTicket" WHERE "createdAt" >= ${from}::date - INTERVAL '1 day' GROUP BY 1`,
    prisma.$queryRaw<{ k: string; c: unknown }[]>`
      SELECT ${vnMonth(Prisma.sql`"resolvedAt"`)} AS k, COUNT(*) AS c
        FROM "ServiceTicket" WHERE "resolvedAt" >= ${from}::date - INTERVAL '1 day' GROUP BY 1`,
  ]);
  const o = new Map(opened.map((r) => [r.k, n(r.c)]));
  const r = new Map(resolved.map((x) => [x.k, n(x.c)]));
  return keys.map((key) => ({ key, opened: o.get(key) ?? 0, resolved: r.get(key) ?? 0 }));
}

export const getTicketsByMonth = cached('tickets-by-month', loadTicketsByMonth);
