export const ORDER_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  MACHINE_PURCHASE: { label: 'Mua máy mới', color: '#1d4ed8', bg: '#eff6ff' },
  RENTAL: { label: 'Thuê máy', color: '#6d28d9', bg: '#f5f3ff' },
  CONSIGNMENT: { label: 'Ký gửi máy', color: '#b45309', bg: '#fef3c7' },
  SPARE_PART: { label: 'Linh kiện / Vật tư', color: '#0f766e', bg: '#f0fdfa' },
  SERVICE: { label: 'Dịch vụ / Bảo dưỡng', color: '#4338ca', bg: '#eef2ff' },
};

export const ORDER_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Chờ xác nhận', color: '#b45309', bg: '#fef3c7' },
  CONFIRMED: { label: 'Đã xác nhận', color: '#2563eb', bg: '#eff6ff' },
  AWAITING_STOCK: { label: 'Chờ hàng về', color: '#7c3aed', bg: '#f5f3ff' },
  READY_TO_DELIVER: { label: 'Đã có hàng, chờ giao', color: '#0284c7', bg: '#f0f9ff' },
  DELIVERED: { label: 'Đã bàn giao', color: '#047857', bg: '#ecfdf5' },
  COMPLETED: { label: 'Hoàn tất', color: '#15803d', bg: '#dcfce7' },
  CANCELLED: { label: 'Đã hủy', color: '#b91c1c', bg: '#fef2f2' },
};

export const QUOTATION_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Nháp', color: '#64748b', bg: '#f1f5f9' },
  SENT: { label: 'Đã gửi khách', color: '#2563eb', bg: '#dbeafe' },
  ACCEPTED: { label: 'Khách đã duyệt', color: '#059669', bg: '#d1fae5' },
  REJECTED: { label: 'Khách từ chối', color: '#dc2626', bg: '#fee2e2' },
  EXPIRED: { label: 'Hết hiệu lực', color: '#d97706', bg: '#fef3c7' },
};

export interface CustomerQuotationItemInput {
  itemType: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitPriceEur?: number;
  unitCostVnd?: number;
  shippingFee?: number;
  customsFee?: number;
  /** Chiết khấu tính trên cả dòng (VND). */
  discountVnd?: number;
  equipmentId?: number;
  /** Linh kiện trong danh mục kho. */
  inventoryItemId?: number;
  /** Chỉ dùng ở giao diện: giá lấy từ danh mục hay do hệ thống suy ra. */
  priceSource?: string;
  notes?: string;
}

export interface SaveCustomerQuotationInput {
  customerId: number;
  locationId?: number;
  quoteCode?: string;
  status?: string;
  quoteDate?: string;
  validUntil?: string;
  /** Thuế suất VAT (%), 0 = không xuất VAT. */
  vatRate?: number;
  /** Cước vận chuyển báo riêng cho khách (VNĐ). */
  shippingFee?: number;
  /** Tỷ giá EUR/VND và chính sách giá dùng để tính báo giá tại thời điểm lưu. */
  exchangeRate?: number;
  marginPercent?: number;
  pricingMethod?: 'MARGIN' | 'MARKUP';
  /** Chiết khấu tính trên tổng tiền hàng (%). */
  discountRate?: number;
  paymentTerms?: string;
  deliveryTime?: string;
  warrantyTerms?: string;
  notes?: string;
  createdById?: number;
  items: CustomerQuotationItemInput[];
}

export interface SaveCustomerInput {
  name: string;
  code?: string;
  contactName?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface CustomerOrderItemInput {
  itemType: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  discountVnd?: number;
  unitCostVnd?: number;
  unitPriceEur?: number;
  shippingFee?: number;
  customsFee?: number;
  equipmentId?: number;
  /** Linh kiện trong danh mục kho — căn cứ xuất kho và đặt hàng nhà cung cấp. */
  inventoryItemId?: number;
  notes?: string;
}

export interface SaveCustomerOrderInput {
  customerId: number;
  locationId?: number;
  orderCode?: string;
  /** Đơn được lập từ báo giá nào. */
  quotationId?: number;
  exchangeRate?: number;
  /** Đơn dịch vụ sinh từ phiếu sự cố nào — để quy doanh thu về đúng máy. */
  serviceTicketId?: number;
  orderType: string;
  status?: string;
  /** Cước vận chuyển thu của khách (VNĐ). */
  shippingFee?: number;
  /** Tỷ lệ chiết khấu (%). */
  discountRate?: number;
  /** Số tiền chiết khấu (VNĐ). */
  discountAmount?: number;
  /** Hạn thanh toán. */
  dueDate?: string;
  /** Hóa đơn VAT đã xuất cho đơn này. */
  invoiceNo?: string;
  invoiceSerial?: string;
  invoiceDate?: string;
  /** Thuế suất VAT (%), 0 = không xuất VAT. */
  vatRate?: number;
  orderDate?: string;
  deliveryDate?: string;
  notes?: string;
  items: CustomerOrderItemInput[];
}

export const PAYMENT_METHODS: Record<string, { label: string }> = {
  TRANSFER: { label: 'Chuyển khoản' },
  CASH: { label: 'Tiền mặt' },
  CARD: { label: 'Quẹt thẻ' },
  OFFSET: { label: 'Cấn trừ công nợ' },
};

export interface SaveCustomerPaymentInput {
  customerId: number;
  /** Thu cho đơn cụ thể; để trống = thu chung, hệ thống trừ dần đơn cũ nhất. */
  orderId?: number;
  amount: number;
  method?: string;
  paidAt?: string;
  reference?: string;
  note?: string;
}

export interface CustomerFilter {
  search?: string;
}

export interface CustomerMetrics {
  total: number;
  totalMachines: number;
  totalOrders: number;
}
