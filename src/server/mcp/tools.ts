import { prisma } from '@/lib/prisma';
import { fmtDate, fmtDateTime, dateOnly } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { TASK_STATUS, TASK_PRIORITY, LEAVE_STATUS, ATTENDANCE_STATUS } from '@/lib/enums';
import { listTasks, generateTaskCode, taskScopeWhere } from '@/server/modules/task/service';
import { listLeaveRequests, getOrCreateBalance, remainingDays, calculateLeaveDays } from '@/server/modules/leave/service';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getMonthlySheet } from '@/server/modules/attendance/service';
import { actOnApproval } from '@/server/modules/workflow/engine';
import { can, type AuthContext } from '@/server/auth/context';
import { listEquipment } from '@/server/modules/equipment/service';
import { orderDebt, summarizeCustomerDebt, recordCustomerPayment } from '@/server/modules/customer/service';
import { ORDER_STATUSES, QUOTATION_STATUSES, PAYMENT_METHODS } from '@/server/modules/customer/types';
import { listStockTransactions } from '@/server/modules/spare-parts/service';
import { resolveRange, getInventoryProfitReport } from '@/server/modules/spare-parts/report';
import { REASON_CODES, TRANSACTION_TYPES } from '@/server/modules/spare-parts/types';
import { listDocuments, DOCUMENT_KINDS } from '@/server/modules/settings/documents';
import type { McpIdentity } from './auth';
import { type McpModuleKey } from './modules';

export interface McpTool {
  name: string;
  /** Phân hệ nghiệp vụ; dùng để bật/tắt theo từng lần triển khai. */
  module: McpModuleKey;
  title: string;
  description: string;
  /** Ghi dữ liệu → bị chặn với client chế độ chỉ đọc */
  mutating?: boolean;
  /** Quyền bắt buộc của người dùng đại diện */
  permission?: string;
  /**
   * Cần ÍT NHẤT MỘT trong các quyền này. Dùng cho công cụ mà màn hình tương ứng
   * cũng mở cho nhiều vai trò, để MCP không lỏng hơn giao diện.
   */
  permissionsAny?: string[];
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, identity: McpIdentity) => Promise<unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

