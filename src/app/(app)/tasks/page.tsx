import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import {
  listTasks, listTasksBoard, countTaskScopes,
  OPEN_TASK_STATUSES, CLOSED_TASK_STATUSES,
} from '@/server/modules/task/service';
import {
  resolveDateRange, TASK_DATE_FIELDS, TASK_DATE_PRESETS,
  type TaskDateField, type TaskDatePreset,
} from '@/server/modules/task/date-filter';
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

  /**
   * Màn hình mặc định chỉ hiện việc còn đang chạy. Việc đã xong hoặc đã hủy nằm
   * ở tab lưu trữ, vẫn tìm kiếm và lọc được như bình thường.
   */
  const scope = sp.scope === 'closed' || sp.scope === 'all' ? sp.scope : 'open';
  const picked = sp.status ? sp.status.split(',') : [];
  const scopeStatuses =
    scope === 'closed' ? [...CLOSED_TASK_STATUSES]
    : scope === 'all' ? []
    : [...OPEN_TASK_STATUSES];
  // Chọn trạng thái cụ thể thì giao với phạm vi của tab, không phá phạm vi đó
  const status = picked.length
    ? (scopeStatuses.length ? picked.filter((p) => scopeStatuses.includes(p as never)) : picked)
    : scopeStatuses;

  // Bộ lọc thời gian: chọn cả trường ngày lẫn khoảng, quy đổi preset ở phía máy chủ
  const dateField = (sp.dfield && sp.dfield in TASK_DATE_FIELDS ? sp.dfield : 'dueDate') as TaskDateField;
  const datePreset = (sp.drange && sp.drange in TASK_DATE_PRESETS ? sp.drange : 'ALL') as TaskDatePreset;
  const dateRange = resolveDateRange(datePreset, { from: sp.dfrom, to: sp.dto });

  const filter = {
    search: sp.q ?? '',
    status,
    pickedStatus: picked,
    scope,
    dateField,
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    noDate: dateRange.noDate,
    customFrom: sp.dfrom ?? '',
    customTo: sp.dto ?? '',
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
  const [data, board, tree, assignableEmployees, scopeCounts] = await Promise.all([
    view === 'list' ? listTasks(ctx, filter) : Promise.resolve(null),
    view === 'board' ? listTasksBoard(ctx, filter) : Promise.resolve(null),
    getDepartmentTree(),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
    }),
    countTaskScopes(ctx, filter),
  ]);

  return (
    <TaskScreen
      view={view}
      data={data ? JSON.parse(JSON.stringify(data)) : null}
      board={board ? JSON.parse(JSON.stringify(board)) : null}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      employees={assignableEmployees}
      filter={filter}
      scopeCounts={scopeCounts}
      currentEmployeeId={ctx.employeeId}
      canCreate={can(ctx, 'FEATURE_TASK_CREATE')}
      canAssign={can(ctx, 'FEATURE_TASK_ASSIGN')}
      canDelete={can(ctx, 'FEATURE_TASK_DELETE')}
      canExport={can(ctx, 'FEATURE_TASK_EXPORT')}
    />
  );
}
