import { allocatePayment } from '@/lib/payment-allocation';
import { prisma } from '@/lib/prisma';
import { nextSequentialCode } from '@/lib/code-sequence';
import { getSetting, setSetting } from '@/server/modules/settings/service';
import { isEquipmentCategory } from './types';
import type {
  SaveSparePartInput,
  SaveStockTransactionInput,
  SaveWarehouseInput,
  SparePartFilter,
  SaveSparePartOrderInput,
  UpdateOrderStatusInput,
  SparePartPricingConfig,
} from './types';
import {
  TRANSACTION_TYPES,
  VOLUME_DISCOUNT_TIERS,
  SparePartPricingConfigSchema,
  calculateSellingPriceFromMargin,
  weightedAverageCost,
  reasonNeedsApproval,
  calculateLandedCostAllocation,
  formatStockCostMetrics,
  parseStockCostMetrics,
} from './types';

export { calculateSellingPriceFromMargin };

/** Tự sinh mã phụ tùng SP-YYYY-XXXX */
export async function generateItemCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SP-${year}-`;
  const rows = await prisma.inventoryItem.findMany({
    where: { itemCode: { startsWith: prefix } },
    select: { itemCode: true },
  });
  return nextSequentialCode(prefix, rows.map((r) => r.itemCode));
}

/** Tự sinh mã giao dịch kho NK/XK/DC-YYYY-XXXX */
export async function generateTransCode(type: 'IN' | 'OUT' | 'TRANSFER'): Promise<string> {
  const year = new Date().getFullYear();
  const typeInfo = TRANSACTION_TYPES[type] || { prefix: 'TX' };
  const prefix = `${typeInfo.prefix}-${year}-`;
  const rows = await prisma.inventoryTransaction.findMany({
    where: { transCode: { startsWith: prefix } },
    select: { transCode: true },
  });
  return nextSequentialCode(prefix, rows.map((r) => r.transCode));
}

/** Lấy danh sách phụ tùng & vật tư kèm tồn kho */
export async function listSpareParts(filter: SparePartFilter = {}) {
  const where: any = {};

  if (filter.search?.trim()) {
    const s = filter.search.trim();
    where.OR = [
      { name: { contains: s } },
      { itemCode: { contains: s } },
      { compatibleWith: { contains: s } },
      { manufacturer: { contains: s } },
    ];
  }

  if (filter.category && filter.category !== 'ALL') {
    where.category = filter.category;
  }

  if (filter.supplyType && filter.supplyType !== 'ALL') {
    where.supplyType = filter.supplyType;
  }

  const items = await prisma.inventoryItem.findMany({
    where,
    include: {
      stocks: {
        include: {
          warehouse: { select: { id: true, code: true, name: true, type: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Tính tổng tồn kho và lọc theo kho / cảnh báo tồn thấp nếu có
  const enriched = items.map((item) => {
    const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const isLowStock = totalStock <= item.minStockAlert;
    return {
      ...item,
      totalStock,
      isLowStock,
    };
  });

  if (filter.warehouseId) {
    return enriched.filter((item) =>
      item.stocks.some((s) => s.warehouseId === filter.warehouseId && s.quantity > 0)
    );
  }

  if (filter.lowStockOnly) {
    return enriched.filter((item) => item.isLowStock);
  }

  return enriched;
}

/** Lấy chi tiết 1 phụ tùng theo ID */
export async function getSparePartById(id: number) {
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: numId },
    include: {
      stocks: {
        include: {
          warehouse: { select: { id: true, code: true, name: true, type: true } },
        },
      },
      transItems: {
        include: {
          transaction: {
            include: {
              sourceWarehouse: true,
              targetWarehouse: true,
            },
          },
          ticket: {
            include: {
              equipment: { select: { id: true, machineCode: true, name: true } },
            },
          },
        },
        orderBy: { id: 'desc' },
        take: 20,
      },
    },
  });

  if (!item) return null;

  const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
  return {
    ...item,
    totalStock,
    isLowStock: totalStock <= item.minStockAlert,
  };
}

/** Tạo hoặc Cập nhật Phụ tùng */
export async function saveSparePart(id: number | null, input: SaveSparePartInput) {
  const numId = id ? Number(id) : null;
  const itemCode = input.itemCode?.trim() || (numId ? undefined : await generateItemCode());

  const data = {
    name: input.name.trim(),
    category: input.category,
    supplyType: input.supplyType || 'READY_STOCK',
    unit: input.unit.trim(),
    compatibleWith: input.compatibleWith?.trim() || null,
    minStockAlert: input.minStockAlert,
    costPrice: input.costPrice !== undefined && input.costPrice !== null ? input.costPrice : null,
    sellingPrice: input.sellingPrice !== undefined && input.sellingPrice !== null ? input.sellingPrice : null,
    priceEur: input.priceEur !== undefined && input.priceEur !== null ? input.priceEur : null,
    priceUsd: input.priceUsd !== undefined && input.priceUsd !== null ? input.priceUsd : null,
    lifespan: input.lifespan?.trim() || null,
    leadTimeDays: input.leadTimeDays || 14,
    manufacturer: input.manufacturer?.trim() || null,
    // Chỉ giữ loại máy F&B cho máy nguyên chiếc, tránh rác ở dòng linh kiện
    fnbCategory: input.category === 'EQUIPMENT' ? input.fnbCategory?.trim() || 'OTHER' : null,
    description: input.description?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
    status: input.status,
  };

  if (numId && !isNaN(numId) && numId > 0) {
    return prisma.inventoryItem.update({
      where: { id: numId },
      data,
    });
  }

  return prisma.inventoryItem.create({
    data: {
      ...data,
      itemCode: itemCode!,
    },
  });
}

/** Xóa Phụ tùng */
export async function deleteSparePart(id: number) {
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;
  return prisma.inventoryItem.delete({ where: { id: numId } });
}

/** Lấy danh sách Kho & Xe lưu động */
export async function listWarehouses() {
  try {
    return await prisma.warehouse.findMany({
      include: {
        manager: { select: { id: true, fullName: true, phone: true } },
        stocks: {
          include: {
            item: { select: { id: true, itemCode: true, name: true, unit: true, category: true } },
          },
        },
        equipments: {
          select: { id: true, machineCode: true, name: true, category: true, status: true },
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (err: any) {
    console.warn('[listWarehouses] Query with equipments failed, falling back:', err?.message);
    const warehouses = await prisma.warehouse.findMany({
      include: {
        manager: { select: { id: true, fullName: true, phone: true } },
        stocks: {
          include: {
            item: { select: { id: true, itemCode: true, name: true, unit: true, category: true } },
          },
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
    return warehouses.map((w) => ({ ...w, equipments: [] }));
  }
}

/** Tạo hoặc Cập nhật Kho */
export async function saveWarehouse(id: number | null, input: SaveWarehouseInput) {
  const numId = id ? Number(id) : null;

  const data = {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    type: input.type,
    address: input.address?.trim() || null,
    managerId: input.managerId || null,
    status: input.status,
  };

  if (numId && !isNaN(numId) && numId > 0) {
    return prisma.warehouse.update({
      where: { id: numId },
      data,
    });
  }

  return prisma.warehouse.create({ data });
}

/** Thực hiện Giao dịch Kho: Nhập kho (IN) / Xuất kho (OUT) / Điều chuyển (TRANSFER) */
export async function createStockTransaction(input: SaveStockTransactionInput, userId: number) {
  if (!input.items.length || input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    throw new Error('Số lượng hàng phải là số nguyên dương');
  }
  if (new Set(input.items.map((item) => item.itemId)).size !== input.items.length) throw new Error('Mỗi mặt hàng chỉ xuất hiện một lần trên phiếu');
  const transCode = await generateTransCode(input.type);
  // Giá vốn đổi thì giá bán tự tính phải đổi theo → cần cấu hình margin ngay tại đây
  const pricingConfig = await getSparePartPricingConfig();

  // Phiếu ghi giảm tài sản (hủy, thanh lý, kiểm kê lệch) phải có người duyệt
  // mới được trừ tồn — tạo ra ở trạng thái chờ duyệt, tồn kho giữ nguyên.
  const pendingApproval = reasonNeedsApproval(input.reasonCode);

  return prisma.$transaction(async (tx) => {
    // 1. Kiểm tra tính hợp lệ của kho nguồn/đích
    if (input.type === 'IN' && !input.targetWarehouseId) {
      throw new Error('Vui lòng chọn Kho đích để nhập hàng');
    }
    if (input.type === 'OUT' && !input.sourceWarehouseId) {
      throw new Error('Vui lòng chọn Kho nguồn để xuất hàng');
    }
    if (input.type === 'TRANSFER') {
      if (!input.sourceWarehouseId || !input.targetWarehouseId) {
        throw new Error('Vui lòng chọn cả Kho nguồn và Kho đích để điều chuyển');
      }
      if (input.sourceWarehouseId === input.targetWarehouseId) {
        throw new Error('Kho nguồn và Kho đích không được trùng nhau');
      }
    }

    // 2. Kiểm tra tồn kho khả dụng nếu là OUT hoặc TRANSFER
    if (!pendingApproval && (input.type === 'OUT' || input.type === 'TRANSFER')) {
      for (const it of input.items) {
        const stock = await tx.inventoryStock.findUnique({
          where: {
            warehouseId_itemId: {
              warehouseId: input.sourceWarehouseId!,
              itemId: it.itemId,
            },
          },
        });

        const currentQty = stock?.quantity || 0;
        if (currentQty < it.quantity) {
          const item = await tx.inventoryItem.findUnique({ where: { id: it.itemId } });
          throw new Error(
            `Kho nguồn không đủ số lượng cho "${item?.name || it.itemId}" (Hiện còn: ${currentQty}, Yêu cầu: ${it.quantity})`
          );
        }
      }
    }

    // 3. Chốt giá vốn từng dòng tại thời điểm ghi sổ, đồng thời cập nhật bình quân
    //    gia quyền cho hàng nhập. Giá vốn phải đóng băng theo phiếu, nếu đọc lại
    //    giá hiện hành thì giá vốn hàng bán của đơn cũ sẽ đổi theo giá nhập mới.
    const dbItems = await tx.inventoryItem.findMany({
      where: { id: { in: input.items.map((i) => i.itemId) } },
      select: {
        id: true,
        avgCost: true,
        costPrice: true,
        avgBaseCost: true,
        avgShippingCost: true,
        avgOtherCost: true,
      },
    });
    const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));
    const itemCostMap = new Map(
      dbItems.map((i) => [i.id, Number(i.avgCost ?? i.costPrice ?? 0)]),
    );

    // Tính toán phân bổ cước vận chuyển và chi phí khác nếu là phiếu nhập kho (IN)
    // Ưu tiên giá trị per-item từ client (user đã sửa tay); nếu không có thì tính tự động.
    const hasPerItemCosts = input.type === 'IN' && input.items.every(
      (it) => it.landedCost != null && it.landedCost > 0,
    );
    const costMetrics = input.type === 'IN'
      ? hasPerItemCosts
        ? (() => {
            // Dựng costMetrics từ giá trị per-item do client truyền xuống
            const merchandiseTotal = input.items.reduce(
              (s, it) => s + (Number(it.baseUnitPrice ?? it.unitPrice ?? 0)) * (Number(it.quantity) || 0), 0,
            );
            const totalShipping = input.items.reduce(
              (s, it) => s + (Number(it.allocatedShipping || 0)) * (Number(it.quantity) || 0), 0,
            );
            const totalOther = input.items.reduce(
              (s, it) => s + (Number(it.allocatedOtherFee || 0)) * (Number(it.quantity) || 0), 0,
            );
            return {
              shippingFee: totalShipping,
              otherFee: totalOther,
              merchandiseTotal,
              totalLandedCost: merchandiseTotal + totalShipping + totalOther,
              allocationMethod: (input.allocationMethod || 'QUANTITY') as 'QUANTITY' | 'VALUE' | 'LINE' | 'EXPLICIT',
              items: input.items.map((it) => ({
                itemId: it.itemId,
                quantity: Number(it.quantity) || 0,
                baseUnitPrice: Number(it.baseUnitPrice ?? it.unitPrice ?? 0),
                allocatedShipping: Number(it.allocatedShipping || 0),
                allocatedOtherFee: Number(it.allocatedOtherFee || 0),
                landedCost: Number(it.landedCost || 0),
                subtotalCost: Number(it.landedCost || 0) * (Number(it.quantity) || 0),
              })),
            } satisfies import('./types').StockCostMetrics;
          })()
        : calculateLandedCostAllocation(
            input.items,
            Number(input.shippingFee || 0),
            Number(input.otherFee || 0),
            input.allocationMethod || 'QUANTITY',
          )
      : null;
    const itemMetricMap = costMetrics
      ? new Map(costMetrics.items.map((m) => [m.itemId, m]))
      : null;

    const lineCosts = new Map<number, number>();
    const lineCostComponents = new Map<number, { base: number; shipping: number; other: number } | null>();
    for (const it of input.items) {
      const dbItem = dbItemMap.get(it.itemId);
      const currentCost = itemCostMap.get(it.itemId) || 0;

      if (input.type === 'IN') {
        const totalOnHand = await tx.inventoryStock.aggregate({
          where: { itemId: it.itemId },
          _sum: { quantity: true },
        });

        const metric = itemMetricMap?.get(it.itemId);
        const hasExplicitUnitCost = it.unitPrice != null || it.baseUnitPrice != null || Number(it.landedCost) > 0 || Number(metric?.landedCost) > 0;
        const currentComponentsKnown = dbItem?.avgBaseCost != null && dbItem.avgShippingCost != null && dbItem.avgOtherCost != null;
        const incomingComponents = metric && metric.landedCost > 0
          ? { base: metric.baseUnitPrice, shipping: metric.allocatedShipping, other: metric.allocatedOtherFee }
          : hasExplicitUnitCost
            ? { base: Number(it.baseUnitPrice ?? it.unitPrice ?? 0), shipping: Number(it.allocatedShipping || 0), other: Number(it.allocatedOtherFee || 0) }
            : currentComponentsKnown
              ? { base: Number(dbItem.avgBaseCost), shipping: Number(dbItem.avgShippingCost), other: Number(dbItem.avgOtherCost) }
              : null;
        // Giá vốn nhập đã gồm cước/phí. Với phiếu kiểm kê không có giá nhập,
        // giữ nguyên giá vốn hiện tại thay vì kéo bình quân về 0.
        const effectiveUnitPrice = incomingComponents
          ? incomingComponents.base + incomingComponents.shipping + incomingComponents.other
          : currentCost;
        lineCosts.set(it.itemId, hasExplicitUnitCost ? effectiveUnitPrice : currentCost);
        lineCostComponents.set(it.itemId, incomingComponents);

        if (pendingApproval) continue;

        const onHandQty = totalOnHand._sum.quantity || 0;
        const newCost = weightedAverageCost(onHandQty, currentCost, it.quantity, effectiveUnitPrice);
        const existingBreakdownKnown = currentComponentsKnown;
        const nextComponents = incomingComponents && (onHandQty === 0 || existingBreakdownKnown)
          ? {
              base: onHandQty === 0
                ? incomingComponents.base
                : weightedAverageCost(onHandQty, Number(dbItem!.avgBaseCost), it.quantity, incomingComponents.base),
              shipping: onHandQty === 0
                ? incomingComponents.shipping
                : weightedAverageCost(onHandQty, Number(dbItem!.avgShippingCost), it.quantity, incomingComponents.shipping),
              other: onHandQty === 0
                ? incomingComponents.other
                : weightedAverageCost(onHandQty, Number(dbItem!.avgOtherCost), it.quantity, incomingComponents.other),
            }
          : null;

        // Giá vốn vừa đổi → tính lại giá bán theo margin và LƯU LẠI, để báo giá
        // luôn đọc được một con số ổn định thay vì tính nóng mỗi lần mở form.
        const autoPrice =
          newCost > 0
            ? calculateSellingPriceFromMargin(
                newCost,
                pricingConfig.defaultMarginPercent,
                pricingConfig.pricingMethod,
              )
            : null;

        await tx.inventoryItem.update({
          where: { id: it.itemId },
          data: {
            avgCost: newCost,
            ...(nextComponents
              ? {
                  avgBaseCost: nextComponents.base,
                  avgShippingCost: nextComponents.shipping,
                  avgOtherCost: nextComponents.other,
                }
              : {}),
            ...(autoPrice
              ? { autoPrice, autoPriceAt: new Date(), autoPriceBasis: newCost }
              : {}),
          },
        });
        itemCostMap.set(it.itemId, newCost);
      } else {
        lineCosts.set(it.itemId, currentCost);
        const breakdownKnown = dbItem?.avgBaseCost != null && dbItem.avgShippingCost != null && dbItem.avgOtherCost != null;
        lineCostComponents.set(it.itemId, breakdownKnown
          ? { base: Number(dbItem.avgBaseCost), shipping: Number(dbItem.avgShippingCost), other: Number(dbItem.avgOtherCost) }
          : null);
      }
    }

    // 4. Cập nhật số lượng tồn kho (phiếu chờ duyệt thì để nguyên, duyệt xong mới ghi)
    for (const it of pendingApproval ? [] : input.items) {
      if (input.type === 'IN') {
        // Tăng tồn kho tại targetWarehouseId
        await tx.inventoryStock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId: input.targetWarehouseId!,
              itemId: it.itemId,
            },
          },
          create: {
            warehouseId: input.targetWarehouseId!,
            itemId: it.itemId,
            quantity: it.quantity,
          },
          update: {
            quantity: { increment: it.quantity },
          },
        });
      } else if (input.type === 'OUT') {
        // Giảm tồn kho tại sourceWarehouseId
        const deducted = await tx.inventoryStock.updateMany({
          where: { warehouseId: input.sourceWarehouseId!, itemId: it.itemId, quantity: { gte: it.quantity } },
          data: { quantity: { decrement: it.quantity } },
        });
        if (deducted.count !== 1) throw new Error('Tồn kho đã thay đổi, vui lòng tải lại phiếu');
      } else if (input.type === 'TRANSFER') {
        // Giảm tại sourceWarehouseId
        const deducted = await tx.inventoryStock.updateMany({
          where: { warehouseId: input.sourceWarehouseId!, itemId: it.itemId, quantity: { gte: it.quantity } },
          data: { quantity: { decrement: it.quantity } },
        });
        if (deducted.count !== 1) throw new Error('Tồn kho đã thay đổi, vui lòng tải lại phiếu');

        // Tăng tại targetWarehouseId
        await tx.inventoryStock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId: input.targetWarehouseId!,
              itemId: it.itemId,
            },
          },
          create: {
            warehouseId: input.targetWarehouseId!,
            itemId: it.itemId,
            quantity: it.quantity,
          },
          update: {
            quantity: { increment: it.quantity },
          },
        });
      }
    }

    // 4. Tạo bản ghi giao dịch kho
    return tx.inventoryTransaction.create({
      data: {
        transCode,
        type: input.type,
        ...(input.sourceWarehouseId
          ? { sourceWarehouse: { connect: { id: input.sourceWarehouseId } } }
          : {}),
        ...(input.targetWarehouseId
          ? { targetWarehouse: { connect: { id: input.targetWarehouseId } } }
          : {}),
        serviceTicketId: input.serviceTicketId || null,
        customerOrderId: input.customerOrderId || null,
        sparePartOrderId: input.sparePartOrderId || null,
        reasonCode: input.reasonCode || 'OTHER',
        reason: input.reason.trim(),
        // Ngày chứng từ do người lập nhập; giữ giờ 12h trưa để không lệch ngày khi
        // đọc lại theo UTC, giống cách các cột ngày khác trong hệ thống xử lý
        transDate: input.transDate ? new Date(`${input.transDate}T12:00:00`) : new Date(),
        partnerName: input.partnerName?.trim() || null,
        refNo: input.refNo?.trim() || null,
        deliveredBy: input.deliveredBy?.trim() || null,
        receivedBy: input.receivedBy?.trim() || null,
        totalValue: input.items.reduce(
          (sum, it) => sum + (lineCosts.get(it.itemId) ?? 0) * it.quantity,
          0,
        ),
        note: costMetrics && (costMetrics.shippingFee > 0 || costMetrics.otherFee > 0)
          ? formatStockCostMetrics(input.note, costMetrics)
          : (input.note?.trim() || null),
        createdById: userId,
        status: pendingApproval ? 'PENDING_APPROVAL' : 'COMPLETED',
        stockCountId: input.stockCountId || null,
        items: {
          create: input.items.map((it) => {
            const metric = itemMetricMap?.get(it.itemId);
            const landedPrice = metric ? metric.landedCost : (it.unitPrice || null);
            return {
              itemId: it.itemId,
              quantity: it.quantity,
              unitPrice: landedPrice,
              unitCost: lineCosts.get(it.itemId) ?? null,
              baseUnitCost: lineCostComponents.get(it.itemId)?.base ?? null,
              shippingUnitCost: lineCostComponents.get(it.itemId)?.shipping ?? null,
              otherUnitCost: lineCostComponents.get(it.itemId)?.other ?? null,
              ticketId: it.ticketId || input.serviceTicketId || null,
              oldPartPhotoUrl: it.oldPartPhotoUrl || null,
            };
          }),
        },
      },
      include: {
        sourceWarehouse: true,
        targetWarehouse: true,
        items: { include: { item: true } },
      },
    });
  });
}

export interface StockTransactionFilter {
  type?: string;
  reasonCode?: string;
  status?: string;
  warehouseId?: number;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Lịch sử giao dịch kho, có lọc và phân trang.
 * Không trả về "50 dòng gần nhất" nữa vì như thế không đối chiếu được cuối tháng.
 */
export async function listStockTransactions(filter: StockTransactionFilter | number = {}) {
  // Giữ tương thích với chỗ gọi cũ listStockTransactions(50)
  const f: StockTransactionFilter = typeof filter === 'number' ? { pageSize: filter } : filter;
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(f.pageSize) || 50));

  const where: any = {};
  if (f.type && f.type !== 'ALL') where.type = f.type;
  if (f.reasonCode && f.reasonCode !== 'ALL') where.reasonCode = f.reasonCode;
  if (f.status && f.status !== 'ALL') where.status = f.status;
  if (f.warehouseId) {
    where.OR = [{ sourceWarehouseId: f.warehouseId }, { targetWarehouseId: f.warehouseId }];
  }
  if (f.from || f.to) {
    // Lọc theo NGÀY CHỨNG TỪ: nhập bù phiếu của tuần trước vẫn phải rơi đúng kỳ
    where.transDate = {};
    if (f.from) where.transDate.gte = new Date(`${f.from}T00:00:00`);
    if (f.to) where.transDate.lte = new Date(`${f.to}T23:59:59.999`);
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.AND = [
      {
        OR: [
          { transCode: { contains: q } },
          { reason: { contains: q } },
          { note: { contains: q } },
          { items: { some: { item: { name: { contains: q } } } } },
          { items: { some: { item: { itemCode: { contains: q } } } } },
        ],
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: {
      sourceWarehouse: { select: { id: true, code: true, name: true, type: true } },
      targetWarehouse: { select: { id: true, code: true, name: true, type: true } },
      items: {
        include: {
          item: { select: { id: true, itemCode: true, name: true, unit: true, category: true } },
          ticket: { select: { id: true, ticketCode: true, title: true } },
        },
      },
    },
    orderBy: [{ transDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryTransaction.count({ where }),
  ]);

  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Thống kê tổng quan Phụ tùng & Kho */
export async function getSparePartsStats() {
  const [totalItems, warehouses, allStocks] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.warehouse.findMany({ select: { id: true, type: true } }),
    prisma.inventoryStock.findMany({
      include: {
        item: { select: { costPrice: true, avgCost: true, minStockAlert: true, category: true } },
      },
    }),
  ]);

  // Nhóm theo item để tính tồn tổng và xem có dưới minStockAlert không
  const itemStockMap = new Map<
    number,
    { totalQty: number; minAlert: number; costPrice: number; category: string }
  >();
  for (const s of allStocks) {
    const existing = itemStockMap.get(s.itemId) || {
      totalQty: 0,
      minAlert: s.item.minStockAlert,
      // Định giá theo bình quân gia quyền — tiền thực đã bỏ ra; giá vốn khai tay
      // chỉ dùng cho mã chưa từng nhập kho. Phải khớp với chân bảng danh mục.
      costPrice: Number(s.item.avgCost || 0) || Number(s.item.costPrice || 0),
      category: s.item.category,
    };
    existing.totalQty += s.quantity;
    itemStockMap.set(s.itemId, existing);
  }

  let lowStockCount = 0;
  let totalStockValue = 0;
  // Máy nguyên chiếc dùng chung kho với phụ tùng, nhưng giá trị một cái máy lớn
  // hơn cả kho linh kiện — gộp một con số thì không đọc ra được điều gì
  let machineStockValue = 0;
  let machineQty = 0;
  let partStockValue = 0;
  for (const [, val] of itemStockMap) {
    if (val.totalQty <= val.minAlert) {
      lowStockCount++;
    }
    const value = val.totalQty * val.costPrice;
    totalStockValue += value;
    if (isEquipmentCategory(val.category)) {
      machineStockValue += value;
      machineQty += val.totalQty;
    } else {
      partStockValue += value;
    }
  }

  const centralCount = warehouses.filter((w) => w.type === 'CENTRAL').length;
  const branchCount = warehouses.filter((w) => w.type === 'BRANCH').length;

  return {
    totalItems,
    lowStockCount,
    totalStockValue,
    machineStockValue,
    machineQty,
    partStockValue,
    totalWarehouses: warehouses.length,
    centralCount,
    branchCount,
    vanCount: 0,
  };
}

/** Khởi tạo dữ liệu mẫu nếu hệ thống chưa có phụ tùng */
export async function seedDefaultSparePartsAndWarehouses(userId: number) {
  const count = await prisma.inventoryItem.count();
  if (count > 0) return { ok: true, message: 'Hệ thống đã có dữ liệu phụ tùng' };

  // 1. Tạo 2 kho mặc định nếu chưa có
  let centralWh = await prisma.warehouse.findFirst({ where: { code: 'WH-HN-CENTRAL' } });
  if (!centralWh) {
    centralWh = await prisma.warehouse.create({
      data: {
        code: 'WH-HN-CENTRAL',
        name: 'Kho Tổng Kỹ Thuật Hà Nội',
        type: 'CENTRAL',
        address: 'Số 88 Phố Vọng, P. Phương Liệt, Q. Thanh Xuân, Hà Nội',
      },
    });
  }

  let branchWh = await prisma.warehouse.findFirst({ where: { code: 'WH-HCM-BRANCH' } });
  if (!branchWh) {
    branchWh = await prisma.warehouse.create({
      data: {
        code: 'WH-HCM-BRANCH',
        name: 'Kho Chi Nhánh Kỹ Thuật TP.HCM',
        type: 'BRANCH',
        address: 'Số 120 Đường Bạch Đằng, P. 2, Q. Tân Bình, TP. Hồ Chí Minh',
      },
    });
  }

  // 2. Danh sách phụ tùng mẫu
  const sampleParts: SaveSparePartInput[] = [
    {
      itemCode: 'SP-2026-0001',
      name: 'Bộ gioăng phớt cối kem Donper 3 vòi (Silicone thực phẩm)',
      category: 'SPARE_PART',
      supplyType: 'READY_STOCK',
      unit: 'Bộ',
      compatibleWith: 'Máy làm kem Donper BQL-S22, BQL-A11, BQL-922',
      minStockAlert: 10,
      leadTimeDays: 7,
      costPrice: 280000,
      sellingPrice: 450000,
      manufacturer: 'Donper Commercial',
      description: 'Chịu nhiệt độ từ -40°C đến 120°C, tiêu chuẩn an toàn thực phẩm FDA',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0002',
      name: 'Lưỡi cạo kem POM chống mài mòn (Beater Scraper)',
      category: 'SPARE_PART',
      supplyType: 'READY_STOCK',
      unit: 'Chiếc',
      compatibleWith: 'Donper BQL-S22, Taycool TC322',
      minStockAlert: 8,
      leadTimeDays: 7,
      costPrice: 150000,
      sellingPrice: 250000,
      manufacturer: 'Donper Commercial',
      description: 'Chất liệu Polyoxymethylene (POM) chịu mài mòn cao, giúp kem xốp mịn',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0003',
      name: 'Cảm biến nhiệt độ cối kem NTC 10K bọc Inox 304',
      category: 'SPARE_PART',
      supplyType: 'READY_STOCK',
      unit: 'Chiếc',
      compatibleWith: 'Máy làm kem tươi Donper, Taycool, Jingling',
      minStockAlert: 5,
      leadTimeDays: 7,
      costPrice: 320000,
      sellingPrice: 550000,
      manufacturer: 'Omron OEM',
      description: 'Độ chính xác cao ±0.5°C, chống nước chuẩn IP67',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0004',
      name: 'Bo mạch điều khiển trung tâm Mainboard BQL-2026',
      category: 'SPARE_PART',
      supplyType: 'READY_STOCK',
      unit: 'Bộ',
      compatibleWith: 'Máy làm kem tươi Donper dòng BQL',
      minStockAlert: 3,
      leadTimeDays: 7,
      costPrice: 2100000,
      sellingPrice: 3200000,
      manufacturer: 'Donper OEM',
      description: 'Tích hợp màn hình LED hiển thị nhiệt độ và độ cứng của kem',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0005',
      name: 'Dây curoa răng cưa truyền động motor B-850',
      category: 'SPARE_PART',
      supplyType: 'READY_STOCK',
      unit: 'Sợi',
      compatibleWith: 'Máy làm kem tươi Donper BQL-S22',
      minStockAlert: 6,
      leadTimeDays: 7,
      costPrice: 180000,
      sellingPrice: 300000,
      manufacturer: 'Bando Japan',
      description: 'Chống trượt và giảm tiếng ồn khi motor vận hành',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0006',
      name: 'Bàn rung khử bọt khí socola 30W chống rung chấn',
      category: 'SPARE_PART',
      supplyType: 'ON_ORDER',
      unit: 'Cụm',
      compatibleWith: 'Máy nấu và rót socola Choco-Melter 24L',
      minStockAlert: 2,
      leadTimeDays: 21,
      costPrice: 1450000,
      sellingPrice: 2200000,
      priceEur: 45,
      manufacturer: 'ChocoTech Germany',
      description: 'Motor rung đồng tâm giúp bề mặt kẹo socola láng bóng',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0007',
      name: 'Dầu bôi trơn cối kem chuyên dụng Haynes Lubri-Film Plus (113g)',
      category: 'CONSUMABLE',
      supplyType: 'READY_STOCK',
      unit: 'Tuýp',
      compatibleWith: 'Tất cả các dòng máy làm kem tươi và máy pha cà phê',
      minStockAlert: 15,
      leadTimeDays: 7,
      costPrice: 160000,
      sellingPrice: 250000,
      manufacturer: 'Haynes USA',
      description: 'Mỡ thực phẩm chuẩn NSF H1, không mùi, không độc hại',
      status: 'ACTIVE',
    },
    {
      itemCode: 'SP-2026-0008',
      name: 'Van xả socola Inox 304 có gia nhiệt chống đông',
      category: 'MACHINE',
      supplyType: 'ON_ORDER',
      unit: 'Cụm',
      compatibleWith: 'Máy rót socola Choco-Melter 24L',
      minStockAlert: 2,
      leadTimeDays: 25,
      costPrice: 2800000,
      sellingPrice: 4200000,
      priceEur: 90,
      manufacturer: 'ChocoTech Germany',
      description: 'Inox 304 nguyên khối, tích hợp dây đốt nhiệt giữ ấm',
      status: 'ACTIVE',
    },
  ];

  const createdItems = [];
  for (const p of sampleParts) {
    const item = await prisma.inventoryItem.create({ data: p as any });
    createdItems.push(item);
  }

  // 3. Nhập tồn ban đầu cho Kho tổng
  await createStockTransaction(
    {
      type: 'IN',
      reasonCode: 'OTHER_IN',
      targetWarehouseId: centralWh.id,
      reason: 'Nhập kho lô linh kiện bảo hành định kỳ từ nhà máy',
      items: [
        { itemId: createdItems[0].id, quantity: 40, unitPrice: 280000 },
        { itemId: createdItems[1].id, quantity: 25, unitPrice: 150000 },
        { itemId: createdItems[2].id, quantity: 15, unitPrice: 320000 },
        { itemId: createdItems[3].id, quantity: 6, unitPrice: 2100000 },
        { itemId: createdItems[4].id, quantity: 20, unitPrice: 180000 },
        { itemId: createdItems[5].id, quantity: 5, unitPrice: 1450000 },
        { itemId: createdItems[6].id, quantity: 50, unitPrice: 160000 },
        { itemId: createdItems[7].id, quantity: 4, unitPrice: 2800000 },
      ],
    },
    userId
  );

  // 4. Điều chuyển một cơ số phụ tùng sang Kho Chi Nhánh TP.HCM
  await createStockTransaction(
    {
      type: 'TRANSFER',
      reasonCode: 'VAN_STOCK',
      sourceWarehouseId: centralWh.id,
      targetWarehouseId: branchWh.id,
      reason: 'Điều chuyển cấp phát phụ tùng ban đầu cho Kho Chi Nhánh TP.HCM',
      items: [
        { itemId: createdItems[0].id, quantity: 8 },
        { itemId: createdItems[1].id, quantity: 5 },
        { itemId: createdItems[2].id, quantity: 3 },
        { itemId: createdItems[4].id, quantity: 4 },
        { itemId: createdItems[6].id, quantity: 10 },
      ],
    },
    userId
  );

  return { ok: true, message: 'Đã khởi tạo thành công kho và 8 mã linh kiện F&B mẫu' };
}

export const DEFAULT_PRICING_CONFIG: SparePartPricingConfig = {
  defaultExchangeRateEur: 32500,
  defaultExchangeRateUsd: 25500,
  defaultMarginPercent: 30,
  pricingMethod: 'MARGIN',
  defaultShippingFee: 3500000,
  defaultCustomsFee: 0,
  defaultExtraShippingRate: 0,
  defaultVatRate: 8,
  volumeDiscountTiers: VOLUME_DISCOUNT_TIERS,
  defaultValidDays: 15,
  defaultDeliveryTime: '15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)',
  defaultPaymentTerms: 'Tạm ứng 50% khi xác nhận đơn hàng, 50% còn lại trước khi bàn giao linh kiện',
  defaultWarrantyTerms: 'Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử; hỗ trợ kỹ thuật lắp đặt tận nơi.',
  defaultQuotationNotes: 'Linh kiện chính hãng nhập khẩu nguyên chiếc từ nhà sản xuất.',
};

/** Đọc cấu hình chính sách giá & margin phụ tùng */
export async function getSparePartPricingConfig(): Promise<SparePartPricingConfig> {
  try {
    const raw = await getSetting<SparePartPricingConfig | null>('spare_parts_pricing_config', null);
    if (!raw) return DEFAULT_PRICING_CONFIG;
    const parsed = SparePartPricingConfigSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    return DEFAULT_PRICING_CONFIG;
  } catch (err) {
    console.error('[getSparePartPricingConfig error]:', err);
    return DEFAULT_PRICING_CONFIG;
  }
}

/** Lưu cấu hình chính sách giá & margin phụ tùng */
export async function saveSparePartPricingConfig(config: SparePartPricingConfig): Promise<SparePartPricingConfig> {
  const validated = SparePartPricingConfigSchema.parse(config);
  await setSetting('spare_parts_pricing_config', validated, { group: 'spare_parts' });
  // Đổi tỷ suất lợi nhuận / tỷ giá → giá bán đã lưu phải tính lại cho khớp
  await recalcAutoPrices();
  return validated;
}

/**
 * Tính giá đơn hàng Order: EUR -> VND, chiết khấu theo số lượng, cộng cước vận chuyển.
 *
 * Mỗi mặt hàng trong đơn cộng một suất cước. Bản trước còn phụ trội đa mã và phí
 * hải quan; cả hai đã bỏ theo quy định giá mới, chỉ còn cước vận chuyển.
 */
export function calculateOrderPricing(
  items: {
    itemId: number;
    quantity: number;
    unitPriceEur?: number;
    name?: string;
    itemCode?: string;
    shippingFee?: number | null;
    customsFee?: number | null;
  }[],
  options: {
    exchangeRate?: number;
    shippingFee?: number;
    volumeDiscountTiers?: { min: number; max: number; rate: number }[];
    hasCustomer?: boolean;
  } = {}
) {
  const exchangeRate = options.exchangeRate ?? 32500;
  const shippingFee = options.shippingFee ?? 3500000;
  const tiers = options.volumeDiscountTiers ?? VOLUME_DISCOUNT_TIERS;
  const hasCustomer = options.hasCustomer ?? true;

  const totalItemsQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  // Tra cứu % chiết khấu theo tổng số lượng đơn hàng (chỉ áp dụng khi bán / đặt cho khách hàng)
  let discountRate = 0;
  if (hasCustomer) {
    for (const tier of tiers) {
      if (totalItemsQty >= tier.min && totalItemsQty <= tier.max) {
        discountRate = tier.rate;
        break;
      }
    }
  }

  const detailedItems = items.map((it) => {
    const qty = Number(it.quantity) || 1;
    const eur = Number(it.unitPriceEur || 0);
    const unitPriceVnd = Math.round(eur * exchangeRate);
    const subtotalVnd = unitPriceVnd * qty;
    const discountVnd = Math.round(subtotalVnd * discountRate);
    const finalPriceVnd = subtotalVnd - discountVnd;

    return {
      ...it,
      quantity: qty,
      unitPriceEur: eur,
      unitPriceVnd,
      subtotalVnd,
      discountVnd,
      finalPriceVnd,
    };
  });

  const subtotalVnd = detailedItems.reduce((sum, it) => sum + it.subtotalVnd, 0);
  const discountVnd = detailedItems.reduce((sum, it) => sum + it.discountVnd, 0);

  // Mỗi mặt hàng một suất cước
  const actualShippingFee = shippingFee * items.length;
  const totalVnd = subtotalVnd - discountVnd + actualShippingFee;

  return {
    totalItemsQty,
    discountRate,
    subtotalVnd,
    discountVnd,
    shippingFee: actualShippingFee,
    // Giữ khóa để cột customsFee trong DB vẫn ghi 0, tránh phải đổi schema
    customsFee: 0,
    totalVnd,
    items: detailedItems,
  };
}

/** Tự sinh mã đơn hàng order PO-YYYY-XXXX */
export async function generateOrderCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const rows = await prisma.sparePartOrder.findMany({
    where: { orderCode: { startsWith: prefix } },
    select: { orderCode: true },
  });
  return nextSequentialCode(prefix, rows.map((r) => r.orderCode));
}

async function getOrCreateDefaultWarehouseId(): Promise<number> {
  const wh = await prisma.warehouse.findFirst({ orderBy: { id: 'asc' } });
  if (wh) return wh.id;
  const newWh = await prisma.warehouse.create({
    data: { code: 'WH-HN-CENTRAL', name: 'Kho Trung Tâm', type: 'CENTRAL' },
  });
  return newWh.id;
}

/** Tạo Đơn hàng Order mới */
export async function createSparePartOrder(input: SaveSparePartOrderInput, userId: number) {
  if (!prisma?.sparePartOrder) {
    throw new Error('Prisma client chưa tải model sparePartOrder. Vui lòng thử lại.');
  }
  const orderCode = await generateOrderCode();

  // Lấy thông tin giá EUR của các phụ tùng nếu chưa truyền
  const itemIds = input.items.map((it) => it.itemId);
  const dbItems = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
  });
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  const enrichedItems = input.items.map((it) => {
    const dbItem = itemMap.get(it.itemId);
    const unitPriceEur = it.unitPriceEur ?? Number(dbItem?.priceEur || 0);
    return {
      ...it,
      unitPriceEur,
      name: dbItem?.name,
      itemCode: dbItem?.itemCode,
    };
  });

  const hasCustomer = Boolean(input.customerId || input.customerOrderId);
  const pricing = calculateOrderPricing(enrichedItems, {
    exchangeRate: input.exchangeRate,
    shippingFee: input.shippingFee,
    hasCustomer,
  });

  return prisma.sparePartOrder.create({
    data: {
      orderCode,
      supplier: input.supplier.trim(),
      status: 'REQUESTED',
      currency: input.currency || 'EUR',
      shippingFee: input.shippingFee !== undefined ? input.shippingFee : pricing.shippingFee,
      customsFee: input.customsFee !== undefined ? input.customsFee : 0,
      extraShippingRate: 0,
      discountRate: hasCustomer ? pricing.discountRate : 0,
      totalItemsQty: pricing.totalItemsQty,
      subtotalVnd: pricing.subtotalVnd,
      discountVnd: hasCustomer ? pricing.discountVnd : 0,
      totalVnd:
        pricing.subtotalVnd -
        (hasCustomer ? pricing.discountVnd : 0) +
        (input.shippingFee !== undefined ? input.shippingFee : pricing.shippingFee) +
        (input.customsFee !== undefined ? input.customsFee : 0),
      targetWarehouseId: input.targetWarehouseId,
      customerId: input.customerId,
      customerOrderId: input.customerOrderId,
      equipmentId: input.equipmentId,
      serviceTicketId: input.serviceTicketId,
      trackingNumber: input.trackingNumber?.trim() || null,
      etaDate: input.etaDate ? new Date(input.etaDate) : null,
      notes: input.notes?.trim() || null,
      createdById: userId,
      items: {
        create: pricing.items.map((it) => ({
          itemId: it.itemId,
          quantity: it.quantity,
          unitPriceEur: it.unitPriceEur,
          unitPriceVnd: it.unitPriceVnd,
          discountVnd: it.discountVnd,
          finalPriceVnd: it.finalPriceVnd,
          shippingFee: it.shippingFee ?? null,
          customsFee: it.customsFee ?? null,
        })),
      },
    },
    include: {
      items: { include: { item: true } },
      targetWarehouse: true,
      customer: true,
      equipment: true,
    },
  });
}

/** Chỉnh sửa Đơn hàng Order khi chưa nhập kho */
export async function updateSparePartOrder(
  orderId: number,
  input: SaveSparePartOrderInput,
  userId: number
) {
  if (!prisma?.sparePartOrder) {
    throw new Error('Prisma client chưa tải model sparePartOrder. Vui lòng thử lại.');
  }

  const existing = await prisma.sparePartOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!existing) {
    throw new Error('Không tìm thấy đơn hàng order');
  }

  if (existing.status === 'STOCKED' || existing.status === 'COMPLETED') {
    throw new Error('Đơn hàng đã nhập kho, không thể chỉnh sửa thông tin hàng hóa!');
  }
  if (existing.status === 'CANCELLED') {
    throw new Error('Đơn hàng đã hủy, không thể chỉnh sửa!');
  }

  // Lấy thông tin giá EUR của các phụ tùng nếu chưa truyền
  const itemIds = input.items.map((it) => it.itemId);
  const dbItems = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
  });
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  const enrichedItems = input.items.map((it) => {
    const dbItem = itemMap.get(it.itemId);
    const unitPriceEur = it.unitPriceEur ?? Number(dbItem?.priceEur || 0);
    return {
      ...it,
      unitPriceEur,
      name: dbItem?.name,
      itemCode: dbItem?.itemCode,
    };
  });

  const hasCustomer = Boolean(input.customerId || input.customerOrderId);
  const pricing = calculateOrderPricing(enrichedItems, {
    exchangeRate: input.exchangeRate,
    shippingFee: input.shippingFee,
    hasCustomer,
  });

  const totalVnd =
    pricing.subtotalVnd -
    (hasCustomer ? pricing.discountVnd : 0) +
    (input.shippingFee !== undefined ? input.shippingFee : pricing.shippingFee) +
    (input.customsFee !== undefined ? input.customsFee : 0);

  return prisma.$transaction(async (tx) => {
    // Xóa các dòng hàng cũ và tạo lại theo danh sách mới
    await tx.sparePartOrderItem.deleteMany({
      where: { orderId },
    });

    return tx.sparePartOrder.update({
      where: { id: orderId },
      data: {
        supplier: input.supplier.trim(),
        currency: input.currency || 'EUR',
        exchangeRate: input.exchangeRate,
        shippingFee: input.shippingFee !== undefined ? input.shippingFee : pricing.shippingFee,
        customsFee: input.customsFee !== undefined ? input.customsFee : 0,
        discountRate: hasCustomer ? pricing.discountRate : 0,
        totalItemsQty: pricing.totalItemsQty,
        subtotalVnd: pricing.subtotalVnd,
        discountVnd: hasCustomer ? pricing.discountVnd : 0,
        totalVnd,
        targetWarehouseId: input.targetWarehouseId,
        customerId: input.customerId,
        customerOrderId: input.customerOrderId,
        equipmentId: input.equipmentId,
        serviceTicketId: input.serviceTicketId,
        trackingNumber: input.trackingNumber?.trim() || null,
        etaDate: input.etaDate ? new Date(input.etaDate) : null,
        notes: input.notes?.trim() || null,
        items: {
          create: pricing.items.map((it) => ({
            itemId: it.itemId,
            quantity: it.quantity,
            unitPriceEur: it.unitPriceEur,
            unitPriceVnd: it.unitPriceVnd,
            discountVnd: it.discountVnd,
            finalPriceVnd: it.finalPriceVnd,
            shippingFee: it.shippingFee ?? null,
            customsFee: it.customsFee ?? null,
          })),
        },
      },
      include: {
        items: { include: { item: true } },
        targetWarehouse: true,
        customer: true,
        equipment: true,
      },
    });
  });
}

/** Xóa PO nháp mới tạo, chưa đặt NCC, chưa thanh toán và chưa nhập kho. */
export async function deleteNewSparePartOrder(orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.sparePartOrder.findUnique({
      where: { id: orderId },
      include: {
        supplierPayments: { select: { id: true } },
        allocations: { select: { id: true } },
      },
    });
    if (!order) throw new Error('Không tìm thấy phiếu mua hàng NCC');
    if (order.status !== 'REQUESTED') {
      throw new Error('Chỉ xóa được phiếu mới chưa chuyển sang bước đặt nhà cung cấp.');
    }
    if (Number(order.paidAmount) > 0 || order.supplierPayments.length > 0 || order.allocations.length > 0) {
      throw new Error('Phiếu đã có thanh toán NCC nên không thể xóa.');
    }

    const receipt = await tx.inventoryTransaction.findFirst({
      where: { sparePartOrderId: order.id },
      select: { id: true },
    });
    if (receipt || order.stockedAt) {
      throw new Error('Phiếu đã phát sinh nhập kho nên không thể xóa.');
    }

    return tx.sparePartOrder.delete({ where: { id: order.id } });
  }, { isolationLevel: 'Serializable' });
}

/** Cập nhật trạng thái / Tiến trình Đơn hàng Order */
export async function updateSparePartOrderStatus(
  orderId: number,
  input: UpdateOrderStatusInput,
  userId: number
) {
  if (!prisma?.sparePartOrder) {
    throw new Error('Prisma client chưa tải model sparePartOrder. Vui lòng thử lại.');
  }
  const order = await prisma.sparePartOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { item: true } } },
  });
  if (!order) throw new Error('Không tìm thấy đơn hàng order');

  const oldStatus = order.status;
  const newStatus = input.status;

  const updateData: any = {
    status: newStatus,
    trackingNumber: input.trackingNumber !== undefined ? input.trackingNumber : order.trackingNumber,
    etaDate: input.etaDate ? new Date(input.etaDate) : order.etaDate,
    notes: input.notes !== undefined ? input.notes : order.notes,
  };

  if (input.shippingFee !== undefined && input.shippingFee !== null) {
    updateData.shippingFee = input.shippingFee;
  }
  if (input.customsFee !== undefined && input.customsFee !== null) {
    updateData.customsFee = input.customsFee;
  }

  if (newStatus === 'ARRIVED_WAREHOUSE' && !order.arrivedDate) {
    updateData.arrivedDate = new Date();
  }

  if (input.inspectionNote !== undefined) {
    updateData.inspectionNote = input.inspectionNote;
  }

  // Nhập kho chỉ xảy ra sau khi kiểm hàng xong, và chỉ một lần duy nhất
  const shouldStockIn = newStatus === 'STOCKED' && !order.stockedAt;
  if (shouldStockIn) {
    updateData.stockedAt = new Date();
  }

  const updated = await prisma.sparePartOrder.update({
    where: { id: orderId },
    data: updateData,
    include: {
      items: { include: { item: true } },
      targetWarehouse: true,
      customer: true,
      equipment: true,
    },
  });

  // Chốt kiểm hàng (chuyển sang "Đã nhập kho") -> sinh phiếu nhập kho (IN)
  if (shouldStockIn) {
    const warehouseId = order.targetWarehouseId || (await getOrCreateDefaultWarehouseId());
    const effectiveShipping = input.shippingFee !== undefined && input.shippingFee !== null
      ? Number(input.shippingFee)
      : Number(order.shippingFee || 0);
    const effectiveOther = input.customsFee !== undefined && input.customsFee !== null
      ? Number(input.customsFee)
      : Number(order.customsFee || 0);
    const allocateLineFee = (total: number, feeByLine: number[], hasRecordedBreakdown: boolean) => {
      const weights = hasRecordedBreakdown && feeByLine.some((fee) => fee > 0)
        ? feeByLine
        : order.items.map((it) => Number(it.quantity) || 0);
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      let allocated = 0;
      return order.items.map((_, index) => {
        const amount = index === order.items.length - 1
          ? Math.round((total - allocated) * 100) / 100
          : weightTotal > 0 ? Math.round(total * weights[index] / weightTotal * 100) / 100 : 0;
        allocated += amount;
        return amount;
      });
    };
    // Nếu cước thực tế thay đổi khi nhận hàng, giữ tỷ trọng dòng đã khai trên PO;
    // đơn cũ chưa có tách dòng thì chia tổng theo số lượng và chốt lại snapshot.
    const shippingByLine = allocateLineFee(
      effectiveShipping,
      order.items.map((it) => Number(it.shippingFee || 0)),
      order.items.every((it) => it.shippingFee != null),
    );
    const otherByLine = allocateLineFee(
      effectiveOther,
      order.items.map((it) => Number(it.customsFee || 0)),
      order.items.every((it) => it.customsFee != null),
    );
    await Promise.all(order.items.map((it, index) => prisma.sparePartOrderItem.update({
      where: { id: it.id },
      data: { shippingFee: shippingByLine[index], customsFee: otherByLine[index] },
    })));

    const receiptByItem = new Map<number, {
      itemId: number;
      quantity: number;
      baseValue: number;
      shippingValue: number;
      otherValue: number;
    }>();
    order.items.forEach((it, index) => {
      const quantity = it.quantity || 1;
      const line = receiptByItem.get(it.itemId) || {
        itemId: it.itemId,
        quantity: 0,
        baseValue: 0,
        shippingValue: 0,
        otherValue: 0,
      };
      line.quantity += quantity;
      line.baseValue += Number(it.finalPriceVnd || 0);
      line.shippingValue += Number(shippingByLine[index] || 0);
      line.otherValue += Number(otherByLine[index] || 0);
      receiptByItem.set(it.itemId, line);
    });

    await createStockTransaction(
      {
        type: 'IN',
        reasonCode: 'PO_RECEIPT',
        sparePartOrderId: order.id,
        customerOrderId: order.customerOrderId || null,
        targetWarehouseId: warehouseId,
        shippingFee: effectiveShipping,
        otherFee: effectiveOther,
        // Snapshot đã được chốt theo từng dòng PO ngay lúc nhận hàng.
        allocationMethod: 'EXPLICIT',
        reason: `Nhập kho từ phiếu đặt hàng ${order.orderCode} (${order.supplier})`,
        note: [
          `Mã vận đơn: ${order.trackingNumber || 'N/A'}`,
          input.inspectionNote ? `Kiểm hàng: ${input.inspectionNote}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        items: [...receiptByItem.values()].map((line) => {
          const quantity = line.quantity || 1;
          const basePrice = line.baseValue / quantity;
          const allocatedShipping = line.shippingValue / quantity;
          const allocatedOtherFee = line.otherValue / quantity;
          return {
            itemId: line.itemId,
            quantity,
            baseUnitPrice: basePrice,
            unitPrice: basePrice,
            allocatedShipping,
            allocatedOtherFee,
            landedCost: basePrice + allocatedShipping + allocatedOtherFee,
          };
        }),
      },
      userId
    );

    // Chỉ báo đơn khách sẵn sàng giao khi tồn thực tế sau phiếu nhập đủ cho
    // toàn bộ các dòng cần lấy từ kho; một PO về chưa chắc đã bao phủ hết đơn.
    if (order.customerOrderId) {
      const customerOrder = await prisma.customerOrder.findUnique({
        where: { id: order.customerOrderId },
        include: { items: { select: { itemType: true, inventoryItemId: true, equipmentId: true, quantity: true } } },
      });
      if (customerOrder && !customerOrder.stockIssuedAt) {
        const stockLines = customerOrder.items.filter((line) =>
          line.itemType === 'SPARE_PART' || (line.itemType === 'EQUIPMENT' && line.inventoryItemId && !line.equipmentId),
        );
        const itemIds = [...new Set(stockLines.flatMap((line) => line.inventoryItemId ? [line.inventoryItemId] : []))];
        const stockRows = itemIds.length
          ? await prisma.inventoryStock.findMany({
              where: { itemId: { in: itemIds } },
              select: { itemId: true, quantity: true },
            })
          : [];
        const qtyByItem = new Map<number, number>();
        for (const stock of stockRows) {
          qtyByItem.set(stock.itemId, (qtyByItem.get(stock.itemId) || 0) + stock.quantity);
        }
        const requiredByItem = new Map<number, number>();
        let hasUnmappedLine = false;
        for (const line of stockLines) {
          if (!line.inventoryItemId) {
            hasUnmappedLine = true;
            continue;
          }
          requiredByItem.set(
            line.inventoryItemId,
            (requiredByItem.get(line.inventoryItemId) || 0) + line.quantity,
          );
        }
        const ready = !hasUnmappedLine && [...requiredByItem].every(([itemId, quantity]) =>
          (qtyByItem.get(itemId) || 0) >= quantity,
        );
        await prisma.customerOrder.updateMany({
          where: {
            id: customerOrder.id,
            status: { in: ['PENDING', 'CONFIRMED', 'AWAITING_STOCK', 'READY_TO_DELIVER'] },
          },
          data: { status: ready ? 'READY_TO_DELIVER' : 'AWAITING_STOCK' },
        });
      }
    }
  }

  return updated;
}

