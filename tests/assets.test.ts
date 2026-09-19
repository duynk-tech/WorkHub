import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAssetCode, ASSET_CATEGORIES, ASSET_STATUSES } from '@/server/modules/asset/service';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findFirst: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('Asset Management Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('định nghĩa đầy đủ các danh mục loại thiết bị', () => {
    expect(ASSET_CATEGORIES.LAPTOP).toBeDefined();
    expect(ASSET_CATEGORIES.DESKTOP).toBeDefined();
    expect(ASSET_CATEGORIES.MONITOR).toBeDefined();
    expect(ASSET_CATEGORIES.MOBILE).toBeDefined();
    expect(ASSET_CATEGORIES.NETWORK).toBeDefined();
  });

  it('định nghĩa đầy đủ các trạng thái thiết bị', () => {
    expect(ASSET_STATUSES.IN_STOCK).toBeDefined();
    expect(ASSET_STATUSES.IN_USE).toBeDefined();
    expect(ASSET_STATUSES.UNDER_MAINTENANCE).toBeDefined();
    expect(ASSET_STATUSES.UNDER_WARRANTY).toBeDefined();
    expect(ASSET_STATUSES.LIQUIDATED).toBeDefined();
  });

  it('tự động sinh mã tài sản tăng dần theo năm AST-YYYY-XXXX', async () => {
    const currentYear = new Date().getFullYear();
    vi.mocked(prisma.asset.findFirst).mockResolvedValue({
      assetCode: `AST-${currentYear}-0015`,
    } as never);

    const code = await generateAssetCode();
    expect(code).toBe(`AST-${currentYear}-0016`);
  });

  it('sinh mã 0001 nếu chưa có thiết bị nào trong năm hiện tại', async () => {
    const currentYear = new Date().getFullYear();
    vi.mocked(prisma.asset.findFirst).mockResolvedValue(null);

    const code = await generateAssetCode();
    expect(code).toBe(`AST-${currentYear}-0001`);
  });
});
