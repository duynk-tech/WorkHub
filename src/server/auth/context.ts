import 'server-only';
import { sha256 } from '@/lib/crypto';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { DataScope } from '@prisma/client';
import { loadUserContext } from './user-context';
import { readSessionCookie } from './session';

export interface AuthContext {
  userId: number;
  username: string;
  employeeId: number;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentPath: string | null;
  positionName: string | null;
  managerId: number | null;
  zaloLinked: boolean;
  roleCodes: string[];
  roleNames: string[];
  permissions: Set<string>;
  /** Phạm vi dữ liệu rộng nhất trong các vai trò được gán */
  dataScope: DataScope;
  /** Phòng ban bổ sung khi dataScope = CUSTOM */
  customDeptIds: number[];
  isAdmin: boolean;
}

/** Đọc context của người đăng nhập. cache() → mỗi request chỉ truy vấn DB một lần. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSessionCookie();
  if (!session) return null;

  const loaded = await loadUserContext(session.userId);
  if (!loaded) return null;
  if (session.credentialVersion !== sha256(loaded.passwordHash)) return null;
  if (loaded.lockedUntil && loaded.lockedUntil > new Date()) return null;
  return loaded.ctx;
});

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export function can(ctx: AuthContext | null, code: string): boolean {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  return ctx.permissions.has(code);
}

export function canAny(ctx: AuthContext | null, codes: string[]): boolean {
  return codes.some((c) => can(ctx, c));
}

/** Dùng trong Server Component / Server Action — ném lỗi nếu thiếu quyền. */
export async function requirePermission(code: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!can(ctx, code)) {
    throw new Error(`Bạn không có quyền thực hiện thao tác này (${code})`);
  }
  return ctx;
}
