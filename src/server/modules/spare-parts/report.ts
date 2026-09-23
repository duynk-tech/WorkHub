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
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
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
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
    nonSaleCost: number;
    netProfit: number;
    transactionCount: number;
  };
  /** Chi phí xuất kho không bán, tách theo lý do. */
  costByReason: { code: string; label: string; qty: number; value: number }[];
  items: ItemReportRow[];
}

export async function getInventoryProfitReport(range: ReportRange): Promise<InventoryProfitReport> {
  const transactions = await prisma.inventoryTransaction.findMany({
    // Kỳ báo cáo tính theo ngày chứng từ, không phải ngày gõ phiếu vào máy
    where: { transDate: { gte: range.from, lte: range.to } },
    include: {
      items: {
        include: { item: { select: { id: true, itemCode: true, name: true, unit: true } } },
      },
    },
  });

  const rows = new Map<number, ItemReportRow>();
  const reasonAgg = new Map<string, { qty: number; value: number }>();

  const rowOf = (item: { id: number; itemCode: string; name: string; unit: string }) => {
    let row = rows.get(item.id);
    if (!row) {
      row = {
        itemId: item.id,
        itemCode: item.itemCode,
        name: item.name,
        unit: item.unit,
        inQty: 0,
        inValue: 0,
        soldQty: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        marginPercent: 0,
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
      const cost = Number(line.unitCost || 0) * qty;
      const price = Number(line.unitPrice || 0) * qty;

      if (trans.type === 'IN') {
        row.inQty += qty;
        row.inValue += price || cost;
      } else if (trans.type === 'OUT') {
        if (trans.reasonCode === 'SALE') {
          row.soldQty += qty;
          row.revenue += price;
          row.cogs += cost;
        } else {
          row.nonSaleQty += qty;
          row.nonSaleCost += cost;
          const agg = reasonAgg.get(trans.reasonCode) || { qty: 0, value: 0 };
          agg.qty += qty;
          agg.value += cost;
          reasonAgg.set(trans.reasonCode, agg);
        }
      }
      // Điều chuyển không ảnh hưởng lãi lỗ, chỉ đổi chỗ hàng
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
    row.grossProfit = row.revenue - row.cogs;
    row.marginPercent = row.revenue > 0 ? Math.round((row.grossProfit / row.revenue) * 10000) / 100 : 0;
    return row;
  });
  items.sort((a, b) => b.grossProfit - a.grossProfit);

  const sum = (pick: (r: ItemReportRow) => number) => items.reduce((acc, r) => acc + pick(r), 0);
  const revenue = sum((r) => r.revenue);
  const cogs = sum((r) => r.cogs);
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
      cogs,
      grossProfit,
      marginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
      nonSaleCost,
      // Lãi thuần của kho = lãi gộp trừ hàng xuất không thu tiền (bảo hành, hủy...)
      netProfit: grossProfit - nonSaleCost,
      transactionCount: transactions.length,
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
  lines.push(`Giá trị nhập kho;${report.summary.inValue}`);
  lines.push(`Doanh thu bán ra;${report.summary.revenue}`);
  lines.push(`Giá vốn hàng bán;${report.summary.cogs}`);
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
      'Mã hàng', 'Tên hàng', 'ĐVT', 'SL nhập', 'Giá trị nhập', 'SL bán', 'Doanh thu',
      'Giá vốn hàng bán', 'Lãi gộp', 'Tỷ suất (%)', 'SL xuất khác', 'Chi phí xuất khác', 'Tồn cuối',
    ].join(';'),
  );
  for (const r of report.items) {
    lines.push(
      [
        esc(r.itemCode), esc(r.name), esc(r.unit), r.inQty, r.inValue, r.soldQty, r.revenue,
        r.cogs, r.grossProfit, r.marginPercent, r.nonSaleQty, r.nonSaleCost, r.closingStock,
      ].join(';'),
    );
  }

  return '﻿' + lines.join('\n');
}
