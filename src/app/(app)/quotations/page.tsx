import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { getSparePartPricingConfig } from '@/server/modules/spare-parts/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { listQuotationsPage, QUOTATION_SORTS } from '@/server/modules/customer/quotation-list';
import { parseDateParam, parseIdParam, parseListQuery } from '@/lib/list-query';
import { prisma } from '@/lib/prisma';
import { QuotationsScreen } from './quotations-screen';

export const metadata = {
  title: 'Báo giá',
  description: 'Quản lý báo giá khách hàng, phê duyệt và chốt đơn bán',
};
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'quotations')) redirect('/dashboard');

  const sp = await searchParams;
  const query = parseListQuery(sp, { sorts: QUOTATION_SORTS, defaultSort: 'created' });
  const status = typeof sp.status === 'string' ? sp.status : '';
  const filter = {
    status,
    salespersonId: parseIdParam(sp.seller),
    from: parseDateParam(sp.from),
    to: parseDateParam(sp.to),
  };

  // Khách/phụ tùng/máy cho form lập báo giá được nạp khi mở form (getQuotationFormCatalogAction)
  const [list, sellers, warehouses, pricingConfig, companyInfo] = await Promise.all([
    listQuotationsPage(query, filter),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', salesQuotations: { some: {} } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.warehouse.findMany({
      select: { id: true, name: true, code: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    }),
    getSparePartPricingConfig(),
    getCompanyInfo(),
  ]);

  return (
    <Suspense fallback={null}>
      <QuotationsScreen
        list={JSON.parse(JSON.stringify(list))}
        filter={{
          q: query.q,
          status,
          seller: filter.salespersonId ? String(filter.salespersonId) : '',
          from: typeof sp.from === 'string' ? sp.from : '',
          to: typeof sp.to === 'string' ? sp.to : '',
          sort: query.sort,
        }}
        sellers={sellers}
        warehouses={JSON.parse(JSON.stringify(warehouses))}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        canManage={can(ctx, 'FEATURE_CUSTOMER_MANAGE')}
      />
    </Suspense>
  );
}
