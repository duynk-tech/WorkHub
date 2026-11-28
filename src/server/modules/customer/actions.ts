'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, can } from '@/server/auth/context';
import { canViewModule, NO_ACCESS_MESSAGE } from '@/server/auth/module-access';
import { customerInputSchema, firstZodMessage } from './schemas';
import {
  saveCustomer,
  deleteCustomer,
  saveCustomerOrder,
  deleteCustomerOrder,
  cancelCustomerOrder,
  saveCustomerQuotation,
  deleteCustomerQuotation,
  convertQuotationToOrder,
  getCustomerOrderFulfillment,
  issueCustomerOrderStock,
  createSupplierOrderFromCustomerOrder,
} from './service';
import type {
  SaveCustomerInput,
  SaveCustomerOrderInput,
  SaveCustomerQuotationInput,
  SaveCustomerPaymentInput,
} from './types';
import type { SaveCustomerReturnInput } from './service';

export async function saveCustomerAction(id: number | null, input: SaveCustomerInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền quản lý khách hàng' };
  }

  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstZodMessage(parsed.error) };

  try {
    const customer = await saveCustomer(id, parsed.data);
    revalidatePath('/customers');
    if (id) revalidatePath(`/customers/${id}`);
    revalidatePath('/spare-parts');
    return { ok: true, message: id ? 'Cập nhật khách hàng thành công' : 'Thêm khách hàng mới thành công', customer };
  } catch (error: any) {
    console.error('[saveCustomerAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu thông tin khách hàng' };
  }
}

export async function deleteCustomerAction(id: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa khách hàng' };
  }

  try {
    await deleteCustomer(id);
    revalidatePath('/customers');
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa khách hàng' };
  } catch (error: any) {
    console.error('[deleteCustomerAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa khách hàng' };
  }
}

export async function saveCustomerOrderAction(id: number | null, input: SaveCustomerOrderInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền quản lý đơn hàng khách hàng' };
  }

  try {
    const order = await saveCustomerOrder(id, input);
    // Đơn mới chưa có nhân viên KD phụ trách thì gán cho người lập (dùng cho KPI theo người)
    if (!id && order?.id) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.customerOrder.updateMany({ where: { id: order.id, salespersonId: null }, data: { salespersonId: ctx.employeeId } });
    }
    revalidatePath('/customers');
    revalidatePath('/sales');
    revalidatePath(`/customers/${input.customerId}`);
    return { ok: true, message: id ? 'Cập nhật đơn hàng thành công' : 'Tạo đơn hàng mới thành công', order };
  } catch (error: any) {
    console.error('[saveCustomerOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu đơn hàng' };
  }
}

export async function deleteCustomerOrderAction(id: number, customerId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa đơn hàng' };
  }

  try {
    await deleteCustomerOrder(id);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, message: 'Đã xóa đơn hàng' };
  } catch (error: any) {
    console.error('[deleteCustomerOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa đơn hàng' };
  }
}

export async function cancelCustomerOrderAction(id: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền hủy đơn hàng' };
  }

  try {
    await cancelCustomerOrder(id);
    revalidatePath('/sales');
    revalidatePath('/customers');
    return { ok: true, message: 'Đã hủy đơn hàng' };
  } catch (error: any) {
    console.error('[cancelCustomerOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi hủy đơn hàng' };
  }
}

export async function saveCustomerQuotationAction(
  id: number | null,
  input: SaveCustomerQuotationInput,
) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền quản lý báo giá' };
  }

  try {
    const quotation = await saveCustomerQuotation(id, {
      ...input,
      createdById: input.createdById ?? ctx.employeeId,
    });
    if (!id && quotation?.id) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.customerQuotation.updateMany({ where: { id: quotation.id, salespersonId: null }, data: { salespersonId: ctx.employeeId } });
    }
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/spare-parts');
    revalidatePath('/quotations');
    return {
      ok: true,
      message: id ? 'Cập nhật báo giá thành công' : 'Tạo báo giá mới thành công',
      // Server Actions cũng phải trả plain objects. Prisma Decimal không được
      // Next serialize trực tiếp khi modal đưa báo giá vừa lưu vào client state.
      quotation: JSON.parse(JSON.stringify(quotation)),
    };
  } catch (error: any) {
    console.error('[saveCustomerQuotationAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu báo giá' };
  }
}

