import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getCompanyInfo } from '@/server/modules/settings/branding';
import { listAssets, getAssetMetrics } from '@/server/modules/asset/service';
import { AssetScreen } from './asset-screen';

export const metadata = { title: 'Thiết bị & Tài sản IT' };
export const dynamic = 'force-dynamic';

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; dept?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;

  const filter = {
    search: sp.q ?? '',
    category: sp.category ?? '',
    status: sp.status ?? '',
    departmentId: sp.dept ? Number(sp.dept) : undefined,
  };

  const [assets, metrics, departments, employees, company] = await Promise.all([
    listAssets(filter),
    getAssetMetrics(),
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
    getCompanyInfo(),
  ]);

  return (
    <AssetScreen
      company={company}
      assets={JSON.parse(JSON.stringify(assets))}
      metrics={metrics}
      departments={departments}
      employees={employees}
      filter={filter}
      canCreate={can(ctx, 'FEATURE_ASSET_CREATE')}
      canEdit={can(ctx, 'FEATURE_ASSET_EDIT')}
      canAssign={can(ctx, 'FEATURE_ASSET_ASSIGN')}
      canUpgrade={can(ctx, 'FEATURE_ASSET_UPGRADE')}
      canMaintenance={can(ctx, 'FEATURE_ASSET_MAINTENANCE')}
      canLiquidate={can(ctx, 'FEATURE_ASSET_LIQUIDATE')}
      canDelete={can(ctx, 'FEATURE_ASSET_DELETE')}
    />
  );
}
