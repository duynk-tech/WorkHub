import { notFound, redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';
import { getCustomerById } from '@/server/modules/customer/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import {
  listSpareParts,
  listWarehouses,
  getSparePartPricingConfig,
} from '@/server/modules/spare-parts/service';
import { listEquipment } from '@/server/modules/equipment/service';
import { prisma } from '@/lib/prisma';
import { CustomerDetailScreen } from './customer-detail-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'customers')) return { title: 'Khách hàng' };
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId) || numId <= 0) {
    return { title: 'Không tìm thấy khách hàng' };
  }
  const customer = await getCustomerById(numId);
  return {
    title: customer ? `${customer.name} - Khách hàng` : 'Chi tiết khách hàng',
  };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'customers')) redirect('/dashboard');
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId) || numId <= 0) {
    notFound();
  }

  // Mọi truy vấn độc lập chạy song song (trước đây phần workspace và nhân viên chạy nối tiếp sau)
  const [customer, companyInfo, spareParts, stockMachines, warehouses, pricingConfig, workspace, employees] =
    await Promise.all([
      getCustomerById(numId),
      getCompanyInfo(),
      listSpareParts({}),
      // Máy đang nằm trong kho → dùng cho đơn "Mua máy mới / Thuê máy"
      listEquipment({ status: 'IN_STOCK' }),
      listWarehouses(),
      getSparePartPricingConfig(),
      prisma.customer.findUnique({ where: { id: numId }, select: {
        profile: true, contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }, careActivities: { orderBy: { createdAt: 'desc' }, take: 200 },
        payments: { include: { order: { select: { id: true, orderCode: true } }, allocations: true }, orderBy: { paidAt: 'desc' } },
      } }),
      prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    ]);

  if (!customer || !workspace) {
    notFound();
  }

  const canManage = can(ctx, 'FEATURE_CUSTOMER_MANAGE');

  return (
    <CustomerDetailScreen
      customer={JSON.parse(JSON.stringify({ ...customer, ...workspace }))}
      canManage={canManage}
      canExport={can(ctx, 'FEATURE_REPORT_EXPORT')}
      employees={employees}
      companyInfo={JSON.parse(JSON.stringify(companyInfo))}
      spareParts={JSON.parse(JSON.stringify(spareParts))}
      stockMachines={JSON.parse(JSON.stringify(stockMachines))}
      warehouses={JSON.parse(JSON.stringify(warehouses))}
      pricingConfig={JSON.parse(JSON.stringify(pricingConfig))}
    />
  );
}
