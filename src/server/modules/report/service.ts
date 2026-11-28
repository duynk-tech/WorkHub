import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getMonthlySheet } from '@/server/modules/attendance/service';
import { dateOnly } from '@/lib/date';

export interface ReportRange { from: Date; to: Date }

export function monthRange(month: string): ReportRange {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
}

/** Báo cáo chấm công tháng: tổng hợp theo nhân sự và theo phòng ban. */
export async function attendanceReport(ctx: AuthContext, month: string) {
  const [y, m] = month.split('-').map(Number);
  const scopeIds = await visibleEmployeeIds(ctx);
  const sheet = await getMonthlySheet(y, m, scopeIds);

  const byDepartment = new Map<string, { department: string; employees: number; workDays: number; lateCount: number; absentCount: number; leaveDays: number; lateMinutes: number }>();
  for (const row of sheet.rows) {
    const key = row.departmentName ?? 'Chưa phân bổ';
    if (!byDepartment.has(key)) {
      byDepartment.set(key, { department: key, employees: 0, workDays: 0, lateCount: 0, absentCount: 0, leaveDays: 0, lateMinutes: 0 });
    }
    const d = byDepartment.get(key)!;
    d.employees++;
    d.workDays += row.summary.present;
    d.lateCount += row.summary.late;
    d.absentCount += row.summary.absent;
    d.leaveDays += row.summary.leave;
    d.lateMinutes += row.summary.totalLateMinutes;
  }

  const employees = sheet.rows.map((r) => ({
    code: r.code, fullName: r.fullName, department: r.departmentName ?? '—',
    workDays: r.summary.present, lateCount: r.summary.late, absentCount: r.summary.absent,
    leaveDays: r.summary.leave, lateMinutes: r.summary.totalLateMinutes,
    workedHours: Number(r.summary.totalWorkedHours.toFixed(1)),
    otHours: Number(r.summary.totalOtHours.toFixed(1)),
  }));

  return {
    month,
    totals: {
      employees: employees.length,
      workDays: employees.reduce((s, e) => s + e.workDays, 0),
      lateCount: employees.reduce((s, e) => s + e.lateCount, 0),
      absentCount: employees.reduce((s, e) => s + e.absentCount, 0),
      leaveDays: employees.reduce((s, e) => s + e.leaveDays, 0),
      workedHours: Number(employees.reduce((s, e) => s + e.workedHours, 0).toFixed(1)),
    },
    employees,
    byDepartment: Array.from(byDepartment.values()).sort((a, b) => b.workDays - a.workDays),
  };
}

export const MAX_REPORT_RANGE_DAYS = 366;

/**
 * Chuẩn hoá khoảng ngày yyyy-mm-dd của báo cáo: ngày sai định dạng thì rơi về
 * đầu năm → hôm nay, đảo ngược thì hoán đổi, dài quá 366 ngày thì cắt bớt đầu.
 * Không chặn thì một yêu cầu "từ 2000" sẽ quét toàn bộ bảng.
 */
export function normalizeReportRange(from?: string | null, to?: string | null, today = new Date()) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const valid = (v?: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
  let f = valid(from) ? from! : `${today.getFullYear()}-01-01`;
  let t = valid(to) ? to! : iso(today);
  if (f > t) [f, t] = [t, f];
  const span = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000;
  if (span > MAX_REPORT_RANGE_DAYS) {
    f = iso(new Date(Date.parse(`${t}T00:00:00Z`) - MAX_REPORT_RANGE_DAYS * 86_400_000));
  }
  return { from: f, to: t, clamped: span > MAX_REPORT_RANGE_DAYS };
}

