import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const ASSET_CATEGORIES: Record<string, { label: string; icon: string }> = {
  LAPTOP: { label: 'Laptop / Máy tính xách tay', icon: 'Laptop' },
  DESKTOP: { label: 'Máy tính để bàn (PC)', icon: 'Monitor' },
  MONITOR: { label: 'Màn hình rời', icon: 'Tv' },
  MOBILE: { label: 'Điện thoại / Tablet', icon: 'Smartphone' },
  NETWORK: { label: 'Thiết bị mạng (Router / Wifi)', icon: 'Wifi' },
  PRINTER: { label: 'Máy in / Máy quét', icon: 'Printer' },
  PERIPHERAL: { label: 'Thiết bị ngoại vi (Bàn phím, Chuột...)', icon: 'Keyboard' },
  OTHER: { label: 'Thiết bị khác', icon: 'HardDrive' },
};

export const ASSET_STATUSES: Record<string, { label: string; color: string; badgeTone: 'success' | 'warning' | 'info' | 'danger' | 'neutral' }> = {
  IN_STOCK: { label: 'Trong kho (Sẵn sàng)', color: '#10b981', badgeTone: 'success' },
  IN_USE: { label: 'Đang cấp phát sử dụng', color: '#3b82f6', badgeTone: 'info' },
  UNDER_MAINTENANCE: { label: 'Đang bảo dưỡng / Sửa chữa', color: '#f59e0b', badgeTone: 'warning' },
  UNDER_WARRANTY: { label: 'Đang gửi bảo hành', color: '#8b5cf6', badgeTone: 'warning' },
  BROKEN: { label: 'Hỏng hóc (Chờ xử lý)', color: '#ef4444', badgeTone: 'danger' },
  LIQUIDATED: { label: 'Đã thanh lý', color: '#64748b', badgeTone: 'neutral' },
  LOST: { label: 'Thất lạc / Đã mất', color: '#dc2626', badgeTone: 'danger' },
};

export const UPGRADE_COMPONENTS: Record<string, string> = {
  RAM: 'Bộ nhớ RAM',
  STORAGE: 'Ổ cứng (SSD / HDD)',
  GPU: 'Card đồ họa (VGA)',
  BATTERY: 'Pin máy tính',
  SCREEN: 'Màn hình',
  OTHER: 'Linh kiện khác',
};

export const MAINTENANCE_TYPES: Record<string, string> = {
  WARRANTY: 'Bảo hành chính hãng',
  REPAIR: 'Sửa chữa phần cứng',
  MAINTENANCE: 'Bảo dưỡng / Vệ sinh định kỳ',
};

export const LIQUIDATION_TYPES: Record<string, string> = {
  SELL_EMPLOYEE: 'Bán thanh lý cho nhân viên',
  SELL_SCRAP: 'Bán thanh lý phế liệu',
  RETURN_PARTNER: 'Trả lại đơn vị cho thuê',
  DISPOSE: 'Tiêu hủy an toàn',
};

export interface AssetSpecs {
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  os?: string;
  screen?: string;
  other?: string;
}

export interface ListAssetsFilter {
  search?: string;
  category?: string;
  status?: string;
  departmentId?: number;
  assigneeId?: number;
  warrantyStatus?: 'active' | 'expired';
}

/** Sinh mã tài sản dạng AST-YYYY-XXXX */
export async function generateAssetCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AST-${year}-`;
  const latest = await prisma.asset.findFirst({
    where: { assetCode: { startsWith: prefix } },
    orderBy: { assetCode: 'desc' },
    select: { assetCode: true },
  });

  let seq = 1;
  if (latest?.assetCode) {
    const parts = latest.assetCode.split('-');
    const lastNum = parseInt(parts[2] ?? '0', 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Thống kê số lượng thiết bị theo trạng thái */
export async function getAssetMetrics() {
  const [total, inUse, inStock, maintenance, liquidated, broken] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.count({ where: { status: 'IN_USE' } }),
    prisma.asset.count({ where: { status: 'IN_STOCK' } }),
    prisma.asset.count({ where: { status: { in: ['UNDER_MAINTENANCE', 'UNDER_WARRANTY'] } } }),
    prisma.asset.count({ where: { status: 'LIQUIDATED' } }),
    prisma.asset.count({ where: { status: 'BROKEN' } }),
  ]);

  return { total, inUse, inStock, maintenance, liquidated, broken };
}

/** Lấy danh sách thiết bị kèm bộ lọc */
export async function listAssets(filter?: ListAssetsFilter) {
  const where: Prisma.AssetWhereInput = {};

  if (filter?.category) {
    where.category = filter.category;
  }

  if (filter?.status) {
    where.status = filter.status;
  }

  if (filter?.departmentId) {
    where.currentDepartmentId = filter.departmentId;
  }

  if (filter?.assigneeId) {
    where.currentAssigneeId = filter.assigneeId;
  }

  if (filter?.warrantyStatus === 'active') {
    where.warrantyExpiresAt = { gte: new Date() };
  } else if (filter?.warrantyStatus === 'expired') {
    where.warrantyExpiresAt = { lt: new Date() };
  }

  if (filter?.search?.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { assetCode: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { serialNumber: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { currentAssignee: { fullName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  return prisma.asset.findMany({
    where,
    include: {
      currentAssignee: {
        select: { id: true, fullName: true, code: true, avatarUrl: true, department: { select: { name: true } } },
      },
      currentDepartment: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Lấy chi tiết một thiết bị kèm toàn bộ lịch sử */
export async function getAssetById(id: number) {
  return prisma.asset.findUnique({
    where: { id },
    include: {
      currentAssignee: {
        select: { id: true, fullName: true, code: true, email: true, phone: true, avatarUrl: true, department: { select: { id: true, name: true } } },
      },
      currentDepartment: { select: { id: true, name: true, code: true } },
      assignments: {
        include: {
          employee: { select: { id: true, fullName: true, code: true, avatarUrl: true } },
          handoverBy: { select: { id: true, fullName: true, code: true } },
        },
        orderBy: { assignedDate: 'desc' },
      },
      upgrades: {
        include: {
          performedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { upgradeDate: 'desc' },
      },
      maintenances: {
        include: {
          performedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { startDate: 'desc' },
      },
      liquidation: {
        include: {
          approvedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
}
