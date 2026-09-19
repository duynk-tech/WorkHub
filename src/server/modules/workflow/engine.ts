import type { PrismaClient, WorkflowEntityType, WorkflowStep } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Dữ liệu đơn dùng để đánh giá điều kiện bước duyệt. */
export type WorkflowContext = Record<string, string | number | boolean | null>;

export interface StepCondition {
  field: string;
  op: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'in' | 'not_in' | 'contains';
  value: string | number | boolean | (string | number)[];
}

/** Đánh giá điều kiện chạy của một bước. Không có điều kiện = luôn chạy. */
export function evaluateCondition(condition: unknown, ctx: WorkflowContext): boolean {
  if (!condition || typeof condition !== 'object') return true;
  const c = condition as Partial<StepCondition>;
  if (!c.field || !c.op) return true;

  const actual = ctx[c.field];
  const expected = c.value;

  switch (c.op) {
    case '>': return Number(actual) > Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case '==': return String(actual) === String(expected);
    case '!=': return String(actual) !== String(expected);
    case 'in': return Array.isArray(expected) && expected.map(String).includes(String(actual));
    case 'not_in': return Array.isArray(expected) && !expected.map(String).includes(String(actual));
    case 'contains': return String(actual ?? '').includes(String(expected));
    default: return true;
  }
}

export function describeCondition(condition: unknown): string | null {
  if (!condition || typeof condition !== 'object') return null;
  const c = condition as Partial<StepCondition>;
  if (!c.field || !c.op) return null;

  const fieldLabels: Record<string, string> = {
    totalDays: 'Số ngày nghỉ',
    leaveTypeCode: 'Loại nghỉ phép',
    departmentId: 'Phòng ban',
    isPaid: 'Nghỉ có lương',
  };
  const opLabels: Record<string, string> = {
    '>': 'lớn hơn', '>=': 'từ', '<': 'nhỏ hơn', '<=': 'không quá',
    '==': 'bằng', '!=': 'khác', in: 'thuộc', not_in: 'không thuộc', contains: 'chứa',
  };
  const value = Array.isArray(c.value) ? c.value.join(', ') : String(c.value);
  return `${fieldLabels[c.field] ?? c.field} ${opLabels[c.op] ?? c.op} ${value}`;
}

/** Biến loại người duyệt thành danh sách nhân sự cụ thể. */
export async function resolveApprovers(
  step: Pick<WorkflowStep, 'approverType' | 'roleId' | 'positionRank' | 'specificEmployeeId' | 'chainLevel'>,
  requesterId: number,
  db: Db = prisma,
): Promise<number[]> {
  const requester = await db.employee.findUnique({
    where: { id: requesterId },
    select: { id: true, managerId: true, departmentId: true, department: { select: { id: true, managerId: true, parentId: true, path: true } } },
  });
  if (!requester) return [];

  switch (step.approverType) {
    case 'DIRECT_MANAGER':
      return requester.managerId ? [requester.managerId] : [];

    case 'MANAGER_CHAIN_LEVEL': {
      const levels = Math.max(1, step.chainLevel ?? 1);
      let cursor: number | null = requester.managerId;
      const seen = new Set<number>([requesterId]);
      for (let i = 1; i < levels && cursor; i++) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const next: { managerId: number | null } | null = await db.employee.findUnique({
          where: { id: cursor }, select: { managerId: true },
        });
        cursor = next?.managerId ?? null;
      }
      return cursor ? [cursor] : [];
    }

    case 'DEPT_HEAD': {
      const head = requester.department?.managerId;
      // Trưởng đơn vị trùng người nộp → leo lên đơn vị cha
      if (head && head !== requesterId) return [head];
      if (requester.department?.parentId) {
        const parent = await db.department.findUnique({ where: { id: requester.department.parentId }, select: { managerId: true } });
        return parent?.managerId ? [parent.managerId] : [];
      }
      return [];
    }

    case 'PARENT_DEPT_HEAD': {
      if (!requester.department?.parentId) return [];
      const parent = await db.department.findUnique({ where: { id: requester.department.parentId }, select: { managerId: true } });
      return parent?.managerId ? [parent.managerId] : [];
    }

    case 'ROLE': {
      if (!step.roleId) return [];
      const users = await db.user.findMany({
        where: { isActive: true, roles: { some: { roleId: step.roleId } } },
        select: { employeeId: true },
      });
      return users.map((u) => u.employeeId);
    }

    case 'POSITION_RANK': {
      const rank = step.positionRank ?? 0;
      const employees = await db.employee.findMany({
        where: { status: 'ACTIVE', position: { rankLevel: { gte: rank } } },
        select: { id: true },
      });
      return employees.map((e) => e.id);
    }

    case 'SPECIFIC_USER':
      return step.specificEmployeeId ? [step.specificEmployeeId] : [];

    case 'HR': {
      const hrRole = await db.role.findUnique({ where: { code: 'HR' } });
      if (!hrRole) return [];
      const users = await db.user.findMany({
        where: { isActive: true, roles: { some: { roleId: hrRole.id } } },
        select: { employeeId: true },
      });
      return users.map((u) => u.employeeId);
    }

    default:
      return [];
  }
}