export async function deleteCustomerQuotationAction(id: number, customerId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa báo giá' };
  }

  try {
    await deleteCustomerQuotation(id);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa báo giá' };
  } catch (error: any) {
    console.error('[deleteCustomerQuotationAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa báo giá' };
  }
}

export async function convertQuotationToOrderAction(
  quotationId: number,
  customerId: number,
  orderType?: string,
) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền chốt báo giá thành đơn hàng' };
  }

  try {
    const order = await convertQuotationToOrder(quotationId, orderType);
    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/spare-parts');
    revalidatePath('/sales');
    return {
      ok: true,
      message: order.status === 'AWAITING_STOCK'
        ? `Đã chốt báo giá thành đơn ${order.orderCode}. Đơn đang chờ hàng; hãy tạo PO cho phần thiếu, nhận đủ hàng rồi mới xuất giao.`
        : `Đã chốt báo giá thành đơn ${order.orderCode}`,
      order: JSON.parse(JSON.stringify(order)),
    };
  } catch (error: any) {
    console.error('[convertQuotationToOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi chốt báo giá thành đơn hàng' };
  }
}

/** Thông tin phục vụ giao hàng: dòng nào xuất kho được, dòng nào còn thiếu mã. */
export async function getOrderFulfillmentAction(orderId: number) {
  const ctx = await requireAuth();
  if (!canViewModule(ctx, 'customers')) return { ok: false, message: NO_ACCESS_MESSAGE };
  try {
    const data = await getCustomerOrderFulfillment(orderId);
    if (!data) return { ok: false, message: 'Không tìm thấy đơn hàng' };
    return {
      ok: true,
      message: '',
      data: JSON.parse(JSON.stringify(data)),
    };
  } catch (error: any) {
    console.error('[getOrderFulfillmentAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc thông tin đơn hàng' };
  }
}

export async function getSalesOrderDetailAction(orderId: number) {
  const ctx = await requireAuth();
  try {
    const { getSalesOrderDetail } = await import('./service');
    const data = await getSalesOrderDetail(ctx, orderId);
    // Thiếu quyền và không tìm thấy trả về cùng một câu: đừng xác nhận đơn có tồn tại
    if (!data) return { ok: false, message: 'Không tìm thấy đơn hàng' };
    return { ok: true, message: '', data: JSON.parse(JSON.stringify(data)) };
  } catch (error: any) {
    console.error('[getSalesOrderDetailAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc chi tiết đơn hàng' };
  }
}

export async function getCustomerOrderContextAction(customerId: number) {
  const ctx = await requireAuth();
  try {
    const { getCustomerOrderContext } = await import('./service');
    const data = await getCustomerOrderContext(ctx, customerId);
    if (!data) return { ok: false, message: 'Không tìm thấy khách hàng' };
    return { ok: true, message: '', data: JSON.parse(JSON.stringify(data)) };
  } catch (error: any) {
    console.error('[getCustomerOrderContextAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc dữ liệu khách hàng' };
  }
}

