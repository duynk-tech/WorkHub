import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { dateOnly, isWorkDay } from '@/lib/date';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export async function generateLeaveCode(db: Db = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LR-${year}-`;
  const last = await db.leaveRequest.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const seq = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export interface WorkingDay { date: Date; portion: number }

/**
 * Tính các ngày nghỉ thực tế: bỏ ngày lễ và ngày không thuộc ca làm việc.
 * Nửa ngày chỉ áp dụng khi đơn gói gọn trong một ngày.
 */
export async function calculateLeaveDays(
  employeeId: number,
  startDate: Date,
  endDate: Date,
  durationType: string,
  db: Db = prisma,
): Promise<{ days: WorkingDay[]; totalDays: number; skipped: { date: Date; reason: string }[] }> {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Ngày nghỉ không hợp lệ');
  if (!['FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON'].includes(durationType)) throw new Error('Thời lượng nghỉ không hợp lệ');
  if (durationType !== 'FULL_DAY' && start.getTime() !== end.getTime()) throw new Error('Đơn nghỉ nửa ngày chỉ áp dụng trong một ngày');
  if (end < start) throw new Error('Ngày kết thúc phải sau ngày bắt đầu');

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { workShift: { select: { workDays: true } } },
  });
  const workDays = employee?.workShift?.workDays ?? 62; // mặc định T2–T6

  const holidays = await db.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    select: { date: true, name: true },
  });
  const holidayMap = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name]));

  const days: WorkingDay[] = [];
  const skipped: { date: Date; reason: string }[] = [];

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const current = new Date(d);
    const key = current.toISOString().slice(0, 10);
    // Dùng getUTCDay vì cột @db.Date lưu ở UTC midnight
    const dow = current.getUTCDay();

    if (!isWorkDay(new Date(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()), workDays)) {
      skipped.push({ date: current, reason: dow === 0 ? 'Chủ nhật' : 'Ngày nghỉ theo ca làm việc' });
      continue;
    }
    if (holidayMap.has(key)) {
      skipped.push({ date: current, reason: `Ngày lễ: ${holidayMap.get(key)}` });
      continue;
    }
    days.push({ date: current, portion: 1 });
  }

  const isSingleDay = days.length === 1;
  if (isSingleDay && durationType !== 'FULL_DAY') days[0].portion = 0.5;

  const totalDays = days.reduce((s, d) => s + d.portion, 0);
  return { days, totalDays, skipped };
}

export async function getOrCreateBalance(employeeId: number, year: number, db: Db = prisma) {
  const existing = await db.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year } } });
  if (existing) return existing;

  const setting = await db.systemSetting.findUnique({ where: { key: 'leave.annualDefaultDays' } });
  return db.leaveBalance.create({
    data: { employeeId, year, standardDays: Number(setting?.valueJson ?? 12) },
  });
}

export function remainingDays(balance: { standardDays: unknown; bonusDays: unknown; carriedOverDays: unknown; usedDays: unknown }) {
  return Number(balance.standardDays) + Number(balance.bonusDays) + Number(balance.carriedOverDays) - Number(balance.usedDays);
}

export interface LeaveFilter {
  search?: string;
  status?: string;
  leaveTypeId?: number | null;
  employeeId?: number | null;
  departmentId?: number | null;
  from?: string;
  to?: string;
  onlyMine?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listLeaveRequests(ctx: AuthContext, filter: LeaveFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, filter.pageSize ?? 20);
  const scopeIds = await visibleEmployeeIds(ctx);

  const where: Prisma.LeaveRequestWhereInput = { AND: [] };
  const and = where.AND as Prisma.LeaveRequestWhereInput[];

  if (filter.onlyMine) and.push({ employeeId: ctx.employeeId });
  else if (scopeIds !== null) and.push({ employeeId: { in: scopeIds.length ? scopeIds : [-1] } });

  if (filter.search?.trim()) {
    const q = filter.search.trim();
    and.push({ OR: [{ code: { contains: q, mode: 'insensitive' } }, { reason: { contains: q, mode: 'insensitive' } }, { employee: { fullName: { contains: q, mode: 'insensitive' } } }] });
  }
  if (filter.status) and.push({ status: filter.status as never });
  if (filter.leaveTypeId) and.push({ leaveTypeId: filter.leaveTypeId });
  if (filter.employeeId) and.push({ employeeId: filter.employeeId });
  if (filter.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: filter.departmentId }, select: { path: true } });
    if (dept) {
      const branch = await prisma.department.findMany({ where: { path: { startsWith: dept.path } }, select: { id: true } });
      and.push({ employee: { departmentId: { in: branch.map((d) => d.id) } } });
    }
  }
  if (filter.from) and.push({ endDate: { gte: dateOnly(new Date(filter.from)) } });
  if (filter.to) and.push({ startDate: { lte: dateOnly(new Date(filter.to)) } });

  const [rows, total, statusGroups] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        employee: { select: { id: true, fullName: true, avatarUrl: true, code: true, department: { select: { name: true } } } },
        leaveType: { select: { id: true, name: true, color: true, isPaid: true } },
        handoverTo: { select: { id: true, fullName: true } },
        workflow: {
          select: {
            id: true, status: true, currentStepOrder: true,
            tasks: {
              orderBy: { stepOrder: 'asc' },
              select: { id: true, status: true, stepOrder: true, approver: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
    }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  return {
    rows, total, page, pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
  };
}

export async function getLeaveDetail(ctx: AuthContext, id: number) {
  const scopeIds = await visibleEmployeeIds(ctx);
  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, code: true, avatarUrl: true, email: true, phone: true,
          department: { select: { name: true } }, position: { select: { name: true } },
          manager: { select: { fullName: true } },
        },
      },
      leaveType: true,
      handoverTo: { select: { id: true, fullName: true, avatarUrl: true } },
      days: { orderBy: { date: 'asc' } },
      workflow: {
        include: {
          definition: { select: { name: true, steps: { orderBy: { stepOrder: 'asc' } } } },
          tasks: {
            orderBy: [{ stepOrder: 'asc' }, { id: 'asc' }],
            include: { approver: { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } }, step: true },
          },
          logs: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!request) return null;
  // Người duyệt luôn xem được đơn được giao dù ngoài phạm vi dữ liệu
  const isApprover = request.workflow?.tasks.some((t) => t.approverId === ctx.employeeId) ?? false;
  const inScope = scopeIds === null || scopeIds.includes(request.employeeId) || request.employeeId === ctx.employeeId;
  if (!inScope && !isApprover) return null;

  return request;
}

/** Cộng/trừ quỹ phép — gọi trong transaction khi trạng thái đơn thay đổi. */
export async function adjustBalance(
  db: Db,
  employeeId: number,
  year: number,
  delta: { pending?: number; used?: number },
) {
  const balance = await getOrCreateBalance(employeeId, year, db);
  await db.leaveBalance.update({
    where: { id: balance.id },
    data: {
      pendingDays: Math.max(0, Number(balance.pendingDays) + (delta.pending ?? 0)),
      usedDays: Math.max(0, Number(balance.usedDays) + (delta.used ?? 0)),
    },
  });
}

/** Kiểm tra trùng lịch nghỉ đã duyệt hoặc đang chờ duyệt. */
export async function findOverlapping(employeeId: number, startDate: Date, endDate: Date, excludeId?: number, durationType = 'FULL_DAY', db: Db = prisma) {
  return db.leaveRequest.findFirst({
    where: {
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { in: ['PENDING', 'APPROVED'] },
      ...(durationType === 'FULL_DAY' ? {} : { durationType: { in: ['FULL_DAY', durationType] as never } }),
      startDate: { lte: dateOnly(endDate) },
      endDate: { gte: dateOnly(startDate) },
    },
    select: { id: true, code: true, startDate: true, endDate: true, status: true },
  });
}
