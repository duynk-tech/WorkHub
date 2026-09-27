import type { AttendanceStatus, Prisma, PrismaClient, RecordSource } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dateOnly, isWorkDay, minutesBetweenTimes, timeOnDate } from '@/lib/date';
import { dispatchOutboundWebhook } from '@/server/modules/webhook/dispatcher';

export interface GeoPoint { lat: number; lng: number }

/** Khoảng cách Haversine giữa hai tọa độ, đơn vị mét. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function checkGeofence(point: GeoPoint): Promise<{ ok: boolean; nearest?: string; distance?: number }> {
  const locations = await prisma.officeLocation.findMany({ where: { isActive: true } });
  if (locations.length === 0) return { ok: true };

  let best: { name: string; distance: number; radius: number } | null = null;
  for (const loc of locations) {
    const d = distanceMeters(point, { lat: Number(loc.latitude), lng: Number(loc.longitude) });
    if (!best || d < best.distance) best = { name: loc.name, distance: d, radius: loc.radiusMeters };
  }
  if (!best) return { ok: true };
  return { ok: best.distance <= best.radius, nearest: best.name, distance: best.distance };
}

export interface ShiftInfo {
  id: number | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateToleranceMin: number;
  workDays: number;
}

export async function resolveShift(employeeId: number): Promise<ShiftInfo> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { workShift: true },
  });
  const s = employee?.workShift;
  return s
    ? { id: s.id, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, lateToleranceMin: s.lateToleranceMin, workDays: s.workDays }
    : { id: null, startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 62 };
}

/** Tính các chỉ số công của một bản ghi dựa trên ca làm việc. */
export function computeMetrics(params: {
  workDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  shift: ShiftInfo;
  isHoliday?: boolean;
  isOnLeave?: boolean;
  leavePortion?: number;
  leaveDuration?: string;
}): { lateMinutes: number; earlyLeaveMinutes: number; workedMinutes: number; otMinutes: number; status: AttendanceStatus } {
  const { workDate, checkInAt, checkOutAt, shift, isHoliday, isOnLeave, leavePortion, leaveDuration } = params;

  const actualMinutes = checkInAt && checkOutAt ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000) - shift.breakMinutes) : 0;
  if (isHoliday) return { lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: actualMinutes, otMinutes: 0, status: 'HOLIDAY' };
  if (isOnLeave && (leavePortion ?? 1) >= 1) {
    return { lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0, status: 'LEAVE' };
  }
  if (!isWorkDay(workDate, shift.workDays)) {
    return { lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: actualMinutes, otMinutes: 0, status: 'WEEKEND' };
  }
  if (!checkInAt) return { lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0, status: 'ABSENT' };

  let shiftStart = timeOnDate(workDate, shift.startTime);
  let shiftEnd = timeOnDate(workDate, shift.endTime);
  if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);
  let standardMinutes = minutesBetweenTimes(shift.startTime, shift.endTime) - shift.breakMinutes;
  let breakMinutes = shift.breakMinutes;
  if (isOnLeave && leavePortion === 0.5 && ['HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON'].includes(leaveDuration || '')) {
    standardMinutes /= 2;
    if (leaveDuration === 'HALF_DAY_MORNING') shiftStart = new Date(shiftEnd.getTime() - standardMinutes * 60000);
    else shiftEnd = new Date(shiftStart.getTime() + standardMinutes * 60000);
    breakMinutes = 0;
  }

  const lateRaw = Math.round((checkInAt.getTime() - shiftStart.getTime()) / 60000);
  const lateMinutes = lateRaw > shift.lateToleranceMin ? lateRaw : 0;

  if (!checkOutAt) {
    return {
      lateMinutes, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0,
      status: 'MISSING_CHECKOUT',
    };
  }

  const earlyRaw = Math.round((shiftEnd.getTime() - checkOutAt.getTime()) / 60000);
  const earlyLeaveMinutes = earlyRaw > 0 ? earlyRaw : 0;
  const otMinutes = earlyRaw < -15 ? Math.abs(earlyRaw) : 0;

  const grossMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  let status: AttendanceStatus = 'PRESENT';
  if (isOnLeave && (leavePortion ?? 1) < 1) status = 'HALF_DAY';
  else if (lateMinutes > 0 && earlyLeaveMinutes > 0) status = 'LATE';
  else if (lateMinutes > 0) status = 'LATE';
  else if (earlyLeaveMinutes > 0) status = 'EARLY_LEAVE';
  else if (workedMinutes < standardMinutes / 2) status = 'HALF_DAY';

  return { lateMinutes, earlyLeaveMinutes, workedMinutes, otMinutes, status };
}

