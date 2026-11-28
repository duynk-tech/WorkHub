import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthContext, can } from '@/server/auth/context';
import { NAV_SECTIONS } from '@/lib/nav';
import { AppShell } from '@/components/layout/app-shell';
import { loadShellLive } from '@/server/modules/notify/live';
import { getAppBranding, getPrintWatermarkConfig } from '@/server/modules/settings/branding';
import { getDisabledReportKeys } from '@/server/modules/report/config';
import { getDisabledMenuHrefs } from '@/server/modules/settings/menus';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  // Lọc menu theo quyền, bỏ nhóm rỗng
  const sections = NAV_SECTIONS
    .map((s) => ({
      ...s,
      items: s.items.filter((i) =>
        !i.permission || (typeof i.permission === 'string' ? can(ctx, i.permission) : i.permission.some((p) => can(ctx, p)))),
    }))
    .filter((s) => s.items.length > 0);

  const [live, branding, printWatermark, disabledReports, disabledMenus] = await Promise.all([
    loadShellLive(ctx),
    getAppBranding(),
    getPrintWatermarkConfig(),
    getDisabledReportKeys(),
    getDisabledMenuHrefs(),
  ]);

  const disabledMenuSet = new Set(disabledMenus);
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !disabledMenuSet.has(item.href) &&
          (item.href !== '/inventory-report' || !disabledReports.includes('sales-inventory')),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <AppShell
      initialCollapsed={(await cookies()).get('workhub-sidebar')?.value === 'collapsed'}
      appName={branding.name}
      logoUrl={branding.logoUrl}
      logoText={branding.logoText}
      printWatermark={printWatermark}
      sections={visibleSections}
      badges={live.badges}
      user={{
        fullName: ctx.fullName,
        username: ctx.username,
        avatarUrl: ctx.avatarUrl,
        departmentName: ctx.departmentName,
        positionName: ctx.positionName,
        roleNames: ctx.roleNames,
        zaloLinked: ctx.zaloLinked,
      }}
      notifications={live.notifications}
      unreadCount={live.unreadCount}
    >
      {children}
    </AppShell>
  );
}
