'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { saveEquipment, deleteEquipment } from './service';
import type { SaveEquipmentInput } from './types';

export async function saveEquipmentAction(id: number | null, input: SaveEquipmentInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_EQUIPMENT_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền quản lý thiết bị F&B' };
  }

  try {
    const existingSn = await prisma.fnbEquipment.findFirst({
      where: {
        serialNumber: input.serialNumber.trim(),
        ...(id ? { id: { not: id } } : {}),
      },
    });
    if (existingSn) {
      return { ok: false, message: `Số Serial (S/N) "${input.serialNumber}" đã tồn tại trên thiết bị khác` };
    }

    const equipment = await saveEquipment(id, input);
    revalidatePath('/spare-parts');
    if (id) revalidatePath(`/equipment/${id}`);

    return {
      ok: true,
      message: id ? 'Cập nhật thiết bị thành công' : 'Thêm thiết bị mới thành công',
      data: equipment,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Lỗi khi lưu thiết bị',
    };
  }
}

export async function deleteEquipmentAction(id: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_EQUIPMENT_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa thiết bị' };
  }

  try {
    await deleteEquipment(id);
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa thiết bị thành công' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Lỗi khi xóa thiết bị',
    };
  }
}

export async function saveCustomerAction(data: {
  name: string;
  code?: string;
  phone: string;
  email?: string;
  address?: string;
  contactName?: string;
}) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_EQUIPMENT_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền quản lý khách hàng' };
  }

  try {
    const code = data.code?.trim() || `KH-${Date.now().toString().slice(-4)}`;
    const customer = await prisma.customer.create({
      data: {
        name: data.name.trim(),
        code,
        phone: data.phone.trim(),
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        contactName: data.contactName?.trim() || null,
      },
    });

    revalidatePath('/spare-parts');
    return { ok: true, message: 'Tạo khách hàng mới thành công', customer };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Lỗi khi tạo khách hàng',
    };
  }
}

export async function saveCustomerLocationAction(data: {
  customerId: number;
  name: string;
  address: string;
  managerName?: string;
  phone?: string;
}) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_EQUIPMENT_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền thêm điểm lắp đặt' };
  }

  try {
    const location = await prisma.customerLocation.create({
      data: {
        customerId: data.customerId,
        name: data.name.trim(),
        address: data.address.trim(),
        managerName: data.managerName?.trim() || null,
        phone: data.phone?.trim() || null,
      },
    });

    revalidatePath('/spare-parts');
    revalidatePath('/customers');
    revalidatePath(`/customers/${data.customerId}`);
    return { ok: true, message: 'Thêm điểm lắp đặt thành công', location };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Lỗi khi thêm điểm lắp đặt',
    };
  }
}

export async function recordMaintenanceDoneAction(data: {
  equipmentId: number;
  doneDate: string;
  nextPmDate?: string | null;
  technicianName?: string;
  notes?: string;
}) {
  const ctx = await requireAuth();
  if (
    !can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') &&
    !can(ctx, 'FEATURE_EQUIPMENT_MANAGE')
  ) {
    return { ok: false, message: 'Bạn không có quyền cập nhật lịch bảo dưỡng thiết bị' };
  }

  try {
    const existing = await prisma.fnbEquipment.findUnique({
      where: { id: data.equipmentId },
      select: { id: true, machineCode: true, name: true, customerId: true, notes: true },
    });
    if (!existing) {
      return { ok: false, message: 'Không tìm thấy thiết bị' };
    }

    const doneD = new Date(data.doneDate);
    const nextD = data.nextPmDate ? new Date(data.nextPmDate) : null;

    const logEntry = `[${new Date().toLocaleDateString('vi-VN')}] Bảo dưỡng ngày ${doneD.toLocaleDateString('vi-VN')}${
      data.technicianName ? ` bởi ${data.technicianName}` : ''
    }${data.notes ? `: ${data.notes}` : ''}`;

    const updatedNotes = existing.notes ? `${existing.notes}\n${logEntry}` : logEntry;

    await prisma.fnbEquipment.update({
      where: { id: data.equipmentId },
      data: {
        lastPmDate: doneD,
        nextPmDate: nextD,
        notes: updatedNotes,
        status: 'OPERATING',
      },
    });

    revalidatePath('/customers');
    revalidatePath('/spare-parts');
    revalidatePath(`/equipment/${data.equipmentId}`);
    if (existing.customerId) {
      revalidatePath(`/customers/${existing.customerId}`);
    }

    return {
      ok: true,
      message: `Đã ghi nhận bảo dưỡng hoàn tất cho máy ${existing.machineCode}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Lỗi khi ghi nhận bảo dưỡng',
    };
  }
}
