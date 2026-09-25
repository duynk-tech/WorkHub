import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_SPEC_PRESETS,
  getEquipmentSpecRows,
  getEquipmentQuickPills,
} from '@/lib/equipment-specs';

describe('Thiết bị F&B: Hệ thống Thông số Kỹ thuật Động & Mẫu Presets', () => {
  it('cung cấp danh sách mẫu Preset chuẩn F&B cho các dòng máy chính', () => {
    expect(EQUIPMENT_SPEC_PRESETS.length).toBeGreaterThanOrEqual(7);
    const presetIds = EQUIPMENT_SPEC_PRESETS.map((p) => p.id);
    expect(presetIds).toContain('ESPRESSO_2GROUP');
    expect(presetIds).toContain('COFFEE_GRINDER');
    expect(presetIds).toContain('SOFT_SERVE');
    expect(presetIds).toContain('GELATO_BATCH');
    expect(presetIds).toContain('CHOCOLATE_TEMPERING');
    expect(presetIds).toContain('CONVECTION_OVEN');
    expect(presetIds).toContain('ICE_MAKER');

    EQUIPMENT_SPEC_PRESETS.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.attributes.length).toBeGreaterThan(0);
      p.attributes.forEach((attr) => {
        expect(attr.label).toBeTruthy();
        expect(attr.value).toBeTruthy();
      });
    });
  });

  it('phân giải chính xác thuộc tính động dạng attributes mảng', () => {
    const mockEquipment = {
      brand: 'Nuova Simonelli',
      model: 'Aurelia Wave 2Gr',
      specs: {
        voltage: '220V / 50Hz',
        powerWatts: '4500W',
        madeIn: 'Ý',
        attributes: [
          { label: 'Số Group', value: '2 Group' },
          { label: 'Dung tích Boiler', value: '14 Lít' },
          { label: 'Công nghệ chiết xuất', value: 'T3 & Pulse-jet' },
        ],
      },
    };

    const rows = getEquipmentSpecRows(mockEquipment);
    const rowLabels = rows.map((r) => r.label);

    expect(rowLabels).toContain('Model');
    expect(rowLabels).toContain('Điện');
    expect(rowLabels).toContain('Số Group');
    expect(rowLabels).toContain('Dung tích Boiler');
    expect(rowLabels).toContain('Công nghệ chiết xuất');

    const boilerRow = rows.find((r) => r.label === 'Dung tích Boiler');
    expect(boilerRow?.value).toBe('14 Lít');
  });

  it('giữ tương thích ngược 100% với định dạng cũ (iceCream, chocolate, kitchen)', () => {
    const legacyIceMachine = {
      specs: {
        iceCream: {
          machineType: 'Kem tươi 3 vòi',
          capacityPerHour: '28 Lít/h',
          cylinderCapacity: '1.9 Lít x 2',
          preCooling: true,
        },
      },
    };

    const rows = getEquipmentSpecRows(legacyIceMachine);
    const rowLabels = rows.map((r) => r.label);

    expect(rowLabels).toContain('Cấu hình');
    expect(rowLabels).toContain('Tính năng');

    const configRow = rows.find((r) => r.label === 'Cấu hình');
    expect(configRow?.value).toContain('Năng suất: 28 Lít/h');
    expect(configRow?.value).toContain('Cối làm kem: 1.9 Lít x 2');

    const featureRow = rows.find((r) => r.label === 'Tính năng');
    expect(featureRow?.value).toContain('Kem tươi 3 vòi');
    expect(featureRow?.value).toContain('Giữ tươi ban đêm');
  });

  it('trích xuất quick pills ngắn gọn từ thông số động', () => {
    const equipment = {
      specs: {
        voltage: '220V / 50Hz',
        madeIn: 'Ý',
        attributes: [
          { label: 'Năng suất làm đá', value: '120 kg/ngày' },
        ],
      },
    };

    const pills = getEquipmentQuickPills(equipment);
    expect(pills.some((p) => p.includes('120 kg/ngày'))).toBe(true);
    expect(pills.some((p) => p.includes('220V'))).toBe(true);
    expect(pills.some((p) => p.includes('Ý'))).toBe(true);
  });
});