export function attendanceWorkDate(at: Date, shift: ShiftInfo) {
  const day = dateOnly(at);
  const [endHour, endMinute] = shift.endTime.split(':').map(Number);
  if (shift.endTime <= shift.startTime && at.getHours() * 60 + at.getMinutes() < endHour * 60 + endMinute) day.setUTCDate(day.getUTCDate() - 1);
  return day;
}
export async function getTodayRecord(employeeId: number, at = new Date()) {
  const shift = await resolveShift(employeeId);
  const workDate = attendanceWorkDate(at, shift);
  const record = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate } } });
  if (!record?.checkInAt && shift.endTime <= shift.startTime) {
    const previous = dateOnly(at); previous.setUTCDate(previous.getUTCDate() - 1);
    const overnight = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: previous } } });
    if (overnight?.checkInAt && !overnight.checkOutAt) return overnight;
  }
  return record;
}

export interface CheckPayload {
  employeeId: number;
  source: RecordSource;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  deviceInfo?: string | null;
  note?: string | null;
  at?: Date;
}

export async function performCheckIn(payload: CheckPayload) {
  const now = payload.at ?? new Date();
  const shift = await resolveShift(payload.employeeId);
  const workDate = attendanceWorkDate(now, shift);

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_workDate: { employeeId: payload.employeeId, workDate } },
  });
  if (existing?.checkInAt) {
    return { ok: false as const, message: 'Bạn đã check-in hôm nay rồi', record: existing };
  }

  const holiday = await prisma.holiday.findUnique({ where: { date: workDate } });
  const metrics = computeMetrics({
    workDate, checkInAt: now, checkOutAt: null, shift, isHoliday: Boolean(holiday),
  });

  const data = {
    employeeId: payload.employeeId,
    workDate,
    shiftId: shift.id,
    checkInAt: now,
    source: payload.source,
    checkInLat: payload.lat ?? null,
    checkInLng: payload.lng ?? null,
    checkInAddress: payload.address ?? null,
    deviceInfo: payload.deviceInfo?.slice(0, 250) ?? null,
    note: payload.note ?? null,
    lateMinutes: metrics.lateMinutes,
    status: metrics.status,
  };

  const record = existing
    ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
    : await prisma.attendanceRecord.create({ data });

  dispatchOutboundWebhook('attendance.checkin', {
    id: record.id,
    employeeId: payload.employeeId,
    workDate: workDate.toISOString(),
    checkInAt: now.toISOString(),
    source: payload.source,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    address: payload.address ?? null,
    lateMinutes: metrics.lateMinutes,
    status: metrics.status,
  }).catch((err) => console.error('[Webhook attendance.checkin Error]:', err));

  return { ok: true as const, record, lateMinutes: metrics.lateMinutes };
}

export async function performCheckOut(payload: CheckPayload) {
  const now = payload.at ?? new Date();
  const existing = await getTodayRecord(payload.employeeId, now);
  if (!existing?.checkInAt) {
    return { ok: false as const, message: 'Chưa có dữ liệu check-in cho hôm nay' };
  }
  if (existing.checkOutAt) {
    return { ok: false as const, message: 'Bạn đã check-out hôm nay rồi', record: existing };
  }

  const workDate = existing.workDate;
  const shift = await resolveShift(payload.employeeId);
  const holiday = await prisma.holiday.findUnique({ where: { date: workDate } });
  const metrics = computeMetrics({
    workDate, checkInAt: existing.checkInAt, checkOutAt: now, shift, isHoliday: Boolean(holiday),
  });

  const record = await prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: {
      checkOutAt: now,
      checkOutLat: payload.lat ?? null,
      checkOutLng: payload.lng ?? null,
      ...metrics,
    },
  });

  return { ok: true as const, record, workedMinutes: metrics.workedMinutes };
}

/**
 * Chốt công một ngày: tạo bản ghi còn thiếu, đánh dấu nghỉ phép/ngày lễ/vắng.
 * Chạy bởi job hằng đêm hoặc gọi lại thủ công từ màn hình chấm công.
 */
