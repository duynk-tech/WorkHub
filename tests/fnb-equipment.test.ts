import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EQUIPMENT_CATEGORIES,
  OWNERSHIP_TYPES,
  EQUIPMENT_STATUSES,
} from '@/server/modules/equipment/types';
import {
  generateMachineCode,
  saveEquipment,
  listEquipment,
} from '@/server/modules/equipment/service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    fnbEquipment: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('F&B Equipment Management Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('định nghĩa đầy đủ các danh mục thiết bị F&B chuyên dụng', () => {
    const keys = Object.keys(EQUIPMENT_CATEGORIES);
    expect(keys).toContain('ICE_CREAM_MACHINE');
    expect(keys).toContain('CHOCOLATE_MACHINE');
    expect(keys).toContain('KITCHEN_HOT');
    expect(keys).toContain('KITCHEN_COLD');
    expect(keys).toContain('BEVERAGE_BAR');
    expect(keys).toContain('OTHER');
  });

  it('định nghĩa đầy đủ các hình thức sở hữu thực tế', () => {
    const keys = Object.keys(OWNERSHIP_TYPES);
    expect(keys).toContain('SOLD');
    expect(keys).toContain('RENTAL');
    expect(keys).toContain('CONSIGNMENT');
  });

  it('định nghĩa đầy đủ các trạng thái vận hành thiết bị', () => {
    const keys = Object.keys(EQUIPMENT_STATUSES);
    expect(keys).toContain('OPERATING');
    expect(keys).toContain('BREAKDOWN');
    expect(keys).toContain('UNDER_MAINTENANCE');
    expect(keys).toContain('IN_STOCK');
    expect(keys).toContain('LIQUIDATED');
  });

  it('tự động sinh mã máy EQ-YYYY-XXXX chuẩn format', async () => {
    const currentYear = new Date().getFullYear();
    vi.mocked(prisma.fnbEquipment.findMany).mockResolvedValue([
      { machineCode: `EQ-${currentYear}-0001` },
      { machineCode: `EQ-${currentYear}-0002` },
      { machineCode: `EQ-${currentYear}-0005` },
    ] as any);

    const code = await generateMachineCode();
    // Lấy số lớn nhất + 1, không đếm số bản ghi (máy đã xóa không làm trùng mã)
    expect(code).toBe(`EQ-${currentYear}-0006`);
  });

  it('tạo mới máy làm kem với thông số chuyên sâu (Specs)', async () => {
    vi.mocked(prisma.fnbEquipment.count).mockResolvedValue(0);
    (prisma.fnbEquipment.create as any).mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));

    const iceCreamSpecs = {
      machineType: 'Máy kem tươi 3 vòi',
      flavorCount: '2 vị + 1 mix (3 cần gạt)',
      hopperCapacity: '12.5 Lít x 2',
      cylinderCapacity: '2 Lít x 2',
      capacityPerHour: '28 Lít/giờ',
      compressor: 'Embraco Aspera (Ý)',
      refrigerant: 'R404A',
      powerWatts: '2200W',
      voltage: '220V / 50Hz',
      preCooling: true,
      airPump: true,
    };

    const saved = await saveEquipment(null, {
      name: 'Máy làm kem tươi Taylor C708',
      serialNumber: 'TYL-2026-9988',
      category: 'ICE_CREAM_MACHINE',
      brand: 'Taylor',
      model: 'C708',
      ownershipType: 'RENTAL',
      status: 'OPERATING',
      specs: { iceCream: iceCreamSpecs },
      customerId: 10,
      locationId: 20,
    });

    expect(prisma.fnbEquipment.create).toHaveBeenCalledTimes(1);
    expect(saved.name).toBe('Máy làm kem tươi Taylor C708');
    expect(saved.specs).toEqual({ iceCream: iceCreamSpecs });
    expect(saved.category).toBe('ICE_CREAM_MACHINE');
    expect(saved.ownershipType).toBe('RENTAL');
  });

  it('tạo mới máy luyện socola với thông số bồn nấu và bàn rung', async () => {
    vi.mocked(prisma.fnbEquipment.count).mockResolvedValue(0);
    (prisma.fnbEquipment.create as any).mockImplementation(async ({ data }: any) => ({
      id: 2,
      ...data,
    }));

    const chocolateSpecs = {
      machineType: 'Continuous Tempering',
      tankCapacityKg: '24 kg',
      outputPerHourKg: '30 kg/h',
      tempRange: '20°C - 60°C (±0.5°C)',
      hasFootPedal: true,
    };

    const saved = await saveEquipment(null, {
      name: 'Máy gia nhiệt & luyện Socola Selmi Plus EX',
      serialNumber: 'SLM-5544-2026',
      category: 'CHOCOLATE_MACHINE',
      brand: 'Selmi',
      model: 'Plus EX',
      ownershipType: 'SOLD',
      status: 'OPERATING',
      specs: { chocolate: chocolateSpecs },
    });

    expect(prisma.fnbEquipment.create).toHaveBeenCalledTimes(1);
    expect(saved.name).toBe('Máy gia nhiệt & luyện Socola Selmi Plus EX');
    expect(saved.specs).toEqual({ chocolate: chocolateSpecs });
    expect(saved.category).toBe('CHOCOLATE_MACHINE');
  });

  it('cập nhật thông tin thiết bị khi truyền id', async () => {
    (prisma.fnbEquipment.update as any).mockImplementation(async ({ data }: any) => ({
      id: 1,
      name: data.name,
      status: data.status,
    }));

    const updated = await saveEquipment(1, {
      name: 'Máy làm kem tươi Taylor C708 (Đã bảo trì)',
      serialNumber: 'TYL-2026-9988',
      category: 'ICE_CREAM_MACHINE',
      ownershipType: 'RENTAL',
      status: 'OPERATING',
    });

    expect(prisma.fnbEquipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      })
    );
    expect(updated.name).toBe('Máy làm kem tươi Taylor C708 (Đã bảo trì)');
  });

  it('tìm kiếm thiết bị theo từ khóa và danh mục', async () => {
    vi.mocked(prisma.fnbEquipment.findMany).mockResolvedValue([]);

    await listEquipment({
      search: 'Taylor',
      category: 'ICE_CREAM_MACHINE',
      ownershipType: 'RENTAL',
      status: 'OPERATING',
    });

    expect(prisma.fnbEquipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'ICE_CREAM_MACHINE',
          ownershipType: 'RENTAL',
          status: 'OPERATING',
          OR: expect.arrayContaining([
            { name: { contains: 'Taylor' } },
            { machineCode: { contains: 'Taylor' } },
            { serialNumber: { contains: 'Taylor' } },
            { brand: { contains: 'Taylor' } },
            { model: { contains: 'Taylor' } },
          ]),
        }),
      })
    );
  });
});
