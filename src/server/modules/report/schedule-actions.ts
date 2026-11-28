'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { writeAudit } from '@/server/lib/audit';
import { REPORTS } from './registry';

type Result = { ok: boolean; message: string };

const schema = z.object({
  name: z.string().trim().min(1, 'Đặt tên cho lịch gửi').max(191),
  reportKey: z.string().refine((k) => REPORTS.some((r) => r.key === k), 'Báo cáo không hợp lệ'),
  frequency: z.string().regex(/^(daily|weekly:[1-7]|monthly:([1-9]|[12]\d|3[01]))$/, 'Tần suất không hợp lệ'),
  channel: z.enum(['EMAIL', 'IN_APP']),
  employeeIds: z.array(z.number().int().positive()).min(1, 'Chọn ít nhất một người nhận').max(50),
});

export async function saveReportScheduleAction(raw: unknown): Promise<Result> {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_REPORT_EXPORT')) return { ok: false, message: 'Bạn không có quyền lập lịch gửi báo cáo' };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;
  const def = REPORTS.find((r) => r.key === d.reportKey)!;
  if (def.permission && !can(ctx, def.permission)) return { ok: false, message: 'Bạn không có quyền xem báo cáo này' };

  const row = await prisma.reportSchedule.create({
    data: {
      name: d.name,
      reportKey: d.reportKey,
      cronExpr: d.frequency,
      channel: d.channel,
      recipientsJson: { ownerUserId: ctx.userId, employeeIds: d.employeeIds },
      isActive: true,
    },
  });
  await writeAudit({ actorId: ctx.userId, entityType: 'ReportSchedule', entityId: String(row.id), action: 'CREATE', diff: d });
  revalidatePath('/reports/schedules');
  return { ok: true, message: `Đã tạo lịch gửi "${d.name}"` };
}

async function ownedSchedule(id: number) {
  const ctx = await requireAuth();
  const s = await prisma.reportSchedule.findUnique({ where: { id } });
  const owner = (s?.recipientsJson as { ownerUserId?: number } | null)?.ownerUserId;
  if (!s || (owner !== ctx.userId && !ctx.isAdmin)) return { ctx, s: null };
  return { ctx, s };
}

export async function toggleReportScheduleAction(id: number): Promise<Result> {
  const { s } = await ownedSchedule(id);
  if (!s) return { ok: false, message: 'Chỉ người lập lịch mới đổi được lịch này' };
  await prisma.reportSchedule.update({ where: { id }, data: { isActive: !s.isActive } });
  revalidatePath('/reports/schedules');
  return { ok: true, message: s.isActive ? 'Đã tạm dừng lịch gửi' : 'Đã bật lại lịch gửi' };
}

export async function deleteReportScheduleAction(id: number): Promise<Result> {
  const { ctx, s } = await ownedSchedule(id);
  if (!s) return { ok: false, message: 'Chỉ người lập lịch mới xoá được lịch này' };
  await prisma.reportSchedule.delete({ where: { id } });
  await writeAudit({ actorId: ctx.userId, entityType: 'ReportSchedule', entityId: String(id), action: 'DELETE' });
  revalidatePath('/reports/schedules');
  return { ok: true, message: 'Đã xoá lịch gửi' };
}