export async function rollupDay(date: Date, db: PrismaClient | Prisma.TransactionClient = prisma, employeeIds?: number[]) {
  const workDate = dateOnly(date);
  const employees = await db.employee.findMany({
    where: {
      ...(employeeIds ? { id: { in: employeeIds } } : { status: { in: ['ACTIVE', 'ON_LEAVE'] as never } }),
      AND: [{ OR: [{ joinDate: null }, { joinDate: { lte: workDate } }] }, { OR: [{ leaveDate: null }, { leaveDate: { gte: workDate } }] }],
    },
    select: { id: true, workShift: true },
  });
  const holiday = await db.holiday.findUnique({ where: { date: workDate } });
  const leaveDays = await db.leaveRequestDay.findMany({
    where: { date: workDate, request: { status: 'APPROVED' } },
    select: { portion: true, request: { select: { employeeId: true, durationType: true } } },
  });
  const leaveMap = new Map<number, { portion: number; duration: string }>();
  for (const day of leaveDays) {
    const previous = leaveMap.get(day.request.employeeId);
    leaveMap.set(day.request.employeeId, { portion: Math.min(1, (previous?.portion || 0) + Number(day.portion)), duration: day.request.durationType });
  }

  let created = 0;
  let updated = 0;

  for (const emp of employees) {
    const shift: ShiftInfo = emp.workShift
      ? {
          id: emp.workShift.id, startTime: emp.workShift.startTime, endTime: emp.workShift.endTime,
          breakMinutes: emp.workShift.breakMinutes, lateToleranceMin: emp.workShift.lateToleranceMin,
          workDays: emp.workShift.workDays,
        }
      : { id: null, startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 62 };

    const existing = await db.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate } },
    });

    const leave = leaveMap.get(emp.id);
    const leavePortion = leave?.portion;
    const metrics = computeMetrics({
      workDate: date,
      checkInAt: existing?.checkInAt ?? null,
      checkOutAt: existing?.checkOutAt ?? null,
      shift,
      isHoliday: Boolean(holiday),
      isOnLeave: leavePortion !== undefined,
      leavePortion,
      leaveDuration: leave?.duration,
    });

    if (existing) {
      // Không ghi đè bản ghi đã được HR chỉnh tay
      if (existing.editedById) continue;
      await db.attendanceRecord.update({ where: { id: existing.id }, data: metrics });
      updated++;
    } else {
      await db.attendanceRecord.create({
        data: { employeeId: emp.id, workDate, shiftId: shift.id, source: 'SYSTEM', ...metrics },
      });
      created++;
    }
  }

  return { created, updated, date: workDate };
}

export interface MonthlyCell {
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  workedMinutes: number;
  otMinutes: number;
  recordId: number | null;
}

export interface MonthlyRow {
  employeeId: number;
  fullName: string;
  code: string;
  departmentName: string | null;
  cells: Record<string, MonthlyCell>;
  summary: {
    present: number; late: number; absent: number; leave: number;
    totalLateMinutes: number; totalWorkedHours: number; totalOtHours: number;
  };
}

/** Bảng công tháng: nhân sự × ngày. Dùng cho màn hình chấm công và báo cáo. */
export async function getMonthlySheet(
  year: number,
  month: number,
  employeeIds: number[] | null,
): Promise<{ rows: MonthlyRow[]; days: string[]; holidays: Record<string, string> }> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const [employees, records, holidays] = await Promise.all([
    prisma.employee.findMany({
      where: {
        status: { not: 'RESIGNED' },
        ...(employeeIds ? { id: { in: employeeIds.length ? employeeIds : [-1] } } : {}),
      },
      orderBy: [{ department: { path: 'asc' } }, { fullName: 'asc' }],
      select: { id: true, fullName: true, code: true, department: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        workDate: { gte: start, lte: end },
        ...(employeeIds ? { employeeId: { in: employeeIds.length ? employeeIds : [-1] } } : {}),
      },
    }),
    prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);

  const days: string[] = [];
  for (let d = 1; d <= end.getUTCDate(); d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10));
  }

  const byEmployee = new Map<number, MonthlyRow>();
  for (const e of employees) {
    byEmployee.set(e.id, {
      employeeId: e.id, fullName: e.fullName, code: e.code,
      departmentName: e.department?.name ?? null,
      cells: {},
      summary: { present: 0, late: 0, absent: 0, leave: 0, totalLateMinutes: 0, totalWorkedHours: 0, totalOtHours: 0 },
    });
  }

  for (const r of records) {
    const row = byEmployee.get(r.employeeId);
    if (!row) continue;
    const key = r.workDate.toISOString().slice(0, 10);
    row.cells[key] = {
      date: key, status: r.status,
      checkInAt: r.checkInAt?.toISOString() ?? null,
      checkOutAt: r.checkOutAt?.toISOString() ?? null,
      lateMinutes: r.lateMinutes, workedMinutes: r.workedMinutes, otMinutes: r.otMinutes,
      recordId: r.id,
    };

    if (['PRESENT', 'LATE', 'EARLY_LEAVE', 'WFH', 'HALF_DAY', 'MISSING_CHECKOUT'].includes(r.status)) row.summary.present++;
    if (r.status === 'LATE') row.summary.late++;
    if (r.status === 'ABSENT') row.summary.absent++;
    if (['LEAVE', 'HALF_DAY'].includes(r.status)) row.summary.leave++;
    row.summary.totalLateMinutes += r.lateMinutes;
    row.summary.totalWorkedHours += r.workedMinutes / 60;
    row.summary.totalOtHours += r.otMinutes / 60;
  }

  return {
    rows: Array.from(byEmployee.values()),
    days,
    holidays: Object.fromEntries(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name])),
  };
}