export async function issueOrderStockAction(
  orderId: number,
  sourceWarehouseId: number,
  customerId: number,
  /** Serial của từng chiếc máy bán từ kho — bắt buộc khai đủ trước khi trừ tồn. */
  machineUnits: { orderItemId: number; serialNumber: string; warrantyMonths?: number }[] = [],
) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xuất kho giao hàng' };
  }

  try {
    const res = await issueCustomerOrderStock(orderId, sourceWarehouseId, ctx.userId, machineUnits);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/sales');
    revalidatePath('/spare-parts');

    const parts: string[] = [];
    if (res.issuedLines > 0) parts.push(`xuất kho ${res.issuedLines} dòng linh kiện`);
    if (res.machinesTransferred > 0) {
      const label =
        res.ownershipType === 'RENTAL'
          ? 'cho thuê'
          : res.ownershipType === 'LOAN'
            ? 'cho mượn'
          : res.ownershipType === 'CONSIGNMENT'
            ? 'ký gửi'
            : 'bán';
      parts.push(`chuyển ${res.machinesTransferred} máy sang khách (${label})`);
    }
    if (res.machinesCreated.length > 0) {
      parts.push(
        `lập hồ sơ ${res.machinesCreated.length} máy mới (${res.machinesCreated.map((m) => m.machineCode).join(', ')})`,
      );
    }
    return { ok: true, message: `Đã ${parts.join(' và ')}` };
  } catch (error: any) {
    console.error('[issueOrderStockAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xuất kho giao hàng' };
  }
}

export async function createSupplierOrderAction(
  orderId: number,
  customerId: number,
  input: {
    supplier?: string;
    targetWarehouseId?: number;
    newItems?: { itemId: number; unit?: string; itemCode?: string }[];
  },
) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền tạo phiếu đặt hàng nhà cung cấp' };
  }

  try {
    const supplierOrder = await createSupplierOrderFromCustomerOrder(orderId, input, ctx.userId);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: `Đã tạo phiếu đặt hàng ${supplierOrder.orderCode} gửi ${supplierOrder.supplier}`,
      supplierOrder: JSON.parse(JSON.stringify(supplierOrder)),
    };
  } catch (error: any) {
    console.error('[createSupplierOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi tạo phiếu đặt hàng nhà cung cấp' };
  }
}

export async function recordCustomerPaymentAction(input: SaveCustomerPaymentInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền ghi nhận thanh toán' };
  }

  try {
    const { recordCustomerPayment } = await import('./service');
    const payment = await recordCustomerPayment(input, ctx.userId);
    revalidatePath('/customers');
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/sales');
    return {
      ok: true,
      message: `Đã ghi nhận phiếu thu ${payment.paymentCode}`,
      payment: JSON.parse(JSON.stringify(payment)),
    };
  } catch (error: any) {
    console.error('[recordCustomerPaymentAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi ghi nhận thanh toán' };
  }
}

export async function deleteCustomerPaymentAction(id: number, customerId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa phiếu thu' };
  }

  try {
    const { deleteCustomerPayment } = await import('./service');
    await deleteCustomerPayment(id, ctx.userId);
    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/sales');
    return { ok: true, message: 'Đã xóa phiếu thu và hoàn lại công nợ' };
  } catch (error: any) {
    console.error('[deleteCustomerPaymentAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa phiếu thu' };
  }
}

export async function createCustomerReturnAction(input: SaveCustomerReturnInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền lập phiếu trả hàng' };
  }

  try {
    const { createCustomerReturn } = await import('./service');
    const record = await createCustomerReturn(input, ctx.userId);
    revalidatePath('/customers');
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/sales');
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: input.settlement === 'REFUND'
        ? record.refundedAmount > 0
          ? `Đã lập phiếu trả hàng ${record.returnCode}, hoàn ${new Intl.NumberFormat('vi-VN').format(record.refundedAmount)} đồng${record.refundedAmount < Number(record.totalValue) ? ' và cấn trừ phần còn lại vào công nợ' : ''}`
          : `Đã lập phiếu trả hàng ${record.returnCode}; đơn chưa có khoản đã thu để hoàn tiền`
        : `Đã lập phiếu trả hàng ${record.returnCode}, giảm trừ công nợ`,
      record: JSON.parse(JSON.stringify(record)),
    };
  } catch (error: any) {
    console.error('[createCustomerReturnAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lập phiếu trả hàng' };
  }
}

export async function deleteCustomerReturnAction(id: number, customerId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) {
    return { ok: false, message: 'Bạn không có quyền xóa phiếu trả hàng' };
  }

  try {
    const { deleteCustomerReturn } = await import('./service');
    await deleteCustomerReturn(id, ctx.userId);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/sales');
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa phiếu trả hàng và hoàn lại công nợ' };
  } catch (error: any) {
    console.error('[deleteCustomerReturnAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa phiếu trả hàng' };
  }
}

