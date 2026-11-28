import type { DataScope } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from './context';

/**
 * Dựng AuthContext (quyền, phạm vi dữ liệu) cho một user theo id.
 * Dùng chung cho phiên đăng nhập (getAuthContext) và việc chạy nền thay mặt người dùng
 * (vd. báo cáo định kỳ chỉ thấy đúng dữ liệu người lập lịch được xem).
 * Không import server-only để job dưới tsx dùng được.
 */
const SCOPE_RANK: Record<DataScope, number> = { ALL: 4, DEPT_TREE: 3, DEPT: 2, CUSTOM: 2, SELF: 1 };

export async function loadUserContext(userId: number): Promise<{ ctx: AuthContext; passwordHash: string; lockedUntil: Date | null } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    passwordHash: user.passwordHash,
    lockedUntil: user.lockedUntil,
    ctx: {
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
    },
  };
}

export function hasPermission(ctx: AuthContext, code: string) {
  return ctx.isAdmin || ctx.permissions.has(code);
}
