import { prisma } from '@/lib/prisma';
import { notify } from '@/server/modules/notify/service';
import { processOutbox } from '@/server/modules/notify/zalo';
import { rollupDay } from '@/server/modules/attendance/service';
import { fmtDate, dateOnly } from '@/lib/date';
import { TASK_PRIORITY } from '@/lib/enums';
import { mapLimit } from '@/lib/concurrency';
import { expireQuotations, runSalesMaintenance } from '@/server/modules/customer/maintenance';
import { generateRecurringTasks } from '@/server/modules/task/recurrence-job';
import { escalateOverdueApprovals } from '@/server/modules/workflow/escalation';

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

  // Chỉ giữ nhắc đã tới giờ và chưa gửi cho mốc này, rồi gửi song song có giới hạn
  const due = reminders.filter((reminder) => {
    const task = reminder.task;
    if (!task.dueDate) return false;
    const fireAt = new Date(task.dueDate.getTime() - reminder.offsetMinutesBeforeDue * 60000);
    if (now < fireAt) return false;
    return !(reminder.lastSentAt && reminder.lastSentAt > fireAt);
  });

  const results = await mapLimit(due, 5, async (reminder) => {
    const task = reminder.task;
    const dueDate = task.dueDate!;
    const fireAt = new Date(dueDate.getTime() - reminder.offsetMinutesBeforeDue * 60000);

    const targets = new Set<number>();
    if (reminder.targetAssignee && task.assigneeId) targets.add(task.assigneeId);
    if (reminder.targetWatchers) task.watchers.forEach((w) => targets.add(w.employeeId));
    if (reminder.targetManager && task.department?.managerId) targets.add(task.department.managerId);
    if (targets.size === 0) return 0;

    const remainingMs = dueDate.getTime() - now.getTime();
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
        dueDate: fmtDate(dueDate, 'dd/MM/yyyy HH:mm'),
        remaining, progress: task.progress,
        priority: TASK_PRIORITY[task.priority]?.label ?? task.priority,
      },
    });

    await prisma.taskReminder.update({ where: { id: reminder.id }, data: { lastSentAt: now } });
    return 1;
  });
  const sent = results.reduce<number>((a, b) => a + b, 0);

  return { job: 'task-reminders', message: `Đã gửi nhắc cho ${sent} công việc`, count: sent };
}

/** Cảnh báo công việc quá hạn — chạy mỗi sáng. Gửi người được giao và trưởng phòng của việc. */
export async function jobOverdueTasks(): Promise<JobResult> {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = await prisma.task.findMany({
    where: { status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() }, assigneeId: { not: null } },
    select: {
      id: true, code: true, title: true, dueDate: true, assigneeId: true,
      department: { select: { managerId: true } },
    },
  });

  const results = await mapLimit(tasks, 5, async (task) => {
    if (!task.assigneeId || !task.dueDate) return 0;
    const overdueDays = Math.max(1, Math.floor((Date.now() - task.dueDate.getTime()) / 86400000));
    const recipients = [task.assigneeId];
    // Quá hạn từ 2 ngày trở lên thì báo cả quản lý để kịp can thiệp
    const managerId = task.department?.managerId;
    if (managerId && managerId !== task.assigneeId && overdueDays >= 2) recipients.push(managerId);
    await notify({
      templateCode: 'TASK_OVERDUE',
      employeeIds: recipients,
      linkPath: `/tasks/${task.id}`,
      dedupeKey: `TASK_OVERDUE:${task.id}:${today}`,
      vars: { code: task.code, title: task.title, dueDate: fmtDate(task.dueDate), overdueDays },
    });
    return 1;
  });
  const sent = results.reduce<number>((a, b) => a + b, 0);

  return { job: 'overdue-tasks', message: `Đã cảnh báo ${sent} công việc quá hạn`, count: sent };
}