/** Lấy danh sách các Đơn hàng Order */
export async function listSparePartOrders(filter: { status?: string; supplier?: string } = {}) {
  if (!prisma?.sparePartOrder) {
    return [];
  }
  const where: any = {};
  if (filter.status && filter.status !== 'ALL') {
    where.status = filter.status;
  }
  if (filter.supplier && filter.supplier !== 'ALL') {
    where.supplier = filter.supplier;
  }

  return prisma.sparePartOrder.findMany({
    where,
    include: {
      items: {
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              name: true,
              unit: true,
              category: true,
              supplyType: true,
              costPrice: true,
              avgCost: true,
              sellingPrice: true,
              priceEur: true,
            },
          },
        },
      },
      targetWarehouse: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, code: true, name: true } },
      customerOrder: { select: { id: true, orderCode: true, customerId: true } },
      equipment: { select: { id: true, machineCode: true, name: true } },
      // Lịch sử chi tiền cho phiếu này, để in lại phiếu chi cũ khi cần đối chiếu
      supplierPayments: {
        select: {
          id: true, paymentCode: true, amount: true, method: true,
          paidAt: true, reference: true, note: true,
        },
        orderBy: { paidAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}


/**
 * Tính lại giá bán tự động cho toàn bộ danh mục.
 * Gọi khi đổi cấu hình giá (tỷ giá, tỷ suất lợi nhuận) — giá vốn không đổi nhưng
 * công thức đổi thì giá bán đã lưu cũng phải đổi theo.
 */
export async function recalcAutoPrices(): Promise<number> {
  const config = await getSparePartPricingConfig();
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, avgCost: true, costPrice: true, priceEur: true, autoPrice: true },
  });

  let changed = 0;
  for (const item of items) {
    const cost =
      Number(item.avgCost || 0) ||
      Number(item.costPrice || 0) ||
      Math.round(Number(item.priceEur || 0) * config.defaultExchangeRateEur);
    if (cost <= 0) continue;

    const autoPrice = calculateSellingPriceFromMargin(
      cost,
      config.defaultMarginPercent,
      config.pricingMethod,
    );
    if (Number(item.autoPrice || 0) === autoPrice) continue;

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { autoPrice, autoPriceAt: new Date(), autoPriceBasis: cost },
    });
    changed += 1;
  }

  return changed;
}

