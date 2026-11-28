import { NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/server/lib/audit';
import { streamXlsxResponse, type SheetColumn, type StreamWorkbook } from '@/server/lib/excel';
import { getAppBranding } from '@/server/modules/settings/branding';
import { getSetting, setSetting } from '@/server/modules/settings/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;
const COOLDOWN_MS = 10 * 60 * 1000;
const d = (v: Date | null | undefined) => (v ? new Date(v) : null);
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Đọc bảng theo trang 1.000 dòng (khoá id tăng dần) rồi ghi luồng — không giữ cả bảng trong bộ nhớ. */
async function pagedSheet<T extends { id: number }>(
  wb: StreamWorkbook,
  name: string,
  columns: SheetColumn[],
  fetchPage: (afterId: number) => Promise<T[]>,
  map: (row: T) => Record<string, unknown>,
) {
  await wb.sheet(name, columns, async (sheet) => {
    let after = 0;
    for (;;) {
      const rows = await fetchPage(after);
      for (const r of rows) sheet.add(map(r));
      if (rows.length < PAGE) break;
      after = rows[rows.length - 1].id;
    }
  }, { autoFilter: true });
}

/**
 * Sao lưu dữ liệu nghiệp vụ ra một file Excel nhiều sheet. Chỉ ADMIN, tối đa 1 lần / 10 phút
 * (file lớn, đọc nhiều bảng). Không chứa mật khẩu, khoá bí mật hay cấu hình hệ thống.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Chỉ quản trị viên được sao lưu toàn bộ dữ liệu' }, { status: 403 });

  const last = await getSetting<string | null>('backup.lastExportAt', null);
  if (last && Date.now() - Date.parse(last) < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - Date.parse(last))) / 60000);
    return NextResponse.json({ error: `Vừa có bản sao lưu — thử lại sau khoảng ${wait} phút` }, { status: 429 });
  }
  await setSetting('backup.lastExportAt', new Date().toISOString(), { group: 'system' });
  await writeAudit({ actorId: ctx.userId, entityType: 'SystemDatabase', action: 'EXPORT_ALL' });

  const branding = await getAppBranding();
  const stamp = new Date().toISOString().slice(0, 10);
  const after = (id: number) => ({ where: { id: { gt: id } }, orderBy: { id: 'asc' as const }, take: PAGE });

  return streamXlsxResponse(`sao-luu-du-lieu-${stamp}.xlsx`, async (wb) => {
    await pagedSheet(wb, 'Khách hàng', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã', key: 'code', width: 14 }, { header: 'Tên', key: 'name', width: 32 },
      { header: 'Người liên hệ', key: 'contactName', width: 22 }, { header: 'Điện thoại', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 26 }, { header: 'Địa chỉ', key: 'address', width: 36 }, { header: 'Ngày tạo', key: 'createdAt', width: 14, numFmt: 'dd/mm/yyyy' },
    ], (id) => prisma.customer.findMany(after(id)), (c) => ({ ...c, createdAt: d(c.createdAt) }));

    await pagedSheet(wb, 'Đơn bán', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã đơn', key: 'orderCode', width: 16 }, { header: 'Khách (ID)', key: 'customerId', width: 11 },
      { header: 'Trạng thái', key: 'status', width: 16 }, { header: 'Ngày đặt', key: 'orderDate', width: 13, numFmt: 'dd/mm/yyyy' },
      { header: 'Hạn TT', key: 'dueDate', width: 13, numFmt: 'dd/mm/yyyy' }, { header: 'Tổng tiền', key: 'totalAmount', width: 16, numFmt: '#,##0' },
      { header: 'Đã thu', key: 'paidAmount', width: 16, numFmt: '#,##0' }, { header: 'Trả hàng', key: 'returnedAmount', width: 14, numFmt: '#,##0' },
      { header: 'NV KD (ID)', key: 'salespersonId', width: 11 },
    ], (id) => prisma.customerOrder.findMany(after(id)), (o) => ({
      id: o.id, orderCode: o.orderCode, customerId: o.customerId, status: o.status, orderDate: d(o.orderDate), dueDate: d(o.dueDate),
      totalAmount: n(o.totalAmount), paidAmount: n(o.paidAmount), returnedAmount: n(o.returnedAmount), salespersonId: o.salespersonId,
    }));

    await pagedSheet(wb, 'Báo giá', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã', key: 'quoteCode', width: 16 }, { header: 'Khách (ID)', key: 'customerId', width: 11 },
      { header: 'Trạng thái', key: 'status', width: 14 }, { header: 'Tổng tiền', key: 'totalAmount', width: 16, numFmt: '#,##0' },
      { header: 'Hiệu lực đến', key: 'validUntil', width: 14, numFmt: 'dd/mm/yyyy' }, { header: 'Ngày tạo', key: 'createdAt', width: 14, numFmt: 'dd/mm/yyyy' },
    ], (id) => prisma.customerQuotation.findMany(after(id)), (q) => ({
      id: q.id, quoteCode: q.quoteCode, customerId: q.customerId, status: q.status, totalAmount: n(q.totalAmount), validUntil: d(q.validUntil), createdAt: d(q.createdAt),
    }));

    await pagedSheet(wb, 'Phiếu thu', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Khách (ID)', key: 'customerId', width: 11 }, { header: 'Số tiền', key: 'amount', width: 16, numFmt: '#,##0' },
      { header: 'Ngày thu', key: 'paidAt', width: 13, numFmt: 'dd/mm/yyyy' }, { header: 'Hình thức', key: 'method', width: 14 },
    ], (id) => prisma.customerPayment.findMany(after(id)), (p) => ({
      id: p.id, customerId: p.customerId, amount: n(p.amount), paidAt: d(p.paidAt), method: p.method,
    }));

    await pagedSheet(wb, 'Phụ tùng', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã', key: 'itemCode', width: 16 }, { header: 'Tên', key: 'name', width: 34 },
      { header: 'Loại', key: 'category', width: 13 }, { header: 'ĐVT', key: 'unit', width: 9 }, { header: 'Ngưỡng tồn', key: 'minStockAlert', width: 12 },
      { header: 'Giá vốn', key: 'costPrice', width: 14, numFmt: '#,##0' }, { header: 'Giá bán', key: 'sellingPrice', width: 14, numFmt: '#,##0' },
      { header: 'Trạng thái', key: 'status', width: 11 },
    ], (id) => prisma.inventoryItem.findMany(after(id)), (i) => ({
      id: i.id, itemCode: i.itemCode, name: i.name, category: i.category, unit: i.unit, minStockAlert: i.minStockAlert,
      costPrice: n(i.costPrice), sellingPrice: n(i.sellingPrice), status: i.status,
    }));

    await pagedSheet(wb, 'Tồn kho', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Kho (ID)', key: 'warehouseId', width: 10 }, { header: 'Phụ tùng (ID)', key: 'itemId', width: 13 },
      { header: 'Số lượng', key: 'quantity', width: 11 },
    ], (id) => prisma.inventoryStock.findMany(after(id)), (s) => ({ ...s }));

    await pagedSheet(wb, 'Nhân sự', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã', key: 'code', width: 12 }, { header: 'Họ tên', key: 'fullName', width: 28 },
      { header: 'Email', key: 'email', width: 26 }, { header: 'Điện thoại', key: 'phone', width: 15 }, { header: 'Phòng ban (ID)', key: 'departmentId', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 12 },
    ], (id) => prisma.employee.findMany(after(id)), (e) => ({
      id: e.id, code: e.code, fullName: e.fullName, email: e.email, phone: e.phone, departmentId: e.departmentId, status: e.status,
    }));

    await pagedSheet(wb, 'Công việc', [
      { header: 'ID', key: 'id', width: 8 }, { header: 'Mã', key: 'code', width: 13 }, { header: 'Tiêu đề', key: 'title', width: 44 },
      { header: 'Trạng thái', key: 'status', width: 13 }, { header: 'Ưu tiên', key: 'priority', width: 11 }, { header: 'Người làm (ID)', key: 'assigneeId', width: 14 },
      { header: 'Hạn', key: 'dueDate', width: 13, numFmt: 'dd/mm/yyyy' }, { header: 'Hoàn thành', key: 'completedAt', width: 13, numFmt: 'dd/mm/yyyy' },
    ], (id) => prisma.task.findMany(after(id)), (t) => ({
      id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, assigneeId: t.assigneeId, dueDate: d(t.dueDate), completedAt: d(t.completedAt),
    }));
  }, { creator: branding.name });
}
