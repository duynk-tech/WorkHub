'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';

export interface TaskTemplateDto {
  id: number;
  name: string;
  title: string;
  description: string;
  priority: string;
  estimateHours: number | null;
  checklist: string[];
  tags: string;
  isOwn: boolean;
}

/** Mẫu của mình + mẫu dùng chung, mới dùng gần đây lên trước. */
export async function listTaskTemplatesAction(): Promise<TaskTemplateDto[]> {
  const ctx = await requireAuth();
  const rows = await prisma.taskTemplate.findMany({
    where: { OR: [{ createdById: ctx.userId }, { isShared: true }] },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    description: t.description ?? '',
    priority: t.priority,
    estimateHours: t.estimateHours ? Number(t.estimateHours) : null,
    checklist: Array.isArray(t.checklistJson) ? (t.checklistJson as unknown[]).map(String) : [],
    tags: t.tags ?? '',
    isOwn: t.createdById === ctx.userId,
  }));
}

const templateSchema = z.object({
  name: z.string().trim().min(1, 'Đặt tên cho mẫu').max(120),
  title: z.string().trim().min(1, 'Mẫu cần có tiêu đề công việc').max(255),
  description: z.string().max(20000).optional().default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimateHours: z.number().min(0).max(10000).nullable().optional(),
  checklist: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  tags: z.string().max(255).optional().default(''),
  isShared: z.boolean().default(true),
});

export async function saveTaskTemplateAction(input: z.input<typeof templateSchema>) {
  const ctx = await requireAuth();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;
  await prisma.taskTemplate.create({
    data: {
      name: d.name, title: d.title, description: d.description || null, priority: d.priority,
      estimateHours: d.estimateHours ?? null, checklistJson: d.checklist, tags: d.tags || null,
      isShared: d.isShared, createdById: ctx.userId,
    },
  });
  return { ok: true, message: `Đã lưu mẫu "${d.name}"` };
}

export async function deleteTaskTemplateAction(id: number) {
  const ctx = await requireAuth();
  const res = await prisma.taskTemplate.deleteMany({ where: { id, ...(ctx.isAdmin ? {} : { createdById: ctx.userId }) } });
  return res.count ? { ok: true, message: 'Đã xoá mẫu' } : { ok: false, message: 'Chỉ xoá được mẫu do bạn tạo' };
}
