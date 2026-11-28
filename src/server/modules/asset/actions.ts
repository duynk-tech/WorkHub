'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/server/auth/context';
import { generateAssetCode } from './service';
import { writeAudit } from '@/server/lib/audit';

export interface Result {
  ok: boolean;
  message: string;
  id?: number;
}

const assetSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên thiết bị').max(191),
  assetCode: z.string().optional().nullable(),
  category: z.string().min(1, 'Chọn loại thiết bị'),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  status: z.string().default('IN_STOCK'),
  purchaseDate: z.string().optional().nullable(),
  purchasePrice: z.number().optional().nullable(),
  supplier: z.string().optional().nullable(),
  warrantyMonths: z.number().int().optional().nullable(),
  warrantyExpiresAt: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  specs: z.object({
    cpu: z.string().optional().nullable(),
    ram: z.string().optional().nullable(),
    storage: z.string().optional().nullable(),
    gpu: z.string().optional().nullable(),
    os: z.string().optional().nullable(),
    screen: z.string().optional().nullable(),
    other: z.string().optional().nullable(),
  }).optional().nullable(),
});

export async function saveAssetAction(id: number | null, raw: unknown): Promise<Result> {
  const ctx = await requirePermission(id ? 'FEATURE_ASSET_EDIT' : 'FEATURE_ASSET_CREATE');
  const parsed = assetSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  }
  const d = parsed.data;

  try {
    let code = d.assetCode?.trim();
    if (!code) {
      code = id ? (await prisma.asset.findUnique({ where: { id } }))?.assetCode ?? (await generateAssetCode()) : await generateAssetCode();
    }

    // Kiểm tra trùng mã code nếu đổi mã
    if (code) {
      const duplicateCode = await prisma.asset.findFirst({
        where: { assetCode: code, ...(id ? { id: { not: id } } : {}) },
      });
      if (duplicateCode) {
        return { ok: false, message: `Mã tài sản "${code}" đã được sử dụng` };
      }
    }

    // Kiểm tra trùng Serial Number nếu có
    if (d.serialNumber?.trim()) {
      const duplicateSerial = await prisma.asset.findFirst({
        where: { serialNumber: d.serialNumber.trim(), ...(id ? { id: { not: id } } : {}) },
      });
      if (duplicateSerial) {
        return { ok: false, message: `Số sê-ri "${d.serialNumber}" đã tồn tại trên thiết bị khác` };
      }
    }

    let warrantyExpiresAt: Date | null = d.warrantyExpiresAt ? new Date(d.warrantyExpiresAt) : null;
    if (!warrantyExpiresAt && d.purchaseDate && d.warrantyMonths && d.warrantyMonths > 0) {
      const pDate = new Date(d.purchaseDate);
      pDate.setMonth(pDate.getMonth() + d.warrantyMonths);
      warrantyExpiresAt = pDate;
    }

    const payload = {
      name: d.name,
      assetCode: code,
      category: d.category,
      brand: d.brand?.trim() || null,
      model: d.model?.trim() || null,
      serialNumber: d.serialNumber?.trim() || null,
      status: d.status,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
      purchasePrice: d.purchasePrice != null ? d.purchasePrice : null,
      supplier: d.supplier?.trim() || null,
      warrantyMonths: d.warrantyMonths != null ? d.warrantyMonths : null,
      warrantyExpiresAt,
      location: d.location?.trim() || null,
      notes: d.notes?.trim() || null,
      specs: (d.specs ?? {}) as never,
    };

    if (id) {
      const asset = await prisma.asset.update({
        where: { id },
        data: payload,
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(id),
          action: 'UPDATE',
          diff: payload as never,
        });

      revalidatePath('/assets');
      revalidatePath(`/assets/${id}`);
      return { ok: true, message: `Đã cập nhật thiết bị ${asset.assetCode}`, id: asset.id };
    }

    const asset = await prisma.asset.create({
      data: payload,
    });

    await writeAudit({
        actorId: ctx.userId,
        entityType: 'Asset',
        entityId: String(asset.id),
        action: 'CREATE',
        diff: payload as never,
      });

    revalidatePath('/assets');
    return { ok: true, message: `Đã tạo thiết bị ${asset.assetCode}`, id: asset.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi lưu thiết bị' };
  }
}

