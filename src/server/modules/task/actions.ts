'use server';

import { revalidatePath } from 'next/cache';
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
  status: z.string().default('TODO'),
  priority: z.string().default('MEDIUM'),
  startDate: z.string().nullable().or(z.literal('')),
  dueDate: z.string().nullable().or(z.literal('')),
  estimateHours: z.number().nullable().optional(),
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

      const task = await prisma.task.update({
        where: { id },
        data: {
          ...data,
          completedAt: d.status === 'DONE' && before.status !== 'DONE' ? new Date() : before.completedAt,
        },
      });

      await prisma.taskWatcher.deleteMany({ where: { taskId: id } });
      if (d.watcherIds.length) {
        await prisma.taskWatcher.createMany({ data: d.watcherIds.map((employeeId) => ({ taskId: id, employeeId })), skipDuplicates: true });
      }

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

    const code = await generateTaskCode();
    const task = await prisma.task.create({
      data: {
        ...data,
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
    const { ctx, task } = await assertCanEdit(id);
    if (task.status === status) return { ok: true, message: 'Trạng thái không đổi' };

    await prisma.task.update({
      where: { id },
      data: {
        status: status as never,
        progress: progress ?? (status === 'DONE' ? 100 : task.progress),
        completedAt: status === 'DONE' ? new Date() : null,
      },
    });

    await logActivity(id, ctx.employeeId, 'STATUS', 'status', TASK_STATUS[task.status]?.label ?? task.status, TASK_STATUS[status]?.label ?? status);

    if (status === 'DONE' && task.status !== 'DONE') {
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
    return { ok: true, message: `Đã chuyển sang "${TASK_STATUS[status]?.label ?? status}"` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật trạng thái thất bại' };
  }
}

export async function updateTaskProgressAction(id: number, progress: number): Promise<Result> {
  try {
    const { ctx } = await assertCanEdit(id);
    await prisma.task.update({ where: { id }, data: { progress: Math.max(0, Math.min(100, progress)) } });
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
    await prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: { isDone, completedAt: isDone ? new Date() : null },
    });

    // Tiến độ tự suy ra từ checklist khi có đủ dữ liệu
    const items = await prisma.taskChecklistItem.findMany({ where: { taskId: item.taskId } });
    if (items.length > 0) {
      const done = items.filter((i) => i.isDone).length;
      await prisma.task.update({
        where: { id: item.taskId },
        data: { progress: Math.round((done / items.length) * 100) },
      });
    }

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
    const count = await prisma.taskChecklistItem.count({ where: { taskId } });
    await prisma.taskChecklistItem.create({ data: { taskId, content: content.trim(), sortOrder: count } });
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
    await prisma.taskChecklistItem.delete({ where: { id: itemId } });
    revalidatePath(`/tasks/${item.taskId}`);
    return { ok: true, message: 'Đã xóa mục checklist' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa thất bại' };
  }
}

export async function logTimeAction(taskId: number, hours: number, workDate: string, description?: string): Promise<Result> {
  try {
    const { ctx } = await assertCanEdit(taskId);
    if (hours <= 0 || hours > 24) return { ok: false, message: 'Số giờ phải trong khoảng 0–24' };

    await prisma.taskTimeLog.create({
      data: { taskId, employeeId: ctx.employeeId, hours, workDate: new Date(workDate), description: description || null },
    });

    const agg = await prisma.taskTimeLog.aggregate({ where: { taskId }, _sum: { hours: true } });
    await prisma.task.update({ where: { id: taskId }, data: { actualHours: agg._sum.hours ?? 0 } });

    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, message: `Đã ghi nhận ${hours} giờ làm việc` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Ghi nhận thời gian thất bại' };
  }
}
