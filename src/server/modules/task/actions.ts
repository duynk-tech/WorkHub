'use server';

import { revalidatePath } from 'next/cache';
import { taskState, taskStatusSchema } from '@/lib/task-state';
import { transitionTask, assertCompletion, assertChecklistEditable, syncChecklistProgress } from './mutations';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission, can } from '@/server/auth/context';
import { generateTaskCode, logActivity, notifyTaskAssigned, taskScopeWhere } from './service';
import { TASK_STATUS } from '@/lib/enums';
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
    const code = await generateTaskCode();
    const task = await prisma.task.create({
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
    return { ok: true, message: `Đã tạo công việc ${code}`, id: task.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu công việc thất bại' };
  }
}

export async function updateTaskStatusAction(id: number, status: string, progress?: number): Promise<Result> {
  try {
    const ctx = await requireAuth();
    await transitionTask(ctx, id, status, progress);

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
  const ctx = await requirePermission('FEATURE_TASK_DELETE');
  const task = await prisma.task.findFirst({ where: { AND: [{ id }, await taskScopeWhere(ctx)] } });
  if (!task) return { ok: false, message: 'Không tìm thấy công việc' };

  await prisma.task.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'Task', entityId: String(id), action: 'DELETE', diffJson: { code: task.code, title: task.title } as never },
  });

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

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: 'Đã gửi bình luận' };
}

export async function toggleChecklistAction(itemId: number, isDone: boolean): Promise<Result> {
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
