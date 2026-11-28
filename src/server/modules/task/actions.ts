'use server';

import { revalidatePath } from 'next/cache';
import { taskState, taskStatusSchema } from '@/lib/task-state';
import { transitionTask, assertCompletion, assertChecklistEditable, syncChecklistProgress } from './mutations';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { generateTaskCode, logActivity, notifyTaskAssigned, notifyTaskComment, notifyTaskParticipants, taskScopeWhere } from './service';
import { TASK_STATUS } from '@/lib/enums';
import { parseRecurrence } from '@/lib/task-recurrence';
import { writeAudit } from '@/server/lib/audit';
import { dispatchOutboundWebhook } from '@/server/modules/webhook/dispatcher';

export interface Result { ok: boolean; message: string; id?: number }

const taskSchema = z.object({
  title: z.string().min(1, 'Nhập tiêu đề công việc').max(255),
  description: z.string().nullable().or(z.literal('')),
  departmentId: z.number().int().nullable(),
  assigneeId: z.number().int().nullable(),
  reviewerId: z.number().int().nullable(),
  parentTaskId: z.number().int().nullable(),
  status: taskStatusSchema.default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  startDate: z.string().nullable().or(z.literal('')),
  dueDate: z.string().nullable().or(z.literal('')),
  estimateHours: z.number().nonnegative().nullable().optional(),
  tags: z.string().nullable().or(z.literal('')),
  progress: z.number().int().min(0).max(100).default(0),
  watcherIds: z.array(z.number().int()).default([]),
  checklist: z.array(z.string()).default([]),
  reminderOffsetMinutes: z.number().int().nullable().optional(),
  // Quy tắc lặp rút gọn FREQ=DAILY|WEEKLY|MONTHLY[;INTERVAL=n]; rỗng = không lặp
  recurrenceRule: z.string().max(255).nullable().optional().refine((v) => !v || parseRecurrence(v) !== null, 'Quy tắc lặp không hợp lệ'),
});

async function assertCanEdit(taskId: number) {
  const ctx = await requireAuth();
  const task = await prisma.task.findFirst({ where: { AND: [{ id: taskId }, await taskScopeWhere(ctx)] } });
  if (!task) throw new Error('Không tìm thấy công việc hoặc ngoài phạm vi dữ liệu của bạn');

  const isOwner = task.assigneeId === ctx.employeeId || task.creatorId === ctx.employeeId;
  if (!isOwner && !can(ctx, 'FEATURE_TASK_EDIT')) {
    throw new Error('Bạn không có quyền sửa công việc này');
  }
  return { ctx, task };
}

/** Bình luận chỉ được thấy/sửa khi công việc chứa nó nằm trong phạm vi dữ liệu của người gọi. */
async function findCommentInScope(ctx: Awaited<ReturnType<typeof requireAuth>>, commentId: number) {
  return prisma.taskComment.findFirst({
    where: { id: commentId, task: await taskScopeWhere(ctx) },
  });
}

