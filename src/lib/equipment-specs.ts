/**
 * Tiện ích trích xuất và định dạng thông số kỹ thuật máy móc F&B
 * dùng chung cho form nhập liệu và bản in báo giá / đơn hàng.
 */

export interface EquipmentSpecRow {
  label: string;
  value: string;
}

export function getEquipmentSpecRows(equipmentOrSpecs: any): EquipmentSpecRow[] {
  if (!equipmentOrSpecs) return [];

  const specs = (equipmentOrSpecs.specs || equipmentOrSpecs) as Record<string, any>;
  const brand = equipmentOrSpecs.brand || specs.brand;
  const model = equipmentOrSpecs.model || specs.model;
  const madeIn = specs.madeIn;

  const ice = specs.iceCream || {};
  const choco = specs.chocolate || {};
  const kitchen = specs.kitchen || {};

  const rows: EquipmentSpecRow[] = [];

  // 1. Model / Hãng / Xuất xứ
  const modelOrigin = [
    model ? `Model: ${model}` : '',
    brand ? `Hãng: ${brand}` : '',
    madeIn ? `Xuất xứ: ${madeIn}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  if (modelOrigin) {
    rows.push({ label: 'Model & Xuất xứ', value: modelOrigin });
  }

  // 2. Điện áp & Công suất
  const voltage = specs.voltage || ice.voltage || choco.voltage || kitchen.voltage;
  const power =
    specs.powerWatts ||
    ice.powerWatts ||
    choco.powerWatts ||
    (kitchen.powerKw ? `${kitchen.powerKw} kW` : undefined) ||
    specs.power;
  const electrical = [voltage, power ? `Công suất: ${power}` : ''].filter(Boolean).join(' • ');
  if (electrical) {
    rows.push({ label: 'Điện áp & Công suất', value: electrical });
  }

  // 3. Năng suất & Dung tích
  const capacityParts: string[] = [];
  if (ice.capacityPerHour) capacityParts.push(`Năng suất: ${ice.capacityPerHour}`);
  if (choco.outputPerHourKg) capacityParts.push(`Năng suất: ${choco.outputPerHourKg}`);
  if (kitchen.capacity) capacityParts.push(`Dung tích: ${kitchen.capacity}`);
  if (choco.tankCapacityKg) capacityParts.push(`Bồn nấu: ${choco.tankCapacityKg}`);
  if (ice.hopperCapacity) capacityParts.push(`Bồn chứa: ${ice.hopperCapacity}`);
  if (ice.cylinderCapacity) capacityParts.push(`Cối làm kem: ${ice.cylinderCapacity}`);
  if (capacityParts.length > 0) {
    rows.push({ label: 'Năng suất & Dung tích', value: capacityParts.join(' • ') });
  }

  // 4. Kích thước & Trọng lượng
  const physParts: string[] = [];
  if (specs.dimensions) physParts.push(`KT: ${specs.dimensions}`);
  if (specs.weightKg) physParts.push(`Trọng lượng: ${specs.weightKg} kg`);
  if (physParts.length > 0) {
    rows.push({ label: 'Kích thước & Khối lượng', value: physParts.join(' • ') });
  }

  // 5. Tính năng & Công nghệ
  const featureParts: string[] = [];
  if (ice.machineType) featureParts.push(ice.machineType);
  if (ice.flavorCount) featureParts.push(ice.flavorCount);
  if (ice.preCooling) featureParts.push('Giữ tươi ban đêm');
  if (ice.airPump) featureParts.push('Bơm tăng xốp');
  if (ice.compressor) featureParts.push(`Máy nén ${ice.compressor}`);
  if (ice.coolingType) featureParts.push(ice.coolingType);
  if (choco.machineType) featureParts.push(choco.machineType);
  if (choco.tempRange) featureParts.push(`Nhiệt độ: ${choco.tempRange}`);
  if (choco.hasFootPedal) featureParts.push('Bàn đạp ngắt rót');
  if (choco.materialGrade) featureParts.push(choco.materialGrade);
  if (kitchen.equipmentType) featureParts.push(kitchen.equipmentType);
  if (kitchen.tempRange) featureParts.push(`Nhiệt độ: ${kitchen.tempRange}`);
  if (kitchen.powerType) featureParts.push(kitchen.powerType);
  if (featureParts.length > 0) {
    rows.push({ label: 'Tính năng & Công nghệ', value: featureParts.join(' • ') });
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
