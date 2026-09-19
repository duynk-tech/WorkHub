import { prisma } from '@/lib/prisma';
import { notify } from '@/server/modules/notify/service';
import { processOutbox } from '@/server/modules/notify/zalo';
import { rollupDay } from '@/server/modules/attendance/service';
import { fmtDate, dateOnly } from '@/lib/date';
import { TASK_PRIORITY } from '@/lib/enums';

export interface JobResult { job: string; message: string; count?: number }

/** Nhắc các công việc sắp đến hạn theo cấu hình TaskReminder. */
export async function jobTaskReminders(): Promise<JobResult> {
  const now = new Date();
  const reminders = await prisma.taskReminder.findMany({
    where: {
      isActive: true,
      task: { status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { not: null } },
    },
    include: {
      task: {
        include: {
          watchers: { select: { employeeId: true } },
          department: { select: { managerId: true } },
        },
      },
    },
  });

  let sent = 0;
  for (const reminder of reminders) {
    const task = reminder.task;
    if (!task.dueDate) continue;

    const fireAt = new Date(task.dueDate.getTime() - reminder.offsetMinutesBeforeDue * 60000);
    if (now < fireAt) continue;
    if (reminder.lastSentAt && reminder.lastSentAt > fireAt) continue;

    const targets = new Set<number>();
    if (reminder.targetAssignee && task.assigneeId) targets.add(task.assigneeId);
    if (reminder.targetWatchers) task.watchers.forEach((w) => targets.add(w.employeeId));
    if (reminder.targetManager && task.department?.managerId) targets.add(task.department.managerId);
    if (targets.size === 0) continue;

    const remainingMs = task.dueDate.getTime() - now.getTime();
    const remaining = remainingMs > 0
      ? `còn ${Math.max(1, Math.round(remainingMs / 3600000))} giờ`
      : `đã trễ ${Math.round(Math.abs(remainingMs) / 3600000)} giờ`;

    await notify({
      templateCode: 'TASK_DUE_SOON',
      employeeIds: Array.from(targets),
      linkPath: `/tasks/${task.id}`,
      dedupeKey: `TASK_DUE:${task.id}:${reminder.id}:${fireAt.toISOString().slice(0, 13)}`,
      vars: {
        code: task.code, title: task.title,
        dueDate: fmtDate(task.dueDate, 'dd/MM/yyyy HH:mm'),
        remaining, progress: task.progress,
        priority: TASK_PRIORITY[task.priority]?.label ?? task.priority,
      },
    });

    await prisma.taskReminder.update({ where: { id: reminder.id }, data: { lastSentAt: now } });
    sent++;
  }

  return { job: 'task-reminders', message: `Đã gửi nhắc cho ${sent} công việc`, count: sent };
}

/** Cảnh báo công việc quá hạn — chạy mỗi sáng. */
export async function jobOverdueTasks(): Promise<JobResult> {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = await prisma.task.findMany({
    where: { status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() }, assigneeId: { not: null } },
    select: { id: true, code: true, title: true, dueDate: true, assigneeId: true },
  });

  let sent = 0;
  for (const task of tasks) {
    if (!task.assigneeId || !task.dueDate) continue;
    const overdueDays = Math.max(1, Math.floor((Date.now() - task.dueDate.getTime()) / 86400000));
    await notify({
      templateCode: 'TASK_OVERDUE',
      employeeIds: [task.assigneeId],
      linkPath: `/tasks/${task.id}`,
      dedupeKey: `TASK_OVERDUE:${task.id}:${today}`,
      vars: { code: task.code, title: task.title, dueDate: fmtDate(task.dueDate), overdueDays },
    });
    sent++;
  }

  return { job: 'overdue-tasks', message: `Đã cảnh báo ${sent} công việc quá hạn`, count: sent };
}

