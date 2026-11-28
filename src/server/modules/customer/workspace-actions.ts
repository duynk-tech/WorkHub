'use server';
import { computeOrderDebt } from '@/lib/customer-debt';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { revalidatePath } from 'next/cache';
import { profileSchema, contactSchema, activitySchema } from './workspace-schema';
import { customerInsights, customerCsv } from '@/lib/customer-insights';
import { z } from 'zod';
async function access(customerId: number, write: boolean) {
  z.number().int().positive().parse(customerId);
  const ctx = await requireAuth();
  if (!(write ? can(ctx, 'FEATURE_CUSTOMER_MANAGE') : can(ctx, 'MENU_CUSTOMERS') || can(ctx, 'FEATURE_CUSTOMER_MANAGE'))) throw new Error('Không có quyền truy cập khách hàng.');
  await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return ctx;
}
export async function saveCustomerWorkspaceAction(customerId: number, kind: 'profile' | 'contact' | 'activity' | 'complete', raw: unknown) {
  try {
    const ctx = await access(customerId, true);
    await prisma.$transaction(async tx => {
      if (kind === 'profile') {
        const data = profileSchema.parse(raw);
        if (data.ownerEmployeeId) await tx.employee.findFirstOrThrow({ where: { id: data.ownerEmployeeId, status: 'ACTIVE' } });
        await tx.customerProfile.upsert({ where: { customerId }, update: data, create: { customerId, ...data } });
      } else if (kind === 'contact') {
        const { id, ...data } = contactSchema.parse(raw);
        if (data.isPrimary) await tx.customerContact.updateMany({ where: { customerId }, data: { isPrimary: false } });
        if (id) {
          const updated = await tx.customerContact.updateMany({ where: { id, customerId }, data });
          if (!updated.count) throw new Error('Liên hệ không thuộc khách hàng này.');
        } else await tx.customerContact.create({ data: { customerId, ...data } });
      } else if (kind === 'activity') {
        const { id, ...data } = activitySchema.parse(raw);
        await tx.employee.findFirstOrThrow({ where: { id: data.assigneeId, status: 'ACTIVE' } });
        const activity = { ...data, dueAt: data.dueAt ? new Date(data.dueAt) : null };
        if (id) {
          const changed = await tx.customerCareActivity.updateMany({ where: { id, customerId, completedAt: null }, data: activity });
          if (!changed.count) throw new Error('Không sửa được lịch đã hoàn thành hoặc không thuộc khách này.');
        } else await tx.customerCareActivity.create({ data: { ...activity, customerId } });
      } else if (kind === 'complete') {
        const id = z.number().int().positive().parse(raw);
        const count = await tx.customerCareActivity.updateMany({ where: { id, customerId, completedAt: null }, data: { completedAt: new Date() } });
        if (!count.count) throw new Error('Công việc không tồn tại hoặc đã hoàn thành.');
      } else throw new Error('Thao tác không hợp lệ.');
      await tx.auditLog.create({ data: { actorId: ctx.userId, entityType: 'Customer', entityId: String(customerId), action: `WORKSPACE_${kind.toUpperCase()}` } });
    }, { isolationLevel: 'Serializable' });
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, message: 'Đã lưu.' };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'Không thể lưu.' }; }
}
export async function exportCustomerReportAction(customerId: number) {
  const ctx = await access(customerId, false);
  if (!can(ctx, 'FEATURE_REPORT_EXPORT')) throw new Error('Không có quyền xuất báo cáo.');
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, include: { orders: { include: { items: true } }, payments: { include: { allocations: true } }, returns: { include: { items: true } } } });
  const report = customerInsights(customer);
  await prisma.auditLog.create({ data: { actorId: ctx.userId, entityType: 'Customer', entityId: String(customerId), action: 'EXPORT_REPORT' } });
  return customerCsv([
    ['BÁO CÁO KHÁCH HÀNG', customer.name], ['Ngày xuất', new Date().toISOString()],
    ['Công nợ hiện tại, không phải số dư lịch sử'], ['Tiền dư chưa phân bổ (phiếu mới)', report.unapplied], ['Phiếu cũ cần đối soát phân bổ', report.legacyPayments],
    ['Đơn', 'Tổng gồm VAT', 'Giảm trừ', 'Đã thu theo đơn', 'Còn nợ', 'Hạn trả', 'Quá hạn'],
    ...report.rows.map((r: any) => [r.orderCode, r.total, r.returned, r.paid, r.remaining, r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '', r.overdue ? 'Có' : 'Không']),
    [], ['PHỤ TÙNG'], ['Tên', 'Đơn', 'SL đơn đã giao', 'Đã trả', 'Còn lại'], ...report.parts.map((r: any) => [r.item.name, r.order.orderCode, r.item.quantity, r.returnedQty, r.netQty]),
  ]);
}

export async function allocateCustomerCreditAction(customerId: number, raw: unknown) {
  try {
    const ctx = await access(customerId, true);
    const input = z.object({ paymentId: z.number().int().positive(), orderId: z.number().int().positive(), amount: z.number().int().positive().max(1e12), expectedAllocated: z.number().nonnegative() }).parse(raw);
    await prisma.$transaction(async tx => {
      const payment = await tx.customerPayment.findFirstOrThrow({ where: { id: input.paymentId, customerId, allocationVersion: 1 }, include: { allocations: true } });
      const order = await tx.customerOrder.findFirstOrThrow({ where: { id: input.orderId, customerId, status: { not: 'CANCELLED' } } });
      const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      if (Math.abs(allocated - input.expectedAllocated) > .01) throw new Error('Phiếu thu đã thay đổi. Tải lại trước khi phân bổ để tránh ghi trùng.');
      const spare = Number(payment.amount) - allocated;
      const remaining = computeOrderDebt(order).remaining;
      if (input.amount > spare || input.amount > remaining) throw new Error('Số tiền vượt tiền chưa phân bổ hoặc dư nợ của đơn.');
      const existing = payment.allocations.find(a => a.orderId === order.id);
      if (existing) await tx.customerPaymentAllocation.update({ where: { id: existing.id }, data: { amount: { increment: input.amount } } });
      else await tx.customerPaymentAllocation.create({ data: { paymentId: payment.id, orderId: order.id, amount: input.amount } });
      await tx.customerOrder.update({ where: { id: order.id }, data: { paidAmount: { increment: input.amount }, ...(order.stockIssuedAt && input.amount === remaining ? { status: 'COMPLETED' } : {}) } });
      await tx.auditLog.create({ data: { actorId: ctx.userId, entityType: 'CustomerPayment', entityId: String(payment.id), action: 'ALLOCATE_CREDIT', diffJson: input } });
    }, { isolationLevel: 'Serializable' });
    revalidatePath(`/customers/${customerId}`); revalidatePath('/sales'); revalidatePath('/reports');
    return { ok: true, message: 'Đã phân bổ tiền vào đơn.' };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'Không phân bổ được.' }; }
}
