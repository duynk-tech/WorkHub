import { z } from 'zod';
export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED', 'CANCELLED']);
export function taskState(statusInput: string, progress: number | undefined, previous: { status: string; progress: number; completedAt?: Date | null }, now = new Date()) {
  const status = taskStatusSchema.parse(statusInput);
  if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) throw new Error('Tiến độ phải là số nguyên từ 0 đến 100');
  return {
    status,
    progress: status === 'DONE' ? 100 : progress ?? (previous.status === 'DONE' ? 0 : previous.progress),
    completedAt: status === 'DONE' ? (previous.status === 'DONE' ? previous.completedAt ?? now : now) : null,
  };
}

/** Trạng thái đã đóng sổ: không còn ai phải làm gì. */
export const CLOSED_TASK_STATUS_LIST = ['DONE', 'CANCELLED'] as const;

/** Việc quá hạn = có hạn, hạn đã qua và chưa đóng. Dùng chung cho list, board, chi tiết và job. */
export function isTaskOverdue(
  task: { dueDate: Date | string | null | undefined; status: string },
  now: Date = new Date(),
): boolean {
  if (!task.dueDate) return false;
  if ((CLOSED_TASK_STATUS_LIST as readonly string[]).includes(task.status)) return false;
  return new Date(task.dueDate) < now;
}
