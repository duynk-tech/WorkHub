import { requireAuth, can } from '@/server/auth/context';
import { redirect } from 'next/navigation';
import { attendanceReport, taskReport, leaveReport, overviewReport } from '@/server/modules/report/service';
import { customerDebtReport } from '@/server/modules/report/customer-debt';
import { getDisabledReportKeys } from '@/server/modules/report/config';
import { visibleReports, visibleGroups } from '@/server/modules/report/registry';
import { ReportScreen } from './report-screen';

export const metadata = { title: 'Báo cáo' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; from?: string; to?: string; year?: string }>;
}) {
  const ctx = await requireAuth();
  if (!can(ctx, 'MENU_REPORTS')) redirect('/dashboard');
  const sp = await searchParams;

  const disabled = await getDisabledReportKeys();
  const reports = visibleReports(disabled, (p) => can(ctx, p as never))
    .filter((report) => report.key !== 'sales-inventory');
  const groups = visibleGroups(reports);

  // Báo cáo bị tắt hoặc không có quyền thì rơi về báo cáo đầu tiên còn hiển thị
  const requested = sp.tab ?? '';
  const tab = reports.some((r) => r.key === requested) ? requested : reports[0]?.key || '';

  const now = new Date();
  const month = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = sp.from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = sp.to ?? now.toISOString().slice(0, 10);
  const year = Number(sp.year ?? now.getFullYear());

  const [overview, attendance, tasks, leaves, debt] = await Promise.all([
    overviewReport(ctx),
    tab === 'attendance' ? attendanceReport(ctx, month) : Promise.resolve(null),
    tab === 'task' ? taskReport(ctx, from, to) : Promise.resolve(null),
    tab === 'leave' ? leaveReport(ctx, year) : Promise.resolve(null),
    tab === 'customer-debt' ? customerDebtReport() : Promise.resolve(null),
  ]);

  return (
    <ReportScreen
      tab={tab}
      reports={reports}
      groups={groups}
      overview={overview}
      attendance={attendance ? JSON.parse(JSON.stringify(attendance)) : null}
      tasks={tasks ? JSON.parse(JSON.stringify(tasks)) : null}
      leaves={leaves ? JSON.parse(JSON.stringify(leaves)) : null}
      debt={debt ? JSON.parse(JSON.stringify(debt)) : null}
      filters={{ month, from, to, year }}
      canExport={can(ctx, 'FEATURE_REPORT_EXPORT')}
    />
  );
}
