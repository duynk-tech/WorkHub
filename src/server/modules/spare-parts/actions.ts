'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, can } from '@/server/auth/context';
import {
  saveSparePart,
  deleteSparePart,
  saveWarehouse,
  createStockTransaction,
  seedDefaultSparePartsAndWarehouses,
  createSparePartOrder,
  updateSparePartOrder,
  updateSparePartOrderStatus,
} from './service';
import type {
  SaveSparePartInput,
  SaveWarehouseInput,
  SaveStockTransactionInput,
} from './types';

export async function saveSparePartAction(id: number | null, input: SaveSparePartInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền quản lý phụ tùng & linh kiện' };
  }

  try {
    const item = await saveSparePart(id, input);
    revalidatePath('/spare-parts');
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: id ? 'Cập nhật phụ tùng thành công' : 'Thêm mới phụ tùng thành công',
      item: JSON.parse(JSON.stringify(item)),
    };
  } catch (error: any) {
    console.error('[saveSparePartAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu thông tin phụ tùng' };
  }
}

export async function deleteSparePartAction(id: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền xóa phụ tùng' };
  }

  try {
    await deleteSparePart(id);
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa phụ tùng' };
  } catch (error: any) {
    console.error('[deleteSparePartAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa phụ tùng' };
  }
}

export async function saveWarehouseAction(id: number | null, input: SaveWarehouseInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền quản lý kho bãi' };
  }

  try {
    const warehouse = await saveWarehouse(id, input);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: id ? 'Cập nhật kho thành công' : 'Thêm mới kho / xe lưu động thành công',
      warehouse: JSON.parse(JSON.stringify(warehouse)),
    };
  } catch (error: any) {
    console.error('[saveWarehouseAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu thông tin kho' };
  }
}

export async function saveStockTransactionAction(input: SaveStockTransactionInput) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền thực hiện giao dịch kho' };
  }

  try {
    const transaction = await createStockTransaction(input, ctx.userId);
    revalidatePath('/spare-parts');
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: 'Giao dịch kho đã được thực hiện thành công',
      transaction: JSON.parse(JSON.stringify(transaction)),
    };
  } catch (error: any) {
    console.error('[saveStockTransactionAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi thực hiện giao dịch kho' };
  }
}

export async function seedSparePartsAction() {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền khởi tạo dữ liệu' };
  }

  try {
    const res = await seedDefaultSparePartsAndWarehouses(ctx.userId);
    revalidatePath('/spare-parts');
    return JSON.parse(JSON.stringify(res));
  } catch (error: any) {
    console.error('[seedSparePartsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi khởi tạo dữ liệu mẫu' };
  }
}

export async function createSparePartOrderAction(input: any) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền tạo đơn hàng order' };
  }

  try {
    const { SaveSparePartOrderSchema } = await import('./types');
    const validated = SaveSparePartOrderSchema.parse(input);
    const order = await createSparePartOrder(validated, ctx.userId);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: `Đã tạo đơn hàng order ${order.orderCode} thành công`,
      order: JSON.parse(JSON.stringify(order)),
    };
  } catch (error: any) {
    console.error('[createSparePartOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi tạo đơn hàng order' };
  }
}

export async function updateSparePartOrderAction(orderId: number, input: any) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền chỉnh sửa đơn hàng order' };
  }

  try {
    const { SaveSparePartOrderSchema } = await import('./types');
    const validated = SaveSparePartOrderSchema.parse(input);
    const order = await updateSparePartOrder(orderId, validated, ctx.userId);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: `Đã cập nhật đơn hàng order ${order.orderCode} thành công`,
      order: JSON.parse(JSON.stringify(order)),
    };
  } catch (error: any) {
    console.error('[updateSparePartOrderAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi cập nhật đơn hàng order' };
  }
}

