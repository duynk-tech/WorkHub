import { Network } from 'lucide-react';
import { requireAuth, can } from '@/server/auth/context';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { prisma } from '@/lib/prisma';
import { DepartmentManager } from './department-manager';

export const metadata = { title: 'Phòng ban' };
export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  const ctx = await requireAuth();
  const tree = await getDepartmentTree();
  const employees = await prisma.employee.findMany({
    where: { status: { not: 'RESIGNED' } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, code: true, departmentId: true },
  });

  const flat = flattenTree(tree);
  const stats = {
    total: flat.length,
    maxLevel: flat.reduce((m, d) => Math.max(m, d.level), 0),
    employees: flat.reduce((s, d) => s + d.employeeCount, 0),
    withoutManager: flat.filter((d) => !d.managerId).length,
  };

  return (
    <DepartmentManager
      tree={tree}
      employees={employees}
      stats={stats}
      canManage={can(ctx, 'FEATURE_DEPARTMENT_MANAGE')}
      icon={<Network size={16} />}
    />
  );
}
