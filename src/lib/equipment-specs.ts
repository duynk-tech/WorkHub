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

  let rawSpecs = equipmentOrSpecs.specs || equipmentOrSpecs;
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
    rows.push({ label: 'Model', value: modelOrigin });
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

  return rows;
}

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
