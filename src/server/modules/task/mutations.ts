import 'server-only';
import { prisma } from '@/lib/prisma';
import { taskState } from '@/lib/task-state';
import { can, type AuthContext } from '@/server/auth/context';
import { taskScopeWhere } from './service';
import { dispatchOutboundWebhook } from '@/server/modules/webhook/dispatcher';
import type { Prisma } from '@prisma/client';
export async function assertCompletion(tx: Prisma.TransactionClient, ctx: AuthContext, task: { id: number; reviewerId: number | null }) {
  if (task.reviewerId && task.reviewerId !== ctx.employeeId && !can(ctx, 'FEATURE_TASK_EDIT')) throw new Error('Công việc cần người kiểm tra xác nhận hoàn thành');
  if (await tx.taskChecklistItem.count({ where: { taskId: task.id, isDone: false } })) throw new Error('Cần hoàn tất checklist trước khi đóng công việc');
  if (await tx.task.count({ where: { parentTaskId: task.id, status: { notIn: ['DONE', 'CANCELLED'] } } })) throw new Error('Còn công việc con chưa hoàn thành');
}
export async function transitionTask(ctx: AuthContext, id: number, status: string, progress?: number) {
  const scope = await taskScopeWhere(ctx);
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { AND: [{ id }, scope] } });
    if (!task) throw new Error('Không tìm thấy công việc hoặc ngoài phạm vi dữ liệu');
    const owner = task.assigneeId === ctx.employeeId || task.creatorId === ctx.employeeId || task.reviewerId === ctx.employeeId;
    if (!owner && !can(ctx, 'FEATURE_TASK_EDIT')) throw new Error('Bạn không có quyền sửa công việc');
    const data = taskState(status, progress, task);
    if (data.status === 'DONE' && task.status !== 'DONE') await assertCompletion(tx, ctx, task);
    const updated = await tx.task.update({ where: { id }, data });
    await tx.taskActivity.create({ data: { taskId: id, actorId: ctx.employeeId, action: 'STATUS', field: 'status', oldValue: task.status, newValue: data.status } });
    return { updated, completed: task.status !== 'DONE' && data.status === 'DONE' };
  }, { isolationLevel: 'Serializable' });
  if (result.completed) await dispatchOutboundWebhook('task.completed', { id, code: result.updated.code, title: result.updated.title, status: 'DONE', completedAt: result.updated.completedAt?.toISOString() }).catch(() => {});
  return result.updated;
}

export async function assertChecklistEditable(tx: Prisma.TransactionClient, taskId: number) {
  const task = await tx.task.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } });
  if (['DONE', 'CANCELLED'].includes(task.status)) throw new Error('Mở lại công việc trước khi sửa checklist');
}
export async function syncChecklistProgress(tx: Prisma.TransactionClient, taskId: number) {
  const items = await tx.taskChecklistItem.findMany({ where: { taskId }, select: { isDone: true } });
  const progress = items.length ? Math.round(items.filter((item) => item.isDone).length * 100 / items.length) : 0;
  await tx.task.update({ where: { id: taskId }, data: { progress } });
}
