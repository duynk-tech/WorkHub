import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { getSparePartPricingConfig } from '@/server/modules/spare-parts/service';
import { listPurchaseOrdersPage, PURCHASE_SORTS } from '@/server/modules/spare-parts/purchase-list';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { parseListQuery } from '@/lib/list-query';
import { prisma } from '@/lib/prisma';
import { PurchasesScreen } from './purchases-screen';

export const metadata = {
  title: 'Mua hàng Nhà cung cấp',
  description: 'Quản lý đơn đặt mua hàng NCC, chi phí giá vốn, tỷ giá và tiến trình vận chuyển',
};
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'purchases')) redirect('/dashboard');

  const sp = await searchParams;
  const query = parseListQuery(sp, { sorts: PURCHASE_SORTS, defaultSort: 'created' });
  const kind = sp.kind === 'CUSTOMER' || sp.kind === 'STOCK' ? sp.kind : 'ALL';
  const status = typeof sp.status === 'string' ? sp.status : '';

  // Phụ tùng/khách/máy cho form đặt mua được nạp khi mở form (getPurchaseFormCatalogAction)
  const [list, warehouses, pricingConfig, companyInfo] = await Promise.all([
    listPurchaseOrdersPage(query, { kind, status }),
    prisma.warehouse.findMany({
      select: { id: true, code: true, name: true, type: true, address: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    }),
    getSparePartPricingConfig(),
    getCompanyInfo(),
  ]);

  return (
    <Suspense fallback={null}>
      <PurchasesScreen
        list={JSON.parse(JSON.stringify(list))}
        filter={{ q: query.q, kind, status, sort: query.sort }}
        warehouses={warehouses}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        canManage={can(ctx, 'FEATURE_SPARE_PARTS_MANAGE')}
      />
    </Suspense>
  );
}
