import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSetting, setSetting } from '@/server/modules/settings/service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('Sales Fulfillment Mode & Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mặc định trả về MANUAL_WAREHOUSE_APPROVAL khi chưa cấu hình trong DB', async () => {
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue(null as any);

    const mode = await getSetting('inventory.salesFulfillmentMode', 'MANUAL_WAREHOUSE_APPROVAL');
    expect(mode).toBe('MANUAL_WAREHOUSE_APPROVAL');
  });

  it('trả về cấu hình AUTO_DEDUCT khi đã lưu trong DB', async () => {
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue({
      id: 1,
      key: 'inventory.salesFulfillmentMode',
      valueJson: 'AUTO_DEDUCT',
      groupName: 'general',
      isSecret: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const mode = await getSetting('inventory.salesFulfillmentMode', 'MANUAL_WAREHOUSE_APPROVAL');
    expect(mode).toBe('AUTO_DEDUCT');
  });

  it('lưu thành công cấu hình vào database qua upsert', async () => {
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.systemSetting.upsert).mockResolvedValue({
      id: 1,
      key: 'inventory.salesFulfillmentMode',
      valueJson: 'AUTO_DEDUCT',
      groupName: 'general',
      isSecret: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    await setSetting('inventory.salesFulfillmentMode', 'AUTO_DEDUCT', { group: 'general' });

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'inventory.salesFulfillmentMode' },
        update: expect.objectContaining({ valueJson: 'AUTO_DEDUCT' }),
        create: expect.objectContaining({ valueJson: 'AUTO_DEDUCT' }),
      }),
    );
  });
});