export async function saveTaskAction(id: number | null, raw: unknown): Promise<Result> {
  const ctx = await requireAuth();
  if (!id && !can(ctx, 'FEATURE_TASK_CREATE')) return { ok: false, message: 'Bạn không có quyền tạo công việc' };

  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;
  const start = d.startDate ? new Date(d.startDate) : null;
  const due = d.dueDate ? new Date(d.dueDate) : null;
  if ((start && !Number.isFinite(start.getTime())) || (due && !Number.isFinite(due.getTime())) || (start && due && due < start)) return { ok: false, message: 'Khoảng ngày công việc không hợp lệ' };
  if (id && d.parentTaskId === id) return { ok: false, message: 'Công việc không thể là cha của chính nó' };

  // Chống vòng lặp công việc cha – con nhiều cấp (A → B → C → A)
  if (id && d.parentTaskId) {
    let cursor: number | null = d.parentTaskId;
    const visited = new Set<number>([id]);
    for (let depth = 0; depth < 20 && cursor; depth++) {
      if (visited.has(cursor)) {
        return { ok: false, message: 'Không thể tạo vòng lặp công việc cha – con' };
      }
      visited.add(cursor);
      const ancestor: { parentTaskId: number | null } | null = await prisma.task.findUnique({
        where: { id: cursor },
        select: { parentTaskId: true },
      });
      cursor = ancestor?.parentTaskId ?? null;
    }
  }

  if (d.assigneeId && d.assigneeId !== ctx.employeeId && !can(ctx, 'FEATURE_TASK_ASSIGN')) {
    return { ok: false, message: 'Bạn chỉ được tạo công việc cho chính mình' };
  }

  const data = {
    title: d.title,
    description: d.description || null,
    departmentId: d.departmentId,
    assigneeId: d.assigneeId,
    reviewerId: d.reviewerId,
    parentTaskId: d.parentTaskId,
    status: d.status as never,
    priority: d.priority as never,
    startDate: d.startDate ? new Date(d.startDate) : null,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    estimateHours: d.estimateHours ?? null,
    tags: d.tags || null,
    progress: d.progress,
    ...(d.recurrenceRule !== undefined
      ? { isRecurring: Boolean(d.recurrenceRule), recurrenceRule: d.recurrenceRule || null }
      : {}),
  };

  try {
    if (id) {
      const { task: before } = await assertCanEdit(id);
      const assigneeChanged = before.assigneeId !== d.assigneeId;

      if (before.reviewerId !== d.reviewerId && before.creatorId !== ctx.employeeId && !can(ctx, 'FEATURE_TASK_ASSIGN')) throw new Error('Bạn không có quyền đổi người kiểm tra');
      const task = await prisma.$transaction(async (tx) => {
        if (d.status === 'DONE' && before.status !== 'DONE') await assertCompletion(tx, ctx, { id, reviewerId: before.reviewerId ?? d.reviewerId });
        const task = await tx.task.update({ where: { id }, data: { ...data, ...taskState(d.status, d.progress, before) } });
        await tx.taskWatcher.deleteMany({ where: { taskId: id } });
        if (d.watcherIds.length) await tx.taskWatcher.createMany({ data: d.watcherIds.map((employeeId) => ({ taskId: id, employeeId })), skipDuplicates: true });
        if (d.reminderOffsetMinutes !== undefined) {
          await tx.taskReminder.deleteMany({ where: { taskId: id, lastSentAt: null } });
          if (d.reminderOffsetMinutes && d.reminderOffsetMinutes > 0) {
            await tx.taskReminder.create({ data: { taskId: id, offsetMinutesBeforeDue: d.reminderOffsetMinutes } });
          }
        }
        return task;
      }, { isolationLevel: 'Serializable' });

      await logActivity(id, ctx.employeeId, 'UPDATE');
      if (assigneeChanged && d.assigneeId) await notifyTaskAssigned(id, ctx.fullName);
      if (d.status === 'DONE' && before.status !== 'DONE') {
        dispatchOutboundWebhook('task.completed', {
          id: task.id,
          code: task.code,
          title: task.title,
          status: 'DONE',
          assigneeId: task.assigneeId,
          completedAt: new Date().toISOString(),
        }).catch((err) => console.error('[Webhook task.completed Error]:', err));
      }

      revalidatePath('/tasks');
      revalidatePath(`/tasks/${id}`);
      return { ok: true, message: 'Đã cập nhật công việc', id: task.id };
    }

    if (d.status === 'DONE' && (d.checklist.some(Boolean) || (d.reviewerId && d.reviewerId !== ctx.employeeId))) throw new Error('Tạo công việc trước khi kiểm tra và hoàn thành');
    let code = '';
    let task: Awaited<ReturnType<typeof prisma.task.create>> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = await generateTaskCode(attempt);
      try {
        task = await prisma.task.create({
          data: {
            ...data,
            ...taskState(d.status, d.progress, { status: 'TODO', progress: 0 }),
            code,
            creatorId: ctx.employeeId,
            departmentId: d.departmentId ?? ctx.departmentId,
            source: 'WEB',
            watchers: d.watcherIds.length ? { create: d.watcherIds.map((employeeId) => ({ employeeId })) } : undefined,
            checklist: d.checklist.length
              ? { create: d.checklist.filter(Boolean).map((content, i) => ({ content, sortOrder: i })) }
              : undefined,
            reminders: d.reminderOffsetMinutes
              ? { create: { offsetMinutesBeforeDue: d.reminderOffsetMinutes } }
              : undefined,
          },
        });
        break;
      } catch (err: unknown) {
        const prismaErr = err as { code?: string };
        if (prismaErr?.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }
    if (!task) throw new Error('Không thể sinh mã công việc duy nhất, vui lòng thử lại');

    await logActivity(task.id, ctx.employeeId, 'CREATE');
    if (task.assigneeId && task.assigneeId !== ctx.employeeId) await notifyTaskAssigned(task.id, ctx.fullName);

    dispatchOutboundWebhook('task.created', {
      id: task.id,
      code: task.code,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      creatorId: task.creatorId,
      departmentId: task.departmentId,
      dueDate: task.dueDate?.toISOString() ?? null,
    }).catch((err) => console.error('[Webhook task.created Error]:', err));

    revalidatePath('/tasks');
    if (d.parentTaskId) revalidatePath(`/tasks/${d.parentTaskId}`);
    return { ok: true, message: `Đã tạo công việc ${code}`, id: task.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu công việc thất bại' };
  }
}

export async function updateTaskStatusAction(id: number, status: string, progress?: number): Promise<Result> {
  try {
    const ctx = await requireAuth();
    const before = await prisma.task.findUnique({ where: { id }, select: { status: true, reviewerId: true } });
    const updated = await transitionTask(ctx, id, status, progress);
    if (before && before.status !== updated.status) {
      await notifyStatusChange(ctx, id, updated.status, before.reviewerId).catch(() => {});
    }

    revalidatePath('/tasks');
    revalidatePath(`/tasks/${id}`);
    return { ok: true, message: `Đã chuyển sang "${TASK_STATUS[status]?.label ?? status}"` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật trạng thái thất bại' };
  }
}

export async function updateTaskProgressAction(id: number, progress: number): Promise<Result> {
  try {
    const { ctx, task } = await assertCanEdit(id);
    if (task.status === 'DONE' && progress !== 100) throw new Error('Mở lại công việc trước khi đổi tiến độ');
    const data = taskState(task.status, progress, task);
    await prisma.task.update({ where: { id }, data });
    await logActivity(id, ctx.employeeId, 'PROGRESS', 'progress', null, String(progress));
    revalidatePath(`/tasks/${id}`);
    return { ok: true, message: `Đã cập nhật tiến độ ${progress}%` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật tiến độ thất bại' };
  }
}

export async function deleteTaskAction(id: number): Promise<Result> {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_TASK_DELETE')) return { ok: false, message: 'Bạn không có quyền xóa công việc' };
  const task = await prisma.task.findFirst({ where: { AND: [{ id }, await taskScopeWhere(ctx)] } });
  if (!task) return { ok: false, message: 'Không tìm thấy công việc' };

  await prisma.task.delete({ where: { id } });
  await writeAudit({ actorId: ctx.userId, entityType: 'Task', entityId: id, action: 'DELETE', diff: { code: task.code, title: task.title } });

  revalidatePath('/tasks');
  return { ok: true, message: `Đã xóa công việc ${task.code}` };
}

export async function addCommentAction(taskId: number, content: string): Promise<Result> {
  const ctx = await requireAuth();
  if (!content.trim()) return { ok: false, message: 'Nội dung bình luận trống' };

  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, await taskScopeWhere(ctx)] },
    select: { id: true, assigneeId: true, creatorId: true },
  });
  if (!task) return { ok: false, message: 'Không tìm thấy công việc' };

  await prisma.taskComment.create({ data: { taskId, authorId: ctx.employeeId, content: content.trim() } });
  await logActivity(taskId, ctx.employeeId, 'COMMENT');
  await notifyTaskComment(taskId, ctx.employeeId, ctx.fullName, content.trim()).catch(() => {});

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: 'Đã gửi bình luận' };
}

