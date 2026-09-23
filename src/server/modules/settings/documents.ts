import { prisma } from '@/lib/prisma';

/**
 * Sổ chứng từ tập trung.
 *
 * Gom mọi chứng từ của hệ thống về một danh sách chung để tra cứu: báo giá, đơn
 * hàng, phiếu thu/chi, trả hàng, đặt hàng nhà cung cấp, phiếu kho, kiểm kê và
 * phiếu sự cố. Mỗi dòng giữ link về đúng màn hình xử lý nó, và giữ mã chứng từ
 * gốc để truy được cả chuỗi giao dịch.
 */

export const DOCUMENT_KINDS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  QUOTATION: { label: 'Báo giá', short: 'BG', color: '#2563eb', bg: '#dbeafe' },
  ORDER: { label: 'Đơn hàng khách', short: 'ORD', color: '#7c3aed', bg: '#ede9fe' },
  PAYMENT_IN: { label: 'Phiếu thu', short: 'TT', color: '#16a34a', bg: '#dcfce7' },
  RETURN: { label: 'Trả hàng', short: 'TH', color: '#b45309', bg: '#fef3c7' },
  PURCHASE_ORDER: { label: 'Đặt hàng NCC', short: 'PO', color: '#0891b2', bg: '#cffafe' },
  PAYMENT_OUT: { label: 'Phiếu chi NCC', short: 'CTT', color: '#dc2626', bg: '#fee2e2' },
  STOCK: { label: 'Phiếu kho', short: 'NK/XK', color: '#475569', bg: '#f1f5f9' },
  STOCK_COUNT: { label: 'Kiểm kê', short: 'KK', color: '#0f766e', bg: '#f0fdfa' },
  TICKET: { label: 'Phiếu sự cố', short: 'TICK', color: '#be123c', bg: '#ffe4e6' },
};

export interface DocumentRow {
  kind: string;
  code: string;
  date: string;
  /** Khách hàng hoặc nhà cung cấp. */
  partner: string | null;
  value: number;
  status: string | null;
  /** Mã chứng từ gốc sinh ra chứng từ này. */
  relatedCode: string | null;
  href: string;
}

export interface DocumentFilter {
  kind?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : new Date(0).toISOString());

/** Nhãn tiếng Việt của trạng thái, tra theo bảng nhãn của từng nghiệp vụ. */
async function statusLabeller() {
  const [customerTypes, spareTypes, equipTypes] = await Promise.all([
    import('@/server/modules/customer/types'),
    import('@/server/modules/spare-parts/types'),
    import('@/server/modules/equipment/types'),
  ]);

  const TX_STATUS: Record<string, string> = {
    COMPLETED: 'Đã ghi sổ',
    PENDING_APPROVAL: 'Chờ duyệt',
    REJECTED: 'Đã từ chối',
  };
  const COUNT_STATUS: Record<string, string> = {
    COUNTING: 'Đang kiểm đếm',
    SUBMITTED: 'Chờ duyệt chênh lệch',
    COMPLETED: 'Đã cân bằng kho',
    CANCELLED: 'Đã hủy',
  };

  return (kind: string, code?: string | null): string | null => {
    if (!code) return null;
    switch (kind) {
      case 'QUOTATION':
        return customerTypes.QUOTATION_STATUSES[code]?.label || code;
      case 'ORDER':
        return customerTypes.ORDER_STATUSES[code]?.label || code;
      case 'PURCHASE_ORDER':
        return spareTypes.ORDER_STATUSES[code]?.label?.replace(/^\d+\.\s*/, '') || code;
      case 'STOCK':
        return TX_STATUS[code] || code;
      case 'STOCK_COUNT':
        return COUNT_STATUS[code] || code;
      case 'TICKET':
        return equipTypes.TICKET_STATUSES[code]?.label || code;
      default:
        return code;
    }
  };
}

/**
 * Đọc chứng từ từ mọi bảng rồi gộp lại.
 * Mỗi bảng lấy tối đa 500 dòng gần nhất trong khoảng lọc — đủ cho quy mô hiện tại;
 * khi dữ liệu lớn hơn cần chuyển sang bảng chỉ mục chứng từ riêng.
 */
