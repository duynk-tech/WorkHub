/**
 * Danh mục vật thể có thể kéo thả trong Trình thiết kế Không gian 3D.
 * File này KHÔNG phụ thuộc Three.js → dùng được ở server (validate khi lưu) lẫn client (thư viện kéo thả).
 * Phần dựng hình nằm ở `src/components/space3d/three/props/registry.ts`.
 */

export type SpaceObjectCategory = 'RETAIL' | 'FURNITURE' | 'PLANT' | 'CAFE' | 'GARDEN' | 'FESTIVE' | 'OFFICE' | 'WAREHOUSE' | 'DECOR' | 'STRUCTURE';

export const SPACE_OBJECT_CATEGORIES: { key: SpaceObjectCategory; label: string }[] = [
  { key: 'RETAIL', label: 'Quầy kệ' },
  { key: 'FURNITURE', label: 'Bàn ghế' },
  { key: 'PLANT', label: 'Cây cảnh' },
  { key: 'CAFE', label: 'Quán cà phê' },
  { key: 'GARDEN', label: 'Sân vườn miền Tây' },
  { key: 'FESTIVE', label: 'Lễ hội & sự kiện' },
  { key: 'OFFICE', label: 'Văn phòng' },
  { key: 'WAREHOUSE', label: 'Kho' },
  { key: 'DECOR', label: 'Trang trí' },
  { key: 'STRUCTURE', label: 'Tường & phòng' },
];

export interface SpaceObjectDef {
  kind: string;
  label: string;
  category: SpaceObjectCategory;
  /** Kích thước mặc định (m) */
  size: [number, number, number];
  /** Giới hạn [min, max] cho rộng / sâu / cao */
  limits: { w: [number, number]; d: [number, number]; h: [number, number] };
  /** Màu chính mặc định & bảng màu gợi ý */
  color?: string;
  palette?: string[];
  /** Vật liệu / biến thể chọn được */
  variants?: { key: string; label: string }[];
  /** Có tầng kệ & hàng hoá */
  shelves?: boolean;
  defaultLevels?: number;
  /** Có nhãn chữ hiển thị */
  labeled?: boolean;
  /** Khách bấm vào để đi tới (gian hàng) */
  walkTarget?: boolean;
}

const L = (w: [number, number], d: [number, number], h: [number, number]) => ({ w, d, h });
const WOOD = ['#a47148', '#c69c6d', '#6b4226', '#e8d5b7', '#2b2b2b'];
const FABRIC = ['#64748b', '#334155', '#a3a3a3', '#b45309', '#166534', '#1e3a8a', '#e7e5e4'];
const ACCENT = ['#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#16a34a', '#db2777', '#ca8a04'];

