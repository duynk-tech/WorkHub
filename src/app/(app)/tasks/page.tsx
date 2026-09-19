import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { listTasks, listTasksBoard } from '@/server/modules/task/service';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { TaskScreen } from './task-screen';

export const metadata = { title: 'Công việc' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;
  const view = sp.view === 'board' ? 'board' : 'list';

  const filter = {
    search: sp.q ?? '',
    status: sp.status ? sp.status.split(',') : [],
    priority: sp.priority ? sp.priority.split(',') : [],
    assigneeId: sp.assignee ? Number(sp.assignee) : null,
    departmentId: sp.dept ? Number(sp.dept) : null,
    onlyMine: sp.mine === '1',
    overdue: sp.overdue === '1',
    sort: sp.sort ?? 'due',
    page: sp.page ? Number(sp.page) : 1,
    pageSize: 20,
  };

  const scopeIds = await visibleEmployeeIds(ctx);
  const [data, board, tree, assignableEmployees] = await Promise.all([
    view === 'list' ? listTasks(ctx, filter) : Promise.resolve(null),
    view === 'board' ? listTasksBoard(ctx, filter) : Promise.resolve(null),
    getDepartmentTree(),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
    }),
  ]);

  return (
    <TaskScreen
      view={view}
      data={data ? JSON.parse(JSON.stringify(data)) : null}
      board={board ? JSON.parse(JSON.stringify(board)) : null}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      employees={assignableEmployees}
      filter={filter}
      currentEmployeeId={ctx.employeeId}
      canCreate={can(ctx, 'FEATURE_TASK_CREATE')}
      canAssign={can(ctx, 'FEATURE_TASK_ASSIGN')}
      canDelete={can(ctx, 'FEATURE_TASK_DELETE')}
    />
  );
}
