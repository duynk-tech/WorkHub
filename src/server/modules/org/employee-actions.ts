'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/auth/context';
import { canTouchEmployee } from '@/server/auth/scope';
import { hashPassword, checkPasswordStrength } from '@/server/auth/password';
import { createEmployee, updateEmployee, type EmployeeInput } from './employee-service';

export interface Result { ok: boolean; message: string }

const schema = z.object({
  code: z.string().min(1, 'Nhập mã nhân sự').max(64),
  fullName: z.string().min(1, 'Nhập họ tên').max(191),
  email: z.string().email('Email không hợp lệ').or(z.literal('')).nullable(),
  phone: z.string().max(32).or(z.literal('')).nullable(),
  departmentId: z.number().int().nullable(),
  positionId: z.number().int().nullable(),
  managerId: z.number().int().nullable(),
  workShiftId: z.number().int().nullable(),
  employmentType: z.string(),
  status: z.string(),
  gender: z.string().nullable().or(z.literal('')),
  dateOfBirth: z.string().nullable().or(z.literal('')),
  joinDate: z.string().nullable().or(z.literal('')),
  note: z.string().nullable().or(z.literal('')),
});

export async function saveEmployeeAction(id: number | null, raw: unknown): Promise<Result> {
  const ctx = await requirePermission('FEATURE_EMPLOYEE_MANAGE');
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  if (id && !(await canTouchEmployee(ctx, id))) {
    return { ok: false, message: 'Nhân sự nằm ngoài phạm vi dữ liệu của bạn' };
  }

  try {
    const input = parsed.data as EmployeeInput;
    const result = id ? await updateEmployee(id, input) : await createEmployee(input);
    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId, entityType: 'Employee', entityId: String(result.id),
        action: id ? 'UPDATE' : 'CREATE', diffJson: input as never,
      },
    });
    revalidatePath('/employees');
    revalidatePath('/departments');
    return { ok: true, message: id ? 'Đã cập nhật hồ sơ nhân sự' : 'Đã thêm nhân sự mới' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu nhân sự thất bại' };
  }
}

const accountSchema = z.object({
  employeeId: z.number().int(),
  username: z.string().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ, số và . _ -'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  roleIds: z.array(z.number().int()).min(1, 'Chọn ít nhất một vai trò'),
  mustChangePassword: z.boolean().default(true),
});

export async function createAccountAction(raw: unknown): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ACCOUNT_MANAGE');
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  const { employeeId, username, password, roleIds, mustChangePassword } = parsed.data;
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { ok: false, message: strength.message! };

  const [existingUser, existingEmployeeUser] = await Promise.all([
    prisma.user.findUnique({ where: { username } }),
    prisma.user.findUnique({ where: { employeeId } }),
  ]);
  if (existingUser) return { ok: false, message: `Tên đăng nhập "${username}" đã tồn tại` };
  if (existingEmployeeUser) return { ok: false, message: 'Nhân sự này đã có tài khoản' };

  const user = await prisma.user.create({
    data: {
      employeeId, username, passwordHash: await hashPassword(password), mustChangePassword,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
  });

  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'User', entityId: String(user.id), action: 'CREATE_ACCOUNT', diffJson: { username, roleIds } as never },
  });

  revalidatePath('/employees');
  revalidatePath('/settings/accounts');
  return { ok: true, message: `Đã tạo tài khoản "${username}"` };
}

export async function updateAccountRolesAction(userId: number, roleIds: number[]): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ACCOUNT_MANAGE');
  if (roleIds.length === 0) return { ok: false, message: 'Tài khoản phải có ít nhất một vai trò' };

  // Không cho phép tự gỡ vai trò ADMIN của chính mình
  if (userId === ctx.userId) {
    const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
    if (adminRole && ctx.isAdmin && !roleIds.includes(adminRole.id)) {
      return { ok: false, message: 'Không thể tự gỡ vai trò quản trị của chính bạn' };
    }
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) }),
  ]);

  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'User', entityId: String(userId), action: 'UPDATE_ROLES', diffJson: { roleIds } as never },
  });

  revalidatePath('/settings/accounts');
  return { ok: true, message: 'Đã cập nhật vai trò' };
}

export async function toggleAccountActiveAction(userId: number, isActive: boolean): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ACCOUNT_MANAGE');
  if (userId === ctx.userId && !isActive) return { ok: false, message: 'Không thể tự vô hiệu hóa tài khoản của bạn' };

  await prisma.user.update({ where: { id: userId }, data: { isActive, failedAttempts: 0, lockedUntil: null } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'User', entityId: String(userId), action: isActive ? 'ENABLE' : 'DISABLE' },
  });

  revalidatePath('/settings/accounts');
  return { ok: true, message: isActive ? 'Đã kích hoạt tài khoản' : 'Đã vô hiệu hóa tài khoản' };
}

export async function resetPasswordAction(userId: number, newPassword: string): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ACCOUNT_RESET_PASSWORD');
  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) return { ok: false, message: strength.message! };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
  });

  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'User', entityId: String(userId), action: 'RESET_PASSWORD' },
  });

  revalidatePath('/settings/accounts');
  return { ok: true, message: 'Đã đặt lại mật khẩu, người dùng phải đổi ở lần đăng nhập tới' };
}