export interface ImportRow {
  employeeCode: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
}

export interface ImportResult {
  batchId: number;
  ok: number;
  failed: number;
  errors: { row: number; message: string }[];
}

/** Nhập dữ liệu từ máy chấm công. Bản ghi đã được HR sửa tay sẽ không bị ghi đè. */
export async function importAttendance(rows: ImportRow[], fileName: string, importedById: number): Promise<ImportResult> {
  const errors: { row: number; message: string }[] = [];
  let ok = 0;

  const batch = await prisma.attendanceImportBatch.create({
    data: { fileName, importedById, rowCount: rows.length },
  });

  const employees = await prisma.employee.findMany({ select: { id: true, code: true, workShift: true } });
  const byCode = new Map(employees.map((e) => [e.code.toUpperCase(), e]));
  const holidays = await prisma.holiday.findMany({ select: { date: true } });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  for (const [index, row] of rows.entries()) {
    const employee = byCode.get(row.employeeCode?.trim().toUpperCase() ?? '');
    if (!employee) {
      errors.push({ row: index + 1, message: `Không tìm thấy nhân sự có mã "${row.employeeCode}"` });
      continue;
    }

    const parsedDate = new Date(row.date);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push({ row: index + 1, message: `Ngày không hợp lệ: "${row.date}"` });
      continue;
    }
    const workDate = dateOnly(parsedDate);

    const toDateTime = (time?: string) => {
      if (!time?.trim()) return null;
      const [h, m] = time.trim().split(':').map(Number);
      if (Number.isNaN(h)) return null;
      const d = new Date(workDate);
      d.setHours(h, m || 0, 0, 0);
      return d;
    };

    const checkInAt = toDateTime(row.checkIn);
    const checkOutAt = toDateTime(row.checkOut);

    const shift: ShiftInfo = employee.workShift
      ? {
          id: employee.workShift.id, startTime: employee.workShift.startTime, endTime: employee.workShift.endTime,
          breakMinutes: employee.workShift.breakMinutes, lateToleranceMin: employee.workShift.lateToleranceMin,
          workDays: employee.workShift.workDays,
        }
      : { id: null, startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 62 };

    const metrics = computeMetrics({
      workDate: parsedDate, checkInAt, checkOutAt, shift,
      isHoliday: holidaySet.has(workDate.toISOString().slice(0, 10)),
    });

    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
    });

    if (existing?.editedById) {
      errors.push({ row: index + 1, message: `Bỏ qua ${row.employeeCode} ngày ${row.date}: bản ghi đã được HR chỉnh tay` });
      continue;
    }

    await prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      update: { checkInAt, checkOutAt, source: 'IMPORT', shiftId: shift.id, importBatchId: batch.id, ...metrics },
      create: { employeeId: employee.id, workDate, checkInAt, checkOutAt, source: 'IMPORT', shiftId: shift.id, importBatchId: batch.id, ...metrics },
    });
    ok++;
  }

  await prisma.attendanceImportBatch.update({
    where: { id: batch.id },
    data: { okCount: ok, errorCount: errors.length, logJson: errors as never },
  });

  return { batchId: batch.id, ok, failed: errors.length, errors };
}
