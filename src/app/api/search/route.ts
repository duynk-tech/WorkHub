import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { prisma } from '@/lib/prisma';
import { taskScopeWhere } from '@/server/modules/task/service';

export const dynamic = 'force-dynamic';

export interface SearchHit { type: string; id: number; title: string; sub?: string; href: string }

const PER_GROUP = 5;

/**
 * Tìm nhanh toàn hệ thống cho ô tìm kiếm ⌘K. Mỗi nhóm tối đa 5 kết quả và chỉ
 * trong phạm vi người dùng được xem. ILIKE '%q%' dùng index trigram (prisma/sql).
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const has = { contains: q, mode: 'insensitive' as const };

  const jobs: Promise<SearchHit[]>[] = [];

  if (can(ctx, 'MENU_TASKS')) {
    jobs.push(taskScopeWhere(ctx).then((scope) =>
      prisma.task.findMany({
        where: { AND: [scope, { OR: [{ title: has }, { code: has }] }] },
        select: { id: true, code: true, title: true, status: true },
        orderBy: { updatedAt: 'desc' }, take: PER_GROUP,
      }).then((rows) => rows.map((t) => ({ type: 'Công việc', id: t.id, title: t.title, sub: t.code, href: `/tasks/${t.id}` })))));
  }
  if (canViewModule(ctx, 'customers')) {
    jobs.push(prisma.customer.findMany({
      where: { OR: [{ name: has }, { phone: has }, { code: has }] },
      select: { id: true, name: true, code: true, phone: true }, orderBy: { updatedAt: 'desc' }, take: PER_GROUP,
    }).then((rows) => rows.map((c) => ({ type: 'Khách hàng', id: c.id, title: c.name, sub: [c.code, c.phone].filter(Boolean).join(' · '), href: `/customers/${c.id}` }))));
  }
  if (canViewModule(ctx, 'sales')) {
    jobs.push(prisma.customerOrder.findMany({
      where: { orderCode: has },
      select: { id: true, orderCode: true, customerId: true, customer: { select: { name: true } } }, orderBy: { orderDate: 'desc' }, take: PER_GROUP,
    }).then((rows) => rows.map((o) => ({ type: 'Đơn bán', id: o.id, title: o.orderCode, sub: o.customer.name, href: `/customers/${o.customerId}?tab=transactions&view=orders&order=${o.id}` }))));
  }
  if (canViewModule(ctx, 'quotations')) {
    jobs.push(prisma.customerQuotation.findMany({
      where: { quoteCode: has },
      select: { id: true, quoteCode: true, customerId: true, customer: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: PER_GROUP,
    }).then((rows) => rows.map((o) => ({ type: 'Báo giá', id: o.id, title: o.quoteCode, sub: o.customer.name, href: `/customers/${o.customerId}?tab=transactions&view=quotations` }))));
  }
  if (canViewModule(ctx, 'inventory')) {
    jobs.push(prisma.inventoryItem.findMany({
      where: { OR: [{ name: has }, { itemCode: has }] },
      select: { id: true, name: true, itemCode: true }, orderBy: { name: 'asc' }, take: PER_GROUP,
    }).then((rows) => rows.map((i) => ({ type: 'Phụ tùng', id: i.id, title: i.name, sub: i.itemCode, href: `/spare-parts?q=${encodeURIComponent(i.itemCode)}` }))));
  }
  if (canViewModule(ctx, 'tickets')) {
    jobs.push(prisma.serviceTicket.findMany({
      where: { OR: [{ ticketCode: has }, { title: has }] },
      select: { id: true, ticketCode: true, title: true }, orderBy: { createdAt: 'desc' }, take: PER_GROUP,
    }).then((rows) => rows.map((t) => ({ type: 'Sự cố', id: t.id, title: t.title, sub: t.ticketCode, href: `/tickets?q=${encodeURIComponent(t.ticketCode)}` }))));
  }
  if (can(ctx, 'MENU_EMPLOYEES')) {
    jobs.push(prisma.employee.findMany({
      where: { status: { not: 'RESIGNED' }, OR: [{ fullName: has }, { code: has }] },
      select: { id: true, fullName: true, code: true }, orderBy: { fullName: 'asc' }, take: PER_GROUP,
    }).then((rows) => rows.map((e) => ({ type: 'Nhân sự', id: e.id, title: e.fullName, sub: e.code, href: `/employees?q=${encodeURIComponent(e.code)}` }))));
  }

  const groups = await Promise.all(jobs.map((j) => j.catch(() => [] as SearchHit[])));
  return NextResponse.json({ hits: groups.flat() }, { headers: { 'Cache-Control': 'no-store' } });
}
