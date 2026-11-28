import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission, can, type AuthContext } from '@/server/auth/context';
import { startWorkflow, actOnApproval, cancelWorkflow } from '@/server/modules/workflow/engine';
import { notify } from '@/server/modules/notify/service';
import { rollupDay } from '@/server/modules/attendance/service';
import { dateOnly, fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import {
  calculateLeaveDays, generateLeaveCode, adjustBalance, findOverlapping, getOrCreateBalance, remainingDays,
} from './service';
import { dispatchOutboundWebhook } from '@/server/modules/webhook/dispatcher';
import { writeAudit } from '@/server/lib/audit';
import { signActionToken } from '@/server/lib/action-token';

export interface Result { ok: boolean; message: string; id?: number }

const schema = z.object({
  leaveTypeId: z.number().int(),
  startDate: z.string().min(1, 'Chọn ngày bắt đầu'),
  endDate: z.string().min(1, 'Chọn ngày kết thúc'),
  durationType: z.enum(['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON']).default('FULL_DAY'),
  reason: z.string().min(3, 'Nhập lý do nghỉ (tối thiểu 3 ký tự)'),
  handoverToId: z.number().int().nullable(),
  handoverNote: z.string().nullable().or(z.literal('')),
  contactDuringLeave: z.string().nullable().or(z.literal('')),
  attachmentUrl: z.string().nullable().or(z.literal('')),
  attachmentName: z.string().nullable().or(z.literal('')),
  /** true = nộp duyệt ngay, false = lưu nháp */
  submit: z.boolean().default(true),
});

/** Xem trước số ngày nghỉ thực tế trước khi nộp đơn. */
export async function previewLeaveDaysAction(startDate: string, endDate: string, durationType: string) {
  const ctx = await requireAuth();
  try {
    const result = await calculateLeaveDays(ctx.employeeId, new Date(startDate), new Date(endDate), durationType);
    return {
      ok: true as const,
      totalDays: result.totalDays,
      workingDays: result.days.length,
      skipped: result.skipped.map((s) => ({ date: s.date.toISOString().slice(0, 10), reason: s.reason })),
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : 'Không tính được số ngày nghỉ' };
  }
}

export async function submitLeaveAction(id: number | null, raw: unknown, ctxOverride?: AuthContext): Promise<Result> {
  let ctx: AuthContext;
  if (ctxOverride) {
    if (!can(ctxOverride, 'FEATURE_LEAVE_REQUEST') && !ctxOverride.isAdmin) {
      return { ok: false, message: 'Bạn không có quyền nộp đơn nghỉ phép (FEATURE_LEAVE_REQUEST)' };
    }
    ctx = ctxOverride;
  } else {
    ctx = await requirePermission('FEATURE_LEAVE_REQUEST');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;

  const leaveType = await prisma.leaveType.findUnique({ where: { id: d.leaveTypeId } });
  if (!leaveType || !leaveType.isActive) return { ok: false, message: 'Loại nghỉ phép không hợp lệ' };

  if (d.durationType !== 'FULL_DAY' && !leaveType.allowHalfDay) return { ok: false, message: 'Loại nghỉ này không cho phép nghỉ nửa ngày' };
  const startDate = dateOnly(new Date(d.startDate));
  const endDate = dateOnly(new Date(d.endDate));
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return { ok: false, message: 'Ngày nghỉ không hợp lệ' };
  if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) return { ok: false, message: 'Vui lòng tách đơn nghỉ theo từng năm để trừ đúng quỹ phép' };
  if (endDate < startDate) return { ok: false, message: 'Ngày kết thúc phải sau ngày bắt đầu' };

  if (leaveType.requiresAttachment && !d.attachmentUrl && d.submit) {
    return { ok: false, message: `Loại nghỉ "${leaveType.name}" yêu cầu đính kèm giấy tờ` };
  }

  // Báo trước tối thiểu
  if (d.submit && leaveType.minAdvanceDays > 0) {
    const daysAhead = Math.floor((startDate.getTime() - dateOnly(new Date()).getTime()) / 86400000);
    if (daysAhead < leaveType.minAdvanceDays) {
      return { ok: false, message: `Loại nghỉ "${leaveType.name}" cần báo trước ít nhất ${leaveType.minAdvanceDays} ngày` };
    }
  }

  const { days, totalDays } = await calculateLeaveDays(ctx.employeeId, startDate, endDate, d.durationType);
  if (totalDays <= 0) return { ok: false, message: 'Khoảng thời gian chọn không có ngày làm việc nào' };

  if (leaveType.maxConsecutiveDays && totalDays > leaveType.maxConsecutiveDays) {
    return { ok: false, message: `Loại nghỉ này tối đa ${leaveType.maxConsecutiveDays} ngày liên tục` };
  }

  const overlap = await findOverlapping(ctx.employeeId, startDate, endDate, id ?? undefined, d.durationType);
  if (overlap) {
    return { ok: false, message: `Trùng với đơn ${overlap.code} (${fmtDate(overlap.startDate)} – ${fmtDate(overlap.endDate)})` };
  }

  const year = startDate.getUTCFullYear();

  // Kiểm tra quỹ phép nếu loại nghỉ có trừ phép
  if (leaveType.deductsBalance && d.submit) {
    const balance = await getOrCreateBalance(ctx.employeeId, year);
    const available = remainingDays(balance) - Number(balance.pendingDays);
    const allowNegative = await prisma.systemSetting.findUnique({ where: { key: 'leave.allowNegativeBalance' } });
    if (available < totalDays && allowNegative?.valueJson !== true) {
      return { ok: false, message: `Quỹ phép không đủ: còn ${formatDays(available)} ngày, đơn cần ${formatDays(totalDays)} ngày` };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (d.submit) {
        if (await findOverlapping(ctx.employeeId, startDate, endDate, id ?? undefined, d.durationType, tx)) throw new Error('Lịch nghỉ vừa thay đổi, đơn bị trùng');
        if (leaveType.deductsBalance) {
          const balance = await getOrCreateBalance(ctx.employeeId, year, tx);
          const config = await tx.systemSetting.findUnique({ where: { key: 'leave.allowNegativeBalance' } });
          if (remainingDays(balance) - Number(balance.pendingDays) < totalDays && config?.valueJson !== true) throw new Error('Quỹ phép không đủ');
        }
      }
      const data = {
        employeeId: ctx.employeeId,
        leaveTypeId: d.leaveTypeId,
        startDate, endDate,
        durationType: d.durationType,
        totalDays,
        reason: d.reason,
        handoverToId: d.handoverToId,
        handoverNote: d.handoverNote || null,
        contactDuringLeave: d.contactDuringLeave || null,
        attachmentUrl: d.attachmentUrl || null,
        attachmentName: d.attachmentName || null,
        status: (d.submit ? 'PENDING' : 'DRAFT') as never,
        submittedAt: d.submit ? new Date() : null,
        source: 'WEB' as const,
      };

      let request;
      if (id) {
        const existing = await tx.leaveRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Không tìm thấy đơn');
        if (existing.employeeId !== ctx.employeeId) throw new Error('Bạn chỉ sửa được đơn của chính mình');
        if (!['DRAFT', 'REJECTED'].includes(existing.status)) throw new Error('Chỉ sửa được đơn ở trạng thái nháp hoặc bị từ chối');

        request = await tx.leaveRequest.update({ where: { id }, data });
        await tx.leaveRequestDay.deleteMany({ where: { requestId: id } });
      } else {
        request = await tx.leaveRequest.create({ data: { ...data, code: await generateLeaveCode(tx) } });
      }

      await tx.leaveRequestDay.createMany({
        data: days.map((day) => ({ requestId: request.id, date: day.date, portion: day.portion })),
      });

      if (!d.submit) return { request, workflowStatus: null as string | null };

      // Giữ chỗ quỹ phép ngay khi nộp
      if (leaveType.deductsBalance) {
        await adjustBalance(tx, ctx.employeeId, year, { pending: totalDays });
      }

      const instance = await startWorkflow({
        entityType: 'LEAVE',
        entityId: request.id,
        requesterId: ctx.employeeId,
        definitionId: leaveType.workflowDefinitionId,
        context: {
          totalDays,
          leaveTypeCode: leaveType.code,
          isPaid: leaveType.isPaid,
          departmentId: ctx.departmentId,
          employeeId: ctx.employeeId,
        },
      }, tx);

      await tx.leaveRequest.update({ where: { id: request.id }, data: { workflowInstanceId: instance.id } });

      return { request, workflowStatus: instance.status };
    }, { isolationLevel: 'Serializable' });

    // Đơn tự duyệt xong ngay (mọi bước bị bỏ qua) → chốt luôn
    if (result.workflowStatus === 'APPROVED') {
      await finalizeLeave(result.request.id, 'APPROVED');
    } else if (result.workflowStatus === 'RUNNING') {
      await notifyPendingApprovers(result.request.id);
    }

    if (d.submit) {
      dispatchOutboundWebhook('leave.submitted', {
        id: result.request.id,
        code: result.request.code,
        employeeId: ctx.employeeId,
        employeeName: ctx.fullName,
        leaveTypeId: d.leaveTypeId,
        leaveTypeName: leaveType.name,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalDays,
        reason: d.reason,
      }).catch((err) => console.error('[Webhook leave.submitted Error]:', err));
    }

    try {
      revalidatePath('/leaves');
      revalidatePath('/approvals');
    } catch {
      // Bỏ qua lỗi revalidate khi chạy ngoài request context (MCP / Webhook)
    }
    return {
      ok: true,
      message: d.submit ? `Đã nộp đơn ${result.request.code} (${formatDays(totalDays)} ngày)` : 'Đã lưu nháp đơn nghỉ phép',
      id: result.request.id,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Nộp đơn thất bại' };
  }
}

/** Chốt kết quả đơn sau khi quy trình duyệt kết thúc: cập nhật trạng thái, quỹ phép, thông báo. */
export async function finalizeLeave(requestId: number, status: 'APPROVED' | 'REJECTED' | 'CANCELLED', note?: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true, employee: { select: { id: true, fullName: true } } },
  });
  if (!request) return;
  if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(request.status)) return;

  const year = request.startDate.getUTCFullYear();
  const total = Number(request.totalDays);

  const finalized = await prisma.$transaction(async (tx) => {
    const claimed = await tx.leaveRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: status as never, closedAt: new Date(), closingNote: note ?? null },
    });
    if (claimed.count !== 1) return false;

    if (request.leaveType.deductsBalance && request.submittedAt) {
      if (status === 'APPROVED') {
        await adjustBalance(tx, request.employeeId, year, { pending: -total, used: total });
      } else {
        await adjustBalance(tx, request.employeeId, year, { pending: -total });
      }
    }
    if (status === 'APPROVED') {
      const days = await tx.leaveRequestDay.findMany({ where: { requestId } });
      for (const day of days) await rollupDay(day.date, tx, [request.employeeId]);
    }
    return true;
  }, { isolationLevel: 'Serializable' });
  if (!finalized) return;



  const balance = await getOrCreateBalance(request.employeeId, year);
  const approverName = note ?? '';

  await notify({
    templateCode: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    employeeIds: [request.employeeId, ...(request.handoverToId && status === 'APPROVED' ? [request.handoverToId] : [])],
    linkPath: `/leaves/${requestId}`,
    vars: {
      code: request.code,
      leaveType: request.leaveType.name,
      startDate: fmtDate(request.startDate),
      endDate: fmtDate(request.endDate),
      totalDays: formatDays(request.totalDays),
      approver: approverName || 'Hệ thống',
      reason: note ?? '',
      remaining: formatDays(remainingDays(balance)),
    },
  });

  if (status === 'APPROVED' || status === 'REJECTED') {
    const event = status === 'APPROVED' ? 'leave.approved' : 'leave.rejected';
    dispatchOutboundWebhook(event, {
      id: request.id,
      code: request.code,
      employeeId: request.employeeId,
      employeeName: request.employee.fullName,
      leaveTypeId: request.leaveTypeId,
      leaveTypeName: request.leaveType.name,
      startDate: request.startDate.toISOString(),
      endDate: request.endDate.toISOString(),
      totalDays: Number(request.totalDays),
      status,
      closingNote: note ?? null,
    }).catch((err) => console.error(`[Webhook ${event} Error]:`, err));
  }
}

