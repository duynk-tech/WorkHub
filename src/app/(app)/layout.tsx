import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthContext, can } from '@/server/auth/context';
import { NAV_SECTIONS } from '@/lib/nav';
import { AppShell } from '@/components/layout/app-shell';
import { getAppBranding } from '@/server/modules/settings/branding';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  // Lọc menu theo quyền, bỏ nhóm rỗng
  const sections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(ctx, i.permission)) }))
    .filter((s) => s.items.length > 0);

  const [pendingApprovals, myTasks, notifications, unreadCount, branding] = await Promise.all([
    prisma.approvalTask.count({ where: { approverId: ctx.employeeId, status: 'PENDING' } }),
    prisma.task.count({ where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
    prisma.inAppNotification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true },
    }),
    prisma.inAppNotification.count({ where: { userId: ctx.userId, readAt: null } }),
    getAppBranding(),
  ]);

  return (
    <AppShell
      appName={branding.name}
      logoUrl={branding.logoUrl}
      logoText={branding.logoText}
      sections={sections}
      badges={{ pendingApprovals, myTasks }}
      user={{
        fullName: ctx.fullName,
        username: ctx.username,
        avatarUrl: ctx.avatarUrl,
        departmentName: ctx.departmentName,
        positionName: ctx.positionName,
        roleNames: ctx.roleNames,
        zaloLinked: ctx.zaloLinked,
      }}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
