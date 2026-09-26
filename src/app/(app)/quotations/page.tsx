import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { listSpareParts, getSparePartPricingConfig } from '@/server/modules/spare-parts/service';
import { listEquipment } from '@/server/modules/equipment/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { prisma } from '@/lib/prisma';
import { QuotationsScreen } from './quotations-screen';

export const metadata = {
  title: 'Báo giá',
  description: 'Quản lý báo giá khách hàng, phê duyệt và chốt đơn bán',
};
export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const ctx = await requireAuth();

  const canView =
    can(ctx, 'MENU_CUSTOMERS') ||
    can(ctx, 'FEATURE_CUSTOMER_MANAGE') ||
    ctx.isAdmin;

  if (!canView) redirect('/dashboard');

  const [quotations, customers, spareParts, stockMachines, pricingConfig, companyInfo] = await Promise.all([
    prisma.customerQuotation.findMany({
      include: {
        customer: { select: { id: true, name: true, phone: true, code: true } },
        location: { select: { id: true, name: true, address: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, name: true, itemCode: true, unit: true } },
          },
        },
        orders: { select: { id: true, orderCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        phone: true,
        code: true,
        locations: { select: { id: true, name: true, address: true } },
        machines: { select: { id: true, name: true, machineCode: true } },
      },
      orderBy: { name: 'asc' },
    }).catch(() => []),
    listSpareParts({}),
    listEquipment({ status: 'IN_STOCK' }),
    getSparePartPricingConfig(),
    getCompanyInfo(),
  ]);

  return (
    <Suspense fallback={null}>
      <QuotationsScreen
        quotations={JSON.parse(JSON.stringify(quotations))}
        customers={JSON.parse(JSON.stringify(customers))}
        spareParts={JSON.parse(JSON.stringify(spareParts))}
        stockMachines={JSON.parse(JSON.stringify(stockMachines))}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        canManage={can(ctx, 'FEATURE_CUSTOMER_MANAGE') || ctx.isAdmin}
      />
    </Suspense>
  );
}