/** Gửi thông báo cho những người đang phải duyệt ở bước hiện tại. */
export async function notifyPendingApprovers(requestId: number) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { fullName: true, department: { select: { name: true } } } },
      leaveType: { select: { name: true } },
      workflow: { include: { tasks: { where: { status: 'PENDING' }, select: { approverId: true } } } },
    },
  });
  if (!request?.workflow) return;

  const approverIds = request.workflow.tasks.map((t) => t.approverId);
  if (approverIds.length === 0) return;

  // Thông báo đẩy có nút "Duyệt" — token gắn với phiên duyệt, route kiểm lại người bấm
  const actionToken = await signActionToken({ kind: 'workflow', id: request.workflow.id }).catch(() => null);

  await notify({
    templateCode: 'LEAVE_SUBMITTED',
    employeeIds: approverIds,
    linkPath: `/leaves/${requestId}`,
    dedupeKey: `LEAVE_SUBMITTED:${requestId}:${request.workflow.currentStepOrder}`,
    push: actionToken
      ? { actions: [{ action: 'APPROVE', title: 'Duyệt' }, { action: 'OPEN', title: 'Xem đơn' }], data: { actionUrl: '/api/approvals/decide', actionToken } }
      : undefined,
    vars: {
      code: request.code,
      employee: request.employee.fullName,
      department: request.employee.department?.name ?? '—',
      leaveType: request.leaveType.name,
      startDate: fmtDate(request.startDate),
      endDate: fmtDate(request.endDate),
      totalDays: formatDays(request.totalDays),
      reason: request.reason,
    },
  });
}

