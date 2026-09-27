import { prisma } from '@/lib/prisma';
import { REASON_CODES } from './types';

/**
 * Báo cáo nhập – xuất – tồn và lãi gộp của kho phụ tùng.
 *
 * Doanh thu lấy từ đơn giá bán ghi trên phiếu xuất; giá vốn lấy từ `unitCost`
 * đã đóng băng lúc ghi sổ, không đọc giá hiện hành — nếu đọc giá hiện hành thì
 * lãi của kỳ cũ sẽ nhảy mỗi lần giá nhập thay đổi.
 */

export type PeriodPreset = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

/**
 * Ngày dạng YYYY-MM-DD theo giờ địa phương.
 * Không dùng toISOString() vì nó quy về UTC — ở múi giờ +7 thì 01/05 lúc 00:00
 * sẽ bị ghi thành 30/04, làm lệch mốc kỳ báo cáo đúng một ngày.
 */
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ReportRange {
  from: Date;
  to: Date;
  label: string;
}

/** Khoảng thời gian của kỳ báo cáo. `anchor` là ngày bất kỳ trong kỳ. */
export function resolveRange(
  preset: PeriodPreset,
  anchor = new Date(),
  custom?: { from?: string; to?: string },
): ReportRange {
  if (preset === 'CUSTOM' && custom?.from && custom?.to) {
    const from = new Date(`${custom.from}T00:00:00`);
    const to = new Date(`${custom.to}T23:59:59.999`);
    return {
      from,
      to,
      label: `${from.toLocaleDateString('vi-VN')} - ${to.toLocaleDateString('vi-VN')}`,
    };
  }

  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  if (preset === 'YEAR') {
    return {
      from: new Date(y, 0, 1),
      to: new Date(y, 11, 31, 23, 59, 59, 999),
      label: `Năm ${y}`,
    };
  }

  if (preset === 'QUARTER') {
    const q = Math.floor(m / 3);
    return {
      from: new Date(y, q * 3, 1),
      to: new Date(y, q * 3 + 3, 0, 23, 59, 59, 999),
      label: `Quý ${q + 1}/${y}`,
    };
  }

  return {
    from: new Date(y, m, 1),
    to: new Date(y, m + 1, 0, 23, 59, 59, 999),
    label: `Tháng ${m + 1}/${y}`,
  };
}

export interface ItemReportRow {
  itemId: number;
  itemCode: string;
  name: string;
  unit: string;
  inQty: number;
  inValue: number;
  soldQty: number;
  /** Doanh thu thuần = tổng totalPrice các dòng đơn bán (đã trừ chiết khấu dòng) */
  revenue: number;
  /** Chiết khấu = tổng (qty × unitPrice) − totalPrice trên từng dòng đơn bán */
  discount: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  /** Đơn giá vốn thực tế về kho (tính từ PO gồm tiền hàng NCC + cước VC + hải quan phân bổ) */
  actualUnitCost?: number;
  /** Đơn giá bán trung bình (revenue / soldQty) */
  avgSellPrice?: number;
  /** Xuất không sinh doanh thu: bảo hành, sửa chữa, hủy, thanh lý... */
  nonSaleQty: number;
  nonSaleCost: number;
  closingStock: number;
}

export interface InventoryProfitReport {
  range: { from: string; to: string; label: string };
  summary: {
    inQty: number;
    inValue: number;
    soldQty: number;
    /** Doanh thu thuần (đã trừ chiết khấu dòng, chưa VAT) */
    revenue: number;
    /** Tổng chiết khấu trên tất cả đơn bán */
    discount: number;
    /** VAT trên tất cả đơn bán */
    vatAmount: number;
    /** Hàng trả lại */
    returnedAmount: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
    nonSaleCost: number;
    netProfit: number;
    /** Số phiếu kho trong kỳ */
    transactionCount: number;
    /** Số đơn bán hàng trong kỳ */
    orderCount: number;
  };
  /** Chi phí xuất kho không bán, tách theo lý do. */
  costByReason: { code: string; label: string; qty: number; value: number }[];
  items: ItemReportRow[];
}

