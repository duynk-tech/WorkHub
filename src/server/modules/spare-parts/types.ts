import { z } from 'zod';

export const PART_CATEGORIES: Record<string, { label: string; color: string; bg: string }> = {
  SPARE_PART: { label: 'Linh kiện thay thế', color: '#2563eb', bg: '#eff6ff' },
  CONSUMABLE: { label: 'Vật tư tiêu hao', color: '#d97706', bg: '#fef3c7' },
  MACHINE: { label: 'Cụm máy / Bộ phận lớn', color: '#7c3aed', bg: '#ede9fe' },
  EQUIPMENT: { label: 'Máy nguyên chiếc', color: '#0f766e', bg: '#f0fdfa' },
};

/**
 * Máy nguyên chiếc nhập về để bán, dùng chung kho với phụ tùng.
 *
 * Tách riêng khỏi phụ tùng khi thống kê: giá trị một cái máy lớn hơn cả kho linh
 * kiện, để chung một con số thì không đọc được gì. Khác với MACHINE là cụm máy /
 * bộ phận lớn dùng để thay thế, không phải máy bán cho khách.
 */
export const EQUIPMENT_CATEGORY = 'EQUIPMENT';
export function isEquipmentCategory(category?: string | null): boolean {
  return category === EQUIPMENT_CATEGORY;
}

export const SUPPLY_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  READY_STOCK: { label: 'Hàng có sẵn', color: '#16a34a', bg: '#f0fdf4' },
  ON_ORDER: { label: 'Hàng order', color: '#7c3aed', bg: '#f5f3ff' },
};

export const WAREHOUSE_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  CENTRAL: { label: 'Kho trung tâm', color: '#0369a1', bg: '#e0f2fe' },
  BRANCH: { label: 'Kho chi nhánh', color: '#15803d', bg: '#dcfce7' },
};

export const TRANSACTION_TYPES: Record<string, { label: string; color: string; bg: string; prefix: string }> = {
  IN: { label: 'Nhập kho', color: '#16a34a', bg: '#f0fdf4', prefix: 'NK' },
  OUT: { label: 'Xuất kho', color: '#dc2626', bg: '#fef2f2', prefix: 'XK' },
  TRANSFER: { label: 'Điều chuyển', color: '#8b5cf6', bg: '#f5f3ff', prefix: 'DC' },
};

export const ORDER_STATUSES: Record<string, { label: string; color: string; bg: string; step: number }> = {
  REQUESTED: { label: '1. Yêu cầu đặt hàng', color: '#d97706', bg: '#fef3c7', step: 1 },
  ORDERED_SUPPLIER: { label: '2. Đã đặt hãng', color: '#2563eb', bg: '#eff6ff', step: 2 },
  SHIPPING_INTL: { label: '3. Đang vận chuyển quốc tế', color: '#7c3aed', bg: '#f5f3ff', step: 3 },
  CUSTOMS_CLEARING: { label: '4. Đang thông quan', color: '#0891b2', bg: '#ecfeff', step: 4 },
  ARRIVED_WAREHOUSE: { label: '5. Hàng đã về', color: '#16a34a', bg: '#f0fdf4', step: 5 },
  INSPECTING: { label: '6. Đang kiểm hàng', color: '#ca8a04', bg: '#fefce8', step: 6 },
  STOCKED: { label: '7. Đã nhập kho', color: '#0f766e', bg: '#f0fdfa', step: 7 },
  COMPLETED: { label: '8. Hoàn tất', color: '#059669', bg: '#ecfdf5', step: 8 },
  CANCELLED: { label: 'Đã hủy', color: '#dc2626', bg: '#fef2f2', step: 0 },
};

/**
 * Nhãn trạng thái phiếu mua, bỏ số thứ tự bước.
 *
 * Nhãn gốc mang tiền tố "1.", "7."… để danh sách chọn bước xếp đúng thứ tự.
 * Nhưng đứng một mình trên thẻ trạng thái thì "7. Đã nhập kho" đọc như một con
 * số lạc vào, dễ tưởng là số lượng hay tiền — chỗ nào chỉ hiện trạng thái thì
 * dùng hàm này.
 */
export function orderStatusLabel(status: string): string {
  const raw = ORDER_STATUSES[status]?.label ?? status;
  return raw.replace(/^\d+\.\s*/, '');
}