/** Báo cáo công việc: đúng hạn/trễ hạn, khối lượng theo người và phòng ban. */
export async function taskReport(ctx: AuthContext, rawFrom: string, rawTo: string) {
  const { from, to } = normalizeReportRange(rawFrom, rawTo);
  const scopeIds = await visibleEmployeeIds(ctx);
  const range = { gte: new Date(from), lte: new Date(`${to}T23:59:59`) };
  const where = {
    createdAt: range,
    ...(scopeIds ? { OR: [{ assigneeId: { in: scopeIds } }, { creatorId: { in: scopeIds } }] } : {}),
  };

  // Chỉ lấy đúng các cột dùng để tổng hợp, không kéo mô tả/tag... của từng việc
  const tasks = await prisma.task.findMany({
    where,
    select: {
      status: true, priority: true, dueDate: true, completedAt: true,
      assignee: { select: { fullName: true, code: true, department: { select: { name: true } } } },
      department: { select: { name: true } },
    },
  });

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byAssignee = new Map<string, { name: string; department: string; total: number; done: number; onTime: number; late: number; open: number; overdue: number }>();
  const byDepartment = new Map<string, { department: string; total: number; done: number; overdue: number }>();

  let onTime = 0, lateDone = 0, overdueOpen = 0;

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;

    const isDone = t.status === 'DONE';
    const finishedLate = Boolean(isDone && t.dueDate && t.completedAt && t.completedAt > t.dueDate);
    const isOverdueOpen = Boolean(!isDone && t.status !== 'CANCELLED' && t.dueDate && t.dueDate < new Date());

    if (isDone && !finishedLate) onTime++;
    if (finishedLate) lateDone++;
    if (isOverdueOpen) overdueOpen++;

    const key = t.assignee ? `${t.assignee.code}` : 'unassigned';
    if (!byAssignee.has(key)) {
      byAssignee.set(key, {
        name: t.assignee?.fullName ?? 'Chưa giao',
        department: t.assignee?.department?.name ?? '—',
        total: 0, done: 0, onTime: 0, late: 0, open: 0, overdue: 0,
      });
    }
    const a = byAssignee.get(key)!;
    a.total++;
    if (isDone) a.done++;
    if (isDone && !finishedLate) a.onTime++;
    if (finishedLate) a.late++;
    if (!isDone && t.status !== 'CANCELLED') a.open++;
    if (isOverdueOpen) a.overdue++;

    const dept = t.department?.name ?? 'Chưa phân bổ';
    if (!byDepartment.has(dept)) byDepartment.set(dept, { department: dept, total: 0, done: 0, overdue: 0 });
    const d = byDepartment.get(dept)!;
    d.total++;
    if (isDone) d.done++;
    if (isOverdueOpen) d.overdue++;
  }

  const doneTotal = onTime + lateDone;

  return {
    from, to,
    totals: {
      total: tasks.length,
      done: doneTotal,
      onTime, lateDone, overdueOpen,
      onTimeRate: doneTotal > 0 ? Math.round((onTime / doneTotal) * 100) : 0,
      completionRate: tasks.length > 0 ? Math.round((doneTotal / tasks.length) * 100) : 0,
    },
    byStatus, byPriority,
    byAssignee: Array.from(byAssignee.values()).sort((a, b) => b.total - a.total),
    byDepartment: Array.from(byDepartment.values()).sort((a, b) => b.total - a.total),
  };
}

/** Báo cáo nghỉ phép: theo loại, theo tháng, quỹ phép còn lại. */
export async function leaveReport(ctx: AuthContext, year: number) {
  const scopeIds = await visibleEmployeeIds(ctx);
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [requests, balances] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        startDate: { gte: from, lte: to },
        ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
      },
      include: {
        leaveType: { select: { name: true, color: true } },
        employee: { select: { code: true, fullName: true, department: { select: { name: true } } } },
      },
    }),
    prisma.leaveBalance.findMany({
      where: { year, ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
      include: { employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } },
    }),
  ]);

  const byType = new Map<string, { type: string; color: string; count: number; days: number }>();
  const byMonth: { month: string; days: number; count: number }[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${String(i + 1).padStart(2, '0')}/${year}`, days: 0, count: 0,
  }));
  const byStatus: Record<string, number> = {};

  for (const r of requests) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status !== 'APPROVED') continue;

    const key = r.leaveType.name;
    if (!byType.has(key)) byType.set(key, { type: key, color: r.leaveType.color, count: 0, days: 0 });
    const t = byType.get(key)!;
    t.count++;
    t.days += Number(r.totalDays);

    const monthIdx = r.startDate.getUTCMonth();
    byMonth[monthIdx].days += Number(r.totalDays);
    byMonth[monthIdx].count++;
  }

  return {
    year,
    totals: {
      requests: requests.length,
      approved: byStatus.APPROVED ?? 0,
      pending: byStatus.PENDING ?? 0,
      rejected: byStatus.REJECTED ?? 0,
      totalDays: Array.from(byType.values()).reduce((s, t) => s + t.days, 0),
    },
    byType: Array.from(byType.values()).sort((a, b) => b.days - a.days),
    byMonth,
    byStatus,
    balances: balances
      .map((b) => ({
        code: b.employee.code, fullName: b.employee.fullName,
        department: b.employee.department?.name ?? '—',
        standard: Number(b.standardDays), bonus: Number(b.bonusDays), carried: Number(b.carriedOverDays),
        used: Number(b.usedDays), pending: Number(b.pendingDays),
        remaining: Number(b.standardDays) + Number(b.bonusDays) + Number(b.carriedOverDays) - Number(b.usedDays),
      }))
      .sort((a, b) => b.remaining - a.remaining),
  };
}

/** Tổng quan nhanh cho dashboard quản lý. */
export async function overviewReport(ctx: AuthContext) {
  const scopeIds = await visibleEmployeeIds(ctx);
  const today = dateOnly(new Date());
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [headcount, openTasks, overdueTasks, doneThisMonth, pendingLeaves, onLeaveToday] = await Promise.all([
    prisma.employee.count({ where: { status: 'ACTIVE', ...(scopeIds ? { id: { in: scopeIds } } : {}) } }),
    prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, ...(scopeIds ? { assigneeId: { in: scopeIds } } : {}) } }),
    prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, dueDate: { lt: new Date() }, ...(scopeIds ? { assigneeId: { in: scopeIds } } : {}) } }),
    prisma.task.count({ where: { status: 'DONE', completedAt: { gte: monthStart }, ...(scopeIds ? { assigneeId: { in: scopeIds } } : {}) } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING', ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) } }),
    prisma.leaveRequestDay.count({ where: { date: today, request: { status: 'APPROVED', ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) } } }),
  ]);

  return { headcount, openTasks, overdueTasks, doneThisMonth, pendingLeaves, onLeaveToday };
}
