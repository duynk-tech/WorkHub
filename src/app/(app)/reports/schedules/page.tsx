import { requirePermission, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { visibleReports } from '@/server/modules/report/registry';
import { getDisabledReportKeys } from '@/server/modules/report/config';
import { isEmailConfigured } from '@/server/modules/notify/email';
import { SchedulesScreen } from './schedules-screen';

export const metadata = { title: 'Lịch gửi báo cáo' };
export const dynamic = 'force-dynamic';

export default async function ReportSchedulesPage() {
  const ctx = await requirePermission('MENU_REPORTS');
  const reports = visibleReports(await getDisabledReportKeys(), (p) => can(ctx, p as never));
  const [schedules, employees] = await Promise.all([
    prisma.reportSchedule.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }),
  ]);
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  const users = await prisma.user.findMany({ select: { id: true, employee: { select: { fullName: true } } } });
  const userName = new Map(users.map((u) => [u.id, u.employee.fullName]));

  // Mỗi người thấy lịch mình lập; admin thấy tất cả
  const visible = schedules.filter((s) => ctx.isAdmin || (s.recipientsJson as { ownerUserId?: number })?.ownerUserId === ctx.userId);

  return (
    <SchedulesScreen
      canCreate={can(ctx, 'FEATURE_REPORT_EXPORT')}
      emailReady={isEmailConfigured()}
      currentEmployeeId={ctx.employeeId}
      reports={reports.map((r) => ({ key: r.key, label: r.label }))}
      employees={employees.map((e) => ({ id: e.id, name: e.fullName, hasEmail: Boolean(e.email) }))}
      schedules={visible.map((s) => {
        const rec = s.recipientsJson as { ownerUserId?: number; employeeIds?: number[] };
        return {
          id: s.id,
          name: s.name,
          reportLabel: reports.find((r) => r.key === s.reportKey)?.label ?? s.reportKey,
          frequency: s.cronExpr,
          channel: s.channel,
          isActive: s.isActive,
          lastRunAt: s.lastRunAt?.toISOString() ?? null,
          owner: rec.ownerUserId ? userName.get(rec.ownerUserId) ?? '—' : '—',
          recipients: (rec.employeeIds ?? []).map((id) => nameOf.get(id) ?? `#${id}`),
        };
      })}
    />
  );
}
