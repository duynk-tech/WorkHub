'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/auth/context';
import { simulateWorkflow, type WorkflowContext } from './engine';

export interface Result { ok: boolean; message: string; id?: number }

const stepSchema = z.object({
  stepOrder: z.number().int().min(1),
  name: z.string().min(1, 'Nhập tên bước duyệt'),
  approverType: z.enum([
    'DIRECT_MANAGER', 'MANAGER_CHAIN_LEVEL', 'DEPT_HEAD', 'PARENT_DEPT_HEAD',
    'ROLE', 'POSITION_RANK', 'SPECIFIC_USER', 'HR',
  ]),
  roleId: z.number().int().nullable(),
  positionRank: z.number().int().nullable(),
  specificEmployeeId: z.number().int().nullable(),
  chainLevel: z.number().int().nullable(),
  mode: z.enum(['SEQUENTIAL', 'PARALLEL_ALL', 'PARALLEL_ANY']),
  conditionField: z.string().nullable().or(z.literal('')),
  conditionOp: z.string().nullable().or(z.literal('')),
  conditionValue: z.string().nullable().or(z.literal('')),
  slaHours: z.number().int().nullable(),
  allowDelegate: z.boolean(),
  skipIfSameAsRequester: z.boolean(),
  skipIfNoApprover: z.boolean(),
});

const definitionSchema = z.object({
  code: z.string().min(1, 'Nhập mã quy trình').max(64),
  name: z.string().min(1, 'Nhập tên quy trình').max(191),
  description: z.string().nullable().or(z.literal('')),
  entityType: z.enum(['LEAVE', 'OVERTIME', 'ATTENDANCE_ADJUST', 'TASK_CLOSE']),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  appliesDepartmentIds: z.array(z.number().int()).default([]),
  appliesLeaveTypeCodes: z.array(z.string()).default([]),
  steps: z.array(stepSchema).min(1, 'Quy trình phải có ít nhất một bước duyệt'),
});

function buildCondition(step: z.infer<typeof stepSchema>) {
  if (!step.conditionField || !step.conditionOp) return null;
  const raw = step.conditionValue ?? '';
  const numeric = Number(raw);
  const value = raw !== '' && !Number.isNaN(numeric) ? numeric
    : raw.includes(',') ? raw.split(',').map((s) => s.trim())
    : raw;
  return { field: step.conditionField, op: step.conditionOp, value };
}