export async function listDocuments(filter: DocumentFilter = {}) {
  const take = 500;
  const dateRange =
    filter.from || filter.to
      ? {
          gte: filter.from ? new Date(`${filter.from}T00:00:00`) : undefined,
          lte: filter.to ? new Date(`${filter.to}T23:59:59.999`) : undefined,
        }
      : undefined;

  const want = (kind: string) => !filter.kind || filter.kind === 'ALL' || filter.kind === kind;

  const [quotations, orders, paymentsIn, returns, purchaseOrders, paymentsOut, stockTx, counts, tickets] =
    await Promise.all([
      want('QUOTATION')
        ? prisma.customerQuotation.findMany({
            where: dateRange ? { quoteDate: dateRange } : {},
            include: { customer: { select: { name: true } } },
            orderBy: { quoteDate: 'desc' },
            take,
          })
        : [],
      want('ORDER')
        ? prisma.customerOrder.findMany({
            where: dateRange ? { orderDate: dateRange } : {},
            include: { customer: { select: { name: true } }, quotation: { select: { quoteCode: true } } },
            orderBy: { orderDate: 'desc' },
            take,
          })
        : [],
      want('PAYMENT_IN')
        ? prisma.customerPayment.findMany({
            where: dateRange ? { paidAt: dateRange } : {},
            include: { customer: { select: { name: true } }, order: { select: { orderCode: true } } },
            orderBy: { paidAt: 'desc' },
            take,
          })
        : [],
      want('RETURN')
        ? prisma.customerReturn.findMany({
            where: dateRange ? { returnedAt: dateRange } : {},
            include: { customer: { select: { name: true } }, order: { select: { orderCode: true } } },
            orderBy: { returnedAt: 'desc' },
            take,
          })
        : [],
      want('PURCHASE_ORDER')
        ? prisma.sparePartOrder.findMany({
            where: dateRange ? { createdAt: dateRange } : {},
            include: { customerOrder: { select: { orderCode: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
        : [],
      want('PAYMENT_OUT')
        ? prisma.supplierPayment.findMany({
            where: dateRange ? { paidAt: dateRange } : {},
            include: { order: { select: { orderCode: true } } },
            orderBy: { paidAt: 'desc' },
            take,
          })
        : [],
      want('STOCK')
        ? prisma.inventoryTransaction.findMany({
            where: dateRange ? { transDate: dateRange } : {},
            orderBy: { transDate: 'desc' },
            take,
          })
        : [],
      want('STOCK_COUNT')
        ? prisma.stockCount.findMany({
            where: dateRange ? { countDate: dateRange } : {},
            include: { warehouse: { select: { name: true } } },
            orderBy: { countDate: 'desc' },
            take,
          })
        : [],
      want('TICKET')
        ? prisma.serviceTicket.findMany({
            where: dateRange ? { createdAt: dateRange } : {},
            include: {
              customer: { select: { name: true } },
              equipment: { select: { id: true, machineCode: true } },
            },
            orderBy: { createdAt: 'desc' },
            take,
          })
        : [],
    ]);

  const label = await statusLabeller();

  const rows: DocumentRow[] = [
    ...quotations.map((q: any) => ({
      kind: 'QUOTATION',
      code: q.quoteCode,
      date: iso(q.quoteDate),
      partner: q.customer?.name || null,
      value: Number(q.totalAmount || 0),
      status: label('QUOTATION', q.status),
      relatedCode: null,
      href: `/customers/${q.customerId}`,
    })),
    ...orders.map((o: any) => ({
      kind: 'ORDER',
      code: o.orderCode,
      date: iso(o.orderDate),
      partner: o.customer?.name || null,
      value: Number(o.totalAmount || 0),
      status: label('ORDER', o.status),
      relatedCode: o.quotation?.quoteCode || null,
      href: `/customers/${o.customerId}`,
    })),
    ...paymentsIn.map((p: any) => ({
      kind: 'PAYMENT_IN',
      code: p.paymentCode,
      date: iso(p.paidAt),
      partner: p.customer?.name || null,
      value: Number(p.amount),
      status: Number(p.amount) < 0 ? 'Hoàn tiền' : null,
      relatedCode: p.order?.orderCode || null,
      href: `/customers/${p.customerId}`,
    })),
    ...returns.map((r: any) => ({
      kind: 'RETURN',
      code: r.returnCode,
      date: iso(r.returnedAt),
      partner: r.customer?.name || null,
      value: Number(r.totalValue),
      status: r.settlement === 'REFUND' ? 'Hoàn tiền' : 'Giảm công nợ',
      relatedCode: r.order?.orderCode || null,
      href: `/customers/${r.customerId}`,
    })),
    ...purchaseOrders.map((po: any) => ({
      kind: 'PURCHASE_ORDER',
      code: po.orderCode,
      date: iso(po.createdAt),
      partner: po.supplier,
      value: Number(po.totalVnd || 0),
      status: label('PURCHASE_ORDER', po.status),
      relatedCode: po.customerOrder?.orderCode || null,
      href: '/spare-parts',
    })),
    ...paymentsOut.map((p: any) => ({
      kind: 'PAYMENT_OUT',
      code: p.paymentCode,
      date: iso(p.paidAt),
      partner: p.supplier,
      value: Number(p.amount),
      status: null,
      relatedCode: p.order?.orderCode || null,
      href: '/spare-parts',
    })),
    ...stockTx.map((t: any) => ({
      kind: 'STOCK',
      code: t.transCode,
      date: iso(t.transDate ?? t.createdAt),
      partner: t.partnerName || null,
      value: Number(t.totalValue || 0),
      status: label('STOCK', t.status),
      relatedCode: t.reason?.match(/\b(ORD|PO|TH|KK)-\d{4}-\d+\b/)?.[0] || null,
      href: '/spare-parts',
    })),
    ...counts.map((c: any) => ({
      kind: 'STOCK_COUNT',
      code: c.countCode,
      date: iso(c.countDate),
      partner: c.warehouse?.name || null,
      value: 0,
      status: label('STOCK_COUNT', c.status),
      relatedCode: null,
      href: '/spare-parts',
    })),
    ...tickets.map((t: any) => ({
      kind: 'TICKET',
      code: t.ticketCode,
      date: iso(t.createdAt),
      partner: t.customer?.name || null,
      value: 0,
      status: label('TICKET', t.status),
      relatedCode: t.equipment?.machineCode || null,
      href: '/tickets',
    })),
  ];

  const q = filter.search?.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        `${r.code} ${r.partner || ''} ${r.relatedCode || ''}`.toLowerCase().includes(q),
      )
    : rows;

  filtered.sort((a, b) => b.date.localeCompare(a.date));

  const page = Math.max(1, Number(filter.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(filter.pageSize) || 30));
  const total = filtered.length;

  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    countByKind: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1;
      return acc;
    }, {}),
  };
}