export async function getInventoryProfitReport(range: ReportRange): Promise<InventoryProfitReport> {
  // 1. Bản đồ Đơn giá vốn thực tế về kho từ các đơn mua hàng NCC (PO)
  //    Phân bổ cước VC + hải quan theo tỷ trọng giá trị hàng (đúng nguyên tắc kế toán),
  //    không chia đều theo số dòng.
  const poOrders = await prisma.sparePartOrder.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: {
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const actualUnitCostMap = new Map<number, number>();
  for (const po of poOrders) {
    // Tổng chi phí phụ của PO
    const shippingFee = Number(po.shippingFee || 0);
    const customsFee = Number(po.customsFee || 0);
    const extraShippingRate = Number(po.extraShippingRate || 0); // VD 0.25 = 25% phụ phí VC

    // Tính tổng giá trị hàng (finalPriceVnd) của toàn PO để phân bổ theo tỷ trọng
    const totalLineValue = po.items.reduce((sum, it) => sum + Number(it.finalPriceVnd || it.unitPriceVnd || 0), 0);
    const totalOverhead = shippingFee + customsFee; // Tổng phí phân bổ

    for (const poItem of po.items) {
      if (actualUnitCostMap.has(poItem.itemId)) continue;
      const qty = Number(poItem.quantity) || 1;
      const lineValue = Number(poItem.finalPriceVnd || poItem.unitPriceVnd || 0);

      // Đơn giá hàng thuần (đã trừ chiết khấu NCC dòng) trên mỗi đơn vị
      const itemBasePerUnit = lineValue / qty;

      // Phụ phí VC thêm (extraShippingRate × giá hàng dòng)
      const extraShipping = itemBasePerUnit * extraShippingRate;

      // Phân bổ cước VC + hải quan theo tỷ trọng giá trị dòng / tổng PO
      const overheadRatio = totalLineValue > 0 ? lineValue / totalLineValue : (1 / (po.items.length || 1));
      const allocatedOverhead = totalOverhead * overheadRatio;
      const overheadPerUnit = allocatedOverhead / qty;

      const actualUnitCost = Math.round(itemBasePerUnit + extraShipping + overheadPerUnit);
      if (actualUnitCost > 0) {
        actualUnitCostMap.set(poItem.itemId, actualUnitCost);
      }
    }
  }

  // 2. Phiếu kho — chỉ dùng để tính nhập kho và xuất khác (bảo hành, hủy…),
  //    KHÔNG dùng để tính doanh thu bán ra.
  const transactions = await prisma.inventoryTransaction.findMany({
    where: { transDate: { gte: range.from, lte: range.to } },
    include: {
      items: {
        include: { item: { select: { id: true, itemCode: true, name: true, unit: true, costPrice: true, avgCost: true } } },
      },
    },
  });

  const rows = new Map<number, ItemReportRow>();
  const reasonAgg = new Map<string, { qty: number; value: number }>();

  const rowOf = (item: { id: number; itemCode: string; name: string; unit: string; costPrice?: any; avgCost?: any }) => {
    let row = rows.get(item.id);
    if (!row) {
      const defaultCost = actualUnitCostMap.get(item.id) ?? Number(item.costPrice || item.avgCost || 0);
      row = {
        itemId: item.id,
        itemCode: item.itemCode,
        name: item.name,
        unit: item.unit,
        inQty: 0,
        inValue: 0,
        soldQty: 0,
        revenue: 0,
        discount: 0,
        cogs: 0,
        grossProfit: 0,
        marginPercent: 0,
        actualUnitCost: defaultCost,
        nonSaleQty: 0,
        nonSaleCost: 0,
        closingStock: 0,
      };
      rows.set(item.id, row);
    }
    return row;
  };

  for (const trans of transactions) {
    for (const line of trans.items) {
      if (!line.item) continue;
      const row = rowOf(line.item);
      const qty = line.quantity;
      const actualCost = actualUnitCostMap.get(line.item.id) ?? Number(line.unitCost || 0);
      const cost = actualCost * qty;
      const price = Number(line.unitPrice || 0) * qty;

      if (trans.type === 'IN') {
        row.inQty += qty;
        row.inValue += price || cost;
      } else if (trans.type === 'OUT') {
        if (trans.reasonCode !== 'SALE') {
          // Xuất không phải bán hàng (bảo hành, hủy, thanh lý…)
          row.nonSaleQty += qty;
          row.nonSaleCost += cost;
          const agg = reasonAgg.get(trans.reasonCode) || { qty: 0, value: 0 };
          agg.qty += qty;
          agg.value += cost;
          reasonAgg.set(trans.reasonCode, agg);
        }
        // Xuất SALE: bỏ qua — doanh thu & giá vốn sẽ tính từ CustomerOrder bên dưới
      }
    }
  }

  // 3. Doanh thu & giá vốn tính chính xác từ chi tiết từng Đơn bán hàng (CustomerOrder)
  //    Mỗi CustomerOrderItem ghi rõ: mặt hàng, số lượng, đơn giá bán, thành tiền.
  //    → Đây là nguồn duy nhất để tính doanh thu, đảm bảo khớp từng đơn.
  const customerOrders = await prisma.customerOrder.findMany({
    where: {
      orderDate: { gte: range.from, lte: range.to },
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      items: {
        include: {
          inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true, costPrice: true, avgCost: true } },
        },
      },
    },
  });

  // Tổng hợp chi tiết đơn bán: chiết khấu, VAT, hàng trả lại — cấp đơn hàng
  let totalDiscount = 0;
  let totalVat = 0;
  let totalReturned = 0;

  for (const order of customerOrders) {
    // Cộng dồn VAT & hàng trả lại cấp đơn hàng
    totalVat += Number(order.vatAmount || 0);
    totalReturned += Number(order.returnedAmount || 0);

    for (const line of order.items) {
      if (!line.inventoryItem) continue;
      const row = rowOf(line.inventoryItem);
      const qty = Number(line.quantity) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const totalPrice = Number(line.totalPrice) || 0;

      // Doanh thu = totalPrice (đã trừ chiết khấu dòng) trên đơn bán hàng
      const lineRevenue = totalPrice > 0 ? totalPrice : unitPrice * qty;
      // Chiết khấu dòng = giá gốc − thành tiền thực thu
      const lineDiscount = Math.max(0, unitPrice * qty - lineRevenue);
      // Giá vốn = đơn giá vốn thực tế PO × số lượng bán
      const actualCost = actualUnitCostMap.get(line.inventoryItem.id) ?? Number(line.inventoryItem.costPrice || line.inventoryItem.avgCost || 0);
      const lineCogs = actualCost * qty;

      row.soldQty += qty;
      row.revenue += lineRevenue;
      row.discount += lineDiscount;
      row.cogs += lineCogs;
      totalDiscount += lineDiscount;
    }
  }

  // Tồn cuối kỳ theo từng mặt hàng
  const stocks = await prisma.inventoryStock.groupBy({
    by: ['itemId'],
    where: { itemId: { in: [...rows.keys()] } },
    _sum: { quantity: true },
  });
  for (const st of stocks) {
    const row = rows.get(st.itemId);
    if (row) row.closingStock = st._sum.quantity || 0;
  }

  const items = [...rows.values()].map((row) => {
    row.actualUnitCost = actualUnitCostMap.get(row.itemId) ?? (row.cogs && row.soldQty ? Math.round(row.cogs / row.soldQty) : (row.inValue && row.inQty ? Math.round(row.inValue / row.inQty) : row.actualUnitCost || 0));
    row.avgSellPrice = row.soldQty > 0 ? Math.round(row.revenue / row.soldQty) : undefined;
    row.grossProfit = row.revenue - row.cogs;
    row.marginPercent = row.revenue > 0 ? Math.round((row.grossProfit / row.revenue) * 10000) / 100 : 0;
    return row;
  });
  items.sort((a, b) => b.grossProfit - a.grossProfit);

  const sum = (pick: (r: ItemReportRow) => number) => items.reduce((acc, r) => acc + pick(r), 0);
  const revenue = sum((r) => r.revenue);
  const cogs = sum((r) => r.cogs);
  const discount = sum((r) => r.discount);
  const nonSaleCost = sum((r) => r.nonSaleCost);
  const grossProfit = revenue - cogs;

  return {
    range: {
      from: toLocalDateString(range.from),
      to: toLocalDateString(range.to),
      label: range.label,
    },
    summary: {
      inQty: sum((r) => r.inQty),
      inValue: sum((r) => r.inValue),
      soldQty: sum((r) => r.soldQty),
      revenue,
      discount,
      vatAmount: totalVat,
      returnedAmount: totalReturned,
      cogs,
      grossProfit,
      marginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
      nonSaleCost,
      // Lãi thuần của kho = lãi gộp trừ hàng xuất không thu tiền (bảo hành, hủy...)
      netProfit: grossProfit - nonSaleCost,
      transactionCount: transactions.length,
      orderCount: customerOrders.length,
    },
    costByReason: [...reasonAgg.entries()]
      .map(([code, agg]) => ({
        code,
        label: REASON_CODES[code]?.label || code,
        qty: agg.qty,
        value: agg.value,
      }))
      .sort((a, b) => b.value - a.value),
    items,
  };
}

