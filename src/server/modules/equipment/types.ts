export const EQUIPMENT_CATEGORIES: Record<string, { label: string; icon: string }> = {
  ICE_CREAM_MACHINE: { label: 'Máy làm kem (Tươi / Gelato / Cứng)', icon: 'IceCream' },
  CHOCOLATE_MACHINE: { label: 'Máy làm socola (Nấu / Tôi / Rót / Phủ)', icon: 'Cookie' },
  KITCHEN_HOT: { label: 'Bếp & Lò nướng (Chiên nhúng / Đối lưu / Combi)', icon: 'Flame' },
  KITCHEN_COLD: { label: 'Thiết bị lạnh (Tủ đông / Bàn mát / Làm đá)', icon: 'Snowflake' },
  BEVERAGE_BAR: { label: 'Thiết bị pha chế (Máy pha cafe / Máy xay)', icon: 'Coffee' },
  OTHER: { label: 'Thiết bị khác', icon: 'Utensils' },
};

export const OWNERSHIP_TYPES: Record<string, { label: string; badgeTone: 'success' | 'info' | 'warning' }> = {
  SOLD: { label: 'Đã bán', badgeTone: 'success' },
  RENTAL: { label: 'Cho thuê', badgeTone: 'info' },
  CONSIGNMENT: { label: 'Ký gửi / Cam kết nguyên liệu', badgeTone: 'warning' },
};

/** Mức độ ưu tiên phiếu sự cố. Nhận cả 2 quy ước mã đang tồn tại trong dữ liệu. */
export const TICKET_PRIORITIES: Record<string, { label: string; color: string; bg: string }> = {
  P1_CRITICAL: { label: 'Khẩn cấp (SLA 2 giờ)', color: '#dc2626', bg: '#fee2e2' },
  CRITICAL: { label: 'Khẩn cấp (SLA 2 giờ)', color: '#dc2626', bg: '#fee2e2' },
  P2_MAJOR: { label: 'Ưu tiên (trong ngày)', color: '#d97706', bg: '#fef3c7' },
  HIGH: { label: 'Ưu tiên (trong ngày)', color: '#d97706', bg: '#fef3c7' },
  MEDIUM: { label: 'Trung bình', color: '#d97706', bg: '#fef3c7' },
  P3_ROUTINE: { label: 'Thông thường', color: '#475569', bg: '#f1f5f9' },
  LOW: { label: 'Thông thường', color: '#475569', bg: '#f1f5f9' },
};

/** Trạng thái xử lý phiếu sự cố / bảo dưỡng. */
export const TICKET_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  OPEN: { label: 'Chờ tiếp nhận', color: '#0369a1', bg: '#e0f2fe' },
  ASSIGNED: { label: 'Đã phân công', color: '#0369a1', bg: '#e0f2fe' },
  IN_PROGRESS: { label: 'Đang xử lý', color: '#0369a1', bg: '#e0f2fe' },
  RESOLVED: { label: 'Đã hoàn tất', color: '#15803d', bg: '#dcfce7' },
  CLOSED: { label: 'Đã đóng phiếu', color: '#15803d', bg: '#dcfce7' },
};

export const EQUIPMENT_STATUSES: Record<string, { label: string; badgeTone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }> = {
  OPERATING: { label: 'Đang vận hành tốt', badgeTone: 'success' },
  BREAKDOWN: { label: 'Đang báo hỏng / Sự cố', badgeTone: 'danger' },
  UNDER_MAINTENANCE: { label: 'Đang bảo dưỡng / Sửa chữa', badgeTone: 'warning' },
  IN_STOCK: { label: 'Lưu kho (Sẵn sàng)', badgeTone: 'info' },
  LIQUIDATED: { label: 'Đã thanh lý', badgeTone: 'neutral' },
};

export interface IceCreamSpecs {
  machineType?: string;      // Soft-serve 3 vòi, Gelato cối đứng, v.v.
  flavorCount?: string;      // 2 vị + 1 hỗn hợp
  capacityPerHour?: string;  // 28 Lít/giờ
  cylinderCapacity?: string; // 1.9 Lít x 2
  hopperCapacity?: string;   // 12.5 Lít x 2
  compressor?: string;       // Embraco / Danfoss
  refrigerant?: string;      // R404a, R134a, R290
  powerWatts?: string;       // 2200W
  voltage?: string;          // 220V 1 pha / 380V 3 pha
  coolingType?: string;      // Làm mát bằng gió / Làm mát bằng nước
  preCooling?: boolean;      // Giữ tươi ban đêm
  airPump?: boolean;         // Bơm tăng xốp
}

export interface ChocolateSpecs {
  machineType?: string;      // Máy tôi Tempering, Nồi nấu Melting, Máy phủ Enrobing
  tankCapacityKg?: string;   // 25 kg
  outputPerHourKg?: string;  // 30 kg/h
  tempRange?: string;        // 20°C - 60°C (±0.1°C)
  heatingMethod?: string;    // Cách thủy tuần hoàn / Thanh nhiệt
  hasFootPedal?: boolean;    // Bàn đạp ngắt dòng rót
  powerWatts?: string;       // 1500W
  voltage?: string;          // 220V / 380V
  materialGrade?: string;    // Inox thực phẩm 304 / 316
}

export interface KitchenSpecs {
  equipmentType?: string;    // Lò nướng đối lưu, Bếp chiên nhúng...
  powerType?: string;        // Điện / Gas
  capacity?: string;         // 5 khay GN 1/1, 2 họng...
  powerKw?: string;          // 9.2 kW
  voltage?: string;          // 220V / 380V
  tempRange?: string;        // 50°C - 300°C
}

export interface EquipmentSpecsInput {
  // Common
  dimensions?: string;
  weightKg?: string;
  madeIn?: string;
  // Category specific
  iceCream?: IceCreamSpecs;
  chocolate?: ChocolateSpecs;
  kitchen?: KitchenSpecs;
  otherDescription?: string;
}

export interface SaveEquipmentInput {
  name: string;
  machineCode?: string;
  serialNumber: string;
  category: string;
  brand?: string;
  model?: string;
  ownershipType: string;
  status: string;
  customerId?: number | null;
  locationId?: number | null;
  installedDate?: string;
  warrantyExpiresAt?: string;
  lastPmDate?: string;
  nextPmDate?: string;
  notes?: string;
  specs?: EquipmentSpecsInput;
  imageUrl?: string | null;
}