export function parseDateInput(val?: string | null): string {
  if (!val) return '';
  const trimmed = String(val).trim();
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

export function toBool(val: unknown): boolean {
  return val === true || val === 'true' || val === 1 || val === '1';
}

/**
 * Loại chứng từ mà người đại diện được phép đọc.
 *
 * Sổ chứng từ gộp chung tiền của khách và phiếu kho, nên phải chia quyền theo
 * từng loại: người chỉ có quyền kho không được thấy báo giá, đơn hàng, phiếu
 * thu chi của khách — và ngược lại.
 */
export function allowedDocumentKinds(identity: McpIdentity): string[] {
  const ctx = identity.ctx;
  const customerSide = ctx.isAdmin || can(ctx, 'MENU_CUSTOMERS') || can(ctx, 'FEATURE_CUSTOMER_MANAGE');
  const stockSide =
    ctx.isAdmin || can(ctx, 'MENU_SPARE_PARTS') || can(ctx, 'FEATURE_SPARE_PARTS_MANAGE');
  const serviceSide =
    ctx.isAdmin || can(ctx, 'MENU_EQUIPMENT') || can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE');

  const kinds: string[] = [];
  if (customerSide) kinds.push('QUOTATION', 'ORDER', 'PAYMENT_IN', 'RETURN');
  if (stockSide) kinds.push('PURCHASE_ORDER', 'PAYMENT_OUT', 'STOCK', 'STOCK_COUNT');
  if (serviceSide) kinds.push('TICKET');
  return kinds;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'search_employees',
    module: 'hr',
    title: 'Tìm nhân sự',
    description: 'Tìm nhân sự theo tên, mã, phòng ban. Trả về thông tin cơ bản, phòng ban, chức danh và quản lý trực tiếp.',
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Từ khóa tên hoặc mã nhân sự'),
        departmentName: str('Lọc theo tên phòng ban'),
        limit: num('Số kết quả tối đa, mặc định 20'),
      },
    },
    handler: async (args, identity) => {
      const scopeIds = await visibleEmployeeIds(identity.ctx);
      const q = (args as { query?: string }).query;
      const departmentName = (args as { departmentName?: string }).departmentName;
      const limit = Math.min(50, Number((args as { limit?: number }).limit ?? 20));

      const rows = await prisma.employee.findMany({
        where: {
          ...(scopeIds ? { id: { in: scopeIds.length ? scopeIds : [-1] } } : {}),
          ...(q ? { OR: [{ fullName: { contains: q } }, { code: { contains: q } }, { email: { contains: q } }] } : {}),
          ...(departmentName ? { department: { name: { contains: departmentName } } } : {}),
          status: { not: 'RESIGNED' },
        },
        take: limit,
        orderBy: { fullName: 'asc' },
        include: {
          department: { select: { name: true } },
          position: { select: { name: true } },
          manager: { select: { fullName: true } },
        },
      });

      return rows.map((e) => ({
        code: e.code, fullName: e.fullName, email: e.email, phone: e.phone,
        department: e.department?.name ?? null, position: e.position?.name ?? null,
        manager: e.manager?.fullName ?? null, status: e.status,
        zaloLinked: Boolean(e.zaloUserId),
      }));
    },
  },
  {
    name: 'get_department_tree',
    module: 'hr',
    title: 'Cây phòng ban',
    description: 'Trả về toàn bộ cơ cấu tổ chức phân cấp kèm số nhân sự từng đơn vị.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const tree = await getDepartmentTree();
      return flattenTree(tree).map((d) => ({
        code: d.code, name: d.name, level: d.level,
        parent: d.parentId, manager: d.managerName,
        employeeCount: d.employeeCount, totalWithSubUnits: d.totalEmployeeCount,
      }));
    },
  },
  {
    name: 'list_tasks',
    module: 'task',
    title: 'Danh sách công việc',
    description: 'Liệt kê công việc trong phạm vi dữ liệu, lọc theo trạng thái, người thực hiện, quá hạn.',
    permission: 'MENU_TASKS',
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Từ khóa tiêu đề hoặc mã công việc'),
        status: str('Trạng thái: TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED, CANCELLED'),
        assigneeCode: str('Mã nhân sự người thực hiện'),
        overdue: bool('Chỉ lấy công việc quá hạn'),
        onlyMine: bool('Chỉ công việc của người dùng đại diện'),
        limit: num('Số kết quả tối đa, mặc định 20'),
      },
    },
    handler: async (args, identity) => {
      const a = args as { query?: string; status?: string; assigneeCode?: string; overdue?: boolean; onlyMine?: boolean; limit?: number };
      let assigneeId: number | null = null;
      if (a.assigneeCode) {
        const emp = await prisma.employee.findUnique({ where: { code: a.assigneeCode.toUpperCase() }, select: { id: true } });
        assigneeId = emp?.id ?? -1;
      }

      const isOverdue = a.overdue !== undefined ? toBool(a.overdue) : undefined;
      const isOnlyMine = a.onlyMine !== undefined ? toBool(a.onlyMine) : undefined;

      const result = await listTasks(identity.ctx, {
        search: a.query, status: a.status ? [a.status] : [],
        assigneeId, overdue: isOverdue, onlyMine: isOnlyMine,
        pageSize: Math.min(50, Number(a.limit ?? 20)),
      });

      return {
        total: result.total,
        statusCounts: result.statusCounts,
        tasks: result.rows.map((t) => ({
          code: t.code, title: t.title,
          status: TASK_STATUS[t.status]?.label ?? t.status,
          priority: TASK_PRIORITY[t.priority]?.label ?? t.priority,
          assignee: t.assignee?.fullName ?? null,
          department: t.department?.name ?? null,
          dueDate: t.dueDate ? fmtDate(t.dueDate) : null,
          overdue: Boolean(t.dueDate && t.dueDate < new Date() && !['DONE', 'CANCELLED'].includes(t.status)),
          progress: t.progress,
        })),
      };
    },
  },
  {
    name: 'get_task',
    module: 'task',
    title: 'Chi tiết công việc',
    description: 'Xem chi tiết một công việc theo mã, gồm checklist, bình luận gần nhất và lịch sử.',
    permission: 'MENU_TASKS',
    inputSchema: { type: 'object', properties: { code: str('Mã công việc, vd TSK-2026-0001') }, required: ['code'] },
    handler: async (args, identity) => {
      const code = String((args as { code: string }).code).toUpperCase();
      const scope = await taskScopeWhere(identity.ctx);
      const task = await prisma.task.findFirst({
        where: { AND: [{ code }, scope] },
        include: {
          assignee: { select: { fullName: true } }, creator: { select: { fullName: true } },
          department: { select: { name: true } },
          checklist: { orderBy: { sortOrder: 'asc' } },
          comments: { orderBy: { createdAt: 'desc' }, take: 5, include: { author: { select: { fullName: true } } } },
        },
      });
      if (!task) throw new Error(`Không tìm thấy công việc ${code} trong phạm vi dữ liệu`);

      return {
        code: task.code, title: task.title, description: task.description,
        status: TASK_STATUS[task.status]?.label, priority: TASK_PRIORITY[task.priority]?.label,
        assignee: task.assignee?.fullName, creator: task.creator.fullName,
        department: task.department?.name,
        startDate: task.startDate ? fmtDate(task.startDate) : null,
        dueDate: task.dueDate ? fmtDateTime(task.dueDate) : null,
        progress: task.progress,
        checklist: task.checklist.map((c) => ({ content: c.content, done: c.isDone })),
        recentComments: task.comments.map((c) => ({ author: c.author.fullName, content: c.content, at: fmtDateTime(c.createdAt) })),
      };
    },
  },
  {
    name: 'create_task',
    module: 'task',
    title: 'Tạo công việc',
    description: 'Tạo công việc mới và giao cho nhân sự. Cần quyền tạo công việc.',
    mutating: true,
    permission: 'FEATURE_TASK_CREATE',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Tiêu đề công việc'),
        description: str('Mô tả chi tiết'),
        assigneeCode: str('Mã nhân sự người thực hiện'),
        priority: str('LOW, MEDIUM, HIGH hoặc URGENT'),
        dueDate: str('Hạn hoàn thành dạng YYYY-MM-DD'),
      },
      required: ['title'],
    },
    handler: async (args, identity) => {
      const a = args as { title: string; description?: string; assigneeCode?: string; priority?: string; dueDate?: string };
      let assigneeId: number | null = null;
      if (a.assigneeCode) {
        const emp = await prisma.employee.findUnique({ where: { code: a.assigneeCode.toUpperCase() }, select: { id: true } });
        if (!emp) throw new Error(`Không tìm thấy nhân sự có mã ${a.assigneeCode}`);
        assigneeId = emp.id;
      }

      const dueDateParsed = a.dueDate ? parseDateInput(a.dueDate) : null;

      const task = await prisma.task.create({
        data: {
          code: await generateTaskCode(),
          title: a.title,
          description: a.description ?? null,
          creatorId: identity.ctx.employeeId,
          assigneeId,
          departmentId: identity.ctx.departmentId,
          priority: (a.priority ?? 'MEDIUM') as never,
          dueDate: dueDateParsed ? new Date(dueDateParsed) : null,
          source: 'MCP',
        },
      });

      await prisma.taskActivity.create({ data: { taskId: task.id, actorId: identity.ctx.employeeId, action: 'CREATE' } });

      if (assigneeId) {
        const { notifyTaskAssigned } = await import('@/server/modules/task/service');
        await notifyTaskAssigned(task.id, `${identity.ctx.fullName} (qua ${identity.clientName})`);
      }

      return { code: task.code, title: task.title, message: `Đã tạo công việc ${task.code}` };
    },
  },
  {
    name: 'update_task_status',
    module: 'task',
    title: 'Cập nhật trạng thái công việc',
    description: 'Đổi trạng thái và tiến độ của một công việc.',
    mutating: true,
    permission: 'MENU_TASKS',
    inputSchema: {
      type: 'object',
      properties: {
        code: str('Mã công việc'),
        status: str('TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED, CANCELLED'),
        progress: num('Tiến độ 0–100'),
      },
      required: ['code', 'status'],
    },
    handler: async (args, identity) => {
      const a = args as { code: string; status: string; progress?: number };
      const scope = await taskScopeWhere(identity.ctx);
      const task = await prisma.task.findFirst({ where: { AND: [{ code: a.code.toUpperCase() }, scope] } });
      if (!task) throw new Error(`Không tìm thấy công việc ${a.code}`);

      // Nhìn thấy việc trong phạm vi dữ liệu KHÔNG đồng nghĩa được sửa nó.
      // Giao diện chỉ cho người được giao, người tạo, hoặc người có quyền sửa việc.
      const isOwner = task.assigneeId === identity.ctx.employeeId || task.creatorId === identity.ctx.employeeId;
      if (!isOwner && !can(identity.ctx, 'FEATURE_TASK_EDIT')) {
        throw new Error(`Bạn không phải người thực hiện hay người tạo ${task.code}, và không có quyền FEATURE_TASK_EDIT`);
      }

      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: a.status as never,
          progress: a.progress !== undefined ? Number(a.progress) : (a.status === 'DONE' ? 100 : task.progress),
          completedAt: a.status === 'DONE' ? new Date() : null,
        },
      });
      await prisma.taskActivity.create({
        data: { taskId: task.id, actorId: identity.ctx.employeeId, action: 'STATUS', field: 'status', oldValue: task.status, newValue: a.status },
      });

      return { message: `Đã chuyển ${task.code} sang "${TASK_STATUS[a.status]?.label ?? a.status}"` };
    },
  },
  {
    name: 'get_leave_balance',
    module: 'hr',
    title: 'Quỹ phép',
    description: 'Xem quỹ phép còn lại của một nhân sự trong năm.',
    permission: 'MENU_LEAVES',
    inputSchema: {
      type: 'object',
      properties: {
        employeeCode: str('Mã nhân sự, bỏ trống để xem của chính người dùng đại diện'),
        year: num('Năm, mặc định năm hiện tại'),
      },
    },
    handler: async (args, identity) => {
      const a = args as { employeeCode?: string; year?: number };
      const year = Number(a.year ?? new Date().getFullYear());

      let employeeId = identity.ctx.employeeId;
      if (a.employeeCode) {
        const emp = await prisma.employee.findUnique({ where: { code: a.employeeCode.toUpperCase() }, select: { id: true } });
        if (!emp) throw new Error(`Không tìm thấy nhân sự ${a.employeeCode}`);
        const scopeIds = await visibleEmployeeIds(identity.ctx);
        if (scopeIds !== null && !scopeIds.includes(emp.id)) throw new Error('Nhân sự nằm ngoài phạm vi dữ liệu được phép xem');
        employeeId = emp.id;
      }

      const [balance, employee] = await Promise.all([
        getOrCreateBalance(employeeId, year),
        prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true, code: true } }),
      ]);

      return {
        employee: employee?.fullName, employeeCode: employee?.code, year,
        standardDays: Number(balance.standardDays), bonusDays: Number(balance.bonusDays),
        carriedOverDays: Number(balance.carriedOverDays), usedDays: Number(balance.usedDays),
        pendingDays: Number(balance.pendingDays), remainingDays: remainingDays(balance),
      };
    },
  },
  {
    name: 'list_leave_requests',
    module: 'hr',
    title: 'Danh sách đơn nghỉ phép',
    description: 'Liệt kê đơn nghỉ phép theo trạng thái và khoảng thời gian. Dùng để trả lời "ai nghỉ tuần này".',
    permission: 'MENU_LEAVES',
    inputSchema: {
      type: 'object',
      properties: {
        status: str('DRAFT, PENDING, APPROVED, REJECTED, CANCELLED'),
        from: str('Từ ngày YYYY-MM-DD'),
        to: str('Đến ngày YYYY-MM-DD'),
        employeeCode: str('Mã nhân sự'),
        limit: num('Số kết quả tối đa, mặc định 20'),
      },
    },
    handler: async (args, identity) => {
      const a = args as { status?: string; from?: string; to?: string; employeeCode?: string; limit?: number };
      let employeeId: number | null = null;
      if (a.employeeCode) {
        const emp = await prisma.employee.findUnique({ where: { code: a.employeeCode.toUpperCase() }, select: { id: true } });
        employeeId = emp?.id ?? -1;
      }

      const fromParsed = a.from ? parseDateInput(a.from) : undefined;
      const toParsed = a.to ? parseDateInput(a.to) : undefined;

      const result = await listLeaveRequests(identity.ctx, {
        status: a.status, from: fromParsed, to: toParsed, employeeId,
        pageSize: Math.min(50, Number(a.limit ?? 20)),
      });

      return {
        total: result.total,
        statusCounts: result.statusCounts,
        requests: result.rows.map((r) => ({
          code: r.code, employee: r.employee.fullName, department: r.employee.department?.name ?? null,
          leaveType: r.leaveType.name, startDate: fmtDate(r.startDate), endDate: fmtDate(r.endDate),
          totalDays: Number(r.totalDays), status: LEAVE_STATUS[r.status]?.label ?? r.status, reason: r.reason,
        })),
      };
    },
  },
  {
    name: 'who_is_on_leave',
    module: 'hr',
    title: 'Ai đang nghỉ',
    description: 'Danh sách nhân sự nghỉ phép trong một ngày cụ thể (mặc định hôm nay).',
    permission: 'MENU_LEAVES',
    inputSchema: { type: 'object', properties: { date: str('Ngày YYYY-MM-DD, mặc định hôm nay') } },
    handler: async (args, identity) => {
      const a = args as { date?: string };
      const parsedDate = a.date ? parseDateInput(a.date) : '';
      const date = dateOnly(parsedDate ? new Date(parsedDate) : new Date());
      const scopeIds = await visibleEmployeeIds(identity.ctx);

      const days = await prisma.leaveRequestDay.findMany({
        where: {
          date,
          request: { status: 'APPROVED', ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
        },
        include: {
          request: {
            select: {
              code: true,
              employee: { select: { fullName: true, code: true, department: { select: { name: true } } } },
              leaveType: { select: { name: true } },
            },
          },
        },
      });

      return {
        date: fmtDate(date),
        count: days.length,
        employees: days.map((d) => ({
          fullName: d.request.employee.fullName,
          code: d.request.employee.code,
          department: d.request.employee.department?.name ?? null,
          leaveType: d.request.leaveType.name,
          portion: Number(d.portion) < 1 ? 'Nửa ngày' : 'Cả ngày',
          requestCode: d.request.code,
        })),
      };
    },
  },
  {
    name: 'submit_leave_request',
    module: 'hr',
    title: 'Nộp đơn nghỉ phép',
    description: 'Tạo và nộp đơn xin nghỉ phép cho người dùng đại diện, đơn sẽ chạy đúng quy trình duyệt đã cấu hình.',
    mutating: true,
    permission: 'FEATURE_LEAVE_REQUEST',
    inputSchema: {
      type: 'object',
      properties: {
        leaveTypeCode: str('Mã loại nghỉ: ANNUAL, SICK, UNPAID…'),
        startDate: str('Từ ngày YYYY-MM-DD'),
        endDate: str('Đến ngày YYYY-MM-DD'),
        reason: str('Lý do nghỉ'),
      },
      required: ['leaveTypeCode', 'startDate', 'endDate', 'reason'],
    },
    handler: async (args, identity) => {
      const a = args as { leaveTypeCode: string; startDate: string; endDate: string; reason: string };
      let leaveType = await prisma.leaveType.findUnique({ where: { code: a.leaveTypeCode.toUpperCase() } });
      if (!leaveType) {
        const allTypes = await prisma.leaveType.findMany({ where: { isActive: true } });
        const term = a.leaveTypeCode.trim().toLowerCase();
        leaveType = allTypes.find((t) => t.code.toLowerCase() === term || t.name.toLowerCase().includes(term)) ?? null;
        if (!leaveType) {
          const list = allTypes.map((t) => `${t.code} (${t.name})`).join(', ');
          throw new Error(`Không tìm thấy loại nghỉ phép "${a.leaveTypeCode}". Các loại nghỉ hợp lệ: ${list}`);
        }
      }

      const startDate = parseDateInput(a.startDate);
      const endDate = parseDateInput(a.endDate);

      const preview = await calculateLeaveDays(identity.ctx.employeeId, new Date(startDate), new Date(endDate), 'FULL_DAY');

      const { submitLeaveAction } = await import('@/server/modules/leave/actions');
      const result = await submitLeaveAction(null, {
        leaveTypeId: leaveType.id, startDate, endDate,
        durationType: 'FULL_DAY', reason: a.reason,
        handoverToId: null, handoverNote: '', contactDuringLeave: '',
        attachmentUrl: '', attachmentName: '', submit: true,
      }, identity.ctx);
      if (!result.ok) throw new Error(result.message);

      return { message: result.message, totalDays: preview.totalDays };
    },
  },
  {
    name: 'list_pending_approvals',
    module: 'hr',
    title: 'Đơn chờ duyệt',
    description: 'Danh sách đơn đang chờ người dùng đại diện duyệt.',
    permission: 'FEATURE_LEAVE_APPROVE',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, identity) => {
      const tasks = await prisma.approvalTask.findMany({
        where: { approverId: identity.ctx.employeeId, status: 'PENDING', instance: { status: 'RUNNING' } },
        include: { instance: true, step: { select: { name: true } } },
      });

      const leaveIds = tasks.filter((t) => t.instance.entityType === 'LEAVE').map((t) => t.instance.entityId);
      const leaves = await prisma.leaveRequest.findMany({
        where: { id: { in: leaveIds } },
        include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } },
      });
      const byId = new Map(leaves.map((l) => [l.id, l]));

      return tasks.map((t) => {
        const l = byId.get(t.instance.entityId);
        return {
          approvalTaskId: t.id,
          requestCode: l?.code ?? null,
          step: t.step.name,
          employee: l?.employee.fullName ?? null,
          leaveType: l?.leaveType.name ?? null,
          startDate: l ? fmtDate(l.startDate) : null,
          endDate: l ? fmtDate(l.endDate) : null,
          totalDays: l ? Number(l.totalDays) : null,
          reason: l?.reason ?? null,
          dueAt: t.dueAt ? fmtDateTime(t.dueAt) : null,
          overdue: Boolean(t.dueAt && t.dueAt < new Date()),
        };
      });
    },
  },
  {
    name: 'approve_request',
    module: 'hr',
    title: 'Duyệt hoặc từ chối đơn',
    description: 'Ra quyết định cho một đơn đang chờ người dùng đại diện duyệt.',
    mutating: true,
    permission: 'FEATURE_LEAVE_APPROVE',
    inputSchema: {
      type: 'object',
      properties: {
        requestCode: str('Mã đơn, vd LR-2026-0001'),
        decision: str('APPROVE hoặc REJECT'),
        comment: str('Ghi chú; bắt buộc khi từ chối'),
      },
      required: ['requestCode', 'decision'],
    },
    handler: async (args, identity) => {
      const a = args as { requestCode: string; decision: string; comment?: string };
      const decision = a.decision.toUpperCase() === 'REJECT' ? 'REJECT' : 'APPROVE';
      if (decision === 'REJECT' && !a.comment?.trim()) throw new Error('Từ chối đơn phải kèm lý do');

      const leave = await prisma.leaveRequest.findUnique({ where: { code: a.requestCode.toUpperCase() } });
      if (!leave?.workflowInstanceId) throw new Error(`Không tìm thấy đơn ${a.requestCode} đang trong quy trình duyệt`);

      const task = await prisma.approvalTask.findFirst({
        where: { instanceId: leave.workflowInstanceId, approverId: identity.ctx.employeeId, status: 'PENDING' },
      });
      if (!task) throw new Error(`Đơn ${a.requestCode} hiện không chờ bạn duyệt`);

      const result = await actOnApproval({
        approvalTaskId: task.id, actorEmployeeId: identity.ctx.employeeId,
        decision, comment: a.comment,
      });
      if (!result.ok) throw new Error(result.message);

      const { finalizeLeave, notifyPendingApprovers } = await import('@/server/modules/leave/actions');
      if (result.instanceStatus === 'APPROVED') await finalizeLeave(leave.id, 'APPROVED', identity.ctx.fullName);
      else if (result.instanceStatus === 'REJECTED') await finalizeLeave(leave.id, 'REJECTED', a.comment ?? identity.ctx.fullName);
      else await notifyPendingApprovers(leave.id);

      return { message: result.message, requestCode: leave.code, instanceStatus: result.instanceStatus };
    },
  },
  {
    name: 'attendance_summary',
    module: 'hr',
    title: 'Tổng hợp chấm công',
    description: 'Thống kê công của một tháng: số công, số lượt đi muộn, vắng, tổng giờ làm.',
    permission: 'MENU_ATTENDANCE',
    inputSchema: {
      type: 'object',
      properties: {
        month: str('Tháng dạng YYYY-MM, mặc định tháng hiện tại'),
        employeeCode: str('Mã nhân sự để xem riêng một người'),
      },
    },
    handler: async (args, identity) => {
      const a = args as { month?: string; employeeCode?: string };
      const now = new Date();
      const [y, m] = (a.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);

      let scopeIds = await visibleEmployeeIds(identity.ctx);
      if (a.employeeCode) {
        const emp = await prisma.employee.findUnique({ where: { code: a.employeeCode.toUpperCase() }, select: { id: true } });
        if (!emp) throw new Error(`Không tìm thấy nhân sự ${a.employeeCode}`);
        if (scopeIds !== null && !scopeIds.includes(emp.id)) throw new Error('Nhân sự nằm ngoài phạm vi dữ liệu');
        scopeIds = [emp.id];
      }

      const sheet = await getMonthlySheet(y, m, scopeIds);
      return {
        month: `${String(m).padStart(2, '0')}/${y}`,
        employees: sheet.rows.map((r) => ({
          code: r.code, fullName: r.fullName, department: r.departmentName,
          workDays: r.summary.present, lateCount: r.summary.late,
          absentCount: r.summary.absent, leaveDays: r.summary.leave,
          totalLateMinutes: r.summary.totalLateMinutes,
          totalWorkedHours: Number(r.summary.totalWorkedHours.toFixed(1)),
        })),
      };
    },
  },
  {
    name: 'my_day',
    module: 'hr',
    title: 'Tổng quan trong ngày',
    description: 'Tóm tắt nhanh: việc đến hạn hôm nay, việc quá hạn, đơn chờ duyệt, quỹ phép còn lại.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, identity) => {
      const today = dateOnly(new Date());
      const empId = identity.ctx.employeeId;
      const year = new Date().getFullYear();

      const [dueToday, overdue, pendingApprovals, balance, attendance] = await Promise.all([
        prisma.task.findMany({
          where: {
            assigneeId: empId, status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { gte: today, lt: new Date(today.getTime() + 86400000) },
          },
          select: { code: true, title: true },
        }),
        prisma.task.count({ where: { assigneeId: empId, status: { notIn: ['DONE', 'CANCELLED'] }, dueDate: { lt: new Date() } } }),
        prisma.approvalTask.count({ where: { approverId: empId, status: 'PENDING' } }),
        getOrCreateBalance(empId, year),
        prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: empId, workDate: today } } }),
      ]);

      return {
        user: identity.ctx.fullName,
        date: fmtDate(today),
        tasksDueToday: dueToday,
        overdueTaskCount: overdue,
        pendingApprovalCount: pendingApprovals,
        leaveRemaining: `${formatDays(remainingDays(balance))} ngày`,
        attendanceToday: attendance
          ? {
              status: ATTENDANCE_STATUS[attendance.status]?.label,
              checkIn: attendance.checkInAt ? fmtDateTime(attendance.checkInAt) : null,
              checkOut: attendance.checkOutAt ? fmtDateTime(attendance.checkOutAt) : null,
            }
          : null,
      };
    },
  },
  {
    name: 'list_fnb_equipment',
    module: 'equipment',
    title: 'Danh sách máy móc F&B',
    description: 'Tra cứu danh sách máy móc F&B theo loại máy, trạng thái, tên/mã máy, thương hiệu hoặc điểm đặt.',
    permission: 'MENU_EQUIPMENT',
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Từ khóa tên máy, mã máy EQ-..., số serial, thương hiệu (vd: Taylor, Carpigiani, Pomati...)'),
        category: str('Loại máy: ICE_CREAM_MACHINE, CHOCOLATE_MACHINE, KITCHEN_HOT, KITCHEN_COLD, BEVERAGE_BAR, OTHER'),
        status: str('Trạng thái: OPERATING (đang chạy), BREAKDOWN (sự cố), UNDER_MAINTENANCE (bảo dưỡng), IN_STOCK (lưu kho), LIQUIDATED (thanh lý)'),
        ownershipType: str('Hình thức: SOLD (đã bán), RENTAL (cho thuê), CONSIGNMENT (ký gửi)'),
        limit: num('Số lượng tối đa, mặc định 20'),
      },
    },
    handler: async (args) => {
      const a = args as { query?: string; category?: string; status?: string; ownershipType?: string; limit?: number };
      const rows = await listEquipment({
        search: a.query,
        category: a.category,
        status: a.status,
        ownershipType: a.ownershipType,
      });

      const limit = Math.min(50, Number(a.limit ?? 20));
      const sliced = rows.slice(0, limit);

      return {
        total: rows.length,
        equipment: sliced.map((e) => ({
          id: e.id,
          machineCode: e.machineCode,
          name: e.name,
          category: e.category,
          brand: e.brand,
          model: e.model,
          serialNumber: e.serialNumber,
          status: e.status,
          ownershipType: e.ownershipType,
          customer: e.customer?.name ?? 'Chưa gán',
          location: e.location?.name ?? null,
          ticketCount: e._count?.tickets ?? 0,
        })),
      };
    },
  },
  {
    name: 'get_fnb_equipment',
    module: 'equipment',
    title: 'Chi tiết máy móc F&B',
    description: 'Xem chi tiết thông số kỹ thuật (cối kem, bồn socola...), lịch sử bảo dưỡng và vị trí đặt máy theo mã máy EQ-... hoặc ID.',
    permission: 'MENU_EQUIPMENT',
    inputSchema: {
      type: 'object',
      properties: {
        code: str('Mã máy EQ-... (ví dụ EQ-2026-0001), số serial hoặc ID máy'),
      },
      required: ['code'],
    },
    handler: async (args) => {
      const codeStr = String((args as { code: string }).code).trim();
      const machine = await prisma.fnbEquipment.findFirst({
        where: {
          OR: [
            { machineCode: codeStr.toUpperCase() },
            { serialNumber: codeStr },
            ...(isNaN(Number(codeStr)) ? [] : [{ id: Number(codeStr) }]),
          ],
        },
        include: {
          customer: {
            select: { id: true, name: true, code: true, phone: true, address: true },
          },
          location: {
            select: { id: true, name: true, address: true, managerName: true, phone: true },
          },
          tickets: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              assignedTo: { select: { fullName: true, code: true } },
            },
          },
        },
      });

      if (!machine) {
        throw new Error(`Không tìm thấy máy móc có mã hoặc serial "${codeStr}"`);
      }

      return {
        id: machine.id,
        machineCode: machine.machineCode,
        name: machine.name,
        category: machine.category,
        brand: machine.brand,
        model: machine.model,
        serialNumber: machine.serialNumber,
        status: machine.status,
        ownershipType: machine.ownershipType,
        specs: machine.specs,
        installedDate: machine.installedDate ? fmtDate(machine.installedDate) : null,
        warrantyExpiresAt: machine.warrantyExpiresAt ? fmtDate(machine.warrantyExpiresAt) : null,
        lastPmDate: machine.lastPmDate ? fmtDate(machine.lastPmDate) : null,
        nextPmDate: machine.nextPmDate ? fmtDate(machine.nextPmDate) : null,
        customer: machine.customer
          ? {
              code: machine.customer.code,
              name: machine.customer.name,
              phone: machine.customer.phone,
            }
          : null,
        location: machine.location
          ? {
              name: machine.location.name,
              address: machine.location.address,
              managerName: machine.location.managerName,
              phone: machine.location.phone,
            }
          : null,
        recentTickets: machine.tickets.map((t) => ({
          ticketCode: t.ticketCode,
          title: t.title,
          priority: t.priority,
          status: t.status,
          assignedTo: t.assignedTo?.fullName ?? 'Chưa phân công',
          createdAt: fmtDateTime(t.createdAt),
          resolvedAt: t.resolvedAt ? fmtDateTime(t.resolvedAt) : null,
        })),
      };
    },
  },
  {
    name: 'list_fnb_customers',
    module: 'sales',
    title: 'Danh sách khách hàng',
    description: 'Tra cứu khách hàng, chuỗi cửa hàng, điểm đặt máy, số điện thoại liên hệ.',
    // Dữ liệu khách hàng — siết đúng như màn hình Khách hàng, không dùng quyền thiết bị
    permissionsAny: ['MENU_CUSTOMERS', 'FEATURE_CUSTOMER_MANAGE'],
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Từ khóa tên khách hàng, mã, số điện thoại hoặc email'),
        status: str('Trạng thái: ACTIVE, INACTIVE, LEAD'),
        limit: num('Số lượng tối đa, mặc định 20'),
      },
    },
    handler: async (args, identity) => {
      if (!can(identity.ctx, 'MENU_EQUIPMENT') && !can(identity.ctx, 'MENU_CUSTOMERS')) {
        throw new Error('Bạn không có quyền xem thông tin khách hàng');
      }
      const a = args as { query?: string; status?: string; limit?: number };
      const rawLimit = Number(a.limit ?? 20);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(50, rawLimit) : 20;
      const q = a.query?.trim();

      const customers = await prisma.customer.findMany({
        where: {
          ...(a.status && a.status !== 'ALL' ? { status: a.status } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { code: { contains: q } },
                  { phone: { contains: q } },
                  { email: { contains: q } },
                ],
              }
            : {}),
        },
        include: {
          locations: {
            select: { id: true, name: true, address: true, managerName: true, phone: true },
          },
          _count: {
            select: { machines: true, orders: true },
          },
        },
        orderBy: { name: 'asc' },
        take: limit,
      });

      return {
        total: customers.length,
        customers: customers.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          status: c.status,
          machineCount: c._count.machines,
          orderCount: c._count.orders,
          locations: c.locations.map((loc) => ({
            name: loc.name,
            address: loc.address,
            managerName: loc.managerName,
            phone: loc.phone,
          })),
        })),
      };
    },
  },
  {
    name: 'list_service_tickets',
    module: 'equipment',
    title: 'Danh sách phiếu sự cố máy F&B',
    description: 'Tra cứu các phiếu báo hỏng, sự cố máy móc F&B theo trạng thái và mức độ ưu tiên.',
    permission: 'MENU_EQUIPMENT',
    inputSchema: {
      type: 'object',
      properties: {
        status: str('Trạng thái: OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED'),
        priority: str('Mức độ: P1_CRITICAL (khẩn cấp 2h), P2_MAJOR (trong ngày), P3_ROUTINE (thông thường)'),
        machineCode: str('Mã máy EQ-... cần tra cứu sự cố'),
        limit: num('Số lượng tối đa, mặc định 20'),
      },
    },
    handler: async (args) => {
      const a = args as { status?: string; priority?: string; machineCode?: string; limit?: number };
      const limit = Math.min(50, Number(a.limit ?? 20));

      const tickets = await prisma.serviceTicket.findMany({
        where: {
          ...(a.status ? { status: a.status } : {}),
          ...(a.priority ? { priority: a.priority } : {}),
          ...(a.machineCode ? { equipment: { machineCode: a.machineCode.toUpperCase() } } : {}),
        },
        include: {
          equipment: { select: { machineCode: true, name: true, category: true } },
          customer: { select: { name: true, phone: true } },
          location: { select: { name: true, address: true } },
          assignedTo: { select: { fullName: true, code: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      });

      return {
        total: tickets.length,
        tickets: tickets.map((t) => ({
          ticketCode: t.ticketCode,
          title: t.title,
          priority: t.priority,
          status: t.status,
          machineCode: t.equipment.machineCode,
          machineName: t.equipment.name,
          customer: t.customer?.name ?? null,
          location: t.location?.name ?? null,
          reportedBy: t.reportedBy,
          reportedPhone: t.reportedPhone,
          assignedTo: t.assignedTo?.fullName ?? 'Chưa phân công',
          slaDeadline: t.slaDeadline ? fmtDateTime(t.slaDeadline) : null,
          createdAt: fmtDateTime(t.createdAt),
          resolvedAt: t.resolvedAt ? fmtDateTime(t.resolvedAt) : null,
        })),
      };
    },
  },
  {
    name: 'create_service_ticket',
    module: 'equipment',
    title: 'Tạo phiếu báo hỏng máy F&B',
    description: 'Tạo phiếu báo hỏng, sự cố máy móc F&B tại điểm bán và tính toán thời hạn xử lý SLA.',
    mutating: true,
    permissionsAny: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],
    inputSchema: {
      type: 'object',
      properties: {
        machineCode: str('Mã máy EQ-..., ví dụ EQ-2026-0001 (hoặc số serial)'),
        title: str('Tiêu đề sự cố, ví dụ: Máy làm kem không đông, Bồn socola lỗi nhiệt độ...'),
        description: str('Mô tả chi tiết sự cố và hiện trạng máy'),
        priority: str('Mức độ: P1_CRITICAL (khẩn cấp - SLA 2h), P2_MAJOR (trong ngày - SLA 8h), P3_ROUTINE (thông thường - SLA 24h)'),
        reportedBy: str('Tên người báo hỏng'),
        reportedPhone: str('Số điện thoại liên hệ'),
      },
      required: ['machineCode', 'title'],
    },
    handler: async (args, identity) => {
      const a = args as {
        machineCode: string;
        title: string;
        description?: string;
        priority?: string;
        reportedBy?: string;
        reportedPhone?: string;
      };

      const machineCodeStr = a.machineCode.trim().toUpperCase();
      const machine = await prisma.fnbEquipment.findFirst({
        where: {
          OR: [{ machineCode: machineCodeStr }, { serialNumber: a.machineCode.trim() }],
        },
      });

      if (!machine) {
        throw new Error(`Không tìm thấy máy móc có mã "${a.machineCode}"`);
      }

      const priority = a.priority || 'P2_MAJOR';
      const now = new Date();
      let slaHours = 8;
      if (priority === 'P1_CRITICAL') slaHours = 2;
      else if (priority === 'P3_ROUTINE') slaHours = 24;
      const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

      // Sinh mã ticket TKT-YYYY-XXXX
      const year = now.getFullYear();
      const prefix = `TKT-${year}-`;
      const count = await prisma.serviceTicket.count({
        where: { ticketCode: { startsWith: prefix } },
      });
      const ticketCode = `${prefix}${String(count + 1).padStart(4, '0')}`;

      // Tạo phiếu sự cố
      const ticket = await prisma.serviceTicket.create({
        data: {
          ticketCode,
          equipmentId: machine.id,
          customerId: machine.customerId,
          locationId: machine.locationId,
          priority,
          title: a.title,
          description: a.description || null,
          reportedBy: a.reportedBy || identity.ctx.fullName,
          reportedPhone: a.reportedPhone || null,
          status: 'OPEN',
          slaDeadline,
        },
      });

      // Cập nhật trạng thái máy sang BREAKDOWN nếu sự cố P1 hoặc P2
      if (priority === 'P1_CRITICAL' || priority === 'P2_MAJOR') {
        await prisma.fnbEquipment.update({
          where: { id: machine.id },
          data: { status: 'BREAKDOWN' },
        });
      }

      return {
        ticketCode: ticket.ticketCode,
        machineCode: machine.machineCode,
        machineName: machine.name,
        priority: ticket.priority,
        status: ticket.status,
        slaDeadline: fmtDateTime(slaDeadline),
        message: `Đã tạo phiếu sự cố ${ticket.ticketCode} cho máy ${machine.machineCode}. SLA hạn chót: ${fmtDateTime(slaDeadline)}.`,
      };
    },
  },
  {
    name: 'list_spare_parts',
    module: 'inventory',
    title: 'Tra cứu danh mục phụ tùng & tồn kho',
    description: 'Tra cứu danh mục phụ tùng, linh kiện thay thế, tồn kho an toàn và máy móc tương thích.',
    permissionsAny: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
    inputSchema: {
      type: 'object',
      properties: {
        query: str('Từ khóa tìm theo tên phụ tùng, mã SP, hãng hoặc dòng máy tương thích'),
        category: str('Phân loại: SPARE_PART (linh kiện), CONSUMABLE (tiêu hao), MACHINE (cụm máy), EQUIPMENT (máy nguyên chiếc)'),
        lowStockOnly: bool('Chỉ lấy các linh kiện sắp hết hàng (tồn <= ngưỡng an toàn)'),
        limit: num('Số lượng tối đa, mặc định 20'),
      },
    },
    handler: async (args) => {
      const a = args as { query?: string; category?: string; lowStockOnly?: boolean; limit?: number };
      const limit = Math.min(50, Number(a.limit ?? 20));

      const where: any = {};
      if (a.query?.trim()) {
        const s = a.query.trim();
        where.OR = [
          { name: { contains: s } },
          { itemCode: { contains: s } },
          { compatibleWith: { contains: s } },
          { manufacturer: { contains: s } },
        ];
      }
      if (a.category) {
        where.category = a.category;
      }

      const items = await prisma.inventoryItem.findMany({
        where,
        include: {
          stocks: {
            include: {
              warehouse: { select: { code: true, name: true, type: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const mapped = items.map((it) => {
        const totalStock = it.stocks.reduce((sum, s) => sum + s.quantity, 0);
        return {
          itemCode: it.itemCode,
          name: it.name,
          category: it.category,
          unit: it.unit,
          compatibleWith: it.compatibleWith,
          manufacturer: it.manufacturer,
          totalStock,
          minStockAlert: it.minStockAlert,
          isLowStock: totalStock <= it.minStockAlert,
          sellingPrice: it.sellingPrice ? Number(it.sellingPrice) : null,
          warehouses: it.stocks.map((s) => ({
            warehouseCode: s.warehouse.code,
            warehouseName: s.warehouse.name,
            type: s.warehouse.type,
            quantity: s.quantity,
          })),
        };
      });

      const results = a.lowStockOnly ? mapped.filter((m) => m.isLowStock) : mapped;

      return {
        total: results.length,
        parts: results,
      };
    },
  },
  {
    name: 'get_spare_part_stock',
    module: 'inventory',
    title: 'Kiểm tra tồn kho phụ tùng chi tiết',
    description: 'Kiểm tra số lượng tồn kho của một mã linh kiện theo từng kho tổng và kho chi nhánh.',
    permissionsAny: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
    inputSchema: {
      type: 'object',
      properties: {
        itemCode: str('Mã phụ tùng SP-... hoặc tên phụ tùng cần tra cứu'),
      },
      required: ['itemCode'],
    },
    handler: async (args) => {
      const a = args as { itemCode: string };
      const queryStr = a.itemCode.trim();

      const item = await prisma.inventoryItem.findFirst({
        where: {
          OR: [
            { itemCode: queryStr.toUpperCase() },
            { name: { contains: queryStr } },
          ],
        },
        include: {
          stocks: {
            include: {
              warehouse: { select: { code: true, name: true, type: true, address: true } },
            },
          },
        },
      });

      if (!item) {
        throw new Error(`Không tìm thấy phụ tùng hoặc linh kiện nào với từ khóa "${a.itemCode}"`);
      }

      const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);

      return {
        itemCode: item.itemCode,
        name: item.name,
        category: item.category,
        unit: item.unit,
        compatibleWith: item.compatibleWith,
        manufacturer: item.manufacturer,
        totalStock,
        minStockAlert: item.minStockAlert,
        isLowStock: totalStock <= item.minStockAlert,
        sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : null,
        stocksByWarehouse: item.stocks.map((s) => ({
          warehouseCode: s.warehouse.code,
          warehouseName: s.warehouse.name,
          type: s.warehouse.type === 'CENTRAL' ? 'Kho tổng' : 'Xe KTV lưu động',
          address: s.warehouse.address,
          quantity: s.quantity,
        })),
      };
    },
  },
  {
    name: 'list_customer_orders',
    module: 'sales',
    title: 'Danh sách đơn hàng khách',
    description:
      'Tra cứu đơn hàng của khách: trạng thái, giá trị, đã thu, còn nợ và hạn thanh toán. Lọc theo khách, trạng thái hoặc chỉ lấy đơn còn nợ.',
    permission: 'MENU_CUSTOMERS',
    inputSchema: {
      type: 'object',
      properties: {
        customer: str('Tên hoặc mã khách hàng cần lọc'),
        status: str(`Trạng thái đơn: ${Object.keys(ORDER_STATUSES).join(', ')}`),
        unpaidOnly: bool('Chỉ lấy đơn còn nợ tiền'),
        limit: num('Số đơn tối đa trả về (mặc định 20)'),
      },
    },
    handler: async (args) => {
      const a = args as { customer?: string; status?: string; unpaidOnly?: unknown; limit?: number };
      const where: Record<string, unknown> = {};
      if (a.status && ORDER_STATUSES[a.status]) where.status = a.status;
      if (a.customer?.trim()) {
        const q = a.customer.trim();
        where.customer = { OR: [{ name: { contains: q } }, { code: { contains: q } }] };
      }

      const orders = await prisma.customerOrder.findMany({
        where,
        include: { customer: { select: { code: true, name: true, phone: true } } },
        orderBy: { orderDate: 'desc' },
        take: Math.min(100, Number(a.limit) || 20),
      });

      const mapped = orders.map((o) => {
        const d = orderDebt(o);
        return {
          orderCode: o.orderCode,
          customer: o.customer?.name || null,
          customerCode: o.customer?.code || null,
          orderDate: fmtDate(o.orderDate),
          status: ORDER_STATUSES[o.status]?.label || o.status,
          totalAmount: d.total,
          paidAmount: d.paid,
          returnedAmount: d.returned,
          remaining: d.remaining,
          dueDate: o.dueDate ? fmtDate(o.dueDate) : null,
          overdue: d.overdue,
        };
      });

      const results = toBool(a.unpaidOnly) ? mapped.filter((m) => m.remaining > 0) : mapped;
      return { total: results.length, orders: results };
    },
  },
  {
    name: 'get_customer_order',
    module: 'sales',
    title: 'Chi tiết đơn hàng khách',
    description: 'Xem chi tiết một đơn hàng theo mã: từng dòng hàng, cước, VAT, đã thu và còn nợ.',
    permission: 'MENU_CUSTOMERS',
    inputSchema: {
      type: 'object',
      properties: { orderCode: str('Mã đơn hàng, ví dụ ORD-2026-0001') },
      required: ['orderCode'],
    },
    handler: async (args) => {
      const a = args as { orderCode: string };
      const order = await prisma.customerOrder.findFirst({
        where: { orderCode: a.orderCode.trim().toUpperCase() },
        include: {
          customer: { select: { code: true, name: true, phone: true, address: true } },
          items: true,
        },
      });
      if (!order) throw new Error(`Không tìm thấy đơn hàng "${a.orderCode}"`);

      const d = orderDebt(order);
      return {
        orderCode: order.orderCode,
        customer: order.customer?.name || null,
        phone: order.customer?.phone || null,
        orderDate: fmtDate(order.orderDate),
        status: ORDER_STATUSES[order.status]?.label || order.status,
        goodsAmount: Number(order.goodsAmount || 0),
        shippingFee: Number(order.shippingFee || 0),
        vatAmount: Number(order.vatAmount || 0),
        totalAmount: d.total,
        paidAmount: d.paid,
        remaining: d.remaining,
        dueDate: order.dueDate ? fmtDate(order.dueDate) : null,
        overdue: d.overdue,
        items: order.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice || 0),
          amount: Number(it.unitPrice || 0) * it.quantity,
        })),
      };
    },
  },
  {
    name: 'list_customer_quotations',
    module: 'sales',
    title: 'Danh sách báo giá',
    description: 'Tra cứu các lần báo giá đã gửi khách: trạng thái, giá trị và hiệu lực.',
    permission: 'MENU_CUSTOMERS',
    inputSchema: {
      type: 'object',
      properties: {
        customer: str('Tên hoặc mã khách hàng cần lọc'),
        status: str(`Trạng thái báo giá: ${Object.keys(QUOTATION_STATUSES).join(', ')}`),
        limit: num('Số báo giá tối đa trả về (mặc định 20)'),
      },
    },
    handler: async (args) => {
      const a = args as { customer?: string; status?: string; limit?: number };
      const where: Record<string, unknown> = {};
      if (a.status && QUOTATION_STATUSES[a.status]) where.status = a.status;
      if (a.customer?.trim()) {
        const q = a.customer.trim();
        where.customer = { OR: [{ name: { contains: q } }, { code: { contains: q } }] };
      }

      const rows = await prisma.customerQuotation.findMany({
        where,
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { quoteDate: 'desc' },
        take: Math.min(100, Number(a.limit) || 20),
      });

      return {
        total: rows.length,
        quotations: rows.map((q) => ({
          quoteCode: q.quoteCode,
          customer: q.customer?.name || null,
          quoteDate: fmtDate(q.quoteDate),
          validUntil: q.validUntil ? fmtDate(q.validUntil) : null,
          status: QUOTATION_STATUSES[q.status]?.label || q.status,
          totalAmount: Number(q.totalAmount || 0),
        })),
      };
    },
  },
  {
    name: 'customer_debt_summary',
    module: 'sales',
    title: 'Công nợ phải thu',
    description:
      'Tổng hợp tiền khách còn nợ. Không truyền tên khách thì trả về top khách nợ nhiều nhất kèm tổng toàn hệ thống.',
    permission: 'MENU_CUSTOMERS',
    inputSchema: {
      type: 'object',
      properties: {
        customer: str('Tên hoặc mã khách hàng; bỏ trống để xem toàn bộ'),
        limit: num('Số khách trả về khi xem toàn bộ (mặc định 10)'),
      },
    },
    handler: async (args) => {
      const a = args as { customer?: string; limit?: number };
      const where: Record<string, unknown> = { status: { not: 'CANCELLED' } };
      if (a.customer?.trim()) {
        const q = a.customer.trim();
        where.customer = { OR: [{ name: { contains: q } }, { code: { contains: q } }] };
      }

      const orders = await prisma.customerOrder.findMany({
        where,
        include: { customer: { select: { id: true, code: true, name: true, phone: true } } },
      });

      const byCustomer = new Map<number, { name: string; code: string | null; phone: string | null; orders: unknown[] }>();
      for (const o of orders) {
        if (!o.customer) continue;
        const row = byCustomer.get(o.customerId) || {
          name: o.customer.name, code: o.customer.code, phone: o.customer.phone, orders: [],
        };
        row.orders.push(o);
        byCustomer.set(o.customerId, row);
      }

      const rows = [...byCustomer.values()]
        .map((r) => ({ customer: r.name, code: r.code, phone: r.phone, ...summarizeCustomerDebt(r.orders) }))
        .filter((r) => r.outstanding > 0)
        .sort((x, y) => y.outstanding - x.outstanding);

      const all = summarizeCustomerDebt(orders);
      return {
        totalOutstanding: all.outstanding,
        totalOverdue: all.overdue,
        debtorCount: rows.length,
        customers: rows.slice(0, Math.min(50, Number(a.limit) || 10)),
      };
    },
  },
  {
    name: 'get_customer_quotation',
    module: 'sales',
    title: 'Chi tiết báo giá',
    description:
      'Xem chi tiết một báo giá theo mã: từng dòng hàng, đơn giá, chiết khấu, cước, VAT, hiệu lực và đã chuyển thành đơn hàng chưa.',
    permission: 'MENU_CUSTOMERS',
    inputSchema: {
      type: 'object',
      properties: { quoteCode: str('Mã báo giá, ví dụ BG-2026-0001') },
      required: ['quoteCode'],
    },
    handler: async (args) => {
      const a = args as { quoteCode: string };
      const q = await prisma.customerQuotation.findFirst({
        where: { quoteCode: a.quoteCode.trim().toUpperCase() },
        include: {
          customer: { select: { code: true, name: true, phone: true } },
          items: true,
          orders: { select: { orderCode: true, status: true } },
        },
      });
      if (!q) throw new Error(`Không tìm thấy báo giá "${a.quoteCode}"`);

      return {
        quoteCode: q.quoteCode,
        customer: q.customer?.name || null,
        phone: q.customer?.phone || null,
        quoteDate: fmtDate(q.quoteDate),
        validUntil: q.validUntil ? fmtDate(q.validUntil) : null,
        expired: Boolean(q.validUntil && q.validUntil < new Date()),
        status: QUOTATION_STATUSES[q.status]?.label || q.status,
        discountAmount: Number(q.discountAmount || 0),
        discountRate: Number(q.discountRate || 0),
        shippingFee: Number(q.shippingFee || 0),
        vatAmount: Number(q.vatAmount || 0),
        totalAmount: Number(q.totalAmount || 0),
        // Báo giá đã chốt thành đơn thì nói rõ, tránh báo giá lại lần nữa
        convertedOrders: (q.orders || []).map((o: { orderCode: string; status: string }) => ({
          orderCode: o.orderCode,
          status: ORDER_STATUSES[o.status]?.label || o.status,
        })),
        items: q.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice || 0),
          amount: Number(it.totalPrice || 0),
        })),
      };
    },
  },
  {
    name: 'record_customer_payment',
    module: 'sales',
    title: 'Ghi nhận khách thanh toán',
    description:
      'Ghi nhận một khoản khách đã trả. Có gắn mã đơn thì trừ vào đúng đơn đó; để trống thì hệ thống tự trừ dần các đơn còn nợ từ cũ tới mới.',
    mutating: true,
    permission: 'FEATURE_CUSTOMER_MANAGE',
    inputSchema: {
      type: 'object',
      properties: {
        customer: str('Tên hoặc mã khách hàng đã trả tiền'),
        amount: num('Số tiền khách trả (VNĐ)'),
        orderCode: str('Mã đơn cần trừ, ví dụ ORD-2026-0001; bỏ trống để trừ dần đơn cũ nhất'),
        method: str(`Hình thức: ${Object.keys(PAYMENT_METHODS).join(', ')}`),
        paidAt: str('Ngày thu, dạng DD/MM/YYYY hoặc YYYY-MM-DD; bỏ trống là hôm nay'),
        reference: str('Số chứng từ, mã giao dịch ngân hàng'),
        note: str('Ghi chú thêm'),
      },
      required: ['customer', 'amount'],
    },
    handler: async (args, identity) => {
      const a = args as {
        customer: string; amount: number; orderCode?: string;
        method?: string; paidAt?: string; reference?: string; note?: string;
      };

      const q = a.customer.trim();
      const matches = await prisma.customer.findMany({
        where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        select: { id: true, code: true, name: true },
        take: 5,
      });
      if (matches.length === 0) throw new Error(`Không tìm thấy khách hàng "${a.customer}"`);
      // Trùng tên mà tự chọn bừa thì tiền vào nhầm sổ, nên bắt nói rõ
      if (matches.length > 1) {
        throw new Error(
          `Có ${matches.length} khách khớp "${a.customer}": ${matches.map((m) => `${m.code} - ${m.name}`).join('; ')}. Hãy dùng mã khách cụ thể.`,
        );
      }
      const customer = matches[0];

      let orderId: number | undefined;
      if (a.orderCode?.trim()) {
        const order = await prisma.customerOrder.findFirst({
          where: { orderCode: a.orderCode.trim().toUpperCase(), customerId: customer.id },
          select: { id: true },
        });
        if (!order) throw new Error(`Không tìm thấy đơn "${a.orderCode}" của khách ${customer.name}`);
        orderId = order.id;
      }

      const payment = await recordCustomerPayment(
        {
          customerId: customer.id,
          orderId,
          amount: Number(a.amount),
          method: a.method || 'TRANSFER',
          paidAt: parseDateInput(a.paidAt) || undefined,
          reference: a.reference,
          note: a.note,
        },
        identity.ctx.userId,
      );

      const orders = await prisma.customerOrder.findMany({
        where: { customerId: customer.id, status: { not: 'CANCELLED' } },
      });

      return {
        paymentCode: payment.paymentCode,
        customer: customer.name,
        amount: Number(payment.amount),
        paidAt: fmtDate(payment.paidAt),
        remainingDebt: summarizeCustomerDebt(orders).outstanding,
      };
    },
  },
  {
    name: 'list_stock_transactions',
    module: 'inventory',
    title: 'Lịch sử nhập / xuất / điều chuyển kho',
    description:
      'Tra lịch sử phiếu kho: nhập hàng về, xuất bán, xuất bảo hành, điều chuyển giữa kho. Lọc theo loại phiếu, lý do và khoảng ngày.',
    permissionsAny: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
    inputSchema: {
      type: 'object',
      properties: {
        type: str(`Loại phiếu: ${Object.keys(TRANSACTION_TYPES).join(', ')}`),
        reasonCode: str(`Lý do: ${Object.keys(REASON_CODES).join(', ')}`),
        search: str('Tìm theo mã phiếu, tên hoặc mã linh kiện'),
        from: str('Từ ngày, dạng DD/MM/YYYY hoặc YYYY-MM-DD'),
        to: str('Đến ngày'),
        limit: num('Số phiếu tối đa trả về (mặc định 20)'),
      },
    },
    handler: async (args) => {
      const a = args as { type?: string; reasonCode?: string; search?: string; from?: string; to?: string; limit?: number };
      const res = await listStockTransactions({
        type: a.type && TRANSACTION_TYPES[a.type] ? a.type : undefined,
        reasonCode: a.reasonCode && REASON_CODES[a.reasonCode] ? a.reasonCode : undefined,
        search: a.search,
        from: parseDateInput(a.from) || undefined,
        to: parseDateInput(a.to) || undefined,
        pageSize: Math.min(100, Number(a.limit) || 20),
      });

      return {
        total: res.total,
        transactions: res.rows.map((t: any) => ({
          transCode: t.transCode,
          type: TRANSACTION_TYPES[t.type]?.label || t.type,
          reason: REASON_CODES[t.reasonCode]?.label || t.reasonCode,
          date: fmtDate(t.createdAt),
          fromWarehouse: t.sourceWarehouse?.name || null,
          toWarehouse: t.targetWarehouse?.name || null,
          totalValue: Number(t.totalValue || 0),
          items: t.items.map((i: any) => ({
            itemCode: i.item?.itemCode,
            name: i.item?.name,
            quantity: i.quantity,
            unit: i.item?.unit,
          })),
        })),
      };
    },
  },
  {
    name: 'find_document',
    module: 'inventory',
    title: 'Tra sổ chứng từ',
    description:
      'Tra mọi loại chứng từ ở một chỗ: báo giá, đơn hàng, phiếu thu chi, trả hàng, đặt hàng NCC, phiếu kho, kiểm kê, phiếu sự cố. Tìm theo mã chứng từ hoặc tên đối tác.',
    permissionsAny: ['MENU_REPORTS', 'MENU_EQUIPMENT', 'MENU_SPARE_PARTS', 'MENU_CUSTOMERS'],
    inputSchema: {
      type: 'object',
      properties: {
        search: str('Mã chứng từ hoặc tên khách / nhà cung cấp'),
        kind: str(`Loại chứng từ: ${Object.keys(DOCUMENT_KINDS).join(', ')}`),
        from: str('Từ ngày'),
        to: str('Đến ngày'),
        limit: num('Số chứng từ tối đa trả về (mặc định 20)'),
      },
    },
    handler: async (args, identity) => {
      const a = args as { search?: string; kind?: string; from?: string; to?: string; limit?: number };

      // Sổ chứng từ gộp cả tiền của khách lẫn phiếu kho. Người chỉ có quyền kho
      // không được đọc báo giá, đơn hàng hay phiếu thu chi của khách.
      const allowed = allowedDocumentKinds(identity);
      if (allowed.length === 0) {
        throw new Error('Tài khoản đại diện không có quyền xem loại chứng từ nào');
      }
      if (a.kind && !allowed.includes(a.kind)) {
        throw new Error(`Tài khoản đại diện không có quyền xem loại chứng từ "${DOCUMENT_KINDS[a.kind]?.label || a.kind}"`);
      }

      const res = await listDocuments({
        search: a.search,
        kind: a.kind && DOCUMENT_KINDS[a.kind] ? a.kind : undefined,
        from: parseDateInput(a.from) || undefined,
        to: parseDateInput(a.to) || undefined,
        // Lấy dư rồi mới lọc quyền, để sau khi lọc vẫn đủ số dòng yêu cầu
        pageSize: Math.min(200, (Number(a.limit) || 20) * 3),
      });

      const rows = res.rows
        .filter((d) => allowed.includes(d.kind))
        .slice(0, Math.min(100, Number(a.limit) || 20));

      return {
        total: rows.length,
        /** Loại chứng từ đã bị ẩn vì thiếu quyền — nói rõ thay vì im lặng bỏ bớt. */
        hiddenKinds: Object.keys(DOCUMENT_KINDS)
          .filter((k) => !allowed.includes(k))
          .map((k) => DOCUMENT_KINDS[k].label),
        documents: rows.map((d) => ({
          kind: DOCUMENT_KINDS[d.kind]?.label || d.kind,
          code: d.code,
          date: fmtDate(d.date),
          partner: d.partner,
          value: d.value,
          status: d.status,
          // Mã chứng từ gốc sinh ra nó — lần được cả chuỗi giao dịch
          relatedCode: d.relatedCode,
        })),
      };
    },
  },
  {
    name: 'inventory_profit_report',
    module: 'inventory',
    title: 'Báo cáo nhập – bán – lãi gộp',
    description:
      'Số liệu kho theo kỳ: giá trị nhập, doanh thu bán ra, giá vốn hàng bán, lãi gộp, tỷ suất và hàng xuất không thu tiền.',
    // Giá vốn và lãi gộp là số liệu nội bộ — siết đúng như màn hình báo cáo kho
    permissionsAny: ['FEATURE_SPARE_PARTS_MANAGE', 'FEATURE_REPORT_INVENTORY'],
    inputSchema: {
      type: 'object',
      properties: {
        preset: str('Kỳ báo cáo: MONTH, QUARTER, YEAR hoặc CUSTOM (mặc định MONTH)'),
        anchor: str('Một ngày bất kỳ trong kỳ, dạng DD/MM/YYYY; bỏ trống là hôm nay'),
        from: str('Từ ngày, chỉ dùng khi preset = CUSTOM'),
        to: str('Đến ngày, chỉ dùng khi preset = CUSTOM'),
      },
    },
    handler: async (args) => {
      const a = args as { preset?: string; anchor?: string; from?: string; to?: string };
      const preset = (['MONTH', 'QUARTER', 'YEAR', 'CUSTOM'].includes(String(a.preset))
        ? a.preset
        : 'MONTH') as 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
      const anchorIso = parseDateInput(a.anchor);
      const range = resolveRange(preset, anchorIso ? new Date(`${anchorIso}T12:00:00`) : new Date(), {
        from: parseDateInput(a.from) || undefined,
        to: parseDateInput(a.to) || undefined,
      });
      const report = await getInventoryProfitReport(range);

      const s = report.summary;
      return {
        period: report.range.label,
        from: report.range.from,
        to: report.range.to,
        inValue: s.inValue,
        revenue: s.revenue,
        cogs: s.cogs,
        grossProfit: s.grossProfit,
        marginPercent: s.marginPercent,
        nonSaleCost: s.nonSaleCost,
        netProfit: s.netProfit,
        transactionCount: s.transactionCount,
        // Chỉ trả 10 mặt hàng lãi cao nhất cho gọn khung chat
        topItems: report.items.slice(0, 10).map((i: any) => ({
          itemCode: i.itemCode,
          name: i.name,
          soldQty: i.soldQty,
          revenue: i.revenue,
          grossProfit: i.grossProfit,
          closingStock: i.closingStock,
        })),
      };
    },
  },
];