/** Nhắc người duyệt khi phiếu duyệt quá hạn SLA; quá gấp đôi SLA thì chuyển lên quản lý. */
export async function jobApprovalSla(): Promise<JobResult> {
  const now = new Date();
  const escalated = await escalateOverdueApprovals(now);
  // Quản lý vừa nhận phiếu được báo ngay, không đợi tới lượt nhắc kế tiếp
  await mapLimit(escalated, 5, (e) =>
    notify({
      templateCode: 'APPROVAL_REMINDER',
      employeeIds: [e.to],
      linkPath: '/approvals',
      dedupeKey: `APPROVAL_ESCALATE:${e.taskId}`,
      vars: { count: 1, summary: 'Một phiếu duyệt quá hạn SLA đã được chuyển lên bạn' },
    }),
  );

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

  return {
    job: 'approval-sla',
    message: `Đã nhắc ${sent} người duyệt quá hạn SLA, chuyển cấp trên ${escalated.length} phiếu`,
    count: sent + escalated.length,
  };
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

  // Ba truy vấn gom nhóm cho tất cả nhân sự, thay vì ba truy vấn cho từng người
  const ids = employees.map((e) => e.id);
  const open = { notIn: ['DONE', 'CANCELLED'] as ('DONE' | 'CANCELLED')[] };
  const [dueGroups, overdueGroups, approvalGroups] = ids.length
    ? await Promise.all([
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: { assigneeId: { in: ids }, status: open, dueDate: { gte: today, lt: new Date(today.getTime() + 86400000) } },
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: { assigneeId: { in: ids }, status: open, dueDate: { lt: new Date() } },
          _count: { _all: true },
        }),
        prisma.approvalTask.groupBy({
          by: ['approverId'],
          where: { approverId: { in: ids }, status: 'PENDING' },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];
  const toMap = (rows: { _count: { _all: number } }[], key: (r: any) => number | null) =>
    new Map(rows.map((r) => [key(r), r._count._all]));
  const dueMap = toMap(dueGroups, (r) => r.assigneeId);
  const overdueMap = toMap(overdueGroups, (r) => r.assigneeId);
  const approvalMap = toMap(approvalGroups, (r) => r.approverId);

  // Không làm phiền người không có gì cần xử lý
  const targets = employees
    .map((emp) => ({
      emp,
      dueToday: dueMap.get(emp.id) ?? 0,
      overdue: overdueMap.get(emp.id) ?? 0,
      pendingApprovals: approvalMap.get(emp.id) ?? 0,
    }))
    .filter((t) => t.dueToday + t.overdue + t.pendingApprovals > 0);

  await mapLimit(targets, 5, ({ emp, dueToday, overdue, pendingApprovals }) =>
    notify({
      templateCode: 'DAILY_DIGEST',
      employeeIds: [emp.id],
      linkPath: '/dashboard',
      channels: ['ZALO'],
      dedupeKey: `DIGEST:${today.toISOString().slice(0, 10)}`,
      vars: { date: fmtDate(today), dueToday, overdue, pendingApprovals, onLeave: onLeaveToday },
    }),
  );
  const sent = targets.length;

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

/** Ghi dấu heartbeat vào bảng SystemSetting để giữ Supabase Free luôn hoạt động (không bị pause). */
export async function jobKeepAlive(): Promise<JobResult> {
  const now = new Date();
  const key = 'system.keepalive';
  const prev = await prisma.systemSetting.findUnique({ where: { key }, select: { valueJson: true } });
  const prevCount =
    prev?.valueJson && typeof prev.valueJson === 'object' && !Array.isArray(prev.valueJson)
      ? Number((prev.valueJson as Record<string, unknown>).count ?? 0)
      : 0;
  const count = Number.isFinite(prevCount) ? prevCount + 1 : 1;

  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      groupName: 'system',
      isSecret: false,
      valueJson: { lastPingAt: now.toISOString(), count },
    },
    update: {
      valueJson: { lastPingAt: now.toISOString(), count },
    },
  });

  return {
    job: 'keepalive',
    message: `Đã cập nhật heartbeat lúc ${now.toISOString()} (lần #${count})`,
    count,
  };
}

/** Bảo trì dữ liệu đơn bán (cước cũ, tự hoàn tất đơn đã giao và thu đủ). */
export async function jobSalesMaintenance(): Promise<JobResult> {
  const r = await runSalesMaintenance();
  return {
    job: 'sales-maintenance',
    message: `Sửa cước cũ ${r.freightFixed} đơn, tự hoàn tất ${r.completed} đơn`,
    count: r.freightFixed + r.completed,
  };
}

/** Báo giá quá ngày hiệu lực chuyển sang Hết hiệu lực. */
export async function jobQuotationExpiry(): Promise<JobResult> {
  const r = await expireQuotations();
  return { job: 'quotation-expiry', message: `Đã chuyển ${r.expired} báo giá sang hết hiệu lực`, count: r.expired };
}

/** Sinh lần kế tiếp cho công việc định kỳ đã đóng. */
export async function jobRecurringTasks(): Promise<JobResult> {
  const r = await generateRecurringTasks();
  return { job: 'recurring-tasks', message: `Đã tạo ${r.created} công việc định kỳ kế tiếp`, count: r.created };
}

export const JOBS = {
  'task-reminders': jobTaskReminders,
  'overdue-tasks': jobOverdueTasks,
  'approval-sla': jobApprovalSla,
  'daily-digest': jobDailyDigest,
  'attendance-rollup': jobAttendanceRollup,
  outbox: jobProcessOutbox,
  keepalive: jobKeepAlive,
  'sales-maintenance': jobSalesMaintenance,
  'quotation-expiry': jobQuotationExpiry,
  'recurring-tasks': jobRecurringTasks,
} as const;

export type JobName = keyof typeof JOBS;