export async function updateSparePartOrderStatusAction(orderId: number, input: any) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền cập nhật đơn hàng order' };
  }

  try {
    const { UpdateOrderStatusSchema } = await import('./types');
    const validated = UpdateOrderStatusSchema.parse(input);
    const order = await updateSparePartOrderStatus(orderId, validated, ctx.userId);
    revalidatePath('/spare-parts');
    revalidatePath('/spare-parts');
    // Nhập kho xong có thể đổi trạng thái đơn hàng khách đang chờ lô này
    revalidatePath('/customers');
    if (order.customerId) revalidatePath(`/customers/${order.customerId}`);
    return {
      ok: true,
      message: `Đã cập nhật trạng thái đơn hàng ${order.orderCode} thành công`,
      order: JSON.parse(JSON.stringify(order)),
    };
  } catch (error: any) {
    console.error('[updateSparePartOrderStatusAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi cập nhật trạng thái đơn hàng order' };
  }
}

export async function saveSparePartPricingConfigAction(input: any) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !can(ctx, 'FEATURE_EQUIPMENT_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền cấu hình chính sách giá & margin' };
  }

  try {
    const { SparePartPricingConfigSchema } = await import('./types');
    const validated = SparePartPricingConfigSchema.parse(input);
    const { saveSparePartPricingConfig } = await import('./service');
    const config = await saveSparePartPricingConfig(validated);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: 'Cập nhật cấu hình chính sách giá & margin thành công',
      config: JSON.parse(JSON.stringify(config)),
    };
  } catch (error: any) {
    console.error('[saveSparePartPricingConfigAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu cấu hình chính sách giá & margin' };
  }
}


export async function getInventoryReportAction(input: {
  preset?: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  anchor?: string;
  from?: string;
  to?: string;
}) {
  const ctx = await requireAuth();
  if (
    !can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') &&
    !can(ctx, 'FEATURE_REPORT_INVENTORY') &&
    !ctx.isAdmin
  ) {
    return { ok: false, message: 'Bạn không có quyền xem báo cáo kho' };
  }

  try {
    const { resolveRange, getInventoryProfitReport } = await import('./report');
    const range = resolveRange(
      input.preset || 'MONTH',
      input.anchor ? new Date(input.anchor) : new Date(),
      { from: input.from, to: input.to },
    );
    const report = await getInventoryProfitReport(range);
    return { ok: true, message: '', report: JSON.parse(JSON.stringify(report)) };
  } catch (error: any) {
    console.error('[getInventoryReportAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lập báo cáo kho' };
  }
}

export async function exportInventoryReportCsvAction(input: {
  preset?: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  anchor?: string;
  from?: string;
  to?: string;
}) {
  const ctx = await requireAuth();
  if (
    !can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') &&
    !can(ctx, 'FEATURE_REPORT_INVENTORY') &&
    !ctx.isAdmin
  ) {
    return { ok: false, message: 'Bạn không có quyền xuất báo cáo kho' };
  }

  try {
    const { resolveRange, getInventoryProfitReport, reportToCsv } = await import('./report');
    const range = resolveRange(
      input.preset || 'MONTH',
      input.anchor ? new Date(input.anchor) : new Date(),
      { from: input.from, to: input.to },
    );
    const report = await getInventoryProfitReport(range);
    return {
      ok: true,
      message: '',
      csv: reportToCsv(report),
      fileName: `bao-cao-kho-${report.range.from}-den-${report.range.to}.csv`,
    };
  } catch (error: any) {
    console.error('[exportInventoryReportCsvAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xuất báo cáo' };
  }
}

export async function approveStockTransactionAction(transactionId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_APPROVE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền duyệt phiếu kho' };
  }

  try {
    const { approveStockTransactionAndSettle } = await import('./service');
    const trans = await approveStockTransactionAndSettle(transactionId, ctx.userId);
    revalidatePath('/spare-parts');
    return { ok: true, message: `Đã duyệt phiếu ${trans.transCode} và cập nhật tồn kho` };
  } catch (error: any) {
    console.error('[approveStockTransactionAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi duyệt phiếu kho' };
  }
}

export async function rejectStockTransactionAction(transactionId: number, reason: string) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_APPROVE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền duyệt phiếu kho' };
  }

  try {
    const { rejectStockTransaction } = await import('./service');
    const trans = await rejectStockTransaction(transactionId, ctx.userId, reason);
    revalidatePath('/spare-parts');
    return { ok: true, message: `Đã từ chối phiếu ${trans.transCode}` };
  } catch (error: any) {
    console.error('[rejectStockTransactionAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi từ chối phiếu kho' };
  }
}

