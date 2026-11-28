'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';
import { canViewModule } from '@/server/auth/module-access';

export interface HistoryEntry {
  id: number;
  at: string;
  actor: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  diff: unknown;
}

/**
 * Dòng thời gian thay đổi của một khách hàng: hồ sơ khách + mọi đơn, báo giá,
 * phiếu thu, phiếu sự cố của khách đó — đọc từ nhật ký thao tác (AuditLog).
 */
export async function getCustomerHistoryAction(customerId: number, cursor?: number): Promise<{ ok: boolean; message?: string; items: HistoryEntry[]; nextCursor: number | null }> {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'customers')) return { ok: false, message: 'Bạn không có quyền xem khách hàng này', items: [], nextCursor: null };

  const [orders, quotes, tickets, payments] = await Promise.all([
    prisma.customerOrder.findMany({ where: { customerId }, select: { id: true } }),
    prisma.customerQuotation.findMany({ where: { customerId }, select: { id: true } }),
    prisma.serviceTicket.findMany({ where: { customerId }, select: { id: true } }),
    prisma.customerPayment.findMany({ where: { customerId }, select: { id: true } }),
  ]);
  const ids = (rows: { id: number }[]) => rows.map((r) => String(r.id));
  const PAGE = 40;

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'Customer', entityId: String(customerId) },
        { entityType: 'CustomerOrder', entityId: { in: ids(orders) } },
        { entityType: 'CustomerQuotation', entityId: { in: ids(quotes) } },
        { entityType: 'ServiceTicket', entityId: { in: ids(tickets) } },
        { entityType: 'CustomerPayment', entityId: { in: ids(payments) } },
      ],
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: PAGE + 1,
    include: { actor: { select: { employee: { select: { fullName: true } }, username: true } } },
  });

  return {
    ok: true,
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actor: r.actor?.employee?.fullName ?? r.actor?.username ?? null,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      diff: r.diffJson,
    })),
    nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null,
  };
}
