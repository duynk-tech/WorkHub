import 'server-only';
import { sha256 } from '@/lib/crypto';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { DataScope } from '@prisma/client';
import { prisma } from '@/lib/prisma';
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

const SCOPE_RANK: Record<DataScope, number> = {
  ALL: 4,
  DEPT_TREE: 3,
  DEPT: 2,
  CUSTOM: 2,
  SELF: 1,
};

/** Đọc context của người đăng nhập. cache() → mỗi request chỉ truy vấn DB một lần. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSessionCookie();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      employee: {
        include: {
          department: { select: { id: true, name: true, path: true } },
          position: { select: { name: true } },
        },
      },
      roles: {
        include: {
          role: {
            include: {
              permissions: { select: { permissionCode: true } },
              deptScopes: { select: { departmentId: true } },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive || user.employee.status === 'RESIGNED') return null;
  if (session.credentialVersion !== sha256(user.passwordHash)) return null;
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;

  const permissions = new Set<string>();
  const customDeptIds = new Set<number>();
  let dataScope: DataScope = 'SELF';

  for (const { role } of user.roles) {
    role.permissions.forEach((p) => permissions.add(p.permissionCode));
    role.deptScopes.forEach((d) => customDeptIds.add(d.departmentId));
    if (SCOPE_RANK[role.dataScope] > SCOPE_RANK[dataScope]) dataScope = role.dataScope;
  }

  const roleCodes = user.roles.map((r) => r.role.code);

  return {
    userId: user.id,
    username: user.username,
    employeeId: user.employeeId,
    fullName: user.employee.fullName,
    email: user.employee.email,
    avatarUrl: user.employee.avatarUrl,
    departmentId: user.employee.departmentId,
    departmentName: user.employee.department?.name ?? null,
    departmentPath: user.employee.department?.path ?? null,
    positionName: user.employee.position?.name ?? null,
    managerId: user.employee.managerId,
    zaloLinked: Boolean(user.employee.zaloUserId),
    roleCodes,
    roleNames: user.roles.map((r) => r.role.name),
    permissions,
    dataScope,
    customDeptIds: Array.from(customDeptIds),
    isAdmin: roleCodes.includes('ADMIN'),
  };
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
