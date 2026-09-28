/**
 * Tiện ích trích xuất và định dạng thông số kỹ thuật máy móc F&B
 * dùng chung cho form nhập liệu và bản in báo giá / đơn hàng.
 */

export interface EquipmentSpecRow {
  icon?: string;
  label: string;
  value: string;
}

export function getEquipmentSpecRows(equipmentOrSpecs: any): EquipmentSpecRow[] {
  if (!equipmentOrSpecs) return [];

  const looksLikeEquipment = [
    'id',
    'machineCode',
    'serialNumber',
    'ownershipType',
    'status',
    'customerId',
  ].some((key) => key in equipmentOrSpecs);
  const equipmentSpecKeys = [
    'dimensions', 'weightKg', 'madeIn', 'voltage', 'powerWatts', 'powerKw', 'power',
    'iceCream', 'chocolate', 'kitchen', 'attributes', 'brand', 'model',
  ];
  const directEquipmentSpecs = looksLikeEquipment
    ? Object.fromEntries(equipmentSpecKeys.filter((key) => equipmentOrSpecs[key] !== undefined).map((key) => [key, equipmentOrSpecs[key]]))
    : equipmentOrSpecs;
  let rawSpecs = equipmentOrSpecs.specs ?? directEquipmentSpecs;
  if (typeof rawSpecs === 'string') {
    try {
      rawSpecs = JSON.parse(rawSpecs);
    } catch {
      rawSpecs = {};
    }
  }
  const specs = (rawSpecs && typeof rawSpecs === 'object' ? rawSpecs : {}) as Record<string, any>;
  const brand = equipmentOrSpecs.brand || specs.brand;
  const model = equipmentOrSpecs.model || specs.model;
  const madeIn = specs.madeIn;

  const ice = specs.iceCream || {};
  const choco = specs.chocolate || {};
  const kitchen = specs.kitchen || {};

  const rows: EquipmentSpecRow[] = [];

  // 1. Model & Hãng / Xuất xứ
  const modelOrigin = [
    model,
    brand ? `Hãng: ${brand}` : '',
    madeIn && !brand?.toLowerCase().includes(madeIn.toLowerCase()) ? `Xuất xứ: ${madeIn}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  if (modelOrigin) {
    rows.push({ label: model ? 'Model' : 'Hãng/SX', value: modelOrigin });
  }

  // 2. Điện & Công suất
  const voltage = specs.voltage || ice.voltage || choco.voltage || kitchen.voltage;
  const rawPower =
    specs.powerWatts ||
    ice.powerWatts ||
    choco.powerWatts ||
    (kitchen.powerKw
      ? `${kitchen.powerKw}${String(kitchen.powerKw).toLowerCase().includes('kw') ? '' : ' kW'}`
      : undefined) ||
    specs.power;
  const power = rawPower ? `CS: ${rawPower}` : '';
  const electrical = [voltage, power].filter(Boolean).join(' • ');
  if (electrical) {
    rows.push({ label: 'Điện', value: electrical });
  }

  // 3. Kích thước & Trọng lượng
  const physParts: string[] = [];
  if (specs.dimensions) physParts.push(specs.dimensions);
  if (specs.weightKg) physParts.push(`Nặng ${specs.weightKg} kg`);
  if (physParts.length > 0) {
    rows.push({ label: 'KT', value: physParts.join(' • ') });
  }

  // 4. Cấu hình & Năng suất
  const capacityParts: string[] = [];
  if (ice.capacityPerHour) capacityParts.push(`Năng suất: ${ice.capacityPerHour}`);
  if (choco.outputPerHourKg) capacityParts.push(`Năng suất: ${choco.outputPerHourKg}`);
  if (kitchen.capacity) capacityParts.push(kitchen.capacity);
  if (choco.tankCapacityKg) capacityParts.push(`Bồn nấu: ${choco.tankCapacityKg}`);
  if (ice.hopperCapacity) capacityParts.push(`Bồn chứa: ${ice.hopperCapacity}`);
  if (ice.cylinderCapacity) capacityParts.push(`Cối làm kem: ${ice.cylinderCapacity}`);
  if (capacityParts.length > 0) {
    rows.push({ label: 'Cấu hình', value: capacityParts.join(' • ') });
  }

  // 5. Tính năng nổi bật
  const featureParts: string[] = [];
  if (ice.machineType) featureParts.push(ice.machineType);
  if (ice.flavorCount) featureParts.push(ice.flavorCount);
  if (ice.preCooling) featureParts.push('Giữ tươi ban đêm');
  if (ice.airPump) featureParts.push('Bơm tăng xốp');
  if (ice.compressor) featureParts.push(`Máy nén ${ice.compressor}`);
  if (ice.refrigerant) featureParts.push(`Gas ${ice.refrigerant}`);
  if (ice.coolingType) featureParts.push(ice.coolingType);
  if (choco.machineType) featureParts.push(choco.machineType);
  if (choco.tempRange) featureParts.push(`Nhiệt độ: ${choco.tempRange}`);
  if (choco.heatingMethod) featureParts.push(choco.heatingMethod);
  if (choco.hasFootPedal) featureParts.push('Bàn đạp ngắt rót');
  if (choco.materialGrade) featureParts.push(choco.materialGrade);
  if (kitchen.equipmentType) featureParts.push(kitchen.equipmentType);
  if (kitchen.tempRange) featureParts.push(`Nhiệt độ: ${kitchen.tempRange}`);
  if (kitchen.powerType && kitchen.powerType.toLowerCase() !== 'điện') {
    featureParts.push(`Nhiên liệu: ${kitchen.powerType}`);
  }
  if (featureParts.length > 0) {
    rows.push({ label: 'Tính năng', value: featureParts.join(' • ') });
  }

  // 6. Thông số kỹ thuật tùy biến động (Dynamic Attributes)
  if (Array.isArray(specs.attributes)) {
    for (const attr of specs.attributes) {
      if (attr && attr.label && attr.value) {
        rows.push({
          label: String(attr.label).trim(),
          value: String(attr.value).trim(),
        });
      }
    }
  }

  // 7. Hỗ trợ cặp key-value tự do nếu có lưu trực tiếp
  const standardKeys = new Set([
    'dimensions',
    'weightKg',
    'madeIn',
    'voltage',
    'powerWatts',
    'powerKw',
    'power',
    'iceCream',
    'chocolate',
    'kitchen',
    'otherDescription',
    'attributes',
    'brand',
    'model',
  ]);
  for (const [key, val] of Object.entries(specs)) {
    if (!standardKeys.has(key) && val !== null && val !== undefined && typeof val !== 'object') {
      const strVal = String(val).trim();
      if (strVal) {
        rows.push({ label: key, value: strVal });
      }
    }
  }

  return rows;
}

export interface DynamicSpecAttribute {
  id?: string;
  label: string;
  value: string;
}

export interface SpecPreset {
  id: string;
  name: string;
  icon: string;
  category: string;
  attributes: Array<{ label: string; value: string }>;
  defaultElectrical?: { voltage?: string; powerWatts?: string };
}

export const EQUIPMENT_SPEC_PRESETS: SpecPreset[] = [
  {
    id: 'ESPRESSO_2GROUP',
    name: 'Máy pha cà phê (2 Group)',
    icon: '☕',
    category: 'BEVERAGE_BAR',
    defaultElectrical: { voltage: '220V - 240V / 50Hz', powerWatts: '3500W - 4500W' },
    attributes: [
      { label: 'Số Group', value: '2 Group chuyên nghiệp' },
      { label: 'Dung tích Boiler', value: '11 Lít (Dual Boiler inox)' },
      { label: 'Công nghệ bơm', value: 'Bơm quay Rotary Procon 9 bar' },
      { label: 'Kiểm soát nhiệt', value: 'PID độc lập từng group (±0.5°C)' },
      { label: 'Chế độ chiết xuất', value: 'Auto-Volumetric 4 nút định lượng/group' },
      { label: 'Vòi hơi & Nước sôi', value: '2 vòi hơi Cool-touch + 1 vòi nước sôi' },
    ],
  },
  {
    id: 'COFFEE_GRINDER',
    name: 'Máy xay cà phê hạt công nghiệp',
    icon: '⚙️',
    category: 'BEVERAGE_BAR',
    defaultElectrical: { voltage: '220V / 50Hz', powerWatts: '350W' },
    attributes: [
      { label: 'Lưỡi dao', value: '65 mm Flat Burrs (Thép đặc biệt)' },
      { label: 'Tốc độ quay', value: '1350 RPM (Năng suất 2.7g/giây)' },
      { label: 'Phễu chứa hạt', value: '1.2 kg chống tia UV' },
      { label: 'Điều chỉnh độ mịn', value: 'Vô cấp Micrometric cực mịn' },
      { label: 'Màn hình & Chế độ', value: 'Điện tử cảm ứng 2 chế độ (Single / Double)' },
    ],
  },
  {
    id: 'SOFT_SERVE',
    name: 'Máy làm kem tươi (Soft-Serve)',
    icon: '🍦',
    category: 'ICE_CREAM_MACHINE',
    defaultElectrical: { voltage: '220V / 50Hz', powerWatts: '2200W - 2800W' },
    attributes: [
      { label: 'Kiểu máy', value: '3 vòi để bàn (2 vị riêng + 1 vị hỗn hợp)' },
      { label: 'Năng suất', value: '28 Lít/giờ (~280 cây kem/h)' },
      { label: 'Dung tích bồn chứa', value: '12.5 Lít x 2 bồn' },
      { label: 'Dung tích cối làm kem', value: '1.9 Lít x 2 cối' },
      { label: 'Bơm tăng xốp', value: 'Air Pump tăng độ phồng kem 35%' },
      { label: 'Giữ tươi ban đêm', value: 'Chế độ Pre-cooling giữ lạnh qua đêm' },
      { label: 'Máy nén & Gas', value: 'Embraco 1.5HP (Ý) • Gas R404A' },
      { label: 'Hệ thống làm mát', value: 'Làm mát bằng gió (Air-cooled)' },
    ],
  },
  {
    id: 'GELATO_BATCH',
    name: 'Máy làm kem Gelato (Batch Freezer)',
    icon: '🍨',
    category: 'ICE_CREAM_MACHINE',
    defaultElectrical: { voltage: '380V / 50Hz (3 pha)', powerWatts: '3200W' },
    attributes: [
      { label: 'Kiểu máy', value: 'Batch Freezer làm mẻ Gelato thủ công' },
      { label: 'Năng suất làm kem', value: '20 kg/giờ (3-4 mẻ/h)' },
      { label: 'Dung tích cối đứng', value: '4 Lít / mẻ' },
      { label: 'Thời gian làm kem', value: '8 - 12 phút / mẻ' },
      { label: 'Máy nén & Gas', value: 'Danfoss Maneurop 2HP • Gas R404A' },
    ],
  },
  {
    id: 'CHOCOLATE_TEMPERING',
    name: 'Máy tôi & phủ Socola (Tempering)',
    icon: '🍫',
    category: 'CHOCOLATE_MACHINE',
    defaultElectrical: { voltage: '220V hoặc 380V', powerWatts: '1600W' },
    attributes: [
      { label: 'Kiểu máy', value: 'Continuous Tempering tôi socola liên tục' },
      { label: 'Dung tích bồn nấu', value: '25 kg' },
      { label: 'Năng suất tôi', value: '90 kg/h' },
      { label: 'Dải nhiệt độ', value: '20°C - 60°C (±0.1°C)' },
      { label: 'Gia nhiệt', value: 'Cách thủy tuần hoàn cưỡng bức' },
      { label: 'Bàn đạp ngắt rót', value: 'Có (Định lượng thể tích)' },
      { label: 'Vật liệu chế tạo', value: 'Inox 316 chuẩn dược phẩm - thực phẩm' },
    ],
  },
  {
    id: 'CONVECTION_OVEN',
    name: 'Lò nướng đối lưu công nghiệp',
    icon: '🔥',
    category: 'KITCHEN_HOT',
    defaultElectrical: { voltage: '380V (3 pha)', powerWatts: '9.2 kW' },
    attributes: [
      { label: 'Cấu hình khay', value: '4 khay 600x400 mm hoặc GN 1/1' },
      { label: 'Dải nhiệt độ nướng', value: '30°C - 260°C' },
      { label: 'Công nghệ đối lưu', value: 'Quạt đảo chiều tự động + Phun ẩm trực tiếp' },
      { label: 'Bảng điều khiển', value: 'Màn hình cảm ứng lưu 99 chương trình' },
      { label: 'Cửa kính', value: 'Kính 2 lớp cách nhiệt an toàn phản xạ nhiệt' },
    ],
  },
  {
    id: 'ICE_MAKER',
    name: 'Máy làm đá viên (Ice Maker)',
    icon: '❄️',
    category: 'KITCHEN_COLD',
    defaultElectrical: { voltage: '220V / 50Hz', powerWatts: '850W' },
    attributes: [
      { label: 'Sản lượng đá', value: '150 kg / 24 giờ' },
      { label: 'Thùng chứa đá', value: '80 kg giữ lạnh bảo ôn' },
      { label: 'Kiểu viên đá', value: 'Đá vuông Full Dice (22x22x22mm)' },
      { label: 'Làm mát', value: 'Làm mát bằng gió (Air-cooled)' },
      { label: 'Vỏ máy', value: 'Inox 304 chống bám vân tay' },
    ],
  },
];

export function getEquipmentQuickPills(equipmentOrSpecs: any): string[] {
  if (!equipmentOrSpecs) return [];
  const specs = (equipmentOrSpecs.specs || equipmentOrSpecs) as Record<string, any>;
  const ice = specs.iceCream || {};
  const choco = specs.chocolate || {};
  const kitchen = specs.kitchen || {};

  const pills: string[] = [];
  if (equipmentOrSpecs.model) pills.push(`Model: ${equipmentOrSpecs.model}`);
  if (ice.capacityPerHour) pills.push(`⚡ ${ice.capacityPerHour}`);
  else if (choco.outputPerHourKg) pills.push(`⚡ ${choco.outputPerHourKg}`);
  else if (kitchen.powerKw) pills.push(`⚡ ${kitchen.powerKw} kW`);

  // Check dynamic attributes for capacity
  if (Array.isArray(specs.attributes)) {
    const capAttr = specs.attributes.find((a: any) =>
      a?.label && (a.label.includes('Năng suất') || a.label.includes('Dung tích') || a.label.includes('Số Group'))
    );
    if (capAttr && capAttr.value && !ice.capacityPerHour && !choco.outputPerHourKg && !kitchen.powerKw) {
      pills.push(`⚡ ${capAttr.label}: ${capAttr.value}`);
    }
  }

  const power = specs.powerWatts || ice.powerWatts || choco.powerWatts;
  const voltage = specs.voltage || ice.voltage || choco.voltage || kitchen.voltage;
  if (power && voltage) {
    pills.push(`🔌 ${power} · ${String(voltage).split('/')[0].trim()}`);
  } else if (power) {
    pills.push(`🔌 ${power}`);
  } else if (voltage) {
    pills.push(`🔌 ${String(voltage).split('/')[0].trim()}`);
  }

  if (specs.madeIn) pills.push(`🌐 ${specs.madeIn}`);
  return pills;
}
