import { prisma } from '@/lib/prisma';

/**
 * Leo thang phiếu duyệt quá SLA.
 *
 * Nhắc (jobApprovalSla) chạy khi quá hạn; nếu đã quá thêm một khoảng SLA nữa
 * (tức tổng thời gian chờ ≥ 2 × SLA) mà người duyệt vẫn chưa xử lý, phiếu được
 * chuyển cho quản lý trực tiếp của họ: phiếu cũ thành DELEGATED, phiếu mới
 * PENDING cùng bước, ghi delegatedFromId để truy lại. Bước tắt "cho phép ủy quyền"
 * hoặc người duyệt không có quản lý thì giữ nguyên, chỉ tiếp tục nhắc.
 */
export function shouldEscalate(task: { dueAt: Date | null; slaHours: number | null }, now = new Date()) {
  if (!task.dueAt || !task.slaHours || task.slaHours <= 0) return false;
  return now.getTime() >= task.dueAt.getTime() + task.slaHours * 3_600_000;
}

export async function escalateOverdueApprovals(now = new Date()) {
  const candidates = await prisma.approvalTask.findMany({
    where: { status: 'PENDING', dueAt: { lt: now }, instance: { status: 'RUNNING' }, step: { allowDelegate: true, slaHours: { gt: 0 } } },
    include: {
      step: { select: { slaHours: true } },
      instance: { select: { requesterId: true } },
      approver: { select: { managerId: true } },
    },
    take: 200,
  });

  const escalated: { taskId: number; from: number; to: number }[] = [];

  for (const task of candidates) {
    if (!shouldEscalate({ dueAt: task.dueAt, slaHours: task.step.slaHours }, now)) continue;
    const managerId = task.approver.managerId;
    // Không đẩy cho chính người nộp đơn, không đẩy vòng về người đang duyệt
    if (!managerId || managerId === task.approverId || managerId === task.instance.requesterId) continue;

    const done = await prisma.$transaction(async (tx) => {
      const moved = await tx.approvalTask.updateMany({
        where: { id: task.id, status: 'PENDING' },
        data: { status: 'DELEGATED', actedAt: now, comment: 'Tự chuyển cấp trên do quá hạn SLA' },
      });
      if (moved.count === 0) return false;
      // Quản lý đã có phiếu đang chờ ở cùng bước (vd. bước song song) thì không tạo thêm
      const dup = await tx.approvalTask.count({
        where: { instanceId: task.instanceId, stepOrder: task.stepOrder, approverId: managerId, status: 'PENDING' },
      });
      if (!dup) {
        await tx.approvalTask.create({
          data: {
            instanceId: task.instanceId,
            stepId: task.stepId,
            stepOrder: task.stepOrder,
            approverId: managerId,
            delegatedFromId: task.approverId,
            dueAt: new Date(now.getTime() + (task.step.slaHours ?? 24) * 3_600_000),
            status: 'PENDING',
          },
        });
      }
      return true;
    });
    if (done) escalated.push({ taskId: task.id, from: task.approverId, to: managerId });
  }

  return escalated;
}
