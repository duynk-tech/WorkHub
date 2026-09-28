import { prisma } from '@/lib/prisma';
import { REASON_CODES } from './types';

/**
 * Báo cáo doanh thu, giá vốn và lợi nhuận thiết bị & phụ tùng.
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
  cogsBaseCost?: number;
  cogsShippingCost?: number;
  cogsOtherCost?: number;
  cogsBreakdownComplete?: boolean;
  grossProfit: number;
  marginPercent: number;
  /** Đơn giá vốn thực tế về kho (tính từ PO gồm tiền hàng NCC + cước VC + hải quan phân bổ) */
  actualUnitCost?: number;
  /** Giá bán bình quân trước chiết khấu ((revenue + discount) / soldQty) */
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
    /** Cước giao hàng thu từ khách, hiển thị riêng ngoài doanh thu mặt hàng. */
    customerShippingFee: number;
    machineRevenue?: number;
    machineDiscount?: number;
    machineQty?: number;
    machineCogs?: number;
    machineCostQty?: number;
    machineMissingCostQty?: number;
    recognizedProfit?: number;
  };
  /** Chi phí xuất kho không bán, tách theo lý do. */
  costByReason: { code: string; label: string; qty: number; value: number }[];
  items: ItemReportRow[];
  /** Chi tiết bán theo từng đơn + mã hàng; giá vốn và phí lấy đúng snapshot phiếu xuất. */
  salesDetails: {
    orderCode: string;
    orderDate: string;
    customerName: string;
    itemId: number;
    itemCode: string;
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    revenue: number;
    baseCost: number | null;
    shippingCost: number | null;
    otherCost: number | null;
    cogs: number;
    grossProfit: number;
    breakdownComplete: boolean;
  }[];
  machineSales?: {
    key: string;
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    costKnown: boolean;
  }[];
  machineSalesDetails?: {
    orderCode: string;
    orderDate: string;
    customerName: string;
    key: string;
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    revenue: number;
    cogs: number | null;
    grossProfit: number | null;
    costKnown: boolean;
  }[];
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
    where: { status: 'COMPLETED', transDate: { gte: range.from, lte: range.to } },
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
        cogsBaseCost: 0,
        cogsShippingCost: 0,
        cogsOtherCost: 0,
        cogsBreakdownComplete: true,
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
      if (trans.type === 'OUT' && trans.reasonCode === 'SALE') continue;
      const row = rowOf(line.item);
      const qty = line.quantity;
      const actualCost = Number(line.unitCost ?? 0);
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
      soldMachines: { select: { id: true, machineCode: true, name: true, model: true, unitCost: true } },
      customer: { select: { name: true } },
    },
  });

  const equipmentIds = [...new Set(customerOrders.flatMap((order) =>
    order.items.filter((line) => line.itemType === 'EQUIPMENT' && line.equipmentId != null)
      .map((line) => Number(line.equipmentId)),
  ))];
  const linkedEquipment = equipmentIds.length
    ? await prisma.fnbEquipment.findMany({
        where: { id: { in: equipmentIds } },
        select: { id: true, unitCost: true, machineCode: true, name: true, model: true },
      })
    : [];
  const equipmentById = new Map(linkedEquipment.map((machine) => [machine.id, machine]));

  // Phiếu xuất bán lưu giá vốn bình quân tại đúng thời điểm xuất. Dùng snapshot
  // này cho COGS để giá nhập mới về sau không làm thay đổi lãi của kỳ cũ.
  const saleTransactions = customerOrders.length
    ? await prisma.inventoryTransaction.findMany({
        where: {
          customerOrderId: { in: customerOrders.map((order) => order.id) },
          type: 'OUT',
          reasonCode: 'SALE',
          status: 'COMPLETED',
        },
        include: {
          items: {
            select: {
              itemId: true,
              quantity: true,
              unitCost: true,
              baseUnitCost: true,
              shippingUnitCost: true,
              otherUnitCost: true,
            },
          },
        },
      })
    : [];
  const saleCostByOrderItem = new Map<string, {
    qty: number;
    cost: number;
    baseCost: number;
    shippingCost: number;
    otherCost: number;
    breakdownComplete: boolean;
  }>();
  for (const transaction of saleTransactions) {
    for (const line of transaction.items) {
      const key = `${transaction.customerOrderId}:${line.itemId}`;
      const quantity = Number(line.quantity) || 0;
      const current = saleCostByOrderItem.get(key) || {
        qty: 0, cost: 0, baseCost: 0, shippingCost: 0, otherCost: 0, breakdownComplete: true,
      };
      current.qty += quantity;
      current.cost += (Number(line.unitCost) || 0) * quantity;
      if (line.baseUnitCost == null || line.shippingUnitCost == null || line.otherUnitCost == null) {
        current.breakdownComplete = false;
      } else {
        current.baseCost += Number(line.baseUnitCost) * quantity;
        current.shippingCost += Number(line.shippingUnitCost) * quantity;
        current.otherCost += Number(line.otherUnitCost) * quantity;
      }
      saleCostByOrderItem.set(key, current);
    }
  }

  // Tổng hợp doanh thu kho và máy móc từ chi tiết đơn bán; phân bổ VAT theo
  // tỷ trọng doanh thu từng nhóm trong đơn để không tính phần dịch vụ ngoài báo cáo.
  let totalDiscount = 0;
  let totalVat = 0;
  let totalReturned = 0;
  let salesOrderCount = 0;
  let customerShippingFee = 0;
  let machineRevenue = 0;
  let machineDiscount = 0;
  let machineQty = 0;
  let machineCogs = 0;
  let machineCostQty = 0;
  let machineMissingCostQty = 0;
  const machineSalesMap = new Map<string, {
    key: string; name: string; quantity: number; gross: number; revenue: number;
    discount: number; cogs: number; costKnown: boolean;
  }>();
  const machineSalesDetails: NonNullable<InventoryProfitReport['machineSalesDetails']> = [];
  const salesDetails: InventoryProfitReport['salesDetails'] = [];

  for (const order of customerOrders) {
    const hasReportSalesLines = order.items.some((line) =>
      line.itemType === 'EQUIPMENT' || (!!line.inventoryItem && line.itemType !== 'EQUIPMENT'),
    );
    if (hasReportSalesLines) {
      salesOrderCount += 1;
      customerShippingFee += Number(order.shippingFee) || 0;
    }
    const countedEquipmentIds = new Set<number>();
    let machineLineSubtotal = 0;
    let machineShare = 0;
    for (const line of order.items) {
      if (line.itemType !== 'EQUIPMENT') continue;
      const quantity = Number(line.quantity) || 0;
      const gross = (Number(line.unitPrice) || 0) * quantity;
      const lineRevenue = line.totalPrice == null ? gross : Number(line.totalPrice);
      const lineDiscount = line.discountAmount == null
        ? Math.max(0, gross - lineRevenue)
        : Number(line.discountAmount);
      const machine = (line.equipmentId == null ? undefined : equipmentById.get(line.equipmentId))
        || order.soldMachines.find((m) => m.id === line.equipmentId);
      if (machine && !countedEquipmentIds.has(machine.id)) {
        countedEquipmentIds.add(machine.id);
        if (machine.unitCost == null) machineMissingCostQty += 1;
        else {
          machineCogs += Number(machine.unitCost) || 0;
          machineCostQty += 1;
        }
      }
      const mapKey = machine?.machineCode || `${line.equipmentId || 'item'}-${line.name}`;
      const key = machine?.machineCode || '—';
      const name = machine ? `${machine.name}${machine.model ? ` (${machine.model})` : ''}` : line.name;
      if (!machine && order.soldMachines.length === 0) machineMissingCostQty += quantity;
      const current = machineSalesMap.get(mapKey) || {
        key, name, quantity: 0, gross: 0, revenue: 0, discount: 0, cogs: 0, costKnown: true,
      };
      current.quantity += quantity;
      current.gross += gross;
      current.revenue += lineRevenue;
      current.discount += lineDiscount;
      if (machine?.unitCost == null) current.costKnown = false;
      else current.cogs += Number(machine.unitCost) * quantity;
      machineSalesMap.set(mapKey, current);
      const machineCostKnown = machine?.unitCost != null;
      const lineCogs = machineCostKnown ? (Number(machine.unitCost) || 0) * quantity : null;
      machineSalesDetails.push({
        orderCode: order.orderCode,
        orderDate: toLocalDateString(order.orderDate),
        customerName: order.customer.name,
        key,
        name,
        quantity,
        unitPrice: Number(line.unitPrice) || 0,
        discount: lineDiscount,
        revenue: lineRevenue,
        cogs: lineCogs,
        grossProfit: lineCogs == null ? null : lineRevenue - lineCogs,
        costKnown: machineCostKnown,
      });
      machineQty += quantity;
      machineRevenue += lineRevenue;
      machineDiscount += lineDiscount;
      machineLineSubtotal += lineRevenue;
    }

    // Thiết bị tạo mới từ lệnh xuất có customerOrderId nhưng có thể dòng đơn
    // không giữ equipmentId; vẫn lấy giá vốn chốt trên hồ sơ thiết bị.
    for (const machine of order.soldMachines) {
      if (countedEquipmentIds.has(machine.id)) continue;
      if (machine.unitCost == null) machineMissingCostQty += 1;
      else {
        machineCogs += Number(machine.unitCost) || 0;
        machineCostQty += 1;
      }
    }

    const orderSubtotal = Number(order.goodsAmount || 0) + Number(order.shippingFee || 0);
    if (machineLineSubtotal > 0 && orderSubtotal > 0) {
      machineShare = Math.min(1, machineLineSubtotal / orderSubtotal);
      totalVat += Number(order.vatAmount || 0) * machineShare;
      totalReturned += Number(order.returnedAmount || 0) * machineShare;
    }

    if (!order.items.some((line) => line.inventoryItem && line.itemType !== 'EQUIPMENT')) continue;
    let inventoryLineSubtotal = 0;
    const costAppliedItemIds = new Set<number>();
    const orderItemDetails = new Map<number, InventoryProfitReport['salesDetails'][number]>();

    for (const line of order.items) {
      if (!line.inventoryItem || line.itemType === 'EQUIPMENT') continue;
      const row = rowOf(line.inventoryItem);
      const qty = Number(line.quantity);
      const unitPrice = Number(line.unitPrice) || 0;
      const totalPrice = line.totalPrice == null ? unitPrice * qty : Number(line.totalPrice);

      // Doanh thu = totalPrice (đã trừ chiết khấu dòng) trên đơn bán hàng
      const lineRevenue = totalPrice;
      // Chiết khấu dòng = giá gốc − thành tiền thực thu
      const lineDiscount = line.discountAmount == null
        ? Math.max(0, unitPrice * qty - lineRevenue)
        : Number(line.discountAmount);

      const detail = orderItemDetails.get(line.inventoryItem.id) || {
        orderCode: order.orderCode,
        orderDate: toLocalDateString(order.orderDate),
        customerName: order.customer.name,
        itemId: line.inventoryItem.id,
        itemCode: line.inventoryItem.itemCode,
        name: line.inventoryItem.name,
        unit: line.inventoryItem.unit,
        quantity: 0,
        unitPrice: 0,
        discount: 0,
        revenue: 0,
        baseCost: null,
        shippingCost: null,
        otherCost: null,
        cogs: 0,
        grossProfit: 0,
        breakdownComplete: false,
      };
      detail.quantity += qty;
      detail.discount += lineDiscount;
      detail.revenue += lineRevenue;
      orderItemDetails.set(line.inventoryItem.id, detail);

      row.soldQty += qty;
      row.revenue += lineRevenue;
      row.discount += lineDiscount;

      // Một mã có thể lặp lại trong nhiều dòng của cùng đơn. Cộng snapshot
      // của phiếu xuất đúng một lần cho đơn+mã hàng, rồi cộng tiếp các đơn
      // khác; không lấy phí PO mới nhất hay làm tròn lại qua đơn giá bình quân.
      if (!costAppliedItemIds.has(line.inventoryItem.id)) {
        const saleCost = saleCostByOrderItem.get(`${order.id}:${line.inventoryItem.id}`);
        if (saleCost?.qty) {
          row.cogs += saleCost.cost;
          detail.cogs = saleCost.cost;
          if (saleCost.breakdownComplete) {
            row.cogsBaseCost = (row.cogsBaseCost || 0) + saleCost.baseCost;
            row.cogsShippingCost = (row.cogsShippingCost || 0) + saleCost.shippingCost;
            row.cogsOtherCost = (row.cogsOtherCost || 0) + saleCost.otherCost;
            detail.baseCost = saleCost.baseCost;
            detail.shippingCost = saleCost.shippingCost;
            detail.otherCost = saleCost.otherCost;
            detail.breakdownComplete = true;
          } else {
            row.cogsBreakdownComplete = false;
          }
        } else {
          // Phiếu xuất cũ không có snapshot chi tiết: dùng giá vốn khả dụng
          // để giữ tổng báo cáo, nhưng không giả lập được phần tách từng loại phí.
          const orderItemQty = order.items
            .filter((candidate) => candidate.inventoryItem?.id === line.inventoryItem!.id && candidate.itemType !== 'EQUIPMENT')
            .reduce((total, candidate) => total + (Number(candidate.quantity) || 0), 0);
          const fallbackUnitCost = actualUnitCostMap.get(line.inventoryItem.id)
            ?? Number(line.inventoryItem.costPrice || line.inventoryItem.avgCost || 0);
          row.cogs += fallbackUnitCost * orderItemQty;
          detail.cogs = fallbackUnitCost * orderItemQty;
          row.cogsBreakdownComplete = false;
        }
        costAppliedItemIds.add(line.inventoryItem.id);
      }
      detail.unitPrice = detail.quantity > 0
        ? (detail.revenue + detail.discount) / detail.quantity
        : 0;
      totalDiscount += lineDiscount;
      inventoryLineSubtotal += lineRevenue;
    }

    for (const detail of orderItemDetails.values()) {
      detail.grossProfit = detail.revenue - detail.cogs;
      salesDetails.push(detail);
    }

    // VAT được lưu ở cấp đơn. Phân bổ theo tỷ trọng doanh thu mặt hàng kho,
    // để không cộng VAT dịch vụ/thiết bị không thuộc báo cáo kho.
    if (inventoryLineSubtotal > 0 && orderSubtotal > 0) {
      const inventoryShare = Math.min(1 - machineShare, inventoryLineSubtotal / orderSubtotal);
      totalVat += Number(order.vatAmount || 0) * inventoryShare;
      totalReturned += Number(order.returnedAmount || 0) * inventoryShare;
    }
  }

  // Tồn hiện tại; chưa phải số dư lịch sử tại ngày cuối kỳ.
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
    row.actualUnitCost = row.cogs && row.soldQty
      ? Math.round(row.cogs / row.soldQty)
      : actualUnitCostMap.get(row.itemId) ?? (row.inValue && row.inQty ? Math.round(row.inValue / row.inQty) : row.actualUnitCost || 0);
    row.avgSellPrice = row.soldQty > 0 ? Math.round((row.revenue + row.discount) / row.soldQty) : undefined;
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
      orderCount: salesOrderCount,
      customerShippingFee,
      machineRevenue,
      machineDiscount,
      machineQty,
      machineCogs,
      machineCostQty,
      machineMissingCostQty,
      recognizedProfit: grossProfit + machineRevenue - machineCogs - nonSaleCost,
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
    salesDetails: salesDetails.sort((a, b) =>
      b.orderDate.localeCompare(a.orderDate) || a.orderCode.localeCompare(b.orderCode) || a.name.localeCompare(b.name),
    ),
    machineSales: [...machineSalesMap.values()]
      .map(({ key, name, quantity, gross, revenue, discount, cogs, costKnown }) => ({
        key,
        name,
        quantity,
        unitPrice: quantity > 0 ? Math.round(gross / quantity) : 0,
        discount,
        revenue,
        cogs,
        grossProfit: revenue - cogs,
        costKnown,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    machineSalesDetails: machineSalesDetails.sort((a, b) =>
      b.orderDate.localeCompare(a.orderDate) || a.orderCode.localeCompare(b.orderCode) || a.name.localeCompare(b.name),
    ),
  };
}

/** Xuất báo cáo ra CSV (mở được bằng Excel, có BOM để không lỗi dấu tiếng Việt). */
export function reportToCsv(report: InventoryProfitReport): string {
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [];
  lines.push(`BÁO CÁO DOANH THU THIẾT BỊ & PHỤ TÙNG;${report.range.label}`);
  lines.push(`Từ ngày;${report.range.from};Đến ngày;${report.range.to}`);
  lines.push('');
  lines.push('TỔNG HỢP');
  lines.push(`Số đơn bán hàng;${report.summary.orderCount}`);
  lines.push(`Giá trị nhập kho;${report.summary.inValue}`);
  lines.push(`Doanh thu bán ra (đã trừ CK);${report.summary.revenue}`);
  lines.push(`Doanh thu máy móc (đã trừ chiết khấu);${report.summary.machineRevenue || 0}`);
  lines.push(`Doanh thu trước chiết khấu;${report.summary.revenue + (report.summary.machineRevenue || 0) + report.summary.discount + (report.summary.machineDiscount || 0)}`);
  lines.push(`Tổng doanh thu thuần;${report.summary.revenue + (report.summary.machineRevenue || 0)}`);
  lines.push(`Cước giao hàng thu khách (hiển thị riêng);${report.summary.customerShippingFee}`);
  lines.push(`Tổng giá trị đơn sau điều chỉnh (không đồng nghĩa đã thu);${report.summary.revenue + (report.summary.machineRevenue || 0) + report.summary.vatAmount + report.summary.customerShippingFee - report.summary.returnedAmount}`);
  lines.push(`Số máy bán;${report.summary.machineQty}`);
  lines.push(`Chiết khấu;${report.summary.discount}`);
  lines.push(`Chiết khấu máy móc;${report.summary.machineDiscount || 0}`);
  lines.push(`Tổng chiết khấu;${report.summary.discount + (report.summary.machineDiscount || 0)}`);
  lines.push(`Thuế VAT;${report.summary.vatAmount}`);
  lines.push(`Hàng trả lại;${report.summary.returnedAmount}`);
  lines.push(`Giá vốn hàng bán (đã gồm cước VC, hải quan và phí phân bổ);${report.summary.cogs}`);
  lines.push(`Giá vốn máy móc (đã chốt trên hồ sơ máy);${report.summary.machineCogs || 0}`);
  lines.push(`Lãi gộp;${report.summary.grossProfit}`);
  lines.push(`Tỷ suất lãi gộp (%);${report.summary.marginPercent}`);
  lines.push(`Chi phí xuất không thu tiền;${report.summary.nonSaleCost}`);
  lines.push(`Lợi nhuận sau chi phí xuất kho đã ghi nhận (chưa gồm vận hành và giao hàng thực tế nếu chưa hạch toán);${report.summary.recognizedProfit ?? report.summary.netProfit}`);
  lines.push(`Số máy có giá vốn / tổng máy bán;${report.summary.machineCostQty || 0}/${report.summary.machineQty || 0}`);
  lines.push(`Số máy thiếu giá vốn;${report.summary.machineMissingCostQty || 0}`);
  lines.push('');

  if (report.costByReason.length > 0) {
    lines.push('CHI PHÍ XUẤT KHO THEO LÝ DO');
    lines.push('Lý do;Số lượng;Giá trị');
    for (const r of report.costByReason) {
      lines.push([esc(r.label), r.qty, r.value].join(';'));
    }
    lines.push('');
  }

  lines.push('TỔNG HỢP DOANH THU & GIÁ VỐN PHỤ TÙNG');
  lines.push(
    [
      'Mã hàng', 'Tên hàng', 'ĐVT', 'SL nhập', 'Giá trị nhập', 'SL bán',
      'Đơn giá bán bình quân', 'Chiết khấu', 'Doanh thu thuần',
      'Giá vốn bình quân/đơn vị', 'Tiền hàng vốn', 'Cước mua phân bổ', 'Phí mua khác phân bổ', 'Tổng giá vốn', 'Lợi nhuận gộp', 'Tỷ suất (%)',
      'SL xuất khác', 'Chi phí xuất khác', 'Tồn hiện tại',
    ].join(';'),
  );
  for (const r of report.items) {
    lines.push(
      [
        esc(r.itemCode), esc(r.name), esc(r.unit), r.inQty, r.inValue, r.soldQty,
        r.avgSellPrice || 0, r.discount, r.revenue,
        r.actualUnitCost || 0,
        r.soldQty && r.cogsBreakdownComplete ? r.cogsBaseCost || 0 : '',
        r.soldQty && r.cogsBreakdownComplete ? r.cogsShippingCost || 0 : '',
        r.soldQty && r.cogsBreakdownComplete ? r.cogsOtherCost || 0 : '',
        r.cogs,
        r.grossProfit, r.marginPercent,
        r.nonSaleQty, r.nonSaleCost, r.closingStock,
      ].join(';'),
    );
  }

  lines.push('');
  lines.push('CHI TIẾT BÁN THEO TỪNG ĐƠN');
  lines.push('Mã đơn;Ngày;Khách hàng;Mã hàng;Tên hàng;SL;ĐVT;Đơn giá bán;Chiết khấu;Doanh thu thuần;Tiền hàng vốn;Cước mua phân bổ;Phí mua khác phân bổ;Tổng giá vốn;Lợi nhuận gộp');
  for (const detail of report.salesDetails) {
    lines.push([
      esc(detail.orderCode), detail.orderDate, esc(detail.customerName), esc(detail.itemCode), esc(detail.name),
      detail.quantity, esc(detail.unit), detail.unitPrice, detail.discount, detail.revenue,
      detail.breakdownComplete ? detail.baseCost ?? 0 : '',
      detail.breakdownComplete ? detail.shippingCost ?? 0 : '',
      detail.breakdownComplete ? detail.otherCost ?? 0 : '',
      detail.cogs, detail.grossProfit,
    ].join(';'));
  }

  lines.push('');
  lines.push('TỔNG HỢP DOANH THU MÁY MÓC');
  lines.push('Mã máy;Tên máy;Số lượng;Giá bán;Chiết khấu;Doanh thu;Giá vốn;Lãi gộp');
  for (const machine of report.machineSales || []) {
    lines.push([
      esc(machine.key), esc(machine.name), machine.quantity, machine.unitPrice, machine.discount,
      machine.revenue, machine.costKnown ? machine.cogs : '', machine.costKnown ? machine.grossProfit : '',
    ].join(';'));
  }

  lines.push('');
  lines.push('CHI TIẾT BÁN MÁY MÓC THEO ĐƠN');
  lines.push('Mã đơn;Ngày;Khách hàng;Mã máy;Tên máy;SL;Giá bán;Chiết khấu;Doanh thu;Giá vốn;Lãi gộp');
  for (const machine of report.machineSalesDetails || []) {
    lines.push([
      esc(machine.orderCode), machine.orderDate, esc(machine.customerName), esc(machine.key), esc(machine.name),
      machine.quantity, machine.unitPrice, machine.discount, machine.revenue,
      machine.costKnown ? machine.cogs ?? 0 : '', machine.costKnown ? machine.grossProfit ?? 0 : '',
    ].join(';'));
  }

  return '﻿' + lines.join('\n');
}
