import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { canViewSalesOrders } from '@/server/modules/customer/service';
import { vnDayOfMonth } from '@/lib/sales-target';
import { TargetsScreen } from './targets-screen';

export const metadata = { title: 'Chỉ tiêu doanh số' };
export const dynamic = 'force-dynamic';

export default async function SalesTargetsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireAuth();
  if (!canViewSalesOrders(ctx)) redirect('/dashboard');

  const now = vnDayOfMonth();
  const raw = (await searchParams).m;
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.year;
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.month;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const isCurrent = year === now.year && month === now.month;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isPast = year < now.year || (year === now.year && month < now.month);

  const [targets, billed, recentSellers, employees] = await Promise.all([
    prisma.salesTarget.findMany({ where: { year, month }, select: { employeeId: true, amount: true } }),
    prisma.$queryRaw<{ id: number; billed: unknown; orders: unknown }[]>`
      SELECT o."salespersonId" AS id, SUM(COALESCE(o."totalAmount", 0)) AS billed, COUNT(*) AS orders
        FROM "CustomerOrder" o
       WHERE o.status <> 'CANCELLED' AND o."salespersonId" IS NOT NULL
         AND o."orderDate" >= ${from}::date AND o."orderDate" < (${from}::date + INTERVAL '1 month')
       GROUP BY o."salespersonId"`,
    // Người đã từng bán trong 12 tháng — gợi ý sẵn trong bảng để khỏi phải tìm
    prisma.customerOrder.findMany({
      where: { salespersonId: { not: null }, orderDate: { gte: new Date(Date.now() - 365 * 86400000) } },
      distinct: ['salespersonId'],
      select: { salespersonId: true },
    }),
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, fullName: true, department: { select: { name: true } } }, orderBy: { fullName: 'asc' } }),
  ]);

  const shown = new Set<number>([...targets.map((t) => t.employeeId), ...recentSellers.map((s) => s.salespersonId!), ...billed.map((b) => b.id)]);
  const billedBy = new Map(billed.map((b) => [b.id, { billed: Number(b.billed ?? 0), orders: Number(b.orders ?? 0) }]));
  const targetBy = new Map(targets.map((t) => [t.employeeId, Number(t.amount)]));

  return (
    <TargetsScreen
      year={year}
      month={month}
      canManage={can(ctx, 'FEATURE_CUSTOMER_MANAGE')}
      progressDay={isCurrent ? now.day : isPast ? daysInMonth : 0}
      daysInMonth={daysInMonth}
      rows={employees
        .filter((e) => shown.has(e.id))
        .map((e) => ({
          employeeId: e.id,
          name: e.fullName,
          department: e.department?.name ?? null,
          target: targetBy.get(e.id) ?? 0,
          billed: billedBy.get(e.id)?.billed ?? 0,
          orders: billedBy.get(e.id)?.orders ?? 0,
        }))}
      allEmployees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
    />
  );
}
