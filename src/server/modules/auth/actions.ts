'use server';

import { sha256 } from '@/lib/crypto';

import { safeRedirectPath } from '@/lib/safe-redirect';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword, checkPasswordStrength } from '@/server/auth/password';
import { createSessionCookie, destroySessionCookie } from '@/server/auth/session';
import { requireAuth } from '@/server/auth/context';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

const loginSchema = z.object({
  username: z.string().min(1, 'Nhập tên đăng nhập'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

export interface ActionState {
  error?: string;
  success?: string;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: String(formData.get('username') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  }

  const { username, password } = parsed.data;
  const input = username.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: input, mode: 'insensitive' } },
        { employee: { code: { equals: input, mode: 'insensitive' } } },
        { employee: { email: { equals: input, mode: 'insensitive' } } },
      ],
    },
    include: { employee: { select: { fullName: true, status: true } } },
  });

  const genericError = 'Tên đăng nhập hoặc mật khẩu không đúng';
  if (!user) return { error: genericError };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Tài khoản đang tạm khóa, thử lại sau ${mins} phút` };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    if (attempts >= MAX_ATTEMPTS) {
      return { error: `Sai quá ${MAX_ATTEMPTS} lần, tài khoản bị khóa ${LOCK_MINUTES} phút` };
    }
    return { error: genericError };
  }

  if (!user.isActive) return { error: 'Tài khoản đã bị vô hiệu hóa' };
  if (user.employee.status === 'RESIGNED') return { error: 'Nhân sự đã nghỉ việc, không thể đăng nhập' };

  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id, entityType: 'User', entityId: String(user.id), action: 'LOGIN',
      ip, userAgent: hdrs.get('user-agent')?.slice(0, 250) ?? null,
    },
  });

  await createSessionCookie({ userId: user.id, username: user.username, credentialVersion: sha256(user.passwordHash) });

  const next = String(formData.get('next') ?? '/dashboard');
  redirect(safeRedirectPath(next));
}

export async function logoutAction() {
  await destroySessionCookie();
  redirect('/login');
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
  newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự'),
  confirmPassword: z.string(),
});

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAuth();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) return { error: 'Xác nhận mật khẩu không khớp' };

  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) return { error: strength.message };

  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user) return { error: 'Không tìm thấy tài khoản' };

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { error: 'Mật khẩu hiện tại không đúng' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  await prisma.auditLog.create({
    data: { actorId: user.id, entityType: 'User', entityId: String(user.id), action: 'CHANGE_PASSWORD' },
  });

  return { success: 'Đã đổi mật khẩu thành công' };
}
