import { prisma } from '@/lib/prisma';

// File riêng, không import auth/context (server-only), để scheduler CLI chạy được.

/**
 * Bảo trì dữ liệu đơn bán, chạy theo lịch (xem src/server/jobs):
 *  - Đơn cũ còn cước vận chuyển: bỏ cước, tính lại VAT và tổng như quy định mới.
 *  - Đơn đã xuất kho và đã thu đủ: chuyển COMPLETED.
 * Trước đây hai việc này chạy mỗi lần mở trang Bán hàng.
 */
export async function runSalesMaintenance() {
  const legacy = await prisma.customerOrder.findMany({
    where: { shippingFee: { gt: 0 } },
    select: { id: true, goodsAmount: true, vatRate: true },
  });
  for (const o of legacy) {
    const goods = Number(o.goodsAmount || 0);
    const vat = Math.round((goods * Number(o.vatRate || 0)) / 100);
    await prisma.customerOrder.update({
      where: { id: o.id },
      data: { shippingFee: 0, vatAmount: vat, totalAmount: goods + vat },
    });
  }

  const completed = await prisma.$executeRaw`
    UPDATE "CustomerOrder" SET status = 'COMPLETED', "updatedAt" = NOW()
     WHERE status NOT IN ('COMPLETED', 'CANCELLED')
       AND "stockIssuedAt" IS NOT NULL
       AND COALESCE("totalAmount", 0) - LEAST(COALESCE("totalAmount", 0), "returnedAmount") - "paidAmount" <= 0`;

  return { freightFixed: legacy.length, completed };
}

/**
 * Báo giá nháp/đã gửi đã qua ngày hiệu lực (giờ Việt Nam) → chuyển EXPIRED và ghi
 * nhật ký. Chạy hằng ngày; báo giá đã chốt, từ chối hay chưa đặt hạn thì không đụng tới.
 */
export async function expireQuotations(now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const due = await prisma.customerQuotation.findMany({
    where: { status: { in: ['DRAFT', 'SENT'] }, validUntil: { lt: new Date(`${today}T00:00:00Z`) } },
    select: { id: true, quoteCode: true, status: true },
  });
  if (!due.length) return { expired: 0 };

  await prisma.$transaction([
    prisma.customerQuotation.updateMany({
      where: { id: { in: due.map((q) => q.id) }, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'EXPIRED' },
    }),
    prisma.auditLog.createMany({
      data: due.map((q) => ({
        entityType: 'CustomerQuotation',
        entityId: String(q.id),
        action: 'AUTO_EXPIRE',
        diffJson: { quoteCode: q.quoteCode, from: q.status, to: 'EXPIRED' },
        source: 'SYSTEM' as const,
      })),
    }),
  ]);
  return { expired: due.length };
}
