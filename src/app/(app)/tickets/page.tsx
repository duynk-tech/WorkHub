import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { prisma } from '@/lib/prisma';
import { listServiceTicketsPage, getTicketMetrics } from '@/server/modules/equipment/ticket-service';
import { pageMeta, parseListQuery } from '@/lib/list-query';
import { TicketScreen } from './ticket-screen';

export const metadata = { title: 'Sự cố & Sửa chữa' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'tickets')) redirect('/dashboard');

  const sp = await searchParams;
  const query = parseListQuery(sp, { sorts: ['default'] as const, defaultSort: 'default' });
  const status = typeof sp.status === 'string' ? sp.status : 'OPEN_ONLY';
  const priority = typeof sp.priority === 'string' ? sp.priority : 'ALL';

  // Danh sách máy/phụ tùng/kho cho form được nạp khi mở form (getTicketFormCatalogAction)
  const [list, metrics, technicians] = await Promise.all([
    listServiceTicketsPage({ status, priority, search: query.q }, query),
    getTicketMetrics(),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const canManage = can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE');

  return (
    <TicketScreen
      tickets={JSON.parse(JSON.stringify(list.rows))}
      paging={pageMeta(list.total, query.page, query.pageSize)}
      allCount={list.all}
      filter={{ status, priority, q: query.q }}
      metrics={JSON.parse(JSON.stringify(metrics))}
      technicians={JSON.parse(JSON.stringify(technicians))}
      canManage={canManage}
    />
  );
}
