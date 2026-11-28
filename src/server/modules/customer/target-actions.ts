'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { writeAudit } from '@/server/lib/audit';
import { invalidateDashboard } from '@/server/modules/dashboard/aggregates';

type Result = { ok: boolean; message: string };

const monthSchema = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });
const rowsSchema = z.array(z.object({ employeeId: z.number().int().positive(), amount: z.number().min(0).max(1e13) })).max(500);

function canManageTargets(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  return can(ctx, 'FEATURE_CUSTOMER_MANAGE');
}

/** Lưu cả bảng chỉ tiêu của một tháng; số 0 nghĩa là bỏ chỉ tiêu của người đó. */
export async function saveSalesTargetsAction(year: number, month: number, rows: { employeeId: number; amount: number }[]): Promise<Result> {
  const ctx = await requireAuth();
  if (!canManageTargets(ctx)) return { ok: false, message: 'Bạn không có quyền đặt chỉ tiêu doanh số' };
  const m = monthSchema.safeParse({ year, month });
  const r = rowsSchema.safeParse(rows);
  if (!m.success || !r.success) return { ok: false, message: 'Dữ liệu chỉ tiêu không hợp lệ' };

  await prisma.$transaction(async (tx) => {
    for (const row of r.data) {
      if (row.amount <= 0) {
        await tx.salesTarget.deleteMany({ where: { employeeId: row.employeeId, year, month } });
      } else {
        await tx.salesTarget.upsert({
          where: { employeeId_year_month: { employeeId: row.employeeId, year, month } },
          update: { amount: row.amount },
          create: { employeeId: row.employeeId, year, month, amount: row.amount, createdById: ctx.userId },
        });
      }
    }
  });
  await writeAudit({ actorId: ctx.userId, entityType: 'SalesTarget', entityId: `${year}-${month}`, action: 'SAVE', diff: { rows: r.data.length } });
  invalidateDashboard();
  revalidatePath('/sales/targets');
  return { ok: true, message: `Đã lưu chỉ tiêu tháng ${month}/${year}` };
}

/** Chép chỉ tiêu tháng trước sang tháng đang xem (không ghi đè người đã có). */
export async function copyPreviousTargetsAction(year: number, month: number): Promise<Result> {
  const ctx = await requireAuth();
  if (!canManageTargets(ctx)) return { ok: false, message: 'Bạn không có quyền đặt chỉ tiêu doanh số' };
  if (!monthSchema.safeParse({ year, month }).success) return { ok: false, message: 'Tháng không hợp lệ' };
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const source = await prisma.salesTarget.findMany({ where: prev });
  if (!source.length) return { ok: false, message: `Tháng ${prev.month}/${prev.year} chưa có chỉ tiêu để chép` };
  const res = await prisma.salesTarget.createMany({
    data: source.map((t) => ({ employeeId: t.employeeId, year, month, amount: t.amount, createdById: ctx.userId })),
    skipDuplicates: true,
  });
  invalidateDashboard();
  revalidatePath('/sales/targets');
  return { ok: true, message: `Đã chép ${res.count} chỉ tiêu từ tháng ${prev.month}/${prev.year}` };
}