export async function updateCommentAction(commentId: number, content: string): Promise<Result> {
  const ctx = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, message: 'Nội dung bình luận trống' };

  const comment = await findCommentInScope(ctx, commentId);
  if (!comment) return { ok: false, message: 'Không tìm thấy bình luận' };
  if (comment.authorId !== ctx.employeeId && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn chỉ có thể sửa bình luận của mình' };
  }

  await prisma.taskComment.update({ where: { id: commentId }, data: { content: trimmed } });
  revalidatePath(`/tasks/${comment.taskId}`);
  return { ok: true, message: 'Đã cập nhật bình luận' };
}

export async function deleteCommentAction(commentId: number): Promise<Result> {
  const ctx = await requireAuth();
  const comment = await findCommentInScope(ctx, commentId);
  if (!comment) return { ok: false, message: 'Không tìm thấy bình luận' };
  if (comment.authorId !== ctx.employeeId && !can(ctx, 'FEATURE_TASK_EDIT')) {
    return { ok: false, message: 'Bạn không có quyền xóa bình luận này' };
  }

  await prisma.taskComment.delete({ where: { id: commentId } });
  revalidatePath(`/tasks/${comment.taskId}`);
  return { ok: true, message: 'Đã xóa bình luận' };
}

export async function toggleChecklistAction(itemId: number, isDone: boolean): Promise<Result> {
  await requireAuth();
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, message: 'Không tìm thấy mục checklist' };

  try {
    const { ctx } = await assertCanEdit(item.taskId);
    await prisma.$transaction(async (tx) => {
      await assertChecklistEditable(tx, item.taskId);
      await tx.taskChecklistItem.update({ where: { id: itemId }, data: { isDone, completedAt: isDone ? new Date() : null } });
      await syncChecklistProgress(tx, item.taskId);
    }, { isolationLevel: 'Serializable' });

    await logActivity(item.taskId, ctx.employeeId, 'CHECKLIST', item.content, null, isDone ? 'hoàn thành' : 'bỏ đánh dấu');
    revalidatePath(`/tasks/${item.taskId}`);
    return { ok: true, message: 'Đã cập nhật checklist' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật checklist thất bại' };
  }
}

