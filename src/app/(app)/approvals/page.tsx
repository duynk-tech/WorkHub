import { requireAuth } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { ApprovalScreen } from './approval-screen';

export const metadata = { title: 'Chờ duyệt' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireAuth();
  const { tab } = await searchParams;
  const showHistory = tab === 'history';

  const [pendingTasks, historyTasks, stats] = await Promise.all([
    prisma.approvalTask.findMany({
      where: { approverId: ctx.employeeId, status: 'PENDING', instance: { status: 'RUNNING' } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      include: {
        step: { select: { name: true, slaHours: true, approverType: true, mode: true } },
        instance: {
          select: { entityType: true, entityId: true, requesterId: true, startedAt: true },
        },
        delegatedFrom: { select: { fullName: true } },
      },
    }),
    showHistory
      ? prisma.approvalTask.findMany({
          where: { approverId: ctx.employeeId, status: { not: 'PENDING' } },
          orderBy: { actedAt: 'desc' },
          take: 50,
          include: {
            step: { select: { name: true } },
            instance: { select: { entityType: true, entityId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.approvalTask.groupBy({
      by: ['status'],
      where: { approverId: ctx.employeeId },
      _count: { _all: true },
    }),
  ]);

  // Nạp dữ liệu đơn nghỉ tương ứng với các phiếu duyệt
  const leaveIds = [...pendingTasks, ...historyTasks]
    .filter((t) => t.instance.entityType === 'LEAVE')
    .map((t) => t.instance.entityId);

  const leaves = leaveIds.length
    ? await prisma.leaveRequest.findMany({
        where: { id: { in: leaveIds } },
        include: {
          employee: { select: { id: true, fullName: true, avatarUrl: true, code: true, department: { select: { name: true } } } },
          leaveType: { select: { name: true, color: true, isPaid: true, deductsBalance: true } },
          handoverTo: { select: { fullName: true } },
        },
      })
    : [];

  // Người nộp của các phiếu không phải đơn nghỉ (đơn nghỉ đã kèm thông tin nhân viên)
  const otherRequesterIds = [...new Set(pendingTasks.filter((t) => t.instance.entityType !== 'LEAVE').map((t) => t.instance.requesterId))];
  const requesters = otherRequesterIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: otherRequesterIds } },
        select: { id: true, fullName: true, avatarUrl: true, code: true },
      })
    : [];

  return (
    <ApprovalScreen
      requesters={requesters}
      pending={JSON.parse(JSON.stringify(pendingTasks))}
      history={JSON.parse(JSON.stringify(historyTasks))}
      leaves={JSON.parse(JSON.stringify(leaves))}
      stats={Object.fromEntries(stats.map((s) => [s.status, s._count._all]))}
      showHistory={showHistory}
    />
  );
}
