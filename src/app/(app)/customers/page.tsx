import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { listCustomers, getCustomerMetrics } from '@/server/modules/customer/service';
import { getCustomerCareList } from '@/server/modules/customer/care';
import { CustomerScreen } from './customer-screen';

export const metadata = { title: 'Khách hàng' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; within?: string; tab?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;

  const filter = {
    search: sp.q ?? '',
    status: sp.status ?? '',
  };

  const [customers, metrics, care, technicians] = await Promise.all([
    listCustomers(filter),
    getCustomerMetrics(),
    getCustomerCareList({ within: sp.within ? Number(sp.within) : 30 }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const canManage = can(ctx, 'FEATURE_CUSTOMER_MANAGE') || ctx.isAdmin;

  return (
    <CustomerScreen
      customers={JSON.parse(JSON.stringify(customers))}
      care={JSON.parse(JSON.stringify(care))}
      technicians={JSON.parse(JSON.stringify(technicians))}
      initialTab={sp.tab || (sp.within ? 'care' : undefined)}
      metrics={JSON.parse(JSON.stringify(metrics))}
      filter={filter}
      canManage={canManage}
    />
  );
}
