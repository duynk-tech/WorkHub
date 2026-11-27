import type { SpaceMerchItem } from './space-3d-types';

/**
 * Máy mẫu trưng bày trên quầy khi kho CHƯA có máy nguyên chiếc.
 * id âm để không trùng sản phẩm thật; khách vẫn bấm xem chi tiết được.
 */
/** Loại máy mẫu (quyết định mô hình 3D bày trên quầy) */
export type DemoKind = 'espresso' | 'grinder' | 'softserve' | 'blender' | 'auto' | 'oven';

export const DEMO_PRODUCTS: (SpaceMerchItem & { model: string; demoKind?: DemoKind })[] = [
  {
    id: -1,
    itemCode: 'MAU-ESP-2G',
    model: 'ESP-2G Pro',
    name: 'Máy pha cà phê Espresso 2 group',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    description:
      'Máy pha espresso 2 group chuyên nghiệp cho quán vừa và lớn: nồi hơi đôi, kiểm soát nhiệt PID, vòi đánh sữa công suất lớn. Mẫu trưng bày — liên hệ nhân viên để được báo giá model phù hợp.',
  },
  {
    id: -2,
    itemCode: 'MAU-ESP-1G',
    model: 'ESP-1G Compact',
    name: 'Máy pha cà phê Espresso 1 group',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    description:
      'Máy pha espresso 1 group nhỏ gọn cho quán take-away và văn phòng: khởi động nhanh, crema ổn định, dễ vệ sinh. Mẫu trưng bày — liên hệ nhân viên để được báo giá.',
  },
  {
    id: -3,
    itemCode: 'MAU-ESP-3G',
    model: 'ESP-3G Elite',
    name: 'Máy pha cà phê Espresso 3 group',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    description:
      'Máy pha espresso 3 group cho chuỗi và quán đông khách: phục vụ liên tục giờ cao điểm, nhiệt độ từng group độc lập. Mẫu trưng bày — liên hệ nhân viên để được tư vấn.',
  },
  {
    id: -4,
    itemCode: 'MAU-GRD-64',
    model: 'GRD-64 On-demand',
    name: 'Máy xay cà phê On-demand 64mm',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    description:
      'Máy xay cà phê on-demand lưỡi phẳng 64mm, chỉnh độ mịn vô cấp, hẹn giờ liều xay chính xác. Mẫu trưng bày — liên hệ nhân viên để được báo giá.',
  },
  {
    id: -5,
    itemCode: 'MAU-KEM-2F',
    model: 'SS-2F Soft Serve',
    name: 'Máy làm kem tươi 2 vòi + 1 vòi trộn',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    demoKind: 'softserve',
    description:
      'Máy làm kem tươi (soft serve) 2 vị + vòi trộn, làm lạnh nhanh, giữ kem tươi qua đêm, công suất 25–30 lít/giờ. Mẫu trưng bày — liên hệ nhân viên để chạy thử và báo giá.',
  },
  {
    id: -6,
    itemCode: 'MAU-BLD-2L',
    model: 'BLD-2L Pro',
    name: 'Máy xay sinh tố công nghiệp 2L',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    demoKind: 'blender',
    description:
      'Máy xay sinh tố công nghiệp 2 lít, động cơ 2200W, cối chịu va đập, xay đá mịn trong 20 giây, có hộp giảm ồn. Mẫu trưng bày — liên hệ nhân viên để được tư vấn.',
  },
  {
    id: -7,
    itemCode: 'MAU-AUTO-B2C',
    model: 'AUTO B2C Touch',
    name: 'Máy pha cà phê tự động (bean-to-cup)',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    demoKind: 'auto',
    description:
      'Máy pha tự động từ hạt: màn hình cảm ứng, 1 chạm ra espresso / cappuccino / latte, tự đánh sữa, tự vệ sinh. Phù hợp văn phòng, khách sạn. Mẫu trưng bày — liên hệ nhân viên để chạy thử.',
  },
  {
    id: -8,
    itemCode: 'MAU-OVN-4K',
    model: 'OVN-4 Convection',
    name: 'Lò nướng bánh đối lưu 4 khay',
    category: 'MACHINE',
    manufacturer: 'Mẫu trưng bày',
    imageUrl: null,
    sellingPrice: null,
    isMachine: true,
    demoKind: 'oven',
    description:
      'Lò nướng đối lưu 4 khay có phun ẩm, nhiệt đều, hẹn giờ điện tử — nướng croissant, bánh mì, bánh ngọt cho quán. Mẫu trưng bày — liên hệ nhân viên để được báo giá.',
  },
];

/** Gán loại cho 4 máy mẫu ban đầu */
for (const p of DEMO_PRODUCTS) if (!p.demoKind) p.demoKind = p.id === -4 ? 'grinder' : 'espresso';

/**
 * Máy mẫu bày trên quầy theo TÊN quầy (khớp nội dung quầy).
 * Không nhận ra → máy pha espresso.
 */
export function demoProductsForCounter(label: string | undefined): (SpaceMerchItem & { model: string; demoKind?: DemoKind })[] {
  const t = (label ?? '').toLowerCase();
  const pick = (...kinds: DemoKind[]) => DEMO_PRODUCTS.filter((p) => kinds.includes(p.demoKind!));
  if (/kem|socola|gelato/.test(t)) return pick('softserve');
  if (/sinh tố|blender|đá xay/.test(t)) return pick('blender');
  if (/tự động|auto/.test(t)) return pick('auto');
  if (/bếp|bánh|lò|nướng/.test(t)) return pick('oven');
  if (/xay/.test(t)) return pick('grinder');
  if (/bar/.test(t)) return pick('blender', 'grinder', 'espresso');
  return pick('espresso');
}

export const DEMO_PRODUCT_MAP = new Map(DEMO_PRODUCTS.map((p) => [p.id, p]));
