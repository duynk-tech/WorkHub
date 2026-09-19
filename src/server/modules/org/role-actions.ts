'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/auth/context';

export interface Result { ok: boolean; message: string }

const roleSchema = z.object({
  code: z.string().min(1, 'Nhập mã vai trò').max(64).regex(/^[A-Z0-9_]+$/, 'Mã vai trò chỉ gồm chữ in hoa, số và dấu _'),
  name: z.string().min(1, 'Nhập tên vai trò').max(191),
  description: z.string().nullable().or(z.literal('')),
  dataScope: z.enum(['ALL', 'DEPT_TREE', 'DEPT', 'SELF', 'CUSTOM']),
  sortOrder: z.number().int().default(0),
  permissions: z.array(z.string()),
  deptIds: z.array(z.number().int()).default([]),
});

export async function saveRoleAction(id: number | null, raw: unknown): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ROLE_MANAGE');
  const parsed = roleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  const { code, name, description, dataScope, sortOrder, permissions, deptIds } = parsed.data;

  const duplicate = await prisma.role.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (duplicate) return { ok: false, message: `Mã vai trò "${code}" đã tồn tại` };

  if (id) {
    const current = await prisma.role.findUnique({ where: { id } });
    if (!current) return { ok: false, message: 'Không tìm thấy vai trò' };
    // Vai trò ADMIN phải luôn giữ toàn quyền để tránh tự khóa hệ thống
    if (current.code === 'ADMIN' && (dataScope !== 'ALL' || code !== 'ADMIN')) {
      return { ok: false, message: 'Không thể thu hẹp phạm vi hoặc đổi mã của vai trò quản trị hệ thống' };
    }
  }

  await prisma.$transaction(async (tx) => {
    const role = id
      ? await tx.role.update({ where: { id }, data: { code, name, description: description || null, dataScope, sortOrder } })
      : await tx.role.create({ data: { code, name, description: description || null, dataScope, sortOrder, isSystem: false } });

    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length) {
      await tx.rolePermission.createMany({
        data: permissions.map((permissionCode) => ({ roleId: role.id, permissionCode })),
        skipDuplicates: true,
      });
    }

    await tx.roleDeptScope.deleteMany({ where: { roleId: role.id } });
    if (dataScope === 'CUSTOM' && deptIds.length) {
      await tx.roleDeptScope.createMany({
        data: deptIds.map((departmentId) => ({ roleId: role.id, departmentId })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: ctx.userId, entityType: 'Role', entityId: String(role.id),
        action: id ? 'UPDATE' : 'CREATE',
        diffJson: { code, name, dataScope, permissionCount: permissions.length } as never,
      },
    });
  });

  revalidatePath('/settings/roles');
  return { ok: true, message: id ? 'Đã cập nhật vai trò' : 'Đã tạo vai trò mới' };
}

export async function deleteRoleAction(id: number): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ROLE_MANAGE');
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return { ok: false, message: 'Không tìm thấy vai trò' };
  if (role.isSystem) return { ok: false, message: 'Không thể xóa vai trò hệ thống' };
  if (role._count.users > 0) return { ok: false, message: `Vai trò đang được gán cho ${role._count.users} tài khoản` };

  await prisma.role.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'Role', entityId: String(id), action: 'DELETE' },
  });

  revalidatePath('/settings/roles');
  return { ok: true, message: 'Đã xóa vai trò' };
}