export async function addChecklistItemAction(taskId: number, content: string): Promise<Result> {
  if (!content.trim()) return { ok: false, message: 'Nội dung trống' };
  try {
    await assertCanEdit(taskId);
    await prisma.$transaction(async (tx) => {
      await assertChecklistEditable(tx, taskId);
      const count = await tx.taskChecklistItem.count({ where: { taskId } });
      await tx.taskChecklistItem.create({ data: { taskId, content: content.trim(), sortOrder: count } });
      await syncChecklistProgress(tx, taskId);
    }, { isolationLevel: 'Serializable' });
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: 'Đã thêm mục checklist' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Thêm checklist thất bại' };
  }
}

export async function deleteChecklistItemAction(itemId: number): Promise<Result> {
  await requireAuth();
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, message: 'Không tìm thấy mục' };
  try {
    await assertCanEdit(item.taskId);
    await prisma.$transaction(async (tx) => {
      await assertChecklistEditable(tx, item.taskId);
      await tx.taskChecklistItem.delete({ where: { id: itemId } });
      await syncChecklistProgress(tx, item.taskId);
    }, { isolationLevel: 'Serializable' });
    revalidatePath(`/tasks/${item.taskId}`);
    return { ok: true, message: 'Đã xóa mục checklist' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa thất bại' };
  }
}