export async function approveLeaveAction(approvalTaskId: number, decision: 'APPROVE' | 'REJECT', comment?: string): Promise<Result> {
  const ctx = await requirePermission('FEATURE_LEAVE_APPROVE');
  return approveLeaveAs(ctx, approvalTaskId, decision, comment);
}

/** Duyệt nhiều đơn phép một lượt (màn Chờ duyệt). Trả về số đơn thành công và lỗi từng đơn. */
export async function bulkApproveLeaveAction(approvalTaskIds: number[]): Promise<Result & { done: number; failed: string[] }> {
  const ctx = await requirePermission('FEATURE_LEAVE_APPROVE');
  const ids = Array.from(new Set(approvalTaskIds)).slice(0, 100);
  let done = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const r = await approveLeaveAs(ctx, id, 'APPROVE');
    if (r.ok) done++; else failed.push(r.message);
  }
  return {
    ok: done > 0,
    message: failed.length ? `Đã duyệt ${done}/${ids.length} đơn — ${failed.length} đơn chưa duyệt được` : `Đã duyệt ${done} đơn`,
    done,
    failed,
  };
}

/** Lõi duyệt đơn phép, dùng chung cho màn hình, duyệt hàng loạt và nút trên thông báo đẩy. */
export async function approveLeaveAs(ctx: AuthContext, approvalTaskId: number, decision: 'APPROVE' | 'REJECT', comment?: string): Promise<Result> {
  if (!can(ctx, 'FEATURE_LEAVE_APPROVE')) return { ok: false, message: 'Bạn không có quyền duyệt đơn phép' };

  if (decision === 'REJECT' && !comment?.trim()) {
    return { ok: false, message: 'Vui lòng nhập lý do từ chối' };
  }

  const result = await actOnApproval({
    approvalTaskId, actorEmployeeId: ctx.employeeId, decision, comment: comment?.trim(),
  });
  if (!result.ok) return { ok: false, message: result.message };

  if (result.entityType === 'LEAVE' && result.entityId) {
    if (result.instanceStatus === 'APPROVED') {
      await finalizeLeave(result.entityId, 'APPROVED', ctx.fullName);
    } else if (result.instanceStatus === 'REJECTED') {
      await finalizeLeave(result.entityId, 'REJECTED', comment?.trim() || ctx.fullName);
    } else {
      await notifyPendingApprovers(result.entityId);
    }
  }

  await writeAudit({
      actorId: ctx.userId, entityType: 'LeaveRequest', entityId: String(result.entityId ?? ''),
      action: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', diff: { comment } as never,
    });

  revalidatePath('/approvals');
  revalidatePath('/leaves');
  if (result.entityId) revalidatePath(`/leaves/${result.entityId}`);
  return { ok: true, message: result.message };
}

