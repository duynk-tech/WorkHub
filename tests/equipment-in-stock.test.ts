import { describe, it, expect } from 'vitest';
import {
  PART_CATEGORIES, EQUIPMENT_CATEGORY, isEquipmentCategory, SaveSparePartSchema,
} from '@/server/modules/spare-parts/types';

/** Tách giá trị tồn theo nhóm — đúng phép tính mà getSparePartsStats dùng. */
function splitStockValue(items: { category: string; qty: number; cost: number }[]) {
  let machine = 0, part = 0, machineQty = 0;
  for (const i of items) {
    const value = i.qty * i.cost;
    if (isEquipmentCategory(i.category)) { machine += value; machineQty += i.qty; }
    else part += value;
  }
  return { machine, part, machineQty, total: machine + part };
}

describe('máy nguyên chiếc trong danh mục kho', () => {
  it('EQUIPMENT là nhóm riêng, không lẫn với cụm máy thay thế', () => {
    expect(PART_CATEGORIES.EQUIPMENT.label).toBe('Máy nguyên chiếc');
    expect(PART_CATEGORIES.MACHINE.label).toBe('Cụm máy / Bộ phận lớn');
    expect(EQUIPMENT_CATEGORY).toBe('EQUIPMENT');
  });

  it('chỉ EQUIPMENT mới được tính là máy', () => {
    expect(isEquipmentCategory('EQUIPMENT')).toBe(true);
    expect(isEquipmentCategory('MACHINE')).toBe(false);
    expect(isEquipmentCategory('SPARE_PART')).toBe(false);
    expect(isEquipmentCategory(null)).toBe(false);
    expect(isEquipmentCategory(undefined)).toBe(false);
  });

  it('form khai báo phụ tùng nhận nhóm EQUIPMENT', () => {
    const parsed = SaveSparePartSchema.parse({
      itemCode: 'SP-2026-0001', name: 'Máy làm kem Taylor C708',
      category: 'EQUIPMENT', unit: 'Máy',
    });
    expect(parsed.category).toBe('EQUIPMENT');
  });

  it('nhóm lạ vẫn bị từ chối', () => {
    expect(() => SaveSparePartSchema.parse({
      itemCode: 'X', name: 'Y', category: 'KHONG_TON_TAI', unit: 'Cái',
    })).toThrow();
  });

  it('dùng chung kho nhưng giá trị máy và phụ tùng tách riêng', () => {
    const r = splitStockValue([
      { category: 'EQUIPMENT', qty: 2, cost: 185_000_000 },
      { category: 'SPARE_PART', qty: 10, cost: 2_800_000 },
      { category: 'MACHINE', qty: 1, cost: 12_000_000 },
    ]);
    expect(r.machine).toBe(370_000_000);
    expect(r.machineQty).toBe(2);
    // Cụm máy thay thế tính vào phụ tùng, không tính vào máy bán
    expect(r.part).toBe(28_000_000 + 12_000_000);
    expect(r.total).toBe(410_000_000);
  });

  it('chưa nhập máy nào thì phần máy bằng 0, không ảnh hưởng số phụ tùng', () => {
    const r = splitStockValue([{ category: 'SPARE_PART', qty: 5, cost: 1_000_000 }]);
    expect(r.machine).toBe(0);
    expect(r.machineQty).toBe(0);
    expect(r.part).toBe(5_000_000);
  });
});