export async function saveWorkflowAction(id: number | null, raw: unknown): Promise<Result> {
  const ctx = await requirePermission('FEATURE_WORKFLOW_MANAGE');
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  const d = parsed.data;

  const duplicate = await prisma.workflowDefinition.findFirst({ where: { code: d.code, ...(id ? { id: { not: id } } : {}) } });
  if (duplicate) return { ok: false, message: `Mã quy trình "${d.code}" đã tồn tại` };

  // Kiểm tra cấu hình bước trước khi lưu — tránh quy trình không có người duyệt
  for (const step of d.steps) {
    if (step.approverType === 'ROLE' && !step.roleId) return { ok: false, message: `Bước "${step.name}": chưa chọn vai trò duyệt` };
    if (step.approverType === 'SPECIFIC_USER' && !step.specificEmployeeId) return { ok: false, message: `Bước "${step.name}": chưa chọn người duyệt cụ thể` };
    if (step.approverType === 'POSITION_RANK' && step.positionRank == null) return { ok: false, message: `Bước "${step.name}": chưa chọn cấp bậc chức danh` };
  }

  const appliesToJson = (d.appliesDepartmentIds.length || d.appliesLeaveTypeCodes.length)
    ? { departmentIds: d.appliesDepartmentIds, leaveTypeCodes: d.appliesLeaveTypeCodes }
    : null;

  const saved = await prisma.$transaction(async (tx) => {
    const def = id
      ? await tx.workflowDefinition.update({
          where: { id },
          data: {
            code: d.code, name: d.name, description: d.description || null, entityType: d.entityType,
            isActive: d.isActive, isDefault: d.isDefault, appliesToJson: appliesToJson as never,
          },
        })
      : await tx.workflowDefinition.create({
          data: {
            code: d.code, name: d.name, description: d.description || null, entityType: d.entityType,
            isActive: d.isActive, isDefault: d.isDefault, appliesToJson: appliesToJson as never,
          },
        });

    if (d.isDefault) {
      await tx.workflowDefinition.updateMany({
        where: { entityType: d.entityType, id: { not: def.id } },
        data: { isDefault: false },
      });
    }

    await tx.workflowStep.deleteMany({ where: { definitionId: def.id } });
    for (const [i, step] of d.steps.entries()) {
      await tx.workflowStep.create({
        data: {
          definitionId: def.id,
          stepOrder: i + 1,
          name: step.name,
          approverType: step.approverType,
          roleId: step.approverType === 'ROLE' ? step.roleId : null,
          positionRank: step.approverType === 'POSITION_RANK' ? step.positionRank : null,
          specificEmployeeId: step.approverType === 'SPECIFIC_USER' ? step.specificEmployeeId : null,
          chainLevel: step.approverType === 'MANAGER_CHAIN_LEVEL' ? step.chainLevel : null,
          mode: step.mode,
          conditionJson: buildCondition(step) as never,
          slaHours: step.slaHours,
          allowDelegate: step.allowDelegate,
          skipIfSameAsRequester: step.skipIfSameAsRequester,
          skipIfNoApprover: step.skipIfNoApprover,
        },
      });
    }

    return def;
  });

  await prisma.auditLog.create({
    data: {
      actorId: ctx.userId, entityType: 'WorkflowDefinition', entityId: String(saved.id),
      action: id ? 'UPDATE' : 'CREATE', diffJson: { code: d.code, steps: d.steps.length } as never,
    },
  });

  revalidatePath('/settings/workflows');
  return { ok: true, message: id ? 'Đã cập nhật quy trình duyệt' : 'Đã tạo quy trình duyệt', id: saved.id };
}

export async function deleteWorkflowAction(id: number): Promise<Result> {
  const ctx = await requirePermission('FEATURE_WORKFLOW_MANAGE');
  const [instanceCount, leaveTypeCount] = await Promise.all([
    prisma.workflowInstance.count({ where: { definitionId: id, status: 'RUNNING' } }),
    prisma.leaveType.count({ where: { workflowDefinitionId: id } }),
  ]);
  if (instanceCount > 0) return { ok: false, message: `Còn ${instanceCount} đơn đang chạy theo quy trình này` };
  if (leaveTypeCount > 0) return { ok: false, message: `Còn ${leaveTypeCount} loại nghỉ phép đang dùng quy trình này` };

  await prisma.workflowDefinition.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'WorkflowDefinition', entityId: String(id), action: 'DELETE' },
  });

  revalidatePath('/settings/workflows');
  return { ok: true, message: 'Đã xóa quy trình duyệt' };
}

export async function simulateWorkflowAction(definitionId: number, requesterId: number, context: WorkflowContext) {
  await requirePermission('FEATURE_WORKFLOW_MANAGE');
  try {
    return { ok: true as const, steps: await simulateWorkflow(definitionId, requesterId, context) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : 'Mô phỏng thất bại' };
  }
}

/** Gán quy trình cho một loại nghỉ phép. */
export async function assignWorkflowToLeaveTypeAction(leaveTypeId: number, definitionId: number | null): Promise<Result> {
  await requirePermission('FEATURE_WORKFLOW_MANAGE');
  await prisma.leaveType.update({ where: { id: leaveTypeId }, data: { workflowDefinitionId: definitionId } });
  revalidatePath('/settings/workflows');
  return { ok: true, message: 'Đã gán quy trình cho loại nghỉ phép' };
}