/** Nhắc người duyệt khi phiếu duyệt quá hạn SLA. */
export async function jobApprovalSla(): Promise<JobResult> {
  const now = new Date();
  const overdue = await prisma.approvalTask.findMany({
    where: { status: 'PENDING', dueAt: { lt: now }, instance: { status: 'RUNNING' } },
    include: { instance: true },
  });

  const byApprover = new Map<number, typeof overdue>();
  for (const task of overdue) {
    if (task.remindedAt && now.getTime() - task.remindedAt.getTime() < 12 * 3600000) continue;
    if (!byApprover.has(task.approverId)) byApprover.set(task.approverId, []);
    byApprover.get(task.approverId)!.push(task);
  }

  let sent = 0;
  for (const [approverId, tasks] of byApprover) {
    const leaveIds = tasks.filter((t) => t.instance.entityType === 'LEAVE').map((t) => t.instance.entityId);
    const leaves = await prisma.leaveRequest.findMany({
      where: { id: { in: leaveIds } },
      include: { employee: { select: { fullName: true } } },
    });
    const summary = leaves
      .map((l) => `• [${l.code}] ${l.employee.fullName} — ${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`)
      .join('\n');

    await notify({
      templateCode: 'APPROVAL_REMINDER',
      employeeIds: [approverId],
      linkPath: '/approvals',
      dedupeKey: `APPROVAL_SLA:${approverId}:${now.toISOString().slice(0, 13)}`,
      vars: { count: tasks.length, summary: summary || `${tasks.length} đơn` },
    });

    await prisma.approvalTask.updateMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      data: { remindedAt: now },
    });
    sent++;
  }

  return { job: 'approval-sla', message: `Đã nhắc ${sent} người duyệt quá hạn SLA`, count: sent };
}

/** Bản tin buổi sáng cho người có việc hoặc đơn cần xử lý. */
export async function jobDailyDigest(): Promise<JobResult> {
  const today = dateOnly(new Date());
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE', zaloUserId: { not: null } },
    select: { id: true, fullName: true },
  });

  const onLeaveToday = await prisma.leaveRequestDay.count({
    where: { date: today, request: { status: 'APPROVED' } },
  });

  let sent = 0;
  for (const emp of employees) {
    const [dueToday, overdue, pendingApprovals] = await Promise.all([
      prisma.task.count({
        where: {
          assigneeId: emp.id, status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { gte: today, lt: new Date(today.getTime() + 86400000) },
        },
      }),
      prisma.task.count({
        where: { assigneeId: emp.id, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() } },
      }),
      prisma.approvalTask.count({ where: { approverId: emp.id, status: 'PENDING' } }),
    ]);

    // Không làm phiền người không có gì cần xử lý
    if (dueToday === 0 && overdue === 0 && pendingApprovals === 0) continue;

    await notify({
      templateCode: 'DAILY_DIGEST',
      employeeIds: [emp.id],
      linkPath: '/dashboard',
      channels: ['ZALO'],
      dedupeKey: `DIGEST:${today.toISOString().slice(0, 10)}`,
      vars: { date: fmtDate(today), dueToday, overdue, pendingApprovals, onLeave: onLeaveToday },
    });
    sent++;
  }

  return { job: 'daily-digest', message: `Đã gửi bản tin cho ${sent} nhân sự`, count: sent };
}

/** Chốt công ngày hôm qua. */
export async function jobAttendanceRollup(): Promise<JobResult> {
  const yesterday = new Date(Date.now() - 86400000);
  const result = await rollupDay(yesterday);
  return {
    job: 'attendance-rollup',
    message: `Chốt công ${fmtDate(result.date)}: tạo ${result.created}, cập nhật ${result.updated}`,
    count: result.created + result.updated,
  };
}

/** Đẩy hàng đợi thông báo Zalo. */
export async function jobProcessOutbox(): Promise<JobResult> {
  const result = await processOutbox(50);
  return {
    job: 'outbox',
    message: `Gửi ${result.sent}, lỗi ${result.failed}, bỏ qua ${result.skipped}`,
    count: result.sent,
  };
}

export const JOBS = {
  'task-reminders': jobTaskReminders,
  'overdue-tasks': jobOverdueTasks,
  'approval-sla': jobApprovalSla,
  'daily-digest': jobDailyDigest,
  'attendance-rollup': jobAttendanceRollup,
  outbox: jobProcessOutbox,
} as const;

export type JobName = keyof typeof JOBS;