export const SPACE_OBJECT_DEFS: SpaceObjectDef[] = [
  // ── Quầy kệ bán lẻ ──
  { kind: 'BOOTH', label: 'Gian hàng triển lãm', category: 'RETAIL', size: [6, 3.6, 3.2], limits: L([3, 10], [2.4, 6], [2.6, 4.5]), color: '#2563eb', palette: ACCENT, labeled: true, walkTarget: true, shelves: true, defaultLevels: 1 },
  { kind: 'DISPLAY_COUNTER', label: 'Quầy trưng bày sản phẩm', category: 'RETAIL', size: [3, 0.95, 0.92], limits: L([1.2, 6], [0.7, 1.4], [0.75, 1.1]), color: '#1d4ed8', palette: ACCENT, labeled: true, shelves: true, defaultLevels: 1, variants: [{ key: 'wood', label: 'Ốp gỗ' }, { key: 'white', label: 'Trắng bóng' }, { key: 'dark', label: 'Đen nhám' }] },
  { kind: 'GONDOLA', label: 'Kệ gondola 2 mặt', category: 'RETAIL', size: [2.4, 0.9, 1.6], limits: L([1, 6], [0.6, 1.4], [1.2, 2.2]), color: '#f1f5f9', palette: ['#f1f5f9', '#1f2937', '#e2e8f0', '#a47148'], shelves: true, defaultLevels: 4 },
  { kind: 'WALL_SHELF', label: 'Kệ áp tường', category: 'RETAIL', size: [2.4, 0.5, 2.1], limits: L([1, 6], [0.35, 0.8], [1.4, 2.6]), color: '#f8fafc', palette: ['#f8fafc', '#1f2937', '#a47148', '#c69c6d'], shelves: true, defaultLevels: 5, variants: [{ key: 'metal', label: 'Kim loại' }, { key: 'wood', label: 'Gỗ' }] },
  { kind: 'DISPLAY_CABINET', label: 'Tủ kính trưng bày', category: 'RETAIL', size: [1.2, 0.5, 1.9], limits: L([0.6, 2.4], [0.4, 0.8], [1, 2.2]), color: '#e5e7eb', shelves: true, defaultLevels: 4 },
  { kind: 'PODIUM', label: 'Bục trưng bày', category: 'RETAIL', size: [1.2, 1.2, 0.6], limits: L([0.5, 3], [0.5, 3], [0.2, 1.2]), color: '#ffffff', palette: ['#ffffff', '#111827', '#e2e8f0', ...ACCENT], shelves: true, defaultLevels: 1 },
  { kind: 'DEMO_BAR', label: 'Quầy pha thử máy', category: 'RETAIL', size: [3.6, 0.9, 1.05], limits: L([2, 6], [0.7, 1.4], [0.95, 1.15]), color: '#6b4226', palette: WOOD, labeled: true },
  { kind: 'GELATO_CASE', label: 'Tủ kem gelato kính cong', category: 'RETAIL', size: [1.8, 1, 1.3], limits: L([1, 3.6], [0.8, 1.2], [1.1, 1.5]), color: '#f8fafc', palette: ['#f8fafc', '#111827', '#be185d', '#a47148'], labeled: true },
  { kind: 'DISPLAY_CHILLER', label: 'Tủ mát đứng cửa kính', category: 'RETAIL', size: [1.2, 0.72, 2], limits: L([0.6, 2], [0.6, 0.85], [1.7, 2.2]), color: '#111827', palette: ['#111827', '#f8fafc', '#1d4ed8', '#b91c1c'], labeled: true },
  { kind: 'CHECKOUT', label: 'Quầy thu ngân', category: 'RETAIL', size: [2, 0.7, 1.05], limits: L([1.2, 3.5], [0.5, 1], [0.9, 1.2]), color: '#f8fafc', palette: WOOD },
  { kind: 'RECEPTION_DESK', label: 'Quầy lễ tân chữ L', category: 'RETAIL', size: [3.2, 1.8, 1.1], limits: L([2, 5], [1, 3], [0.95, 1.25]), color: '#2563eb', palette: ACCENT, labeled: true },

  // ── Bàn ghế ──
  { kind: 'TABLE_ROUND', label: 'Bàn tròn', category: 'FURNITURE', size: [0.8, 0.8, 0.75], limits: L([0.5, 1.6], [0.5, 1.6], [0.6, 1.1]), color: '#c69c6d', palette: WOOD, variants: [{ key: 'wood', label: 'Gỗ' }, { key: 'marble', label: 'Đá marble' }] },
  { kind: 'TABLE_RECT', label: 'Bàn chữ nhật', category: 'FURNITURE', size: [1.2, 0.7, 0.75], limits: L([0.6, 3], [0.5, 1.2], [0.6, 1.1]), color: '#a47148', palette: WOOD, variants: [{ key: 'wood', label: 'Gỗ' }, { key: 'marble', label: 'Đá marble' }] },
  { kind: 'CHAIR', label: 'Ghế cafe', category: 'FURNITURE', size: [0.46, 0.5, 0.86], limits: L([0.4, 0.6], [0.4, 0.6], [0.75, 1]), color: '#6b4226', palette: [...WOOD, ...FABRIC] },
  { kind: 'BAR_STOOL', label: 'Ghế bar', category: 'FURNITURE', size: [0.42, 0.42, 0.78], limits: L([0.35, 0.5], [0.35, 0.5], [0.6, 0.9]), color: '#1f2937', palette: ['#1f2937', '#a47148', '#b45309', '#e7e5e4'] },
  { kind: 'SOFA', label: 'Sofa', category: 'FURNITURE', size: [2, 0.85, 0.82], limits: L([1.2, 3.2], [0.7, 1.1], [0.7, 1]), color: '#64748b', palette: FABRIC },
  { kind: 'ARMCHAIR', label: 'Ghế bành', category: 'FURNITURE', size: [0.85, 0.82, 0.82], limits: L([0.7, 1.1], [0.7, 1.1], [0.7, 1]), color: '#b45309', palette: FABRIC },
  { kind: 'COFFEE_TABLE', label: 'Bàn trà', category: 'FURNITURE', size: [1, 0.6, 0.42], limits: L([0.5, 1.6], [0.4, 1], [0.3, 0.6]), color: '#a47148', palette: WOOD },
  { kind: 'RUG', label: 'Thảm trải sàn', category: 'FURNITURE', size: [2.4, 1.6, 0.01], limits: L([1, 6], [0.8, 5], [0.01, 0.01]), color: '#d6c7b0', palette: ['#d6c7b0', '#64748b', '#7f1d1d', '#1e3a8a', '#e7e5e4'] },

  // ── Cây cảnh ──
  { kind: 'PLANT_FIDDLE', label: 'Bàng Singapore', category: 'PLANT', size: [0.7, 0.7, 1.7], limits: L([0.4, 1.2], [0.4, 1.2], [0.8, 2.6]), color: '#e7e5e4', palette: ['#e7e5e4', '#1f2937', '#b45309', '#94a3b8'] },
  { kind: 'PLANT_MONSTERA', label: 'Trầu bà Nam Mỹ', category: 'PLANT', size: [0.9, 0.9, 1.2], limits: L([0.5, 1.6], [0.5, 1.6], [0.6, 1.8]), color: '#1f2937', palette: ['#e7e5e4', '#1f2937', '#b45309', '#94a3b8'] },
  { kind: 'PLANT_SNAKE', label: 'Lưỡi hổ', category: 'PLANT', size: [0.4, 0.4, 0.9], limits: L([0.25, 0.7], [0.25, 0.7], [0.5, 1.3]), color: '#94a3b8', palette: ['#e7e5e4', '#1f2937', '#b45309', '#94a3b8'] },
  { kind: 'PLANT_PALM', label: 'Cau tiểu trâm', category: 'PLANT', size: [0.9, 0.9, 1.8], limits: L([0.5, 1.6], [0.5, 1.6], [1, 2.8]), color: '#b45309', palette: ['#e7e5e4', '#1f2937', '#b45309', '#94a3b8'] },
  { kind: 'PLANTER_BOX', label: 'Bồn cây dài', category: 'PLANT', size: [1.6, 0.45, 0.8], limits: L([0.8, 4], [0.3, 0.8], [0.5, 1.4]), color: '#52525b', palette: ['#52525b', '#e7e5e4', '#a47148'] },

  // ── Quán cà phê ──
  { kind: 'BAR_COUNTER', label: 'Quầy bar pha chế', category: 'CAFE', size: [3.6, 0.8, 1.1], limits: L([1.8, 7], [0.6, 1.2], [0.95, 1.2]), color: '#6b4226', palette: WOOD, variants: [{ key: 'marble', label: 'Mặt đá' }, { key: 'wood', label: 'Mặt gỗ' }] },
  { kind: 'ESPRESSO_MACHINE', label: 'Máy pha espresso', category: 'CAFE', size: [0.78, 0.56, 0.54], limits: L([0.5, 1.1], [0.45, 0.7], [0.4, 0.7]), color: '#d1d5db', palette: ['#d1d5db', '#111827', '#b91c1c', '#e7e5e4'] },
  { kind: 'PASTRY_CASE', label: 'Tủ bánh', category: 'CAFE', size: [1.2, 0.7, 1.2], limits: L([0.8, 2], [0.5, 0.9], [0.9, 1.5]), color: '#e5e7eb' },
  { kind: 'MENU_BOARD', label: 'Bảng menu', category: 'CAFE', size: [1.6, 0.06, 0.9], limits: L([0.8, 3], [0.04, 0.1], [0.5, 1.6]), color: '#111827', labeled: true },
  { kind: 'PENDANT_LIGHT', label: 'Đèn thả', category: 'CAFE', size: [0.38, 0.38, 0.4], limits: L([0.2, 0.8], [0.2, 0.8], [0.2, 0.8]), color: '#111827', palette: ['#111827', '#b45309', '#e7e5e4', '#166534'] },

  // ── Sân vườn miền Tây (quán cà phê sân vườn) ──
  { kind: 'GARDEN_GATE', label: 'Cổng gỗ bảng hiệu', category: 'GARDEN', size: [5.4, 0.9, 4.5], limits: L([3, 9], [0.6, 1.2], [3.6, 6]), color: '#7d6c5a', labeled: true },
  { kind: 'LIVE_EDGE_TABLE', label: 'Bàn gỗ nguyên tấm (bàn dài)', category: 'GARDEN', size: [7, 1.2, 0.78], limits: L([1.6, 12], [0.7, 1.8], [0.7, 0.85]), color: '#c46a2e' },
  { kind: 'STACK_CHAIR', label: 'Ghế nhựa đen', category: 'GARDEN', size: [0.48, 0.5, 0.84], limits: L([0.42, 0.55], [0.42, 0.55], [0.78, 0.92]), color: '#1f2022', palette: ['#1f2022', '#6b4226', '#e7e5e4', '#166534'] },
  { kind: 'BANYAN_TREE', label: 'Cây đa cổ thụ', category: 'GARDEN', size: [2.2, 2.2, 8.5], limits: L([1.4, 3.6], [1.4, 3.6], [6, 12]), color: '#6b5a48' },
  { kind: 'SHADE_NET', label: 'Lưới che + đèn dây', category: 'GARDEN', size: [12, 9, 4.6], limits: L([4, 24], [4, 20], [3, 7]), color: '#f5f5f0' },
  { kind: 'SAMPAN_BOAT', label: 'Xuồng ba lá', category: 'GARDEN', size: [3.4, 0.95, 0.95], limits: L([2, 5], [0.7, 1.4], [0.7, 1.3]), color: '#b8693a' },
  { kind: 'BANANA_PLANT', label: 'Bụi chuối', category: 'GARDEN', size: [1.8, 1.8, 3.4], limits: L([0.8, 3], [0.8, 3], [2, 4.5]), color: '#6cbf45' },
  { kind: 'BOULDER', label: 'Đá cuội lớn', category: 'GARDEN', size: [0.9, 0.8, 0.6], limits: L([0.3, 2], [0.3, 2], [0.25, 1.2]), color: '#8d8f8a' },
  { kind: 'STEPPING_PATH', label: 'Lối cỏ đá bước', category: 'GARDEN', size: [1.6, 8, 0.05], limits: L([0.8, 4], [2, 30], [0.05, 0.05]), color: '#5c8f34' },
  { kind: 'GRAVEL_BED', label: 'Nền sỏi', category: 'GARDEN', size: [4, 3, 0.03], limits: L([1, 30], [1, 30], [0.03, 0.03]), color: '#8b8d90', variants: [{ key: 'gravel', label: 'Sỏi xám' }, { key: 'pebble', label: 'Sỏi đen bó vỉa' }] },
  { kind: 'PATIO_UMBRELLA', label: 'Dù che vuông', category: 'GARDEN', size: [3, 3, 2.7], limits: L([2, 4], [2, 4], [2.2, 3.2]), color: '#8a6a55', palette: ['#8a6a55', '#f5f5f0', '#166534', '#7f1d1d'] },
  { kind: 'HOI_AN_LANTERN', label: 'Đèn lồng Hội An', category: 'GARDEN', size: [0.32, 0.32, 3], limits: L([0.2, 0.6], [0.2, 0.6], [1.8, 4.5]), color: '#c2410c', palette: ['#c2410c', '#1d4ed8', '#be123c', '#ca8a04', '#15803d'] },
  { kind: 'GABION_WALL', label: 'Rọ đá gabion', category: 'GARDEN', size: [1.2, 0.6, 1.1], limits: L([0.5, 6], [0.4, 1.2], [0.4, 2]), color: '#6b6a64' },
  { kind: 'WOOD_FENCE', label: 'Hàng rào gỗ', category: 'GARDEN', size: [3, 0.08, 1.1], limits: L([0.6, 10], [0.05, 0.12], [0.6, 2]), color: '#8f8a80', palette: ['#8f8a80', '#14532d', '#6b4226'] },
  { kind: 'METAL_ROOF', label: 'Mái tôn khung sắt', category: 'GARDEN', size: [8, 5, 3.4], limits: L([2, 24], [2, 16], [2.6, 5]), color: '#3a3d42' },
  { kind: 'BANH_QUE_KIOSK', label: 'Quầy bánh quê', category: 'GARDEN', size: [4.2, 2.8, 3.2], limits: L([2.6, 7], [2, 4], [2.6, 4]), color: '#2b2420', labeled: true },
  { kind: 'FOOD_VAN', label: 'Xe đò trang trí', category: 'GARDEN', size: [5.2, 2, 2.4], limits: L([4, 6.5], [1.7, 2.3], [2, 2.8]), color: '#efe6cf', labeled: true },
  { kind: 'POND', label: 'Ao rau muống', category: 'GARDEN', size: [6, 4, 0.2], limits: L([2, 20], [2, 14], [0.15, 0.3]), color: '#3d4a2c' },
  { kind: 'MIST_FAN', label: 'Quạt phun sương', category: 'GARDEN', size: [0.6, 0.6, 1.8], limits: L([0.5, 0.8], [0.5, 0.8], [1.4, 2.2]), color: '#e5e7eb', palette: ['#e5e7eb', '#1f2937', '#2563eb'] },
  { kind: 'CHALKBOARD_STAND', label: 'Bảng phấn chữ A (menu)', category: 'GARDEN', size: [0.65, 0.5, 1.1], limits: L([0.45, 1], [0.35, 0.7], [0.8, 1.4]), color: '#8a5a35', labeled: true },
  { kind: 'MOTORBIKE', label: 'Xe máy đậu', category: 'GARDEN', size: [0.7, 1.85, 1.15], limits: L([0.6, 0.8], [1.6, 2], [1, 1.3]), color: '#dc2626', palette: ['#dc2626', '#1f2937', '#f8fafc', '#2563eb', '#16a34a', '#f59e0b'] },
  { kind: 'FOOD_CART', label: 'Xe đẩy bánh quê', category: 'GARDEN', size: [1.4, 0.7, 1.9], limits: L([1, 2], [0.5, 0.9], [1.6, 2.2]), color: '#f8fafc', labeled: true },
  { kind: 'CLAY_JAR', label: 'Chum sành', category: 'GARDEN', size: [0.6, 0.6, 0.75], limits: L([0.3, 1], [0.3, 1], [0.4, 1.2]), color: '#b7791f', palette: ['#b7791f', '#7c2d12', '#57534e', '#1e3a8a'] },
  { kind: 'VINE_RAILING', label: 'Lan can kính dây leo', category: 'GARDEN', size: [6, 0.5, 1.1], limits: L([1.2, 20], [0.3, 0.8], [0.9, 1.4]), color: '#4b5563' },
  { kind: 'LOGO_STANDEE', label: 'Bảng logo quán', category: 'GARDEN', size: [0.9, 0.3, 1.9], limits: L([0.6, 1.4], [0.2, 0.4], [1.4, 2.4]), color: '#6b4226' },

  // ── Lễ hội & sự kiện (Giáng sinh, Tết, khai trương…) ──
  { kind: 'CHRISTMAS_TREE', label: 'Cây thông Noel', category: 'FESTIVE', size: [1.4, 1.4, 2.4], limits: L([0.8, 2.6], [0.8, 2.6], [1.4, 4.5]), color: '#1f5c32' },
  { kind: 'GIFT_BOXES', label: 'Hộp quà Giáng sinh', category: 'FESTIVE', size: [1, 0.8, 0.45], limits: L([0.5, 2], [0.5, 2], [0.3, 0.8]), color: '#dc2626' },
  { kind: 'SNOWMAN', label: 'Người tuyết', category: 'FESTIVE', size: [0.8, 0.8, 1.4], limits: L([0.5, 1.4], [0.5, 1.4], [0.8, 2.2]), color: '#f8fafc' },
  { kind: 'MAI_TREE', label: 'Cây mai vàng', category: 'FESTIVE', size: [1.2, 1.2, 2], limits: L([0.6, 2.4], [0.6, 2.4], [1, 3.2]), color: '#facc15' },
  { kind: 'DAO_TREE', label: 'Cây đào hồng', category: 'FESTIVE', size: [1.2, 1.2, 2], limits: L([0.6, 2.4], [0.6, 2.4], [1, 3.2]), color: '#f9a8d4' },
  { kind: 'KUMQUAT_TREE', label: 'Cây quất', category: 'FESTIVE', size: [0.9, 0.9, 1.5], limits: L([0.5, 1.6], [0.5, 1.6], [0.9, 2.2]), color: '#f97316' },
  { kind: 'LANTERN_STRING', label: 'Dây đèn lồng đỏ', category: 'FESTIVE', size: [4, 0.3, 3], limits: L([1.5, 12], [0.2, 0.5], [2.2, 4.5]), color: '#dc2626' },
  { kind: 'TET_COUPLETS', label: 'Câu đối Tết', category: 'FESTIVE', size: [2.6, 0.3, 2.4], limits: L([1.6, 5], [0.2, 0.5], [1.6, 3.2]), color: '#b91c1c', labeled: true },
  { kind: 'FRUIT_TRAY', label: 'Mâm ngũ quả', category: 'FESTIVE', size: [0.8, 0.5, 0.75], limits: L([0.5, 1.4], [0.4, 0.8], [0.5, 1]), color: '#7f1d1d' },
  { kind: 'EVENT_BACKDROP', label: 'Backdrop sự kiện', category: 'FESTIVE', size: [5, 0.3, 3], limits: L([2.5, 10], [0.2, 0.5], [2, 4.5]), color: '#1d4ed8', labeled: true },
  { kind: 'BALLOON_ARCH', label: 'Cổng bong bóng', category: 'FESTIVE', size: [3.6, 0.4, 3], limits: L([2, 8], [0.3, 0.6], [2, 4.5]), color: '#ef4444' },
  { kind: 'FLOWER_STAND', label: 'Kệ hoa khai trương', category: 'FESTIVE', size: [0.9, 0.5, 2.2], limits: L([0.6, 1.4], [0.4, 0.8], [1.6, 2.8]), color: '#ef4444', palette: ['#ef4444', '#f472b6', '#facc15', '#f8fafc', '#a855f7'], labeled: true },
  { kind: 'RED_CARPET', label: 'Thảm đỏ + cột chắn', category: 'FESTIVE', size: [1.6, 6, 0.02], limits: L([1, 4], [2, 20], [0.02, 0.02]), color: '#b91c1c' },

  // ── Văn phòng ──
  { kind: 'DESK', label: 'Bàn làm việc', category: 'OFFICE', size: [1.4, 0.7, 0.75], limits: L([1, 2.4], [0.6, 0.9], [0.7, 0.8]), color: '#e8d5b7', palette: WOOD },
  { kind: 'OFFICE_CHAIR', label: 'Ghế xoay', category: 'OFFICE', size: [0.6, 0.6, 1.1], limits: L([0.5, 0.7], [0.5, 0.7], [0.95, 1.25]), color: '#1f2937', palette: ['#1f2937', '#334155', '#1e3a8a', '#7f1d1d'] },
  { kind: 'MEETING_TABLE', label: 'Bàn họp', category: 'OFFICE', size: [3, 1.2, 0.75], limits: L([1.6, 6], [0.9, 1.8], [0.7, 0.8]), color: '#6b4226', palette: WOOD },
  { kind: 'MEETING_TV', label: 'TV trình chiếu phòng họp', category: 'OFFICE', size: [1.6, 0.6, 1.9], limits: L([1, 2.6], [0.4, 0.8], [1.5, 2.4]), color: '#111827' },
  { kind: 'PANTRY_COUNTER', label: 'Quầy pantry', category: 'OFFICE', size: [2.4, 0.62, 0.9], limits: L([1.2, 4], [0.5, 0.75], [0.85, 0.95]), color: '#e7e5e4', palette: ['#e7e5e4', '#1f2937', '#a47148', '#166534'] },
  { kind: 'WATER_DISPENSER', label: 'Bình nước nóng lạnh', category: 'OFFICE', size: [0.34, 0.34, 1.35], limits: L([0.3, 0.45], [0.3, 0.45], [1.1, 1.5]), color: '#f8fafc' },
  { kind: 'FRIDGE', label: 'Tủ lạnh', category: 'OFFICE', size: [0.7, 0.68, 1.8], limits: L([0.5, 1], [0.55, 0.8], [1.2, 2]), color: '#cbd5e1', palette: ['#cbd5e1', '#1f2937', '#f8fafc'] },
  { kind: 'FILE_CABINET', label: 'Tủ hồ sơ', category: 'OFFICE', size: [0.9, 0.45, 1.9], limits: L([0.4, 2], [0.4, 0.6], [0.7, 2.2]), color: '#e5e7eb', palette: ['#e5e7eb', '#1f2937', '#a47148'] },
  { kind: 'PARTITION', label: 'Vách ngăn nỉ', category: 'OFFICE', size: [1.6, 0.05, 1.2], limits: L([0.6, 3.2], [0.04, 0.08], [0.8, 1.8]), color: '#64748b', palette: FABRIC },

  // ── Kho ──
  { kind: 'RACK', label: 'Kệ pallet', category: 'WAREHOUSE', size: [6, 1.4, 3.6], limits: L([2.4, 12], [1, 1.6], [2, 6]), color: '#2563eb', palette: ['#2563eb', '#0891b2', '#16a34a', '#ea580c'], shelves: true, defaultLevels: 3, labeled: true },
  { kind: 'PALLET_STACK', label: 'Chồng pallet hàng', category: 'WAREHOUSE', size: [1.2, 1, 1.3], limits: L([1, 1.4], [0.8, 1.2], [0.3, 2]), color: '#c69c6d' },
  { kind: 'FORKLIFT', label: 'Xe nâng', category: 'WAREHOUSE', size: [1.2, 2.4, 2.1], limits: L([1, 1.4], [2, 3], [1.9, 2.4]), color: '#f59e0b', palette: ['#f59e0b', '#dc2626', '#16a34a'] },
  { kind: 'CARTON_STACK', label: 'Thùng carton', category: 'WAREHOUSE', size: [0.8, 0.6, 0.9], limits: L([0.4, 1.6], [0.4, 1.2], [0.3, 1.8]), color: '#c08a52' },

  // ── Trang trí ──
  { kind: 'BRAND_WALL', label: 'Vách thương hiệu LED', category: 'DECOR', size: [6, 0.3, 3.2], limits: L([2, 12], [0.2, 0.5], [2, 5]), color: '#0b1220', labeled: true },
  { kind: 'FLOOR_LAMP', label: 'Đèn cây', category: 'DECOR', size: [0.4, 0.4, 1.6], limits: L([0.3, 0.6], [0.3, 0.6], [1.2, 2]), color: '#111827' },
  { kind: 'WALL_ART', label: 'Tranh treo', category: 'DECOR', size: [1.2, 0.04, 0.8], limits: L([0.4, 3], [0.03, 0.06], [0.3, 2]), color: '#2563eb', palette: ACCENT },

  // ── Tường & phòng ──
  { kind: 'WALL', label: 'Tường ngăn', category: 'STRUCTURE', size: [4, 0.12, 2.8], limits: L([0.5, 20], [0.08, 0.3], [1, 5]), color: '#f1f5f9', palette: ['#f1f5f9', '#e7e5e4', '#b45309', '#166534', '#1f2937'], variants: [{ key: 'paint', label: 'Sơn' }, { key: 'brick', label: 'Gạch thô' }, { key: 'wood', label: 'Ốp gỗ' }] },
  { kind: 'GLASS_WALL', label: 'Vách kính', category: 'STRUCTURE', size: [4, 0.08, 2.8], limits: L([0.5, 20], [0.05, 0.15], [1, 5]), color: '#cfe8fb' },
  { kind: 'ROOM_ZONE', label: 'Vùng phòng (camera vào phòng)', category: 'STRUCTURE', size: [6, 5, 2.8], limits: L([2, 30], [2, 30], [2.2, 6]), color: '#38bdf8', labeled: true },
  { kind: 'DOOR', label: 'Cửa đi (tự mở)', category: 'STRUCTURE', size: [0.95, 0.12, 2.15], limits: L([0.8, 2.4], [0.08, 0.3], [2, 2.6]), color: '#a47148', palette: WOOD, variants: [{ key: 'swing', label: 'Cửa cánh mở' }, { key: 'slide', label: 'Cửa kính trượt 2 cánh' }] },
];

export const SPACE_OBJECT_DEF_MAP: Record<string, SpaceObjectDef> = Object.fromEntries(SPACE_OBJECT_DEFS.map((d) => [d.kind, d]));
export const SPACE_OBJECT_KINDS = SPACE_OBJECT_DEFS.map((d) => d.kind);

/** Loại không gian & nhóm thư viện gợi ý mở sẵn */
export type SpaceSceneKind = 'SHOWROOM' | 'WAREHOUSE' | 'CAFE' | 'OFFICE';
export const SCENE_KIND_LABEL: Record<SpaceSceneKind, string> = {
  SHOWROOM: 'Showroom',
  WAREHOUSE: 'Kho hàng',
  CAFE: 'Quán cà phê',
  OFFICE: 'Văn phòng',
};
export function normalizeSceneKind(k: unknown): SpaceSceneKind {
  return k === 'WAREHOUSE' || k === 'CAFE' || k === 'OFFICE' ? k : 'SHOWROOM';
}

export const MAX_SPACE_OBJECTS = 600;