/** Bảng chiết khấu theo tổng số lượng đơn hàng (Volume Discount) */
export const VOLUME_DISCOUNT_TIERS = [
  { min: 1, max: 1, rate: 0.00 },
  { min: 2, max: 9, rate: 0.01 },
  { min: 10, max: 29, rate: 0.02 },
  { min: 30, max: 99999, rate: 0.03 },
];

export const SaveSparePartSchema = z.object({
  itemCode: z.string().min(1, 'Mã phụ tùng không được để trống'),
  name: z.string().min(1, 'Tên phụ tùng không được để trống'),
  category: z.enum(['SPARE_PART', 'CONSUMABLE', 'MACHINE', 'EQUIPMENT']).default('SPARE_PART'),
  supplyType: z.enum(['READY_STOCK', 'ON_ORDER']).default('READY_STOCK'),
  unit: z.string().min(1, 'Đơn vị tính không được để trống'),
  compatibleWith: z.string().optional().nullable(),
  minStockAlert: z.coerce.number().int().min(0).default(5),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  sellingPrice: z.coerce.number().min(0).optional().nullable(),
  priceEur: z.coerce.number().min(0).optional().nullable(),
  priceUsd: z.coerce.number().min(0).optional().nullable(),
  lifespan: z.string().optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(1).default(14),
  manufacturer: z.string().optional().nullable(),
  /** Loại máy F&B, chỉ dùng khi category = EQUIPMENT. */
  fnbCategory: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type SaveSparePartInput = z.infer<typeof SaveSparePartSchema>;

export const StockTransactionItemSchema = z.object({
  itemId: z.number().int().positive('Chọn linh kiện hợp lệ'),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  unitPrice: z.number().min(0).optional().nullable(),
  ticketId: z.number().int().positive().optional().nullable(),
  oldPartPhotoUrl: z.string().optional().nullable(),
  /** Giá mua gốc trước khi phân bổ cước và chi phí khác (nếu có). */
  baseUnitPrice: z.number().min(0).optional().nullable(),
  /** Cước vận chuyển phân bổ cho mỗi đơn vị. */
  allocatedShipping: z.number().min(0).optional().nullable(),
  /** Chi phí khác phân bổ cho mỗi đơn vị. */
  allocatedOtherFee: z.number().min(0).optional().nullable(),
  /** Đơn giá vốn thực tế sau cước & chi phí khác (Landed Cost). */
  landedCost: z.number().min(0).optional().nullable(),
});

export const SaveStockTransactionSchema = z.object({
  type: z.enum(['IN', 'OUT', 'TRANSFER']),
  /** Mã lý do có cấu trúc — bắt buộc để thống kê được. */
  reasonCode: z.string().min(1, 'Vui lòng chọn lý do nhập/xuất kho').default('OTHER'),
  customerOrderId: z.number().int().positive().optional().nullable(),
  sparePartOrderId: z.number().int().positive().optional().nullable(),
  stockCountId: z.number().int().positive().optional().nullable(),
  sourceWarehouseId: z.number().int().positive().optional().nullable(),
  targetWarehouseId: z.number().int().positive().optional().nullable(),
  serviceTicketId: z.number().int().positive().optional().nullable(),
  reason: z.string().min(1, 'Lý do xuất/nhập/điều chuyển không được để trống'),
  /** Ngày trên chứng từ (YYYY-MM-DD); bỏ trống là hôm nay. */
  transDate: z.string().optional().nullable(),
  /** Đơn vị giao hàng đến (phiếu nhập) hoặc đơn vị nhận hàng (phiếu xuất). */
  partnerName: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  deliveredBy: z.string().optional().nullable(),
  receivedBy: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  /** Cước vận chuyển lô hàng (chỉ dùng cho phiếu IN). */
  shippingFee: z.coerce.number().min(0).optional().nullable(),
  /** Chi phí khác phát sinh cho lô hàng (chỉ dùng cho phiếu IN). */
  otherFee: z.coerce.number().min(0).optional().nullable(),
  /** Phương thức phân bổ cước & chi phí: QUANTITY (theo số lượng) hoặc VALUE (theo giá trị). */
  allocationMethod: z.enum(['QUANTITY', 'VALUE']).optional(),
  items: z.array(StockTransactionItemSchema).min(1, 'Phải có ít nhất một mặt hàng'),
});

export type SaveStockTransactionInput = z.infer<typeof SaveStockTransactionSchema>;

export const SaveWarehouseSchema = z.object({
  code: z.string().min(1, 'Mã kho không được để trống'),
  name: z.string().min(1, 'Tên kho không được để trống'),
  type: z.enum(['CENTRAL', 'BRANCH', 'MOBILE_VAN']).default('CENTRAL'),
  address: z.string().optional().nullable(),
  managerId: z.number().int().positive().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type SaveWarehouseInput = z.infer<typeof SaveWarehouseSchema>;

export const OrderItemInputSchema = z.object({
  itemId: z.number().int().positive('Chọn linh kiện hợp lệ'),
  quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
  unitPriceEur: z.number().min(0).optional().nullable(),
});

export const SaveSparePartOrderSchema = z.object({
  supplier: z.string().min(1, 'Tên nhà cung cấp không được để trống').default('Selmi'),
  currency: z.string().default('EUR'),
  exchangeRate: z.coerce.number().positive().default(32500),
  shippingFee: z.coerce.number().min(0).default(3500000),
  customsFee: z.coerce.number().min(0).default(1000000),
  extraShippingRate: z.coerce.number().min(0).default(0.25),
  targetWarehouseId: z.number().int().positive().optional().nullable(),
  customerId: z.number().int().positive().optional().nullable(),
  customerOrderId: z.number().int().positive().optional().nullable(),
  equipmentId: z.number().int().positive().optional().nullable(),
  serviceTicketId: z.number().int().positive().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  etaDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(OrderItemInputSchema).min(1, 'Phải chọn ít nhất một linh kiện để đặt hàng'),
});

export type SaveSparePartOrderInput = z.infer<typeof SaveSparePartOrderSchema>;

export const UpdateOrderStatusSchema = z.object({
  status: z.enum([
    'REQUESTED',
    'ORDERED_SUPPLIER',
    'SHIPPING_INTL',
    'CUSTOMS_CLEARING',
    'ARRIVED_WAREHOUSE',
    'INSPECTING',
    'STOCKED',
    'COMPLETED',
    'CANCELLED',
  ]),
  /** Ghi nhận kết quả kiểm hàng khi chuyển sang "Đã nhập kho". */
  inspectionNote: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  etaDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  shippingFee: z.coerce.number().min(0).optional().nullable(),
  customsFee: z.coerce.number().min(0).optional().nullable(),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export interface SparePartFilter {
  search?: string;
  category?: string;
  supplyType?: string;
  warehouseId?: number;
  lowStockOnly?: boolean;
}

export const VolumeDiscountTierSchema = z.object({
  min: z.number().int().min(1),
  max: z.number().int().min(1),
  rate: z.number().min(0).max(1),
});

export const SparePartPricingConfigSchema = z.object({
  defaultExchangeRateEur: z.coerce.number().positive().default(32500),
  defaultExchangeRateUsd: z.coerce.number().positive().default(25500),
  defaultMarginPercent: z.coerce.number().min(0).max(1000).default(30),
  pricingMethod: z.enum(['MARGIN', 'MARKUP']).default('MARGIN'),
  defaultShippingFee: z.coerce.number().min(0).default(3500000),
  defaultCustomsFee: z.coerce.number().min(0).default(1000000),
  defaultExtraShippingRate: z.coerce.number().min(0).max(5).default(0.25),
  defaultVatRate: z.coerce.number().min(0).max(100).default(8),
  volumeDiscountTiers: z.array(VolumeDiscountTierSchema).default(VOLUME_DISCOUNT_TIERS),
});

export type SparePartPricingConfig = z.infer<typeof SparePartPricingConfigSchema>;

/** Tính giá bán đề xuất từ giá vốn và tỷ suất margin/markup */
export function calculateSellingPriceFromMargin(
  costPrice: number,
  marginPercent: number,
  method: 'MARGIN' | 'MARKUP' = 'MARGIN'
): number {
  if (costPrice <= 0) return 0;
  const rate = marginPercent / 100;

  if (method === 'MARGIN') {
    // Gross Margin: Giá bán = Giá vốn / (1 - Margin%)
    if (rate >= 1) return costPrice * 2; // Guard against division by 0
    return Math.round(costPrice / (1 - rate));
  } else {
    // Markup: Giá bán = Giá vốn * (1 + Markup%)
    return Math.round(costPrice * (1 + rate));
  }
}


export type QuotePriceSource = 'LIST' | 'ESTIMATED' | 'NONE';

export interface QuotePriceResult {
  /** Đơn giá báo khách (VNĐ). */
  price: number;
  /** LIST = lấy giá bán niêm yết; ESTIMATED = suy ra từ giá vốn; NONE = chưa đủ dữ liệu. */
  source: QuotePriceSource;
  /** Giá vốn quy đổi VNĐ dùng để tính (chưa gồm cước). */
  cost: number;
  /** Phần cước nhập khẩu đã phân bổ vào một đơn vị hàng. */
  shippingPerUnit: number;
}

/**
 * Đơn giá báo khách cho một linh kiện.
 *
 * Ưu tiên "Giá bán / Báo giá (VNĐ)" đã khai trong danh mục — đó là giá niêm yết,
 * cước nhập đã nằm sẵn trong đó. Nếu chưa khai thì suy ra theo công thức cấu hình:
 *
 *   Giá bán = Giá vốn / (1 - Margin%) + Cước vận chuyển
 *
 * Lợi nhuận chỉ tính trên giá vốn hàng; cước là khoản thu hộ nên cộng nguyên vào
 * sau, không ăn margin.
 */
export function calculateQuotedUnitPrice(
  part: {
    sellingPrice?: number | null;
    costPrice?: number | null;
    priceEur?: number | null;
    /** Giá vốn bình quân gia quyền — chính xác hơn costPrice khai tay. */
    avgCost?: number | null;
    /** Giá bán tự tính đã lưu lúc giá vốn thay đổi gần nhất. */
    autoPrice?: number | null;
  },
  config?: Partial<SparePartPricingConfig>,
  shippingPerUnit = 0,
): QuotePriceResult {
  const listPrice = Number(part.sellingPrice || 0);
  const exchangeRate = config?.defaultExchangeRateEur ?? 32500;
  const marginPercent = config?.defaultMarginPercent ?? 30;
  const method = config?.pricingMethod ?? 'MARGIN';

  const cost =
    Number(part.avgCost || 0) > 0
      ? Number(part.avgCost)
      : Number(part.costPrice || 0) > 0
        ? Number(part.costPrice)
        : Number(part.priceEur || 0) > 0
          ? Math.round(Number(part.priceEur) * exchangeRate)
          : 0;

  if (listPrice > 0) {
    return { price: listPrice, source: 'LIST', cost, shippingPerUnit: 0 };
  }

  // Giá tự tính đã lưu từ lần giá vốn đổi gần nhất — chỉ dùng khi không phải
  // cộng thêm cước, vì cước thay đổi theo từng lô nên phải tính lại.
  if (shippingPerUnit <= 0 && Number(part.autoPrice || 0) > 0) {
    return { price: Number(part.autoPrice), source: 'ESTIMATED', cost, shippingPerUnit: 0 };
  }

  if (cost <= 0) {
    return { price: 0, source: 'NONE', cost: 0, shippingPerUnit: 0 };
  }

  const freight = Math.max(0, shippingPerUnit);
  return {
    price: calculateSellingPriceFromMargin(cost, marginPercent, method) + freight,
    source: 'ESTIMATED',
    cost,
    shippingPerUnit: freight,
  };
}

/**
 * Tổng cước nhập khẩu cho một lô hàng: mỗi mặt hàng trong đơn cộng một suất cước.
 *
 * Phụ trội đa mã và phí hải quan đã bỏ khỏi công thức giá; phần còn lại là cước
 * tính thẳng theo số mặt hàng.
 */
export function estimateImportFreight(lineCount: number, config?: Partial<SparePartPricingConfig>) {
  if (lineCount <= 0) return 0;
  return Math.round((config?.defaultShippingFee ?? 3500000) * lineCount);
}

/**
 * Mã lý do nhập / xuất kho.
 *
 * Lý do phải là mã có cấu trúc chứ không phải chữ tự do, nếu không sẽ không tổng
 * hợp được "tháng này hủy bao nhiêu tiền hàng hư" hay "xuất bảo hành bao nhiêu".
 * `needsApproval` = ghi giảm tài sản, phải có người duyệt trước khi trừ tồn.
 */
export const REASON_CODES: Record<
  string,
  { label: string; type: 'IN' | 'OUT' | 'TRANSFER'; needsApproval?: boolean; auto?: boolean }
> = {
  // ── Nhập kho ──
  PO_RECEIPT: { label: 'Nhập từ phiếu đặt hàng', type: 'IN', auto: true },
  CUSTOMER_RETURN: { label: 'Khách trả lại hàng', type: 'IN' },
  REPAIR_RETURN: { label: 'Thu hồi từ sửa chữa', type: 'IN' },
  COUNT_SURPLUS: { label: 'Kiểm kê thừa', type: 'IN', needsApproval: true },
  OTHER_IN: { label: 'Nhập khác', type: 'IN' },

  // ── Xuất kho ──
  SALE: { label: 'Xuất bán giao khách', type: 'OUT', auto: true },
  WARRANTY: { label: 'Xuất bảo hành (không thu tiền)', type: 'OUT' },
  REPAIR: { label: 'Xuất sửa chữa theo phiếu sự cố', type: 'OUT' },
  SAMPLE_LOAN: { label: 'Cho mượn / hàng mẫu', type: 'OUT' },
  SCRAP: { label: 'Hủy hàng hư hỏng', type: 'OUT', needsApproval: true },
  LIQUIDATION: { label: 'Thanh lý', type: 'OUT', needsApproval: true },
  COUNT_SHORTAGE: { label: 'Kiểm kê thiếu', type: 'OUT', needsApproval: true },
  OTHER_OUT: { label: 'Xuất khác', type: 'OUT' },

  // ── Điều chuyển ──
  WAREHOUSE_TRANSFER: { label: 'Điều chuyển giữa kho', type: 'TRANSFER' },
  VAN_STOCK: { label: 'Cấp cơ số cho xe kỹ thuật', type: 'TRANSFER' },

  OTHER: { label: 'Khác (dữ liệu cũ)', type: 'OUT' },
};

/** Các mã lý do hợp lệ cho một loại phiếu, dùng đổ dropdown. */
export function reasonCodesFor(type: 'IN' | 'OUT' | 'TRANSFER') {
  return Object.entries(REASON_CODES)
    .filter(([code, cfg]) => cfg.type === type && code !== 'OTHER')
    .map(([code, cfg]) => ({ code, ...cfg }));
}

export function reasonNeedsApproval(code?: string | null): boolean {
  return Boolean(code && REASON_CODES[code]?.needsApproval);
}

/**
 * Giá vốn bình quân gia quyền sau khi nhập thêm một lô.
 * Giá vốn cũ × tồn cũ + giá lô mới × số lượng mới, chia cho tổng tồn.
 */
export function weightedAverageCost(
  currentQty: number,
  currentCost: number,
  inQty: number,
  inCost: number,
): number {
  const qtyBefore = Math.max(0, Number(currentQty) || 0);
  const qtyIn = Math.max(0, Number(inQty) || 0);
  const totalQty = qtyBefore + qtyIn;
  if (totalQty <= 0) return Math.round(Number(inCost) || Number(currentCost) || 0);

  const valueBefore = qtyBefore * (Number(currentCost) || 0);
  const valueIn = qtyIn * (Number(inCost) || 0);
  // Lô nhập không khai giá thì giữ nguyên giá vốn cũ, không kéo bình quân về 0
  if (qtyIn > 0 && !Number(inCost) && Number(currentCost)) return Math.round(Number(currentCost));

  return Math.round((valueBefore + valueIn) / totalQty);
}

/* ─────────────────────────────────────────────────────────
 * CHI TIẾT CHI PHÍ LÔ HÀNG (LANDED COST & METRICS)
 * ───────────────────────────────────────────────────────── */

export interface StockCostItemMetric {
  itemId: number;
  quantity: number;
  baseUnitPrice: number;
  allocatedShipping: number;
  allocatedOtherFee: number;
  landedCost: number;
  subtotalCost: number;
}

export interface StockCostMetrics {
  shippingFee: number;
  otherFee: number;
  merchandiseTotal: number;
  totalLandedCost: number;
  allocationMethod: 'QUANTITY' | 'VALUE';
  items: StockCostItemMetric[];
}

/**
 * Phân bổ cước vận chuyển và chi phí khác vào từng dòng linh kiện trong lô nhập kho.
 * Tính ra Đơn giá vốn thực tế (Landed Cost / unit = Giá mua + Cước + Phí khác).
 */
export function calculateLandedCostAllocation(
  items: Array<{ itemId: number; quantity: number; unitPrice?: number | null; baseUnitPrice?: number | null }>,
  shippingFee = 0,
  otherFee = 0,
  method: 'QUANTITY' | 'VALUE' = 'QUANTITY',
): StockCostMetrics {
  const safeShipping = Math.max(0, Number(shippingFee) || 0);
  const safeOther = Math.max(0, Number(otherFee) || 0);

  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const merchandiseTotal = items.reduce((sum, it) => {
    const price = Number(it.baseUnitPrice ?? it.unitPrice ?? 0);
    return sum + price * (Number(it.quantity) || 0);
  }, 0);

  let allocatedShippingTotal = 0;
  let allocatedOtherTotal = 0;

  const itemMetrics: StockCostItemMetric[] = items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const basePrice = Number(it.baseUnitPrice ?? it.unitPrice ?? 0);
    const lineGoodsTotal = basePrice * qty;

    let lineShipping = 0;
    let lineOther = 0;

    if (idx === items.length - 1) {
      // Dòng cuối cùng hấp thụ phần chênh lệch làm tròn
      lineShipping = safeShipping - allocatedShippingTotal;
      lineOther = safeOther - allocatedOtherTotal;
    } else {
      if (method === 'VALUE' && merchandiseTotal > 0) {
        const ratio = lineGoodsTotal / merchandiseTotal;
        lineShipping = Math.round(safeShipping * ratio);
        lineOther = Math.round(safeOther * ratio);
      } else if (totalQty > 0) {
        const ratio = qty / totalQty;
        lineShipping = Math.round(safeShipping * ratio);
        lineOther = Math.round(safeOther * ratio);
      }
      allocatedShippingTotal += lineShipping;
      allocatedOtherTotal += lineOther;
    }

    const shipPerUnit = qty > 0 ? Math.round(lineShipping / qty) : 0;
    const otherPerUnit = qty > 0 ? Math.round(lineOther / qty) : 0;
    const landedPerUnit = basePrice + shipPerUnit + otherPerUnit;
    const subtotal = lineGoodsTotal + lineShipping + lineOther;

    return {
      itemId: it.itemId,
      quantity: qty,
      baseUnitPrice: basePrice,
      allocatedShipping: shipPerUnit,
      allocatedOtherFee: otherPerUnit,
      landedCost: landedPerUnit,
      subtotalCost: subtotal,
    };
  });

  const totalLandedCost = merchandiseTotal + safeShipping + safeOther;

  return {
    shippingFee: safeShipping,
    otherFee: safeOther,
    merchandiseTotal,
    totalLandedCost,
    allocationMethod: method,
    items: itemMetrics,
  };
}

const COST_METRICS_TAG_REGEX = /\[COST_METRICS:\s*(\{[\s\S]*?\})\]/i;

/** Trích xuất dữ liệu chi phí lô hàng từ trường note của phiếu nhập kho */
export function parseStockCostMetrics(note?: string | null): StockCostMetrics | null {
  if (!note) return null;
  const match = note.match(COST_METRICS_TAG_REGEX);
  if (!match || !match[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === 'object') {
      return parsed as StockCostMetrics;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

/** Định dạng lại ghi chú phiếu kho, bao gồm thẻ COST_METRICS */
export function formatStockCostMetrics(
  cleanNote: string | undefined | null,
  metrics: StockCostMetrics,
): string {
  const base = (cleanNote || '').replace(COST_METRICS_TAG_REGEX, '').trim();
  const tag = `[COST_METRICS: ${JSON.stringify(metrics)}]`;
  return base ? `${base} ${tag}` : tag;
}

/** Lấy ghi chú sạch sẽ đã loại bỏ thẻ COST_METRICS để hiển thị */
export function getCleanStockNote(note?: string | null): string {
  if (!note) return '';
  return note.replace(COST_METRICS_TAG_REGEX, '').trim();
}

