import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import {
  getEquipmentById,
  listCustomersWithLocations,
} from '@/server/modules/equipment/service';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { getEquipmentProfit } from '@/server/modules/equipment/profit';
import { EquipmentDetailScreen } from './equipment-detail-screen';

export const metadata = { title: 'Chi tiết Thiết bị' };
export const dynamic = 'force-dynamic';

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  const { id } = await params;
  const eqId = Number(id);

  if (isNaN(eqId)) {
    notFound();
  }

  const [equipment, customers, company, profit] = await Promise.all([
    getEquipmentById(eqId),
    listCustomersWithLocations(),
    getCompanyInfo(),
    getEquipmentProfit(eqId),
  ]);

  if (!equipment) {
    notFound();
  }

  const canManage = can(ctx, 'FEATURE_EQUIPMENT_MANAGE');

  return (
    <EquipmentDetailScreen
      equipment={JSON.parse(JSON.stringify(equipment))}
      customers={JSON.parse(JSON.stringify(customers))}
      canManage={canManage}
      company={company}
      profit={profit ? JSON.parse(JSON.stringify(profit)) : null}
    />
  );
}
