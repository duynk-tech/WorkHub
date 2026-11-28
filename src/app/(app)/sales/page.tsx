import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewSalesOrders } from '@/server/modules/customer/service';
import { listSalesOrdersPage, SALES_CHIPS, SALES_SORTS, type SalesChip } from '@/server/modules/customer/sales-list';
import { getSparePartPricingConfig } from '@/server/modules/spare-parts/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { parseDateParam, parseIdParam, parseListQuery } from '@/lib/list-query';
import { ORDER_TYPES } from '@/server/modules/customer/types';
import { prisma } from '@/lib/prisma';
import { SalesScreen } from './sales-screen';

export const metadata = {
  title: 'Bán hàng',
  description: 'Đơn bán cho khách, tình hình giao hàng và công nợ phải thu',
};
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireAuth();

  // Tách khỏi màn kho nên quyền cũng tách: đây là dữ liệu doanh thu, công nợ
  if (!canViewSalesOrders(ctx)) redirect('/dashboard');

  const sp = await searchParams;
  const query = parseListQuery(sp, { sorts: SALES_SORTS, defaultSort: 'date' });
  const chipRaw = typeof sp.chip === 'string' ? sp.chip : 'ALL';
  const chip = (SALES_CHIPS as readonly string[]).includes(chipRaw) ? (chipRaw as SalesChip) : 'ALL';
  const orderType = typeof sp.type === 'string' && sp.type in ORDER_TYPES ? sp.type : '';
  const filter = {
    chip,
    orderType,
    salespersonId: parseIdParam(sp.seller),
    from: parseDateParam(sp.from),
    to: parseDateParam(sp.to),
  };

  // Phụ tùng và máy trong kho chỉ cần khi mở form lập đơn: nạp lúc đó, không nạp sẵn ở đây
  const [list, customers, sellers, pricingConfig, companyInfo, warehouses] = await Promise.all([
    listSalesOrdersPage(ctx, query, filter),
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', salesOrders: { some: {} } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    getSparePartPricingConfig(),
    getCompanyInfo(),
    prisma.warehouse.findMany({
      select: { id: true, name: true, code: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return (
    <Suspense fallback={null}>
      <SalesScreen
        list={JSON.parse(JSON.stringify(list))}
        filter={{
          q: query.q,
          chip,
          type: orderType,
          seller: filter.salespersonId ? String(filter.salespersonId) : '',
          from: typeof sp.from === 'string' ? sp.from : '',
          to: typeof sp.to === 'string' ? sp.to : '',
          sort: query.sort,
        }}
        customers={JSON.parse(JSON.stringify(customers))}
        sellers={sellers}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        warehouses={JSON.parse(JSON.stringify(warehouses))}
        canManage={can(ctx, 'FEATURE_CUSTOMER_MANAGE')}
      />
    </Suspense>
  );
}