/** Xuất báo cáo ra CSV (mở được bằng Excel, có BOM để không lỗi dấu tiếng Việt). */
export function reportToCsv(report: InventoryProfitReport): string {
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [];
  lines.push(`BÁO CÁO NHẬP - XUẤT - LÃI GỘP KHO PHỤ TÙNG;${report.range.label}`);
  lines.push(`Từ ngày;${report.range.from};Đến ngày;${report.range.to}`);
  lines.push('');
  lines.push('TỔNG HỢP');
  lines.push(`Số đơn bán hàng;${report.summary.orderCount}`);
  lines.push(`Giá trị nhập kho;${report.summary.inValue}`);
  lines.push(`Doanh thu bán ra (đã trừ CK);${report.summary.revenue}`);
  lines.push(`Chiết khấu;${report.summary.discount}`);
  lines.push(`Thuế VAT;${report.summary.vatAmount}`);
  lines.push(`Hàng trả lại;${report.summary.returnedAmount}`);
  lines.push(`Giá vốn hàng bán (đã gồm cước VC, hải quan và phí phân bổ);${report.summary.cogs}`);
  lines.push(`Lãi gộp;${report.summary.grossProfit}`);
  lines.push(`Tỷ suất lãi gộp (%);${report.summary.marginPercent}`);
  lines.push(`Chi phí xuất không thu tiền;${report.summary.nonSaleCost}`);
  lines.push(`Lãi thuần;${report.summary.netProfit}`);
  lines.push('');

  if (report.costByReason.length > 0) {
    lines.push('CHI PHÍ XUẤT KHO THEO LÝ DO');
    lines.push('Lý do;Số lượng;Giá trị');
    for (const r of report.costByReason) {
      lines.push([esc(r.label), r.qty, r.value].join(';'));
    }
    lines.push('');
  }

  lines.push('CHI TIẾT THEO MẶT HÀNG');
  lines.push(
    [
      'Mã hàng', 'Tên hàng', 'ĐVT', 'SL nhập', 'Giá trị nhập', 'SL bán',
      'Giá bán TB', 'Chiết khấu', 'Doanh thu (đã trừ CK)',
      'Đơn giá vốn thực tế (đã gồm phí)', 'Giá vốn hàng bán (đã gồm phí)', 'Lãi gộp', 'Tỷ suất (%)',
      'SL xuất khác', 'Chi phí xuất khác', 'Tồn cuối',
    ].join(';'),
  );
  for (const r of report.items) {
    lines.push(
      [
        esc(r.itemCode), esc(r.name), esc(r.unit), r.inQty, r.inValue, r.soldQty,
        r.avgSellPrice || 0, r.discount, r.revenue,
        r.actualUnitCost || 0, r.cogs, r.grossProfit, r.marginPercent,
        r.nonSaleQty, r.nonSaleCost, r.closingStock,
      ].join(';'),
    );
  }

  return '﻿' + lines.join('\n');
}
