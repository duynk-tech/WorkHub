import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getAssetById } from '@/server/modules/asset/service';
import { AssetDetailScreen } from './asset-detail-screen';

export const metadata = { title: 'Chi tiết thiết bị' };
export const dynamic = 'force-dynamic';

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  const { id } = await params;
  const assetId = Number(id);

  if (isNaN(assetId)) {
    notFound();
  }

  const [asset, departments, employees] = await Promise.all([
    getAssetById(assetId),
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        fullName: true,
        code: true,
        avatarUrl: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  if (!asset) {
    notFound();
  }

  return (
    <AssetDetailScreen
      asset={JSON.parse(JSON.stringify(asset))}
      departments={departments}
      employees={employees}
      canEdit={can(ctx, 'FEATURE_ASSET_EDIT')}
      canAssign={can(ctx, 'FEATURE_ASSET_ASSIGN')}
      canUpgrade={can(ctx, 'FEATURE_ASSET_UPGRADE')}
      canMaintenance={can(ctx, 'FEATURE_ASSET_MAINTENANCE')}
      canLiquidate={can(ctx, 'FEATURE_ASSET_LIQUIDATE')}
      canDelete={can(ctx, 'FEATURE_ASSET_DELETE')}
    />
  );
}