/** Chọn quy trình phù hợp: ưu tiên quy trình chỉ định, sau đó theo điều kiện áp dụng, cuối cùng là mặc định. */
export async function pickDefinition(
  entityType: WorkflowEntityType,
  ctx: WorkflowContext,
  preferredId?: number | null,
  db: Db = prisma,
) {
  if (preferredId) {
    const preferred = await db.workflowDefinition.findFirst({
      where: { id: preferredId, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (preferred) return preferred;
  }

  const candidates = await db.workflowDefinition.findMany({
    where: { entityType, isActive: true },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
    orderBy: [{ isDefault: 'asc' }, { version: 'desc' }],
  });

  for (const def of candidates) {
    const applies = def.appliesToJson as { departmentIds?: number[]; leaveTypeCodes?: string[] } | null;
    if (!applies) continue;
    const deptOk = !applies.departmentIds?.length || applies.departmentIds.includes(Number(ctx.departmentId));
    const typeOk = !applies.leaveTypeCodes?.length || applies.leaveTypeCodes.includes(String(ctx.leaveTypeCode));
    if (deptOk && typeOk) return def;
  }

  return candidates.find((d) => d.isDefault) ?? candidates[0] ?? null;
}

export interface StartInput {
  entityType: WorkflowEntityType;
  entityId: number;
  requesterId: number;
  context: WorkflowContext;
  definitionId?: number | null;
}

/**
 * Khởi tạo quy trình và mở bước duyệt đầu tiên có hiệu lực.
 * Trả về instance kèm trạng thái — nếu mọi bước đều bị bỏ qua thì tự duyệt luôn.
 */
export async function startWorkflow(input: StartInput, db: Db = prisma) {
  const def = await pickDefinition(input.entityType, input.context, input.definitionId, db);
  if (!def) throw new Error('Chưa có quy trình duyệt nào được cấu hình cho loại đơn này');
  if (def.steps.length === 0) throw new Error(`Quy trình "${def.name}" chưa có bước duyệt nào`);

  const instance = await db.workflowInstance.create({
    data: {
      definitionId: def.id,
      entityType: input.entityType,
      entityId: input.entityId,
      requesterId: input.requesterId,
      status: 'RUNNING',
      currentStepOrder: 0,
      contextJson: input.context as never,
    },
  });

  await db.workflowLog.create({
    data: { instanceId: instance.id, actorId: input.requesterId, action: 'SUBMIT', toStatus: 'RUNNING', note: `Áp dụng quy trình: ${def.name}` },
  });

  return openNextStep(instance.id, db);
}

/** Mở bước kế tiếp có hiệu lực. Bỏ qua bước không thỏa điều kiện hoặc không tìm được người duyệt. */
export async function openNextStep(instanceId: number, db: Db = prisma) {
  const instance = await db.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { definition: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
  });
  if (!instance) throw new Error('Không tìm thấy phiên duyệt');
  if (instance.status !== 'RUNNING') return instance;

  const ctx = (instance.contextJson ?? {}) as WorkflowContext;
  const nextSteps = instance.definition.steps.filter((s) => s.stepOrder > instance.currentStepOrder);

  for (const step of nextSteps) {
    if (!evaluateCondition(step.conditionJson, ctx)) {
      await db.workflowLog.create({
        data: { instanceId, action: 'SKIP_STEP', note: `Bỏ qua "${step.name}" — không thỏa điều kiện` },
      });
      continue;
    }

    let approverIds = await resolveApprovers(step, instance.requesterId, db);
    if (step.skipIfSameAsRequester) approverIds = approverIds.filter((id) => id !== instance.requesterId);
    approverIds = Array.from(new Set(approverIds));

    if (approverIds.length === 0) {
      if (step.skipIfNoApprover) {
        await db.workflowLog.create({
          data: { instanceId, action: 'SKIP_STEP', note: `Bỏ qua "${step.name}" — không xác định được người duyệt` },
        });
        continue;
      }
      throw new Error(`Bước "${step.name}" không xác định được người duyệt. Hãy kiểm tra cấu hình quản lý/trưởng đơn vị.`);
    }

    const dueAt = step.slaHours ? new Date(Date.now() + step.slaHours * 3600000) : null;

    await db.approvalTask.createMany({
      data: approverIds.map((approverId) => ({
        instanceId, stepId: step.id, stepOrder: step.stepOrder, approverId, dueAt, status: 'PENDING' as const,
      })),
    });

    const updated = await db.workflowInstance.update({
      where: { id: instanceId },
      data: { currentStepOrder: step.stepOrder },
    });

    await db.workflowLog.create({
      data: { instanceId, action: 'OPEN_STEP', note: `Mở bước "${step.name}" cho ${approverIds.length} người duyệt` },
    });

    return { ...updated, openedStep: step, approverIds };
  }

  // Hết bước → duyệt xong
  return finishWorkflow(instanceId, 'APPROVED', db);
}

export async function finishWorkflow(instanceId: number, status: 'APPROVED' | 'REJECTED' | 'CANCELLED', db: Db = prisma) {
  const instance = await db.workflowInstance.update({
    where: { id: instanceId },
    data: { status, finishedAt: new Date() },
  });

  await db.workflowLog.create({
    data: { instanceId, action: 'FINISH', toStatus: status },
  });

  return instance;
}

export interface ActInput {
  approvalTaskId: number;
  actorEmployeeId: number;
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
}

export interface ActResult {
  ok: boolean;
  message: string;
  instanceStatus?: string;
  entityType?: WorkflowEntityType;
  entityId?: number;
}

/**
 * Ghi nhận quyết định của một người duyệt và chuyển bước nếu đủ điều kiện.
 * PARALLEL_ALL: chờ tất cả duyệt. PARALLEL_ANY / SEQUENTIAL: một người duyệt là qua bước.
 */
export async function actOnApproval(input: ActInput, db: Db = prisma): Promise<ActResult> {
  const task = await db.approvalTask.findUnique({
    where: { id: input.approvalTaskId },
    include: { step: true, instance: true },
  });

  if (!task) return { ok: false, message: 'Không tìm thấy phiếu duyệt' };
  if (task.approverId !== input.actorEmployeeId) return { ok: false, message: 'Bạn không phải người duyệt của bước này' };
  if (task.status !== 'PENDING') return { ok: false, message: 'Phiếu duyệt này đã được xử lý' };
  if (task.instance.status !== 'RUNNING') return { ok: false, message: 'Đơn đã kết thúc quy trình duyệt' };

  await db.approvalTask.update({
    where: { id: task.id },
    data: {
      status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      comment: input.comment ?? null,
      actedAt: new Date(),
    },
  });

  await db.workflowLog.create({
    data: {
      instanceId: task.instanceId, actorId: input.actorEmployeeId,
      action: input.decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
      note: input.comment ?? null,
    },
  });

  // Từ chối → dừng toàn bộ quy trình
  if (input.decision === 'REJECT') {
    await db.approvalTask.updateMany({
      where: { instanceId: task.instanceId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    await finishWorkflow(task.instanceId, 'REJECTED', db);
    return {
      ok: true, message: 'Đã từ chối đơn', instanceStatus: 'REJECTED',
      entityType: task.instance.entityType, entityId: task.instance.entityId,
    };
  }

  const siblings = await db.approvalTask.findMany({
    where: { instanceId: task.instanceId, stepOrder: task.stepOrder },
  });
  const stillPending = siblings.filter((s) => s.status === 'PENDING');

  if (task.step.mode === 'PARALLEL_ALL' && stillPending.length > 0) {
    return {
      ok: true,
      message: `Đã duyệt. Còn ${stillPending.length} người duyệt khác ở bước này.`,
      instanceStatus: 'RUNNING',
      entityType: task.instance.entityType, entityId: task.instance.entityId,
    };
  }

  // Các phiếu còn lại cùng bước không cần xử lý nữa
  if (stillPending.length > 0) {
    await db.approvalTask.updateMany({
      where: { instanceId: task.instanceId, stepOrder: task.stepOrder, status: 'PENDING' },
      data: { status: 'SKIPPED' },
    });
  }

  const result = await openNextStep(task.instanceId, db);
  const instanceStatus = 'status' in result ? result.status : 'RUNNING';

  return {
    ok: true,
    message: instanceStatus === 'APPROVED' ? 'Đã duyệt — đơn hoàn tất quy trình' : 'Đã duyệt — chuyển sang bước tiếp theo',
    instanceStatus,
    entityType: task.instance.entityType, entityId: task.instance.entityId,
  };
}

export async function cancelWorkflow(instanceId: number, actorEmployeeId: number, note?: string, db: Db = prisma) {
  await db.approvalTask.updateMany({ where: { instanceId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  await db.workflowLog.create({ data: { instanceId, actorId: actorEmployeeId, action: 'CANCEL', note: note ?? null } });
  return finishWorkflow(instanceId, 'CANCELLED', db);
}

export interface SimulatedStep {
  stepOrder: number;
  name: string;
  approverTypeLabel: string;
  condition: string | null;
  willRun: boolean;
  skipReason: string | null;
  approvers: { id: number; fullName: string; positionName: string | null }[];
  mode: string;
  slaHours: number | null;
}

/** Mô phỏng chuỗi người duyệt trước khi lưu cấu hình — tránh cấu hình sai gây kẹt đơn. */
export async function simulateWorkflow(
  definitionId: number,
  requesterId: number,
  ctx: WorkflowContext,
): Promise<SimulatedStep[]> {
  const def = await prisma.workflowDefinition.findUnique({
    where: { id: definitionId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });
  if (!def) return [];

  const { APPROVER_TYPE, STEP_MODE } = await import('@/lib/enums');
  const out: SimulatedStep[] = [];

  for (const step of def.steps) {
    const conditionOk = evaluateCondition(step.conditionJson, ctx);
    let approverIds = await resolveApprovers(step, requesterId);
    if (step.skipIfSameAsRequester) approverIds = approverIds.filter((id) => id !== requesterId);
    approverIds = Array.from(new Set(approverIds));

    const approvers = approverIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, fullName: true, position: { select: { name: true } } },
        })
      : [];

    const willRun = conditionOk && approverIds.length > 0;
    const skipReason = !conditionOk
      ? 'Không thỏa điều kiện với dữ liệu mô phỏng'
      : approverIds.length === 0
        ? (step.skipIfNoApprover ? 'Không tìm được người duyệt — bước sẽ bị bỏ qua' : 'Không tìm được người duyệt — đơn sẽ báo lỗi khi nộp')
        : null;

    out.push({
      stepOrder: step.stepOrder,
      name: step.name,
      approverTypeLabel: APPROVER_TYPE[step.approverType]?.label ?? step.approverType,
      condition: describeCondition(step.conditionJson),
      willRun,
      skipReason,
      approvers: approvers.map((a) => ({ id: a.id, fullName: a.fullName, positionName: a.position?.name ?? null })),
      mode: STEP_MODE[step.mode] ?? step.mode,
      slaHours: step.slaHours,
    });
  }

  return out;
}
