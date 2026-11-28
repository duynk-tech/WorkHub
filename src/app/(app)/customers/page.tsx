import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { prisma } from '@/lib/prisma';
import { listCustomersPage, getCustomerMetrics, CUSTOMER_SORTS } from '@/server/modules/customer/service';
import { pageMeta, parseListQuery } from '@/lib/list-query';
import { getCustomerCareList } from '@/server/modules/customer/care';
import { CustomerScreen } from './customer-screen';

export const metadata = { title: 'Khách hàng' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'customers')) redirect('/dashboard');
  const sp = await searchParams;

  const query = parseListQuery(sp, { sorts: CUSTOMER_SORTS, defaultSort: 'created' });
  const status = sp.status === 'ACTIVE' || sp.status === 'INACTIVE' ? sp.status : '';
  const filter = { search: query.q, status, sort: query.sort };

  const [customers, metrics, care, technicians] = await Promise.all([
    listCustomersPage(filter, query),
    getCustomerMetrics(),
    getCustomerCareList({ within: sp.within ? Number(sp.within) : 30 }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const canManage = can(ctx, 'FEATURE_CUSTOMER_MANAGE');

  return (
    <CustomerScreen
      customers={JSON.parse(JSON.stringify(customers.rows))}
      paging={pageMeta(customers.total, query.page, query.pageSize)}
      care={JSON.parse(JSON.stringify(care))}
      technicians={JSON.parse(JSON.stringify(technicians))}
      initialTab={sp.tab || (sp.within ? 'care' : undefined)}
      metrics={JSON.parse(JSON.stringify(metrics))}
      filter={filter}
      canManage={canManage}
    />
  );
}
