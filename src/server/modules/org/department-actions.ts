'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/auth/context';
import {
  createDepartment, updateDepartment, deleteDepartment, rebuildTreePaths, verifyTreeIntegrity,
} from './department-service';

const schema = z.object({
  code: z.string().min(1, 'Nhập mã phòng ban').max(64),
  name: z.string().min(1, 'Nhập tên phòng ban').max(191),
  parentId: z.number().int().nullable(),
  managerId: z.number().int().nullable(),
  email: z.string().email('Email không hợp lệ').nullable().or(z.literal('')),
  phone: z.string().max(32).nullable().or(z.literal('')),
  costCenter: z.string().max(64).nullable().or(z.literal('')),
  description: z.string().nullable().or(z.literal('')),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type DepartmentFormInput = z.input<typeof schema>;
export interface Result { ok: boolean; message: string }

export async function saveDepartmentAction(id: number | null, raw: DepartmentFormInput): Promise<Result> {
  const ctx = await requirePermission('FEATURE_DEPARTMENT_MANAGE');
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  const input = {
    ...parsed.data,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    costCenter: parsed.data.costCenter || null,
    description: parsed.data.description || null,
  };

  try {
    const result = id ? await updateDepartment(id, input) : await createDepartment(input);
    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId, entityType: 'Department', entityId: String(id ?? (result as { id?: number })?.id ?? ''),
        action: id ? 'UPDATE' : 'CREATE', diffJson: input as never,
      },
    });
    revalidatePath('/departments');
    return { ok: true, message: id ? 'Đã cập nhật phòng ban' : 'Đã tạo phòng ban mới' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu phòng ban thất bại' };
  }
}

export async function deleteDepartmentAction(id: number): Promise<Result> {
  const ctx = await requirePermission('FEATURE_DEPARTMENT_MANAGE');
  try {
    await deleteDepartment(id);
    await prisma.auditLog.create({
      data: { actorId: ctx.userId, entityType: 'Department', entityId: String(id), action: 'DELETE' },
    });
    revalidatePath('/departments');
    return { ok: true, message: 'Đã xóa phòng ban' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa phòng ban thất bại' };
  }
}

export async function repairTreeAction(): Promise<Result> {
  await requirePermission('FEATURE_DEPARTMENT_MANAGE');
  const issues = await verifyTreeIntegrity();
  if (issues.length === 0) return { ok: true, message: 'Cây phòng ban đang nhất quán, không cần sửa' };
  const fixed = await rebuildTreePaths();
  revalidatePath('/departments');
  return { ok: true, message: `Đã phát hiện ${issues.length} sai lệch và dựng lại ${fixed} nút` };
}
