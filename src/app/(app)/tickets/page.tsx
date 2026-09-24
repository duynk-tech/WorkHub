import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { listServiceTickets, getTicketMetrics } from '@/server/modules/equipment/ticket-service';
import { listEquipment } from '@/server/modules/equipment/service';
import { listSpareParts, listWarehouses } from '@/server/modules/spare-parts/service';
import { TicketScreen } from './ticket-screen';

export const metadata = { title: 'Sự cố & Sửa chữa' };
export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const ctx = await requireAuth();

  const [tickets, metrics, equipments, technicians, spareParts, warehouses] = await Promise.all([
    listServiceTickets({}),
    getTicketMetrics(),
    listEquipment({}),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    }),
    listSpareParts({}),
    listWarehouses(),
  ]);

  const canManage =
    can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE') || ctx.isAdmin;

  return (
    <TicketScreen
      tickets={JSON.parse(JSON.stringify(tickets))}
      metrics={JSON.parse(JSON.stringify(metrics))}
      equipments={JSON.parse(JSON.stringify(equipments))}
      technicians={JSON.parse(JSON.stringify(technicians))}
      spareParts={JSON.parse(JSON.stringify(spareParts))}
      warehouses={JSON.parse(JSON.stringify(warehouses))}
      canManage={canManage}
    />
  );
}