export async function cancelLeaveAction(requestId: number, reason?: string): Promise<Result> {
  const ctx = await requireAuth();
  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, message: 'Không tìm thấy đơn' };

  const isOwner = request.employeeId === ctx.employeeId;
  if (!isOwner && !can(ctx, 'FEATURE_LEAVE_FORCE_CLOSE')) {
    return { ok: false, message: 'Bạn không có quyền hủy đơn này' };
  }
  if (!['DRAFT', 'PENDING', 'APPROVED'].includes(request.status)) {
    return { ok: false, message: 'Đơn này không thể hủy' };
  }
  if (request.status === 'APPROVED' && isOwner && request.startDate < new Date()) {
    return { ok: false, message: 'Không thể tự hủy đơn đã bắt đầu — liên hệ HR' };
  }


  const leaveType = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  const year = request.startDate.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.leaveRequest.updateMany({
      where: { id: requestId, status: request.status },
      data: { status: 'CANCELLED', closedAt: new Date(), closingNote: reason ?? null },
    });
    if (claimed.count !== 1) throw new Error('Trạng thái đơn đã thay đổi. Vui lòng tải lại.');

    if (leaveType?.deductsBalance && request.submittedAt) {
      if (request.status === 'APPROVED') await adjustBalance(tx, request.employeeId, year, { used: -Number(request.totalDays) });
      else if (request.status === 'PENDING') await adjustBalance(tx, request.employeeId, year, { pending: -Number(request.totalDays) });
    }

    if (request.workflowInstanceId) await cancelWorkflow(request.workflowInstanceId, ctx.employeeId, reason, tx);
    const days = await tx.leaveRequestDay.findMany({ where: { requestId } });
    for (const day of days) await rollupDay(day.date, tx, [request.employeeId]);
  }, { isolationLevel: 'Serializable' });

  revalidatePath('/leaves');
  revalidatePath(`/leaves/${requestId}`);
  revalidatePath('/approvals');
  return { ok: true, message: `Đã hủy đơn ${request.code}` };
}