/** Cấp phát thiết bị cho nhân sự / phòng ban */
export async function assignAssetAction(
  assetId: number,
  data: {
    employeeId?: number | null;
    departmentId?: number | null;
    conditionOnAssign?: string;
    handoverNote?: string;
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_ASSIGN');
  if (!data.employeeId && !data.departmentId) {
    return { ok: false, message: 'Vui lòng chọn nhân sự hoặc phòng ban nhận bàn giao' };
  }

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };
  if (asset.status === 'LIQUIDATED') return { ok: false, message: 'Thiết bị đã thanh lý, không thể cấp phát' };

  try {
    await prisma.$transaction(async (tx) => {
      // Đóng bản ghi bàn giao cũ nếu có
      if (asset.currentAssigneeId) {
        await tx.assetAssignment.updateMany({
          where: { assetId, returnedDate: null },
          data: { returnedDate: new Date(), conditionOnReturn: 'Bàn giao chuyển giao cho nhân sự mới' },
        });
      }

      // Tạo bản ghi bàn giao mới
      await tx.assetAssignment.create({
        data: {
          assetId,
          employeeId: data.employeeId || null,
          departmentId: data.departmentId || null,
          type: asset.currentAssigneeId ? 'TRANSFER' : 'ASSIGN',
          assignedDate: new Date(),
          conditionOnAssign: data.conditionOnAssign?.trim() || 'Tốt',
          handoverById: ctx.employeeId,
          handoverNote: data.handoverNote?.trim() || null,
        },
      });

      // Cập nhật trạng thái máy
      await tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'IN_USE',
          currentAssigneeId: data.employeeId || null,
          currentDepartmentId: data.departmentId || null,
          assignedAt: new Date(),
        },
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(assetId),
          action: 'ASSIGN',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Đã cấp phát thiết bị ${asset.assetCode} thành công` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi cấp phát thiết bị' };
  }
}

/** Thu hồi thiết bị về kho */
export async function revokeAssetAction(
  assetId: number,
  data: {
    conditionOnReturn?: string;
    returnNote?: string;
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_ASSIGN');
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };
  if (!asset.currentAssigneeId && !asset.currentDepartmentId) {
    return { ok: false, message: 'Thiết bị đang ở trong kho, không có người đang giữ' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Đóng bản ghi bàn giao hiện tại
      await tx.assetAssignment.updateMany({
        where: { assetId, returnedDate: null },
        data: {
          returnedDate: new Date(),
          conditionOnReturn: data.conditionOnReturn?.trim() || 'Bình thường',
        },
      });

      // Tạo bản ghi log thu hồi
      await tx.assetAssignment.create({
        data: {
          assetId,
          employeeId: asset.currentAssigneeId,
          departmentId: asset.currentDepartmentId,
          type: 'REVOKE',
          assignedDate: new Date(),
          returnedDate: new Date(),
          conditionOnReturn: data.conditionOnReturn?.trim() || 'Bình thường',
          handoverById: ctx.employeeId,
          handoverNote: data.returnNote?.trim() || 'Thu hồi thiết bị về kho',
        },
      });

      // Cập nhật trạng thái máy về trong kho
      await tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'IN_STOCK',
          currentAssigneeId: null,
          currentDepartmentId: null,
          assignedAt: null,
        },
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(assetId),
          action: 'REVOKE',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Đã thu hồi thiết bị ${asset.assetCode} về kho` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi thu hồi thiết bị' };
  }
}

/** Ghi nhận nâng cấp linh kiện (ví dụ nâng RAM, thay SSD...) và cập nhật trực tiếp specs */
export async function addUpgradeAction(
  assetId: number,
  data: {
    component: string;
    action: string;
    beforeSpec?: string;
    afterSpec: string;
    cost?: number;
    provider?: string;
    notes?: string;
    upgradeDate?: string;
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_UPGRADE');
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Tạo bản ghi nâng cấp
      await tx.assetUpgrade.create({
        data: {
          assetId,
          component: data.component,
          action: data.action,
          beforeSpec: data.beforeSpec?.trim() || null,
          afterSpec: data.afterSpec.trim(),
          cost: data.cost != null ? data.cost : null,
          provider: data.provider?.trim() || null,
          notes: data.notes?.trim() || null,
          upgradeDate: data.upgradeDate ? new Date(data.upgradeDate) : new Date(),
          performedById: ctx.employeeId,
        },
      });

      // 2. Tự động cập nhật trực tiếp vào trường specs của Asset nếu là RAM, STORAGE, GPU...
      const currentSpecs = ((asset.specs as Record<string, string>) ?? {}) as Record<string, string>;
      const compKey = data.component.toLowerCase();
      if (['ram', 'storage', 'gpu', 'os', 'screen'].includes(compKey)) {
        currentSpecs[compKey] = data.afterSpec.trim();
        await tx.asset.update({
          where: { id: assetId },
          data: { specs: currentSpecs as never },
        });
      }

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(assetId),
          action: 'UPGRADE',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Đã ghi nhận nâng cấp ${data.component} cho thiết bị ${asset.assetCode}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi ghi nhận nâng cấp' };
  }
}

/** Gửi máy đi bảo hành hoặc sửa chữa */
export async function addMaintenanceAction(
  assetId: number,
  data: {
    type: string; // WARRANTY, REPAIR, MAINTENANCE
    title: string;
    description?: string;
    provider?: string;
    cost?: number;
    startDate: string;
    targetStatus?: 'UNDER_MAINTENANCE' | 'UNDER_WARRANTY';
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_MAINTENANCE');
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.assetMaintenance.create({
        data: {
          assetId,
          type: data.type,
          title: data.title.trim(),
          description: data.description?.trim() || null,
          provider: data.provider?.trim() || null,
          cost: data.cost != null ? data.cost : null,
          startDate: new Date(data.startDate),
          status: 'PENDING',
          performedById: ctx.employeeId,
        },
      });

      const nextStatus = data.targetStatus ?? (data.type === 'WARRANTY' ? 'UNDER_WARRANTY' : 'UNDER_MAINTENANCE');
      await tx.asset.update({
        where: { id: assetId },
        data: { status: nextStatus },
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(assetId),
          action: 'MAINTENANCE_START',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Đã ghi nhận sự cố / gửi bảo hành cho thiết bị ${asset.assetCode}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi gửi bảo hành / sửa chữa' };
  }
}

/** Hoàn tất bảo hành / sửa chữa */
export async function completeMaintenanceAction(
  maintenanceId: number,
  data: {
    completedDate: string;
    cost?: number;
    result: string;
    returnToStatus: 'IN_USE' | 'IN_STOCK';
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_MAINTENANCE');
  const record = await prisma.assetMaintenance.findUnique({
    where: { id: maintenanceId },
    include: { asset: true },
  });
  if (!record) return { ok: false, message: 'Không tìm thấy bản ghi sửa chữa' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.assetMaintenance.update({
        where: { id: maintenanceId },
        data: {
          status: 'COMPLETED',
          completedDate: new Date(data.completedDate),
          cost: data.cost != null ? data.cost : record.cost,
          result: data.result.trim(),
        },
      });

      // Nếu máy có người giữ thì đưa về IN_USE, ngược lại về IN_STOCK
      const finalStatus = record.asset.currentAssigneeId ? data.returnToStatus : 'IN_STOCK';
      await tx.asset.update({
        where: { id: record.assetId },
        data: { status: finalStatus },
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(record.assetId),
          action: 'MAINTENANCE_COMPLETE',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${record.assetId}`);
    return { ok: true, message: 'Đã hoàn tất quá trình bảo hành / sửa chữa' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi hoàn tất bảo hành' };
  }
}

/** Thanh lý thiết bị */
export async function liquidateAssetAction(
  assetId: number,
  data: {
    reason: string;
    liquidationType: string;
    recoveredAmount?: number;
    buyer?: string;
    notes?: string;
    liquidationDate?: string;
  },
): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_LIQUIDATE');
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };
  if (asset.status === 'LIQUIDATED') return { ok: false, message: 'Thiết bị đã được thanh lý từ trước' };

  try {
    await prisma.$transaction(async (tx) => {
      // Đóng bàn giao nếu đang có người dùng
      if (asset.currentAssigneeId) {
        await tx.assetAssignment.updateMany({
          where: { assetId, returnedDate: null },
          data: { returnedDate: new Date(), conditionOnReturn: 'Thu hồi để thanh lý máy' },
        });
      }

      // Tạo bản ghi thanh lý
      await tx.assetLiquidation.create({
        data: {
          assetId,
          reason: data.reason.trim(),
          liquidationType: data.liquidationType,
          recoveredAmount: data.recoveredAmount != null ? data.recoveredAmount : null,
          buyer: data.buyer?.trim() || null,
          notes: data.notes?.trim() || null,
          liquidationDate: data.liquidationDate ? new Date(data.liquidationDate) : new Date(),
          approvedById: ctx.employeeId,
        },
      });

      // Cập nhật trạng thái máy
      await tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'LIQUIDATED',
          currentAssigneeId: null,
          currentDepartmentId: null,
          assignedAt: null,
        },
      });

      await writeAudit({
          actorId: ctx.userId,
          entityType: 'Asset',
          entityId: String(assetId),
          action: 'LIQUIDATE',
          diff: data as never,
        }, tx);
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Đã hoàn tất thanh lý thiết bị ${asset.assetCode}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi thanh lý thiết bị' };
  }
}

/** Xóa thiết bị khỏi hệ thống */
export async function deleteAssetAction(assetId: number): Promise<Result> {
  const ctx = await requirePermission('FEATURE_ASSET_DELETE');
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, message: 'Không tìm thấy thiết bị' };

  try {
    await prisma.asset.delete({ where: { id: assetId } });
    await writeAudit({
        actorId: ctx.userId,
        entityType: 'Asset',
        entityId: String(assetId),
        action: 'DELETE',
        diff: { assetCode: asset.assetCode, name: asset.name } as never,
      });

    revalidatePath('/assets');
    return { ok: true, message: `Đã xóa thiết bị ${asset.assetCode}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Lỗi khi xóa thiết bị' };
  }
}