/**
 * Danh mục phụ tùng và máy trong kho cho form lập đơn. Trước đây trang Bán hàng
 * nạp sẵn cả kho mỗi lần mở, giờ chỉ nạp khi người dùng thật sự mở form.
 */
export async function getOrderFormCatalogAction() {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) return { ok: false, message: 'Bạn không có quyền lập đơn bán' };
  try {
    const [{ listSpareParts }, { listEquipment }] = await Promise.all([
      import('@/server/modules/spare-parts/service'),
      import('@/server/modules/equipment/service'),
    ]);
    const [spareParts, stockMachines] = await Promise.all([listSpareParts({}), listEquipment({ status: 'IN_STOCK' })]);
    return {
      ok: true,
      message: '',
      spareParts: JSON.parse(JSON.stringify(spareParts)),
      stockMachines: JSON.parse(JSON.stringify(stockMachines)),
    };
  } catch (error: any) {
    console.error('[getOrderFormCatalogAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi tải danh mục hàng' };
  }
}

/** Dữ liệu cho form báo giá (khách kèm địa điểm/máy, phụ tùng, máy trong kho) — nạp khi mở form. */
export async function getQuotationFormCatalogAction() {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) return { ok: false, message: 'Bạn không có quyền lập báo giá' };
  try {
    const [{ prisma }, { listSpareParts }, { listEquipment }] = await Promise.all([
      import('@/lib/prisma'),
      import('@/server/modules/spare-parts/service'),
      import('@/server/modules/equipment/service'),
    ]);
    const [customers, spareParts, stockMachines] = await Promise.all([
      prisma.customer.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true, name: true, phone: true, code: true,
          locations: { select: { id: true, name: true, address: true } },
          machines: { select: { id: true, name: true, machineCode: true } },
        },
        orderBy: { name: 'asc' },
      }),
      listSpareParts({}),
      listEquipment({ status: 'IN_STOCK' }),
    ]);
    return {
      ok: true,
      message: '',
      customers: JSON.parse(JSON.stringify(customers)),
      spareParts: JSON.parse(JSON.stringify(spareParts)),
      stockMachines: JSON.parse(JSON.stringify(stockMachines)),
    };
  } catch (error: any) {
    console.error('[getQuotationFormCatalogAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi tải dữ liệu báo giá' };
  }
}

/** Đánh dấu hết hiệu lực nhiều báo giá cùng lúc (chỉ báo giá nháp/đã gửi). */
export async function expireQuotationsAction(ids: number[]) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_CUSTOMER_MANAGE')) return { ok: false, message: 'Bạn không có quyền sửa báo giá' };
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (!clean.length) return { ok: false, message: 'Chưa chọn báo giá nào' };
  try {
    const { prisma } = await import('@/lib/prisma');
    const targets = await prisma.customerQuotation.findMany({
      where: { id: { in: clean }, status: { in: ['DRAFT', 'SENT'] } },
      select: { id: true, quoteCode: true, status: true },
    });
    if (targets.length) {
      await prisma.$transaction([
        prisma.customerQuotation.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { status: 'EXPIRED' } }),
        prisma.auditLog.createMany({
          data: targets.map((t) => ({
            actorId: ctx.userId, entityType: 'CustomerQuotation', entityId: String(t.id), action: 'EXPIRE',
            diffJson: { quoteCode: t.quoteCode, from: t.status, to: 'EXPIRED', bulk: true },
          })),
        }),
      ]);
    }
    revalidatePath('/quotations');
    const skipped = clean.length - targets.length;
    return {
      ok: true,
      message: skipped
        ? `Đã chuyển ${targets.length} báo giá sang hết hiệu lực; bỏ qua ${skipped} báo giá đã chốt/từ chối`
        : `Đã chuyển ${targets.length} báo giá sang hết hiệu lực`,
    };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi cập nhật báo giá' };
  }
}
