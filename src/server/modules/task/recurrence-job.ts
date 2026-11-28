import { prisma } from '@/lib/prisma';
import { nextDueDate, parseRecurrence } from '@/lib/task-recurrence';
import { withFreshCode } from '@/server/lib/code-sequence';
import { generateTaskCode, notifyTaskAssigned } from './service';

/**
 * Sinh lần kế tiếp cho công việc định kỳ đã đóng.
 *
 * Cờ "định kỳ" được chuyền sang việc mới trong cùng transaction (việc cũ tắt cờ),
 * nên mỗi chuỗi chỉ có đúng một việc đang mang cờ và job chạy lại không sinh trùng.
 * Việc mới chép tiêu đề, mô tả, người làm/duyệt/theo dõi, checklist (bỏ đánh dấu)
 * và mức nhắc việc; hạn mới tính từ hạn cũ theo quy tắc lặp.
 */
export async function generateRecurringTasks(now = new Date()) {
  const closed = await prisma.task.findMany({
    where: { isRecurring: true, status: { in: ['DONE', 'CANCELLED'] } },
    include: {
      watchers: { select: { employeeId: true } },
      checklist: { orderBy: { sortOrder: 'asc' }, select: { content: true, sortOrder: true } },
      reminders: { where: { isActive: true }, take: 1 },
    },
    take: 200,
  });

  let created = 0;
  let skipped = 0;

  for (const task of closed) {
    const rule = parseRecurrence(task.recurrenceRule);
    if (!rule) {
      // Quy tắc hỏng: tắt cờ để không quét lại mãi
      await prisma.task.update({ where: { id: task.id }, data: { isRecurring: false } });
      skipped++;
      continue;
    }

    const anchor = task.dueDate ?? task.completedAt ?? now;
    const due = nextDueDate(anchor, rule, now);
    const start = task.startDate && task.dueDate
      ? new Date(due.getTime() - (task.dueDate.getTime() - task.startDate.getTime()))
      : null;
    const reminder = task.reminders[0];

    const next = await withFreshCode(generateTaskCode, (code) =>
      prisma.$transaction(async (tx) => {
        // Đã có người/lần chạy khác chuyền cờ rồi thì thôi
        const released = await tx.task.updateMany({
          where: { id: task.id, isRecurring: true },
          data: { isRecurring: false },
        });
        if (released.count === 0) return null;

        return tx.task.create({
          data: {
            code,
            title: task.title,
            description: task.description,
            departmentId: task.departmentId,
            creatorId: task.creatorId,
            assigneeId: task.assigneeId,
            reviewerId: task.reviewerId,
            parentTaskId: task.parentTaskId,
            priority: task.priority,
            estimateHours: task.estimateHours,
            tags: task.tags,
            startDate: start,
            dueDate: due,
            isRecurring: true,
            recurrenceRule: task.recurrenceRule,
            source: 'SYSTEM',
            watchers: { create: task.watchers.map((w) => ({ employeeId: w.employeeId })) },
            checklist: { create: task.checklist.map((c) => ({ content: c.content, sortOrder: c.sortOrder })) },
            ...(reminder
              ? {
                  reminders: {
                    create: {
                      offsetMinutesBeforeDue: reminder.offsetMinutesBeforeDue,
                      targetAssignee: reminder.targetAssignee,
                      targetWatchers: reminder.targetWatchers,
                      targetManager: reminder.targetManager,
                    },
                  },
                }
              : {}),
            activities: {
              create: { action: 'CREATE', field: 'recurrence', oldValue: task.code, newValue: task.recurrenceRule },
            },
          },
        });
      }),
    );

    if (next) {
      created++;
      if (next.assigneeId) await notifyTaskAssigned(next.id, 'Lịch lặp tự động').catch(() => {});
    }
  }

  return { created, skipped };
}
