import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { getDisabledMenuHrefs } from '@/server/modules/settings/menus';
import { PERMISSIONS } from '@/lib/permissions';
import { RoleScreen } from './role-screen';

export const metadata = { title: 'Phân quyền' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const ctx = await requireAuth();
  if (!ctx.isAdmin && !can(ctx, 'MENU_ROLES')) notFound();

  const [roles, tree, disabledMenus, totalUsers] = await Promise.all([
    prisma.role.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        permissions: { select: { permissionCode: true } },
        deptScopes: { select: { departmentId: true } },
        _count: { select: { users: true } },
      },
    }),
    getDepartmentTree(),
    getDisabledMenuHrefs(),
    prisma.user.count(),
  ]);

  return (
    <RoleScreen
      roles={roles.map((r) => ({
        id: r.id, code: r.code, name: r.name, description: r.description,
        dataScope: r.dataScope, isSystem: r.isSystem, sortOrder: r.sortOrder,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permissionCode),
        deptIds: r.deptScopes.map((d) => d.departmentId),
      }))}
      permissions={PERMISSIONS}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      disabledMenus={disabledMenus}
      totalUsers={totalUsers}
      canManage={can(ctx, 'FEATURE_ROLE_MANAGE')}
      canManageMenus={ctx.isAdmin || can(ctx, 'FEATURE_SETTING_GENERAL')}
    />
  );
}
