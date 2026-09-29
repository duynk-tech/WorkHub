import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { listSalesOrders, canViewSalesOrders } from '@/server/modules/customer/service';
import { listSpareParts, getSparePartPricingConfig } from '@/server/modules/spare-parts/service';
import { listEquipment } from '@/server/modules/equipment/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { prisma } from '@/lib/prisma';
import { SalesScreen } from './sales-screen';

export const metadata = {
  title: 'Bán hàng',
  description: 'Đơn bán cho khách, tình hình giao hàng và công nợ phải thu',
};
export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const ctx = await requireAuth();

  // Tách khỏi màn kho nên quyền cũng tách: đây là dữ liệu doanh thu, công nợ
  if (!canViewSalesOrders(ctx)) redirect('/dashboard');

  // Dữ liệu dùng chung cho mọi khách nạp sẵn; phần riêng của từng khách
  // (địa điểm, máy, báo giá) đợi chọn khách rồi mới lấy
  const [orders, customers, spareParts, stockMachines, pricingConfig, companyInfo, warehouses] = await Promise.all([
    listSalesOrders(ctx),
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    listSpareParts({}),
    listEquipment({ status: 'IN_STOCK' }),
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
        orders={JSON.parse(JSON.stringify(orders))}
        customers={JSON.parse(JSON.stringify(customers))}
        spareParts={JSON.parse(JSON.stringify(spareParts))}
        stockMachines={JSON.parse(JSON.stringify(stockMachines))}
        pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
        companyInfo={JSON.parse(JSON.stringify(companyInfo))}
        warehouses={JSON.parse(JSON.stringify(warehouses))}
        canManage={can(ctx, 'FEATURE_CUSTOMER_MANAGE') || ctx.isAdmin}
      />
    </Suspense>
  );
}