export const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

/**
 * Người đại diện có đủ quyền cho công cụ này không.
 * Dùng chung cho cả việc LIỆT KÊ và việc GỌI, để không quảng cáo công cụ mà gọi
 * vào lại bị từ chối — trợ lý sẽ cứ thử rồi báo lỗi với người dùng.
 */
export function hasToolPermission(ctx: AuthContext, tool: McpTool): boolean {
  if (tool.permission && !can(ctx, tool.permission)) return false;
  if (tool.permissionsAny?.length) {
    return ctx.isAdmin || tool.permissionsAny.some((p) => can(ctx, p));
  }
  return true;
}

/** Kiểm tra client được phép gọi công cụ này không (scope + chế độ chỉ đọc + quyền của người đại diện). */
export function checkToolAccess(identity: McpIdentity, toolName: string): string | null {
  const tool = TOOLS_BY_NAME.get(toolName);
  if (!tool) return `Không có công cụ "${toolName}"`;
  if (identity.scopes.length > 0 && !identity.scopes.includes(toolName)) {
    return `Công cụ "${toolName}" không nằm trong phạm vi của API key này`;
  }
  if (tool.mutating && identity.readOnly) {
    return `API key này ở chế độ chỉ đọc, không thể gọi "${toolName}"`;
  }
  if (tool.permission && !can(identity.ctx, tool.permission)) {
    return `Tài khoản đại diện (${identity.ctx.fullName}) không có quyền ${tool.permission}`;
  }
  if (tool.permissionsAny?.length) {
    const ok = identity.ctx.isAdmin || tool.permissionsAny.some((p) => can(identity.ctx, p));
    if (!ok) {
      return `Tài khoản đại diện (${identity.ctx.fullName}) cần một trong các quyền: ${tool.permissionsAny.join(', ')}`;
    }
  }
  return null;
}
