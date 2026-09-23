import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { getLeaveDetail, getOrCreateBalance, remainingDays } from '@/server/modules/leave/service';
import { LeaveDetail } from './leave-detail';

export const dynamic = 'force-dynamic';

export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  const { id } = await params;
  const request = await getLeaveDetail(ctx, Number(id));
  if (!request) notFound();

  const balance = await getOrCreateBalance(request.employeeId, request.startDate.getUTCFullYear());
  const myPendingTask = request.workflow?.tasks.find((t) => t.approverId === ctx.employeeId && t.status === 'PENDING');

  return (
    <LeaveDetail
      request={JSON.parse(JSON.stringify(request))}
      balanceRemaining={remainingDays(balance)}
      myPendingTaskId={myPendingTask?.id ?? null}
      isOwner={request.employeeId === ctx.employeeId}
      canApprove={can(ctx, 'FEATURE_LEAVE_APPROVE')}
      canForceClose={can(ctx, 'FEATURE_LEAVE_FORCE_CLOSE')}
      canDelete={ctx.isAdmin || can(ctx, 'FEATURE_LEAVE_FORCE_CLOSE')}
    />
  );
}
