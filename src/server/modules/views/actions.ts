'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';
import { SAVED_VIEW_MODULES, type SavedViewDto, type SavedViewModule } from './types';

const moduleSchema = z.enum(SAVED_VIEW_MODULES);

/** Bỏ tham số trang để view luôn mở từ trang 1. */
function cleanQuery(q: string) {
  const p = new URLSearchParams(q.replace(/^\?/, ''));
  p.delete('page');
  return p.toString().slice(0, 2000);
}

export async function listSavedViewsAction(module: SavedViewModule): Promise<SavedViewDto[]> {
  const ctx = await requireAuth();
  if (!moduleSchema.safeParse(module).success) return [];
  const rows = await prisma.savedView.findMany({
    where: { module, OR: [{ userId: ctx.userId }, { isShared: true }] },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 30,
  });
  return rows.map((r) => ({ id: r.id, name: r.name, query: r.query, isShared: r.isShared, isOwn: r.userId === ctx.userId }));
}

export async function saveViewAction(module: SavedViewModule, name: string, query: string, isShared: boolean) {
  const ctx = await requireAuth();
  const parsed = z.object({ module: moduleSchema, name: z.string().trim().min(1, 'Đặt tên cho view').max(80) }).safeParse({ module, name });
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const q = cleanQuery(query);
  if (!q) return { ok: false as const, message: 'Chưa có bộ lọc nào để lưu' };
  const count = await prisma.savedView.count({ where: { module, userId: ctx.userId } });
  if (count >= 20) return { ok: false as const, message: 'Tối đa 20 view cho mỗi màn hình' };
  const view = await prisma.savedView.create({
    data: { userId: ctx.userId, module, name: parsed.data.name, query: q, isShared, sortOrder: count },
  });
  return { ok: true as const, message: `Đã lưu view "${view.name}"`, id: view.id };
}

export async function deleteViewAction(id: number) {
  const ctx = await requireAuth();
  const res = await prisma.savedView.deleteMany({ where: { id, userId: ctx.userId } });
  return res.count ? { ok: true, message: 'Đã xoá view' } : { ok: false, message: 'Chỉ xoá được view do bạn tạo' };
}
