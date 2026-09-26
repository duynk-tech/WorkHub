import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import {
  listSparePartOrders,
  listWarehouses,
  listSpareParts,
  getSparePartPricingConfig,
} from '@/server/modules/spare-parts/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { prisma } from '@/lib/prisma';
import { PurchasesScreen } from './purchases-screen';

export const metadata = {
  title: 'Mua hàng Nhà cung cấp',
  description: 'Quản lý đơn đặt mua hàng NCC, chi phí giá vốn, tỷ giá và tiến trình vận chuyển',
};
export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const ctx = await requireAuth();

  const canView =
    can(ctx, 'MENU_EQUIPMENT') ||
    can(ctx, 'MENU_SPARE_PARTS') ||
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
    ctx.isAdmin;

  if (!canView) redirect('/dashboard');

  const [orders, warehouses, spareParts, pricingConfig, companyInfo, customers] = await Promise.all([
    listSparePartOrders(),
    listWarehouses(),
    listSpareParts({}),
    getSparePartPricingConfig(),
    getCompanyInfo(),
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, phone: true, code: true },
      orderBy: { name: 'asc' },
    }).catch(() => []),
  ]);

  return (
    <Suspense fallback={null}>
      <PurchasesScreen
        orders={JSON.parse(JSON.stringify(orders))}
        warehouses={JSON.parse(JSON.stringify(warehouses))}
        spareParts={JSON.parse(JSON.stringify(spareParts))}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        customers={JSON.parse(JSON.stringify(customers))}
        canManage={can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') || ctx.isAdmin}
      />
    </Suspense>
  );
}
