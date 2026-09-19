import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { listEmployees } from '@/server/modules/org/employee-service';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { EmployeeScreen } from './employee-screen';

export const metadata = { title: 'Nhân sự' };
export const dynamic = 'force-dynamic';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string; page?: string; sub?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;

  const filter = {
    search: sp.q ?? '',
    departmentId: sp.dept ? Number(sp.dept) : null,
    includeSubDepts: sp.sub !== '0',
    status: sp.status ?? '',
    page: sp.page ? Number(sp.page) : 1,
    pageSize: 20,
  };

  const [data, tree, positions, shifts, roles, allEmployees] = await Promise.all([
    listEmployees(ctx, filter),
    getDepartmentTree(),
    prisma.position.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.workShift.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, name: true } }),
    prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true } }),
    prisma.employee.findMany({
      where: { status: { not: 'RESIGNED' } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, code: true },
    }),
  ]);

  return (
    <EmployeeScreen
      data={JSON.parse(JSON.stringify(data))}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level, code: d.code }))}
      positions={positions.map((p) => ({ id: p.id, name: p.name }))}
      shifts={shifts}
      roles={roles}
      allEmployees={allEmployees}
      filter={filter}
      canManage={can(ctx, 'FEATURE_EMPLOYEE_MANAGE')}
      canManageAccount={can(ctx, 'FEATURE_ACCOUNT_MANAGE')}
    />
  );
}
