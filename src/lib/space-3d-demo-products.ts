import type { SpaceMerchItem } from './space-3d-types';

/**
 * Máy mẫu trưng bày trên quầy khi kho CHƯA có máy nguyên chiếc.
 * id âm để không trùng sản phẩm thật; khách vẫn bấm xem chi tiết được.
 */
export const DEMO_PRODUCTS: (SpaceMerchItem & { model: string })[] = [
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
];

export const DEMO_PRODUCT_MAP = new Map(DEMO_PRODUCTS.map((p) => [p.id, p]));
