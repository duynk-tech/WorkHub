import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import {
  listSpareParts,
  listWarehouses,
  listStockTransactions,
  getSparePartsStats,
  listSparePartOrders,
  getSparePartPricingConfig,
} from '@/server/modules/spare-parts/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import {
  listEquipment,
  getEquipmentMetrics,
  listCustomersWithLocations,
} from '@/server/modules/equipment/service';
import { prisma } from '@/lib/prisma';
import { SparePartsScreen } from './spare-parts-screen';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Máy móc & Phụ tùng',
  description: 'Danh mục phụ tùng, máy nguyên chiếc, tồn kho, xuất nhập kho và máy đang lắp tại khách',
};

export default async function SparePartsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = searchParams ? await searchParams : {};

  const canView =
    can(ctx, 'MENU_SPARE_PARTS') ||
    can(ctx, 'MENU_EQUIPMENT') ||
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
    ctx.isAdmin;

  if (!canView) {
    redirect('/dashboard');
  }

  const canManage =
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
    can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
    ctx.isAdmin;

  const [
    spareParts, warehouses, transactions, stats, orders, pricingConfig, companyInfo, customers, equipments,
    equipmentList, equipmentMetrics, equipmentCustomers,
  ] = await Promise.all([
    listSpareParts(),
    listWarehouses(),
    listStockTransactions({ pageSize: 50 }),
    getSparePartsStats(),
    listSparePartOrders(),
    getSparePartPricingConfig(),
    getCompanyInfo(),
    prisma.customer.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' } }).catch(() => []),
    prisma.fnbEquipment.findMany({ select: { id: true, name: true, machineCode: true }, orderBy: { machineCode: 'asc' } }).catch(() => []),
    listEquipment({}),
    getEquipmentMetrics(),
    listCustomersWithLocations(),
  ]);

  return (
    <SparePartsScreen
      spareParts={JSON.parse(JSON.stringify(spareParts))}
      warehouses={JSON.parse(JSON.stringify(warehouses))}
      transactions={JSON.parse(JSON.stringify(transactions.rows))}
      transactionTotal={transactions.total}
      orders={JSON.parse(JSON.stringify(orders))}
      stats={stats}
      canManage={canManage}
      pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
      companyInfo={JSON.parse(JSON.stringify(companyInfo))}
      customers={JSON.parse(JSON.stringify(customers))}
      equipments={JSON.parse(JSON.stringify(equipments))}
      initialTab={sp.tab}
      equipmentList={JSON.parse(JSON.stringify(equipmentList))}
      equipmentMetrics={equipmentMetrics}
      equipmentCustomers={JSON.parse(JSON.stringify(equipmentCustomers))}
    />
  );
}
