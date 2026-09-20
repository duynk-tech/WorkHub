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
import { can } from '@/server/auth/context';
import type { McpIdentity } from './auth';

export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** Ghi dữ liệu → bị chặn với client chế độ chỉ đọc */
  mutating?: boolean;
  /** Quyền bắt buộc của người dùng đại diện */
  permission?: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, identity: McpIdentity) => Promise<unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'search_employees',
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

      const result = await listTasks(identity.ctx, {
        search: a.query, status: a.status ? [a.status] : [],
        assigneeId, overdue: a.overdue, onlyMine: a.onlyMine,
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

      const task = await prisma.task.create({
        data: {
          code: await generateTaskCode(),
          title: a.title,
          description: a.description ?? null,
          creatorId: identity.ctx.employeeId,
          assigneeId,
          departmentId: identity.ctx.departmentId,
          priority: (a.priority ?? 'MEDIUM') as never,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
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

      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: a.status as never,
          progress: a.progress ?? (a.status === 'DONE' ? 100 : task.progress),
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

      const result = await listLeaveRequests(identity.ctx, {
        status: a.status, from: a.from, to: a.to, employeeId,
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
    title: 'Ai đang nghỉ',
    description: 'Danh sách nhân sự nghỉ phép trong một ngày cụ thể (mặc định hôm nay).',
    permission: 'MENU_LEAVES',
    inputSchema: { type: 'object', properties: { date: str('Ngày YYYY-MM-DD, mặc định hôm nay') } },
    handler: async (args, identity) => {
      const a = args as { date?: string };
      const date = dateOnly(a.date ? new Date(a.date) : new Date());
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

      const preview = await calculateLeaveDays(identity.ctx.employeeId, new Date(a.startDate), new Date(a.endDate), 'FULL_DAY');

      const { submitLeaveAction } = await import('@/server/modules/leave/actions');
      const result = await submitLeaveAction(null, {
        leaveTypeId: leaveType.id, startDate: a.startDate, endDate: a.endDate,
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
];

export const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

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
  return null;
}
