'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission, can } from '@/server/auth/context';
import { canTouchEmployee } from '@/server/auth/scope';
import { getSetting } from '@/server/modules/settings/service';
import { performCheckIn, performCheckOut, checkGeofence, rollupDay } from './service';
import { dateOnly } from '@/lib/date';
import { writeAudit } from '@/server/lib/audit';

export interface CheckResult { ok: boolean; message: string }

export async function checkInAction(lat?: number, lng?: number, address?: string): Promise<CheckResult> {
  const ctx = await requirePermission('FEATURE_ATTENDANCE_CHECKIN');
  const hdrs = await headers();

  const requireGeo = await getSetting<boolean>('attendance.requireGeofence', false);
  if (requireGeo) {
    if (lat == null || lng == null) {
      return { ok: false, message: 'Cần bật định vị để check-in' };
    }
    const geo = await checkGeofence({ lat, lng });
    if (!geo.ok) {
      return { ok: false, message: `Bạn đang ở ngoài khu vực cho phép (cách ${geo.nearest} khoảng ${geo.distance}m)` };
    }
  }

  const result = await performCheckIn({
    employeeId: ctx.employeeId,
    source: 'WEB',
    lat, lng, address,
    deviceInfo: hdrs.get('user-agent'),
  });

  revalidatePath('/dashboard');
  revalidatePath('/attendance');

  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    message: result.lateMinutes > 0 ? `Đã check-in (muộn ${result.lateMinutes} phút)` : 'Đã check-in thành công',
  };
}

export async function checkOutAction(lat?: number, lng?: number): Promise<CheckResult> {
  const ctx = await requirePermission('FEATURE_ATTENDANCE_CHECKIN');
  const result = await performCheckOut({ employeeId: ctx.employeeId, source: 'WEB', lat, lng });

  revalidatePath('/dashboard');
  revalidatePath('/attendance');

  if (!result.ok) return { ok: false, message: result.message };
  const h = Math.floor((result.workedMinutes ?? 0) / 60);
  const m = (result.workedMinutes ?? 0) % 60;
  return { ok: true, message: `Đã check-out — làm việc ${h} giờ ${m} phút` };
}

export interface AdjustPayload {
  recordId: number;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status?: string;
  note?: string;
}

export async function adjustAttendanceAction(payload: AdjustPayload): Promise<CheckResult> {
  const ctx = await requirePermission('FEATURE_ATTENDANCE_EDIT');
  const record = await prisma.attendanceRecord.findUnique({ where: { id: payload.recordId } });
  if (!record) return { ok: false, message: 'Không tìm thấy bản ghi chấm công' };

  if (!(await canTouchEmployee(ctx, record.employeeId))) {
    return { ok: false, message: 'Bản ghi nằm ngoài phạm vi dữ liệu của bạn' };
  }

  const checkInAt = payload.checkInAt ? new Date(payload.checkInAt) : record.checkInAt;
  const checkOutAt = payload.checkOutAt ? new Date(payload.checkOutAt) : record.checkOutAt;

  await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      checkInAt, checkOutAt,
      status: (payload.status as never) ?? record.status,
      note: payload.note ?? record.note,
      source: 'WEB',
      editedById: ctx.employeeId,
      editedAt: new Date(),
    },
  });

  await writeAudit({
      actorId: ctx.userId, entityType: 'AttendanceRecord', entityId: String(record.id), action: 'ADJUST',
      diff: { before: { checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, status: record.status }, after: payload } as never,
    });

  revalidatePath('/attendance');
  return { ok: true, message: 'Đã cập nhật dữ liệu chấm công' };
}

export async function rollupDayAction(dateStr: string): Promise<CheckResult> {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_ATTENDANCE_EDIT')) {
    return { ok: false, message: 'Bạn không có quyền chốt công' };
  }
  const result = await rollupDay(dateOnly(new Date(dateStr)));
  revalidatePath('/attendance');
  return { ok: true, message: `Đã chốt công: tạo mới ${result.created}, cập nhật ${result.updated} bản ghi` };
}

export interface ImportPayload {
  fileName: string;
  rows: { employeeCode: string; date: string; checkIn?: string; checkOut?: string }[];
}

export async function importAttendanceAction(payload: ImportPayload) {
  const ctx = await requirePermission('FEATURE_ATTENDANCE_IMPORT');
  if (!payload.rows.length) return { ok: false as const, message: 'Tệp không có dòng dữ liệu nào' };
  if (payload.rows.length > 5000) return { ok: false as const, message: 'Tối đa 5000 dòng mỗi lần import' };

  const { importAttendance } = await import('./service');
  const result = await importAttendance(payload.rows, payload.fileName, ctx.employeeId);

  await writeAudit({
      actorId: ctx.userId, entityType: 'AttendanceImportBatch', entityId: String(result.batchId),
      action: 'IMPORT', diff: { fileName: payload.fileName, ok: result.ok, failed: result.failed } as never,
    });

  revalidatePath('/attendance');
  return {
    ok: true as const,
    message: `Đã nhập ${result.ok} dòng${result.failed ? `, bỏ qua ${result.failed} dòng lỗi` : ''}`,
    result,
  };
}