export async function logTimeAction(taskId: number, hours: number, workDate: string, description?: string): Promise<Result> {
  try {
    const { ctx } = await assertCanEdit(taskId);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { ok: false, message: 'Số giờ phải trong khoảng 0–24' };
    const day = new Date(workDate);
    if (!Number.isFinite(day.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || day.toISOString().slice(0, 10) !== workDate) return { ok: false, message: 'Ngày làm việc không hợp lệ' };
    await prisma.$transaction(async (tx) => {
      const daily = await tx.taskTimeLog.aggregate({ where: { employeeId: ctx.employeeId, workDate: day }, _sum: { hours: true } });
      if (Number(daily._sum.hours || 0) + hours > 24) throw new Error('Tổng thời gian của bạn trong ngày vượt 24 giờ');
      await tx.taskTimeLog.create({ data: { taskId, employeeId: ctx.employeeId, hours, workDate: day, description: description || null } });
      const agg = await tx.taskTimeLog.aggregate({ where: { taskId }, _sum: { hours: true } });
      await tx.task.update({ where: { id: taskId }, data: { actualHours: agg._sum.hours ?? 0 } });
    }, { isolationLevel: 'Serializable' });

    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: `Đã ghi nhận ${hours} giờ làm việc` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Ghi nhận thời gian thất bại' };
  }
}

export async function deleteTimeLogAction(timeLogId: number): Promise<Result> {
  try {
    const ctx = await requireAuth();
    const log = await prisma.taskTimeLog.findUnique({ where: { id: timeLogId } });
    if (!log) return { ok: false, message: 'Không tìm thấy bản ghi chấm giờ' };

    const task = await prisma.task.findFirst({ where: { AND: [{ id: log.taskId }, await taskScopeWhere(ctx)] } });
    if (!task) return { ok: false, message: 'Công việc ngoài phạm vi dữ liệu của bạn' };
    if (log.employeeId !== ctx.employeeId && !can(ctx, 'FEATURE_TASK_EDIT')) {
      return { ok: false, message: 'Bạn không có quyền xóa bản ghi chấm giờ này' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskTimeLog.delete({ where: { id: timeLogId } });
      const agg = await tx.taskTimeLog.aggregate({ where: { taskId: log.taskId }, _sum: { hours: true } });
      await tx.task.update({ where: { id: log.taskId }, data: { actualHours: agg._sum.hours ?? 0 } });
    }, { isolationLevel: 'Serializable' });

    revalidatePath(`/tasks/${log.taskId}`);
    return { ok: true, message: 'Đã xóa bản ghi chấm giờ' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa chấm giờ thất bại' };
  }
}

export async function deleteTaskAttachmentAction(attachmentId: number): Promise<Result> {
  try {
    const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) return { ok: false, message: 'Không tìm thấy tệp đính kèm' };
    const { ctx } = await assertCanEdit(att.taskId);

    await prisma.taskAttachment.delete({ where: { id: attachmentId } });
    await logActivity(att.taskId, ctx.employeeId, 'ATTACHMENT', att.fileName, null, 'đã xóa');

    revalidatePath(`/tasks/${att.taskId}`);
    revalidatePath('/tasks');
    return { ok: true, message: 'Đã xóa tệp đính kèm' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa tệp đính kèm thất bại' };
  }
}

export async function toggleWatchTaskAction(taskId: number): Promise<Result> {
  try {
    const ctx = await requireAuth();
    const task = await prisma.task.findFirst({
      where: { AND: [{ id: taskId }, await taskScopeWhere(ctx)] },
      select: { id: true },
    });
    if (!task) return { ok: false, message: 'Không tìm thấy công việc' };

    const existing = await prisma.taskWatcher.findUnique({
      where: { taskId_employeeId: { taskId, employeeId: ctx.employeeId } },
    });

    if (existing) {
      await prisma.taskWatcher.delete({
        where: { taskId_employeeId: { taskId, employeeId: ctx.employeeId } },
      });
      revalidatePath(`/tasks/${taskId}`);
      return { ok: true, message: 'Đã bỏ theo dõi công việc' };
    }

    await prisma.taskWatcher.create({
      data: { taskId, employeeId: ctx.employeeId },
    });
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: 'Đã theo dõi công việc' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật theo dõi thất bại' };
  }
}

/**
 * Báo người liên quan khi công việc đổi trạng thái. Chuyển sang "Chờ duyệt" thì
 * chỉ báo người nghiệm thu (đó là việc của họ), các trạng thái khác báo cả nhóm.
 */
async function notifyStatusChange(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  taskId: number,
  status: string,
  reviewerId: number | null,
) {
  const label = TASK_STATUS[status]?.label ?? status;
  if (status === 'REVIEW' && reviewerId) {
    await notifyTaskParticipants(taskId, ctx.employeeId, (t) => ({
      title: `${ctx.fullName} gửi ${t.code} chờ bạn nghiệm thu`,
      body: t.title,
    }), { only: [reviewerId] });
    return;
  }
  await notifyTaskParticipants(taskId, ctx.employeeId, (t) => ({
    title: `${t.code} chuyển sang "${label}"`,
    body: `${ctx.fullName} cập nhật: ${t.title}`,
  }));
}

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  action: z.enum(['status', 'assign', 'delete']),
  status: taskStatusSchema.optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export interface BulkResult extends Result {
  done: number;
  failed: { id: number; message: string }[];
}

/**
 * Thao tác hàng loạt trên danh sách công việc. Mỗi việc đi qua đúng luật như
 * khi làm lẻ (phạm vi dữ liệu, quyền sửa, điều kiện hoàn thành), việc nào không
 * đạt thì bỏ qua và báo lại, không làm hỏng cả lô.
 */
export async function bulkTaskAction(raw: unknown): Promise<BulkResult> {
  const ctx = await requireAuth();
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Dữ liệu không hợp lệ', done: 0, failed: [] };
  const { ids, action } = parsed.data;

  if (action === 'delete' && !can(ctx, 'FEATURE_TASK_DELETE')) {
    return { ok: false, message: 'Bạn không có quyền xóa công việc', done: 0, failed: [] };
  }
  if (action === 'assign' && !can(ctx, 'FEATURE_TASK_ASSIGN')) {
    return { ok: false, message: 'Bạn không có quyền giao việc', done: 0, failed: [] };
  }
  if (action === 'status' && !parsed.data.status) {
    return { ok: false, message: 'Chưa chọn trạng thái', done: 0, failed: [] };
  }

  const failed: { id: number; message: string }[] = [];
  let done = 0;

  if (action === 'status') {
    for (const id of ids) {
      const r = await updateTaskStatusAction(id, parsed.data.status!);
      if (r.ok) done++;
      else failed.push({ id, message: r.message });
    }
  } else {
    const scope = await taskScopeWhere(ctx);
    const tasks = await prisma.task.findMany({
      where: { AND: [{ id: { in: ids } }, scope] },
      select: { id: true, code: true, title: true, assigneeId: true },
    });
    const found = new Set(tasks.map((t) => t.id));
    for (const id of ids) if (!found.has(id)) failed.push({ id, message: 'Không tìm thấy hoặc ngoài phạm vi dữ liệu' });

    if (action === 'delete' && tasks.length) {
      await prisma.$transaction([
        prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } }),
        prisma.auditLog.createMany({
          data: tasks.map((t) => ({
            actorId: ctx.userId, entityType: 'Task', entityId: String(t.id), action: 'DELETE',
            diffJson: { code: t.code, title: t.title, bulk: true },
          })),
        }),
      ]);
      done = tasks.length;
    }

    if (action === 'assign' && tasks.length) {
      const assigneeId = parsed.data.assigneeId ?? null;
      const changed = tasks.filter((t) => t.assigneeId !== assigneeId);
      await prisma.task.updateMany({ where: { id: { in: changed.map((t) => t.id) } }, data: { assigneeId } });
      for (const t of changed) {
        await logActivity(t.id, ctx.employeeId, 'ASSIGN', 'assigneeId', t.assigneeId ? String(t.assigneeId) : null, assigneeId ? String(assigneeId) : null);
        if (assigneeId) await notifyTaskAssigned(t.id, ctx.fullName).catch(() => {});
      }
      done = tasks.length;
    }
  }

  revalidatePath('/tasks');
  const message = failed.length
    ? `Đã xử lý ${done}/${ids.length} công việc; ${failed.length} việc bị bỏ qua`
    : `Đã xử lý ${done} công việc`;
  return { ok: done > 0 || failed.length === 0, message, done, failed };
}
