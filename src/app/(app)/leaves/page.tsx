import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { listLeaveRequests, getOrCreateBalance, remainingDays } from '@/server/modules/leave/service';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { LeaveScreen } from './leave-screen';

export const metadata = { title: 'Nghỉ phép' };
export const dynamic = 'force-dynamic';

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : new Date().getFullYear();

  const filter = {
    search: sp.q ?? '',
    status: sp.status ?? '',
    leaveTypeId: sp.type ? Number(sp.type) : null,
    departmentId: sp.dept ? Number(sp.dept) : null,
    onlyMine: sp.mine === '1',
    from: sp.from ?? '',
    to: sp.to ?? '',
    page: sp.page ? Number(sp.page) : 1,
    pageSize: 20,
  };

  const scopeIds = await visibleEmployeeIds(ctx);
  const [data, balance, leaveTypes, tree, employees, teamBalances] = await Promise.all([
    listLeaveRequests(ctx, filter),
    getOrCreateBalance(ctx.employeeId, year),
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    getDepartmentTree(),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, code: true },
    }),
    can(ctx, 'FEATURE_LEAVE_BALANCE_MANAGE')
      ? prisma.leaveBalance.findMany({
          where: { year, ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
          orderBy: { employee: { fullName: 'asc' } },
          include: { employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <LeaveScreen
      initialTab={sp.tab ?? 'requests'}
      data={JSON.parse(JSON.stringify(data))}
      myBalance={{
        year,
        standardDays: Number(balance.standardDays),
        bonusDays: Number(balance.bonusDays),
        carriedOverDays: Number(balance.carriedOverDays),
        usedDays: Number(balance.usedDays),
        pendingDays: Number(balance.pendingDays),
        remaining: remainingDays(balance),
      }}
      teamBalances={JSON.parse(JSON.stringify(teamBalances))}
      leaveTypes={JSON.parse(JSON.stringify(leaveTypes))}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      employees={employees}
      filter={filter}
      year={year}
      currentEmployeeId={ctx.employeeId}
      canRequest={can(ctx, 'FEATURE_LEAVE_REQUEST')}
      canManageBalance={can(ctx, 'FEATURE_LEAVE_BALANCE_MANAGE')}
    />
  );
}
