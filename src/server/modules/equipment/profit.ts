import { prisma } from '@/lib/prisma';

/**
 * Lãi / lỗ trên vòng đời một chiếc máy.
 *
 * Gộp ba nguồn tiền quanh đúng chiếc máy đó:
 *  - Bán máy: giá bán trừ giá vốn, cả hai đều chốt tại thời điểm giao
 *  - Dịch vụ: tiền công và linh kiện đã thu qua các đơn sinh từ phiếu sự cố
 *  - Chi phí: giá vốn linh kiện đã thay, kể cả ca bảo hành không thu tiền
 *
 * Máy khai tay từ trước khi hệ thống đi qua kho thì không có giá vốn — trả về
 * `hasCost: false` để màn hình nói rõ là chưa đủ dữ liệu, thay vì hiện lãi bằng
 * đúng giá bán và làm người đọc tưởng lãi 100%.
 */

export interface EquipmentProfit {
  hasCost: boolean;
  soldPrice: number;
  unitCost: number;
  saleProfit: number;
  saleMarginPercent: number;
  serviceRevenue: number;
  servicePartsCost: number;
  serviceProfit: number;
  netProfit: number;
  ticketCount: number;
  billedTicketCount: number;
  orderCode: string | null;
  tickets: {
    ticketCode: string;
    title: string;
    status: string;
    resolvedAt: string | null;
    partsCost: number;
    revenue: number;
    orderCode: string | null;
  }[];
}

export async function getEquipmentProfit(equipmentId: number): Promise<EquipmentProfit | null> {
  const id = Number(equipmentId);
  if (!id || isNaN(id)) return null;

  const equipment = await prisma.fnbEquipment.findUnique({
    where: { id },
    select: {
      unitCost: true,
      soldPrice: true,
      customerOrder: { select: { orderCode: true } },
      tickets: {
        select: {
          id: true,
          ticketCode: true,
          title: true,
          status: true,
          resolvedAt: true,
          partsUsed: { select: { quantity: true, unitCost: true, unitPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!equipment) return null;

  // Doanh thu dịch vụ nằm ở đơn sinh từ phiếu sự cố; hủy đơn thì không tính
  const ticketIds = equipment.tickets.map((t) => t.id);
  const serviceOrders = ticketIds.length
    ? await prisma.customerOrder.findMany({
        where: { serviceTicketId: { in: ticketIds }, status: { not: 'CANCELLED' } },
        select: { orderCode: true, totalAmount: true, serviceTicketId: true },
      })
    : [];
  const revenueByTicket = new Map<number, { amount: number; orderCode: string }>();
  for (const o of serviceOrders) {
    if (!o.serviceTicketId) continue;
    const prev = revenueByTicket.get(o.serviceTicketId);
    revenueByTicket.set(o.serviceTicketId, {
      amount: (prev?.amount || 0) + Number(o.totalAmount || 0),
      orderCode: prev?.orderCode || o.orderCode,
    });
  }

  const tickets = equipment.tickets.map((t) => {
    // Giá vốn linh kiện đã chốt lúc xuất kho; dòng cũ chưa có thì lùi về đơn giá
    const partsCost = t.partsUsed.reduce(
      (sum, p) => sum + Number(p.unitCost ?? p.unitPrice ?? 0) * p.quantity,
      0,
    );
    const billed = revenueByTicket.get(t.id);
    return {
      ticketCode: t.ticketCode,
      title: t.title,
      status: t.status,
      resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
      partsCost,
      revenue: billed?.amount || 0,
      orderCode: billed?.orderCode || null,
    };
  });

  const soldPrice = Number(equipment.soldPrice || 0);
  const unitCost = Number(equipment.unitCost || 0);
  const hasCost = equipment.unitCost !== null;

  const saleProfit = hasCost ? soldPrice - unitCost : 0;
  const servicePartsCost = tickets.reduce((s, t) => s + t.partsCost, 0);
  const serviceRevenue = tickets.reduce((s, t) => s + t.revenue, 0);

  return {
    hasCost,
    soldPrice,
    unitCost,
    saleProfit,
    saleMarginPercent: soldPrice > 0 && hasCost ? Math.round((saleProfit / soldPrice) * 10000) / 100 : 0,
    serviceRevenue,
    servicePartsCost,
    serviceProfit: serviceRevenue - servicePartsCost,
    netProfit: saleProfit + serviceRevenue - servicePartsCost,
    ticketCount: tickets.length,
    billedTicketCount: tickets.filter((t) => t.revenue > 0).length,
    orderCode: equipment.customerOrder?.orderCode || null,
    tickets,
  };
}