/**
 * Xóa hẳn một đơn nghỉ chưa được duyệt.
 *
 * Khác với hủy đơn (giữ lại bản ghi ở trạng thái CANCELLED để còn dấu vết), đây
 * là xóa vĩnh viễn — chỉ dành cho quản trị dọn đơn rác, đơn nhập nhầm hoặc đơn
 * kẹt quy trình. Đơn đã duyệt không xóa được: phải hủy trước để hoàn lại quỹ
 * phép và bảng công, rồi mới xóa.
 */
export async function deleteLeaveAction(requestId: number): Promise<Result> {
  const ctx = await requireAuth();
  if (!ctx.isAdmin && !can(ctx, 'FEATURE_LEAVE_FORCE_CLOSE')) {
    return { ok: false, message: 'Chỉ quản trị hệ thống mới được xóa đơn nghỉ phép' };
  }

  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, message: 'Không tìm thấy đơn' };

  if (request.status === 'APPROVED') {
    return { ok: false, message: 'Đơn đã duyệt không xóa được — hãy hủy đơn trước để hoàn lại quỹ phép' };
  }

  const leaveType = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  const year = request.startDate.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    // Đơn đang chờ duyệt vẫn đang giữ chỗ trong quỹ phép, phải trả lại trước khi xóa
    if (leaveType?.deductsBalance && request.status === 'PENDING' && request.submittedAt) {
      await adjustBalance(tx, request.employeeId, year, { pending: -Number(request.totalDays) });
    }

    // Bảng công do hệ thống sinh ra từ đơn này
    await tx.attendanceRecord.deleteMany({
      where: {
        employeeId: request.employeeId,
        workDate: { gte: request.startDate, lte: request.endDate },
        source: 'SYSTEM',
        status: { in: ['LEAVE', 'HALF_DAY'] },
      },
    });

    // LeaveRequestDay tự xóa theo cascade; quy trình duyệt thì không, vì quan hệ
    // từ đơn sang workflow là SetNull — bỏ sót sẽ để lại việc chờ duyệt mồ côi
    await tx.leaveRequest.delete({ where: { id: requestId } });
    if (request.workflowInstanceId) {
      await tx.workflowInstance.delete({ where: { id: request.workflowInstanceId } }).catch(() => null);
    }
  });

  await writeAudit({
      actorId: ctx.userId,
      entityType: 'LeaveRequest',
      entityId: String(requestId),
      action: 'DELETE',
      diff: {
        code: request.code,
        status: request.status,
        employeeId: request.employeeId,
        totalDays: Number(request.totalDays),
      } as never,
    }).catch(() => null);

  revalidatePath('/leaves');
  revalidatePath('/approvals');
  return { ok: true, message: `Đã xóa đơn ${request.code}` };
}

const balanceSchema = z.object({
  employeeId: z.number().int(),
  year: z.number().int(),
  standardDays: z.number(),
  bonusDays: z.number(),
  carriedOverDays: z.number(),
  note: z.string().nullable().or(z.literal('')),
});

export async function updateBalanceAction(raw: unknown): Promise<Result> {
  const ctx = await requirePermission('FEATURE_LEAVE_BALANCE_MANAGE');
  const parsed = balanceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;

  const balance = await getOrCreateBalance(d.employeeId, d.year);
  await prisma.leaveBalance.update({
    where: { id: balance.id },
    data: {
      standardDays: d.standardDays, bonusDays: d.bonusDays,
      carriedOverDays: d.carriedOverDays, note: d.note || null,
    },
  });

  await writeAudit({ actorId: ctx.userId, entityType: 'LeaveBalance', entityId: String(balance.id), action: 'UPDATE', diff: d as never });

  revalidatePath('/leaves');
  return { ok: true, message: 'Đã cập nhật quỹ phép' };
}