// ── Duyệt phiếu kho ghi giảm tài sản ────────────────────────────

/**
 * Duyệt một phiếu kho đang chờ: lúc này mới thực sự trừ/cộng tồn kho.
 * Tách khỏi lúc tạo phiếu để người tạo và người duyệt là hai người khác nhau.
 */
export async function approveStockTransaction(transactionId: number, userId: number) {
  const pricingConfig = await getSparePartPricingConfig();

  return prisma.$transaction(async (tx) => {
    const trans = await tx.inventoryTransaction.findUnique({
      where: { id: transactionId },
      include: { items: true },
    });
    if (!trans) throw new Error('Không tìm thấy phiếu kho');
    if (trans.status !== 'PENDING_APPROVAL') {
      throw new Error(`Phiếu ${trans.transCode} không ở trạng thái chờ duyệt`);
    }

    const claimed = await tx.inventoryTransaction.updateMany({
      where: { id: transactionId, status: 'PENDING_APPROVAL' },
      data: { status: 'COMPLETED', approvedById: userId, approvedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error('Phiếu đã được xử lý, vui lòng tải lại');

    // Kiểm tra tồn ngay lúc duyệt, không dùng số lúc tạo phiếu — hàng có thể đã xuất bớt
    if (trans.type === 'OUT' || trans.type === 'TRANSFER') {
      for (const line of trans.items) {
        const stock = await tx.inventoryStock.findUnique({
          where: {
            warehouseId_itemId: { warehouseId: trans.sourceWarehouseId!, itemId: line.itemId },
          },
        });
        const current = stock?.quantity || 0;
        if (current < line.quantity) {
          const item = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
          throw new Error(
            `Kho không đủ số lượng cho "${item?.name || line.itemId}" (còn ${current}, cần ${line.quantity})`,
          );
        }
      }
    }

    for (const line of trans.items) {
      if (trans.type === 'IN') {
        const onHand = await tx.inventoryStock.aggregate({
          where: { itemId: line.itemId },
          _sum: { quantity: true },
        });
        const item = await tx.inventoryItem.findUnique({
          where: { id: line.itemId },
          select: { avgCost: true, costPrice: true, avgBaseCost: true, avgShippingCost: true, avgOtherCost: true },
        });
        const currentQty = onHand._sum.quantity || 0;
        const newCost = weightedAverageCost(
          currentQty,
          Number(item?.avgCost ?? item?.costPrice ?? 0),
          line.quantity,
          Number(line.unitCost ?? line.unitPrice ?? 0),
        );
        const currentBreakdownKnown = item?.avgBaseCost != null && item.avgShippingCost != null && item.avgOtherCost != null;
        const lineBreakdownKnown = line.baseUnitCost != null && line.shippingUnitCost != null && line.otherUnitCost != null;
        const nextComponents = lineBreakdownKnown && (currentQty === 0 || currentBreakdownKnown)
          ? {
              base: currentQty === 0
                ? Number(line.baseUnitCost)
                : weightedAverageCost(currentQty, Number(item!.avgBaseCost), line.quantity, Number(line.baseUnitCost)),
              shipping: currentQty === 0
                ? Number(line.shippingUnitCost)
                : weightedAverageCost(currentQty, Number(item!.avgShippingCost), line.quantity, Number(line.shippingUnitCost)),
              other: currentQty === 0
                ? Number(line.otherUnitCost)
                : weightedAverageCost(currentQty, Number(item!.avgOtherCost), line.quantity, Number(line.otherUnitCost)),
            }
          : null;
        const autoPrice =
          newCost > 0
            ? calculateSellingPriceFromMargin(
                newCost,
                pricingConfig.defaultMarginPercent,
                pricingConfig.pricingMethod,
              )
            : null;

        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: {
            avgCost: newCost,
            ...(nextComponents
              ? {
                  avgBaseCost: nextComponents.base,
                  avgShippingCost: nextComponents.shipping,
                  avgOtherCost: nextComponents.other,
                }
              : {}),
            ...(autoPrice ? { autoPrice, autoPriceAt: new Date(), autoPriceBasis: newCost } : {}),
          },
        });

        await tx.inventoryStock.upsert({
          where: {
            warehouseId_itemId: { warehouseId: trans.targetWarehouseId!, itemId: line.itemId },
          },
          create: {
            warehouseId: trans.targetWarehouseId!,
            itemId: line.itemId,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });
      } else if (trans.type === 'OUT') {
        const deducted = await tx.inventoryStock.updateMany({
          where: { warehouseId: trans.sourceWarehouseId!, itemId: line.itemId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (deducted.count !== 1) throw new Error('Tồn kho đã thay đổi, vui lòng tải lại phiếu');
      } else {
        const deducted = await tx.inventoryStock.updateMany({
          where: { warehouseId: trans.sourceWarehouseId!, itemId: line.itemId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (deducted.count !== 1) throw new Error('Tồn kho đã thay đổi, vui lòng tải lại phiếu');
        await tx.inventoryStock.upsert({
          where: {
            warehouseId_itemId: { warehouseId: trans.targetWarehouseId!, itemId: line.itemId },
          },
          create: {
            warehouseId: trans.targetWarehouseId!,
            itemId: line.itemId,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });
      }
    }

    return tx.inventoryTransaction.update({
      where: { id: transactionId },
      data: { status: 'COMPLETED', approvedById: userId, approvedAt: new Date() },
      include: { items: { include: { item: true } }, sourceWarehouse: true, targetWarehouse: true },
    });
  }, { isolationLevel: 'Serializable' });
}

/** Duyệt phiếu rồi chốt luôn đợt kiểm kê nếu không còn phiếu nào chờ. */
export async function approveStockTransactionAndSettle(transactionId: number, userId: number) {
  const trans = await approveStockTransaction(transactionId, userId);
  if (trans.stockCountId) await finalizeStockCountIfSettled(trans.stockCountId);
  return trans;
}

/** Từ chối phiếu chờ duyệt — tồn kho chưa từng bị động nên chỉ cần đánh dấu. */
export async function rejectStockTransaction(transactionId: number, userId: number, reason: string) {
  const trans = await prisma.inventoryTransaction.findUnique({ where: { id: transactionId } });
  if (!trans) throw new Error('Không tìm thấy phiếu kho');
  if (trans.status !== 'PENDING_APPROVAL') {
    throw new Error(`Phiếu ${trans.transCode} không ở trạng thái chờ duyệt`);
  }

  const updated = await prisma.inventoryTransaction.update({
    where: { id: transactionId },
    data: {
      status: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      rejectReason: reason?.trim()?.slice(0, 255) || 'Không nêu lý do',
    },
  });

  if (updated.stockCountId) await finalizeStockCountIfSettled(updated.stockCountId);
  return updated;
}

// ── Kiểm kê kho ─────────────────────────────────────────────────

export const STOCK_COUNT_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  COUNTING: { label: 'Đang kiểm đếm', color: '#d97706', bg: '#fef3c7' },
  SUBMITTED: { label: 'Chờ duyệt chênh lệch', color: '#2563eb', bg: '#dbeafe' },
  COMPLETED: { label: 'Đã cân bằng kho', color: '#15803d', bg: '#dcfce7' },
  CANCELLED: { label: 'Đã hủy', color: '#64748b', bg: '#f1f5f9' },
};

async function generateCountCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KK-${year}-`;
  const rows = await prisma.stockCount.findMany({
    where: { countCode: { startsWith: prefix } },
    select: { countCode: true },
  });
  return nextSequentialCode(prefix, rows.map((r) => r.countCode));
}

/**
 * Mở một đợt kiểm kê: chụp lại tồn sổ sách của kho tại thời điểm bắt đầu.
 * Chụp ngay từ đầu để chênh lệch về sau là chênh giữa "sổ sách lúc chốt" và
 * "số đếm thực tế", không bị ảnh hưởng bởi phát sinh trong lúc đang đếm.
 */
export async function createStockCount(warehouseId: number, userId: number, note?: string) {
  const stocks = await prisma.inventoryStock.findMany({
    where: { warehouseId },
    include: { item: { select: { id: true, status: true } } },
  });

  const open = await prisma.stockCount.findFirst({
    where: { warehouseId, status: { in: ['COUNTING', 'SUBMITTED'] } },
  });
  if (open) {
    throw new Error(`Kho này đang có đợt kiểm kê ${open.countCode} chưa hoàn tất`);
  }

  return prisma.stockCount.create({
    data: {
      countCode: await generateCountCode(),
      warehouseId,
      status: 'COUNTING',
      note: note?.trim() || null,
      createdById: userId,
      items: {
        create: stocks.map((st) => ({
          itemId: st.itemId,
          systemQty: st.quantity,
        })),
      },
    },
    include: { items: { include: { count: false } }, warehouse: true },
  });
}

export async function getStockCount(id: number) {
  return prisma.stockCount.findUnique({
    where: { id },
    include: {
      warehouse: true,
      items: { orderBy: { id: 'asc' } },
    },
  });
}

export async function listStockCounts(limit = 20) {
  return prisma.stockCount.findMany({
    include: { warehouse: { select: { id: true, code: true, name: true } }, items: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Ghi số đếm thực tế cho từng mặt hàng. */
export async function saveStockCountItems(
  countId: number,
  lines: { itemId: number; countedQty: number | null; note?: string }[],
) {
  const count = await prisma.stockCount.findUnique({ where: { id: countId } });
  if (!count) throw new Error('Không tìm thấy đợt kiểm kê');
  if (count.status !== 'COUNTING') {
    throw new Error('Đợt kiểm kê đã chốt, không sửa số đếm được nữa');
  }

  for (const line of lines) {
    await prisma.stockCountItem.updateMany({
      where: { countId, itemId: line.itemId },
      data: {
        countedQty: line.countedQty === null ? null : Math.max(0, Math.round(line.countedQty)),
        note: line.note?.trim()?.slice(0, 255) || null,
      },
    });
  }

  return getStockCount(countId);
}

/**
 * Chốt đợt kiểm kê: sinh phiếu điều chỉnh cho phần thừa và phần thiếu.
 * Hai phiếu này ở trạng thái chờ duyệt — đây là đường hợp lệ duy nhất để sửa
 * tồn kho, thay vì tạo phiếu xuất/nhập "điều chỉnh" tùy tiện.
 */
export async function submitStockCount(countId: number, userId: number) {
  const count = await getStockCount(countId);
  if (!count) throw new Error('Không tìm thấy đợt kiểm kê');
  if (count.status !== 'COUNTING') throw new Error('Đợt kiểm kê này đã được chốt');

  const counted = count.items.filter((i) => i.countedQty !== null);
  if (counted.length === 0) throw new Error('Chưa nhập số đếm thực tế cho mặt hàng nào');

  const surplus = counted
    .filter((i) => (i.countedQty as number) > i.systemQty)
    .map((i) => ({ itemId: i.itemId, quantity: (i.countedQty as number) - i.systemQty }));
  const shortage = counted
    .filter((i) => (i.countedQty as number) < i.systemQty)
    .map((i) => ({ itemId: i.itemId, quantity: i.systemQty - (i.countedQty as number) }));

  const created: string[] = [];

  if (surplus.length > 0) {
    const t = await createStockTransaction(
      {
        type: 'IN',
        reasonCode: 'COUNT_SURPLUS',
        targetWarehouseId: count.warehouseId,
        stockCountId: count.id,
        reason: `Kiểm kê thừa theo đợt ${count.countCode}`,
        note: count.note || null,
        items: surplus,
      } as any,
      userId,
    );
    created.push(t.transCode);
  }

  if (shortage.length > 0) {
    const t = await createStockTransaction(
      {
        type: 'OUT',
        reasonCode: 'COUNT_SHORTAGE',
        sourceWarehouseId: count.warehouseId,
        stockCountId: count.id,
        reason: `Kiểm kê thiếu theo đợt ${count.countCode}`,
        note: count.note || null,
        items: shortage,
      } as any,
      userId,
    );
    created.push(t.transCode);
  }

  const balanced = surplus.length === 0 && shortage.length === 0;

  await prisma.stockCount.update({
    where: { id: count.id },
    data: {
      status: balanced ? 'COMPLETED' : 'SUBMITTED',
      submittedAt: new Date(),
      completedAt: balanced ? new Date() : null,
    },
  });

  return {
    balanced,
    surplusCount: surplus.length,
    shortageCount: shortage.length,
    transactions: created,
  };
}

/** Đợt kiểm kê hoàn tất khi mọi phiếu chênh lệch của nó đã được duyệt hoặc từ chối. */
export async function finalizeStockCountIfSettled(countId: number) {
  const pending = await prisma.inventoryTransaction.count({
    where: { stockCountId: countId, status: 'PENDING_APPROVAL' },
  });
  if (pending > 0) return false;

  await prisma.stockCount.updateMany({
    where: { id: countId, status: 'SUBMITTED' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return true;
}

// ── Công nợ nhà cung cấp ────────────────────────────────────────

export async function generateSupplierPaymentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CTT-${year}-`;
  try {
    if (!prisma.supplierPayment) return `${prefix}0001`;
    const rows = await prisma.supplierPayment.findMany({
      where: { paymentCode: { startsWith: prefix } },
      select: { paymentCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.paymentCode));
  } catch {
    return `${prefix}0001`;
  }
}

/** Công nợ của một phiếu đặt hàng: phải trả (giá vốn NCC), đã trả, còn lại, quá hạn. */
export function supplierOrderDebt(order: {
  totalVnd?: any;
  subtotalVnd?: any;
  discountVnd?: any;
  shippingFee?: any;
  customsFee?: any;
  paidAmount?: any;
  dueDate?: Date | string | null;
  status?: string;
  [key: string]: any;
}) {
  // Phần trả nhà cung cấp là Giá Vốn (tiền hàng mua từ NCC, không tính chiết khấu của khách hàng cuối)
  const supplierCost =
    order.subtotalVnd !== undefined && order.subtotalVnd !== null && Number(order.subtotalVnd) > 0
      ? Number(order.subtotalVnd)
      : Number(order.totalVnd || 0);
  const total = order.status === 'CANCELLED' ? 0 : supplierCost;
  const paid = Number(order.paidAmount || 0);
  const remaining = Math.max(0, total - paid);
  const due = order.dueDate ? new Date(order.dueDate) : null;
  const overdue = Boolean(remaining > 0 && due && due < new Date(new Date().toDateString()));
  return { total, paid, remaining, overdue };
}

export function summarizeSupplierDebt(orders: any[]) {
  return (orders || []).reduce(
    (acc, o) => {
      const d = supplierOrderDebt(o);
      acc.totalBilled += d.total;
      acc.totalPaid += Math.min(d.paid, d.total);
      acc.outstanding += d.remaining;
      if (d.overdue) {
        acc.overdue += d.remaining;
        acc.overdueOrders += 1;
      }
      return acc;
    },
    { totalBilled: 0, totalPaid: 0, outstanding: 0, overdue: 0, overdueOrders: 0 },
  );
}

export async function recordSupplierPayment(
  input: {
    supplier: string;
    orderId?: number;
    amount: number;
    method?: string;
    paidAt?: string;
    reference?: string;
    note?: string;
  },
  userId?: number,
) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền thanh toán phải lớn hơn 0');
  const paymentCode = await generateSupplierPaymentCode();
  return prisma.$transaction(async (tx) => {
    // Với thanh toán gắn trực tiếp PO, người nhận tiền có thể là hãng vận
    // chuyển/hải quan chứ không trùng tên nhà cung cấp trên PO.
    const orders = input.orderId
      ? await tx.sparePartOrder.findMany({
          where: { id: input.orderId, status: { not: 'CANCELLED' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      : await tx.sparePartOrder.findMany({
          where: { supplier: input.supplier.trim(), status: { not: 'CANCELLED' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
    if (input.orderId && !orders.length) throw new Error('Phiếu mua hàng không tồn tại hoặc đã hủy');
    const { allocations, unapplied } = allocatePayment(amount, orders.map((order) => ({ id: order.id, remaining: supplierOrderDebt(order).remaining })));
    const payment = await tx.supplierPayment.create({ data: {
      allocationVersion: 1, paymentCode, supplier: input.supplier.trim(), orderId: input.orderId || null, amount,
      method: input.method || 'TRANSFER', paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      reference: input.reference?.trim() || null, note: input.note?.trim() || null, createdById: userId || null,
      allocations: { create: allocations },
    } });
    for (const allocation of allocations) await tx.sparePartOrder.update({ where: { id: allocation.orderId }, data: { paidAmount: { increment: allocation.amount } } });
    await tx.auditLog.create({ data: { actorId: userId || null, entityType: 'SupplierPayment', entityId: String(payment.id), action: 'ALLOCATE', diffJson: { allocations, amount } } });
    return { ...payment, unappliedAmount: unapplied };
  }, { isolationLevel: 'Serializable' });
}

export async function deleteSupplierPayment(id: number, actorId?: number) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findUnique({ where: { id }, include: { allocations: true } });
    if (!payment) throw new Error('Không tìm thấy phiếu chi');
    if (Number(payment.amount) <= 0) throw new Error('Phiếu điều chỉnh cần đối soát riêng');
    let allocations = payment.allocations.map((a) => ({ orderId: a.orderId, amount: Number(a.amount) }));
    if (!allocations.length && payment.allocationVersion !== 1) {
      if (!payment.orderId) throw new Error('Phiếu chi cũ chưa có phân bổ. Cần đối soát trước khi hủy.');
      allocations = [{ orderId: payment.orderId, amount: Number(payment.amount) }];
    }
    for (const allocation of allocations) {
      const updated = await tx.sparePartOrder.updateMany({ where: { id: allocation.orderId, paidAmount: { gte: allocation.amount } }, data: { paidAmount: { decrement: allocation.amount } } });
      if (updated.count !== 1) throw new Error('Công nợ không khớp phân bổ. Cần đối soát trước khi hủy.');
    }
    await tx.auditLog.create({ data: { actorId: actorId || null, entityType: 'SupplierPayment', entityId: String(id), action: 'REVERSE', diffJson: { paymentCode: payment.paymentCode, amount: Number(payment.amount), allocations } } });
    return tx.supplierPayment.delete({ where: { id } });
  }, { isolationLevel: 'Serializable' });
}

export async function listSupplierPayments(supplier?: string, orderId?: number) {
  if (!prisma.supplierPayment) return [];
  const where: any = {};
  if (orderId) {
    where.orderId = orderId;
  } else if (supplier && supplier !== 'ALL') {
    where.supplier = supplier;
  }
  return prisma.supplierPayment.findMany({
    where,
    include: { order: { select: { id: true, orderCode: true } } },
    orderBy: { paidAt: 'desc' },
    take: 100,
  });
}
