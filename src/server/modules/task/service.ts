import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { visibleEmployeeIds, visibleDepartmentIds } from '@/server/auth/scope';
import { fmtDate } from '@/lib/date';
import { nextCode } from '@/server/lib/code-sequence';
import { notify } from '@/server/modules/notify/service';
import { TASK_PRIORITY } from '@/lib/enums';
import { extractMentions } from '@/lib/mentions';

export async function generateTaskCode(offset = 0): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TSK-${year}-`;
  const next = await nextCode('Task', prefix);
  const seq = Number(next.slice(prefix.length)) + offset;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export interface TaskFilter {
  search?: string;
  status?: string[];
  priority?: string[];
  assigneeId?: number | null;
  departmentId?: number | null;
  creatorId?: number | null;
  onlyMine?: boolean;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  /** Trường ngày dùng để lọc: ngày đến hạn, ngày bắt đầu, ngày tạo hay ngày hoàn thành. */
  dateField?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Chỉ lấy việc chưa đặt giá trị cho trường ngày đang chọn. */
  noDate?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
}

/** Điều kiện phạm vi dữ liệu cho công việc: người được giao, người tạo, hoặc phòng ban trong phạm vi. */
export async function taskScopeWhere(ctx: AuthContext): Promise<Prisma.TaskWhereInput> {
  if (ctx.dataScope === 'ALL') return {};
  const [empIds, deptIds] = await Promise.all([visibleEmployeeIds(ctx), visibleDepartmentIds(ctx)]);

  const or: Prisma.TaskWhereInput[] = [
    { assigneeId: ctx.employeeId },
    { creatorId: ctx.employeeId },
    { reviewerId: ctx.employeeId },
    { watchers: { some: { employeeId: ctx.employeeId } } },
  ];
  if (empIds?.length) or.push({ assigneeId: { in: empIds } }, { creatorId: { in: empIds } });
  if (deptIds?.length) or.push({ departmentId: { in: deptIds } });

  return { OR: or };
}

/**
 * Việc đã đóng sổ: không còn ai phải làm gì nữa.
 * Tách riêng để màn hình mặc định chỉ hiện việc đang chạy, việc cũ đưa sang tab lưu trữ.
 */
export const CLOSED_TASK_STATUSES = ['DONE', 'CANCELLED'] as const;
export const OPEN_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED'] as const;

/** Phòng ban và mọi phòng ban con; cache theo request vì list, số đếm tab và board cùng gọi. */
const departmentBranchIds = cache(async (departmentId: number): Promise<number[] | null> => {
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { path: true } });
  if (!dept) return null;
  const branch = await prisma.department.findMany({ where: { path: { startsWith: dept.path } }, select: { id: true } });
  return branch.map((d) => d.id);
});

/** Dựng điều kiện lọc dùng chung cho danh sách và cho số đếm của các tab. */
async function buildTaskWhere(ctx: AuthContext, filter: TaskFilter) {
  const where: Prisma.TaskWhereInput = { AND: [await taskScopeWhere(ctx)] };
  const and = where.AND as Prisma.TaskWhereInput[];

  if (filter.search?.trim()) {
    const q = filter.search.trim();
    and.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] });
  }
  if (filter.status?.length) and.push({ status: { in: filter.status as never[] } });
  if (filter.priority?.length) and.push({ priority: { in: filter.priority as never[] } });
  if (filter.assigneeId) and.push({ assigneeId: filter.assigneeId });
  if (filter.creatorId) and.push({ creatorId: filter.creatorId });
  if (filter.onlyMine) and.push({ assigneeId: ctx.employeeId });
  if (filter.overdue) and.push({ dueDate: { lt: new Date() }, status: { notIn: ['DONE', 'CANCELLED'] } });
  if (filter.dueFrom) and.push({ dueDate: { gte: new Date(filter.dueFrom) } });
  if (filter.dueTo) and.push({ dueDate: { lte: new Date(`${filter.dueTo}T23:59:59`) } });

  // Lọc theo trường ngày người dùng chọn; chỉ nhận đúng 4 cột ngày đã khai báo
  const dateField = (['dueDate', 'startDate', 'createdAt', 'completedAt'] as const).find(
    (f) => f === filter.dateField,
  );
  if (dateField) {
    if (filter.noDate) {
      and.push({ [dateField]: null } as Prisma.TaskWhereInput);
    } else if (filter.dateFrom || filter.dateTo) {
      and.push({
        [dateField]: {
          ...(filter.dateFrom ? { gte: new Date(`${filter.dateFrom}T00:00:00`) } : {}),
          ...(filter.dateTo ? { lte: new Date(`${filter.dateTo}T23:59:59.999`) } : {}),
        },
      } as Prisma.TaskWhereInput);
    }
  }

  if (filter.departmentId) {
    const branch = await departmentBranchIds(filter.departmentId);
    if (branch) and.push({ departmentId: { in: branch } });
  }

  return where;
}

/**
 * Số việc đang làm / đã đóng, dùng cho nhãn các tab.
 * Đếm theo đúng bộ lọc đang áp dụng nhưng bỏ qua trạng thái, để hai con số luôn
 * cộng lại bằng tổng của tab "Tất cả".
 */
export async function countTaskScopes(ctx: AuthContext, filter: TaskFilter) {
  const where = await buildTaskWhere(ctx, { ...filter, status: [] });
  const and = where.AND as Prisma.TaskWhereInput[];

  const [open, closed] = await Promise.all([
    prisma.task.count({ where: { AND: [...and, { status: { in: OPEN_TASK_STATUSES as never } }] } }),
    prisma.task.count({ where: { AND: [...and, { status: { in: CLOSED_TASK_STATUSES as never } }] } }),
  ]);

  return { open, closed, all: open + closed };
}

export async function listTasks(ctx: AuthContext, filter: TaskFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, filter.pageSize ?? 20);

  const where = await buildTaskWhere(ctx, filter);

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    filter.sort === 'priority' ? [{ priority: 'desc' }, { dueDate: 'asc' }]
    : filter.sort === 'created' ? [{ createdAt: 'desc' }]
    : filter.sort === 'title' ? [{ title: 'asc' }]
    : [{ dueDate: 'asc' }, { priority: 'desc' }];

  const include = {
    assignee: { select: { id: true, fullName: true, avatarUrl: true } },
    creator: { select: { id: true, fullName: true } },
    department: { select: { id: true, name: true } },
    _count: { select: { comments: true, subTasks: true, checklist: true, attachments: true } },
  };

  const [rows, total, statusGroups] = await Promise.all([
    prisma.task.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include }),
    prisma.task.count({ where }),
    prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  return {
    rows, total, page, pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
  };
}

/**
 * Dữ liệu xuất Excel của màn Công việc.
 *
 * Dùng chung buildTaskWhere với danh sách nên file tải về đúng bằng những gì
 * người dùng đang nhìn thấy: cùng bộ lọc, cùng phạm vi dữ liệu theo phân quyền.
 * Không phân trang nhưng có trần để một cú bấm không kéo cả trăm nghìn dòng.
 */
export const TASK_EXPORT_LIMIT = 5000;

export async function exportTasks(ctx: AuthContext, filter: TaskFilter) {
  const where = await buildTaskWhere(ctx, filter);

  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    take: TASK_EXPORT_LIMIT,
    select: {
      code: true, title: true, status: true, priority: true, progress: true,
      startDate: true, dueDate: true, completedAt: true,
      estimateHours: true, actualHours: true, tags: true, createdAt: true,
      department: { select: { name: true } },
      assignee: { select: { fullName: true, code: true } },
      creator: { select: { fullName: true } },
      reviewer: { select: { fullName: true } },
      parentTask: { select: { code: true } },
      _count: { select: { comments: true, subTasks: true, checklist: true } },
    },
  });

  const total = await prisma.task.count({ where });
  return { rows, total, truncated: total > rows.length };
}

/** Dữ liệu cho bảng Kanban — lấy tối đa N việc mỗi cột, đồng bộ đầy đủ bộ lọc với Danh sách. */
export async function listTasksBoard(ctx: AuthContext, filter: TaskFilter, perColumn = 50) {
  const statuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
  perColumn = Math.min(300, Math.max(10, Math.floor(perColumn) || 50));
  const baseWhere = await buildTaskWhere(ctx, { ...filter, status: [] });
  const baseAnd = (baseWhere.AND as Prisma.TaskWhereInput[]) ?? [];

  const columns = await Promise.all(
    statuses.map(async (status) => {
      const colWhere: Prisma.TaskWhereInput = { AND: [...baseAnd, { status }] };
      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where: colWhere,
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
          take: perColumn,
          include: {
            assignee: { select: { id: true, fullName: true, avatarUrl: true } },
            _count: { select: { comments: true, checklist: true, subTasks: true, attachments: true } },
          },
        }),
        prisma.task.count({ where: colWhere }),
      ]);
      return { status, tasks, total };
    }),
  );

  return columns;
}

/** Số bình luận / tệp / giờ công tối đa nạp kèm chi tiết công việc. */
export const TASK_DETAIL_LIMIT = 100;

export async function getTaskDetail(ctx: AuthContext, id: number) {
  const scope = await taskScopeWhere(ctx);
  const task = await prisma.task.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true, department: { select: { name: true } } } },
      creator: { select: { id: true, fullName: true, avatarUrl: true } },
      reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
      department: { select: { id: true, name: true } },
      parentTask: { select: { id: true, code: true, title: true, status: true } },
      subTasks: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, code: true, title: true, status: true, progress: true, assignee: { select: { fullName: true, avatarUrl: true } } },
      },
      checklist: { orderBy: { sortOrder: 'asc' } },
      watchers: { include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } } },
      // Giới hạn số dòng lịch sử nạp kèm: việc chạy lâu có thể có hàng nghìn bình luận/giờ công
      comments: {
        orderBy: { createdAt: 'desc' },
        take: TASK_DETAIL_LIMIT,
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
      attachments: { orderBy: { createdAt: 'desc' }, take: TASK_DETAIL_LIMIT },
      activities: { orderBy: { createdAt: 'desc' }, take: 30 },
      timeLogs: {
        orderBy: { workDate: 'desc' },
        take: TASK_DETAIL_LIMIT,
        include: { employee: { select: { fullName: true } } },
      },
      _count: { select: { comments: true, attachments: true, timeLogs: true } },
      reminders: true,
    },
  });
  return task;
}

export async function logActivity(
  taskId: number, actorId: number | null, action: string,
  field?: string, oldValue?: string | null, newValue?: string | null,
) {
  return prisma.taskActivity.create({
    data: { taskId, actorId, action, field, oldValue, newValue },
  });
}

/** Thông báo giao việc cho người được giao (và người theo dõi). */
export async function notifyTaskAssigned(taskId: number, actorName: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { id: true } }, watchers: { select: { employeeId: true } } },
  });
  if (!task?.assigneeId) return;

  await notify({
    templateCode: 'TASK_ASSIGNED',
    employeeIds: [task.assigneeId],
    linkPath: `/tasks/${task.id}`,
    vars: {
      code: task.code,
      title: task.title,
      priority: TASK_PRIORITY[task.priority]?.label ?? task.priority,
      dueDate: task.dueDate ? fmtDate(task.dueDate) : 'chưa đặt',
      creator: actorName,
    },
  });
}

/**
 * Thông báo in-app cho những người liên quan tới công việc (người làm, người tạo,
 * người nghiệm thu, người theo dõi + `extra`), trừ chính người thao tác.
 */
export async function notifyTaskParticipants(
  taskId: number,
  actorEmployeeId: number,
  build: (task: { id: number; code: string; title: string }) => { title: string; body: string },
  opts: { extraEmployeeIds?: number[]; only?: number[]; exclude?: number[] } = {},
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, code: true, title: true, assigneeId: true, creatorId: true, reviewerId: true,
      watchers: { select: { employeeId: true } },
    },
  });
  if (!task) return 0;

  const base = opts.only ?? [
    task.assigneeId,
    task.creatorId,
    task.reviewerId,
    ...task.watchers.map((w) => w.employeeId),
    ...(opts.extraEmployeeIds ?? []),
  ];
  const recipientEmployeeIds = Array.from(
    new Set(base.filter((id): id is number => Boolean(id) && id !== actorEmployeeId && !opts.exclude?.includes(id as number))),
  );
  if (recipientEmployeeIds.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { employeeId: { in: recipientEmployeeIds }, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const { title, body } = build(task);
  await prisma.inAppNotification.createMany({
    data: users.map((u) => ({ userId: u.id, title, body, linkUrl: `/tasks/${task.id}` })),
  });
  return users.length;
}


/** Gửi thông báo in-app khi có bình luận mới; người được @nhắc tên nhận thông báo riêng. */
export async function notifyTaskComment(
  taskId: number,
  actorEmployeeId: number,
  actorName: string,
  content: string,
) {
  const snippet = content.length > 120 ? `${content.slice(0, 120)}…` : content;

  const usernames = extractMentions(content);
  const mentioned = usernames.length
    ? await prisma.user.findMany({
        where: { username: { in: usernames, mode: 'insensitive' }, isActive: true },
        select: { employeeId: true },
      })
    : [];
  const mentionedIds = mentioned.map((u) => u.employeeId);

  if (mentionedIds.length) {
    await notifyTaskParticipants(
      taskId,
      actorEmployeeId,
      (task) => ({ title: `${actorName} đã nhắc bạn ở ${task.code}`, body: `${task.title}: ${snippet}` }),
      { only: mentionedIds },
    );
  }

  await notifyTaskParticipants(taskId, actorEmployeeId, (task) => ({
    title: `${actorName} đã bình luận ở ${task.code}`,
    body: `${task.title}: ${snippet}`,
  }), { exclude: mentionedIds });
}