export async function listStockTransactionsAction(filter: any) {
  await requireAuth();
  try {
    const { listStockTransactions } = await import('./service');
    const res = await listStockTransactions(filter);
    return { ok: true, message: '', data: JSON.parse(JSON.stringify(res)) };
  } catch (error: any) {
    console.error('[listStockTransactionsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc lịch sử kho' };
  }
}

export async function createStockCountAction(warehouseId: number, note?: string) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền mở đợt kiểm kê' };
  }

  try {
    const { createStockCount } = await import('./service');
    const count = await createStockCount(warehouseId, ctx.userId, note);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: `Đã mở đợt kiểm kê ${count.countCode} với ${count.items.length} mặt hàng`,
      count: JSON.parse(JSON.stringify(count)),
    };
  } catch (error: any) {
    console.error('[createStockCountAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi mở đợt kiểm kê' };
  }
}

export async function getStockCountAction(id: number) {
  await requireAuth();
  try {
    const { getStockCount } = await import('./service');
    const count = await getStockCount(id);
    if (!count) return { ok: false, message: 'Không tìm thấy đợt kiểm kê' };
    return { ok: true, message: '', count: JSON.parse(JSON.stringify(count)) };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi đọc đợt kiểm kê' };
  }
}

export async function listStockCountsAction() {
  await requireAuth();
  try {
    const { listStockCounts } = await import('./service');
    const counts = await listStockCounts();
    return { ok: true, message: '', counts: JSON.parse(JSON.stringify(counts)) };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi đọc danh sách kiểm kê' };
  }
}

export async function saveStockCountItemsAction(
  countId: number,
  lines: { itemId: number; countedQty: number | null; note?: string }[],
) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền nhập số kiểm kê' };
  }

  try {
    const { saveStockCountItems } = await import('./service');
    const count = await saveStockCountItems(countId, lines);
    return { ok: true, message: 'Đã lưu số đếm thực tế', count: JSON.parse(JSON.stringify(count)) };
  } catch (error: any) {
    console.error('[saveStockCountItemsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu số đếm' };
  }
}

export async function submitStockCountAction(countId: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền chốt đợt kiểm kê' };
  }

  try {
    const { submitStockCount } = await import('./service');
    const res = await submitStockCount(countId, ctx.userId);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: res.balanced
        ? 'Kiểm kê khớp sổ sách, không có chênh lệch nào'
        : `Đã lập ${res.transactions.length} phiếu chênh lệch chờ duyệt: ${res.transactions.join(', ')}`,
      result: JSON.parse(JSON.stringify(res)),
    };
  } catch (error: any) {
    console.error('[submitStockCountAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi chốt đợt kiểm kê' };
  }
}

export async function recordSupplierPaymentAction(input: {
  supplier: string;
  orderId?: number;
  amount: number;
  method?: string;
  paidAt?: string;
  reference?: string;
  note?: string;
}) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền ghi nhận thanh toán nhà cung cấp' };
  }

  try {
    const { recordSupplierPayment } = await import('./service');
    const payment = await recordSupplierPayment(input, ctx.userId);
    revalidatePath('/spare-parts');
    return {
      ok: true,
      message: `Đã ghi nhận phiếu chi ${payment.paymentCode}`,
      payment: JSON.parse(JSON.stringify(payment)),
    };
  } catch (error: any) {
    console.error('[recordSupplierPaymentAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi ghi nhận thanh toán' };
  }
}

export async function deleteSupplierPaymentAction(id: number) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền xóa phiếu chi' };
  }

  try {
    const { deleteSupplierPayment } = await import('./service');
    await deleteSupplierPayment(id);
    revalidatePath('/spare-parts');
    return { ok: true, message: 'Đã xóa phiếu chi và hoàn lại công nợ' };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi xóa phiếu chi' };
  }
}

export async function listSupplierPaymentsAction(supplier?: string) {
  await requireAuth();
  try {
    const { listSupplierPayments } = await import('./service');
    const payments = await listSupplierPayments(supplier);
    return { ok: true, message: '', payments: JSON.parse(JSON.stringify(payments)) };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi đọc lịch sử thanh toán' };
  }
}
