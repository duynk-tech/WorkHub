import { requirePermission, can } from '@/server/auth/context';
import { customerDebtReport } from '@/server/modules/report/customer-debt';
import { attendanceReport, taskReport, leaveReport, overviewReport } from '@/server/modules/report/service';
import { getDisabledReportKeys } from '@/server/modules/report/config';
import { visibleReports } from '@/server/modules/report/registry';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { ReportScreen } from './report-screen';

export const metadata = { title: 'Báo cáo' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; report?: string; month?: string; from?: string; to?: string; year?: string }>;
}) {
  const ctx = await requirePermission('MENU_REPORTS');
  const sp = await searchParams;
  const today = new Date();
  const year = today.getFullYear();

  const reports = visibleReports(
    await getDisabledReportKeys(),
    (permission) => can(ctx, permission as never),
  ).filter((report) => report.key !== 'sales-inventory');

  const requested = sp.tab ?? sp.report ?? '';
  const tab = reports.some((report) => report.key === requested) ? requested : reports[0]?.key ?? '';
  const month = sp.month ?? `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const from = sp.from ?? `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const to = sp.to ?? today.toISOString().slice(0, 10);
  const reportYear = Number(sp.year ?? year);

  const [overview, attendance, tasks, leaves, debt] = await Promise.all([
    overviewReport(ctx),
    tab === 'attendance' ? attendanceReport(ctx, month) : Promise.resolve(null),
    tab === 'task' ? taskReport(ctx, from, to) : Promise.resolve(null),
    tab === 'leave' ? leaveReport(ctx, reportYear) : Promise.resolve(null),
    tab === 'customer-debt' ? customerDebtReport() : Promise.resolve(null),
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Báo cáo"
        description="Tổng hợp báo cáo công việc, chấm công, nghỉ phép và công nợ khách hàng"
        actions={<Link href="/reports/schedules" className="btn btn-secondary"><CalendarClock /> Lịch gửi tự động</Link>}
      />
      <ReportScreen
        tab={tab}
        reports={reports}
        overview={overview}
        attendance={attendance ? JSON.parse(JSON.stringify(attendance)) : null}
        tasks={tasks ? JSON.parse(JSON.stringify(tasks)) : null}
        leaves={leaves ? JSON.parse(JSON.stringify(leaves)) : null}
        debt={debt ? JSON.parse(JSON.stringify(debt)) : null}
        filters={{ month, from, to, year: reportYear }}
        canExport={can(ctx, 'FEATURE_REPORT_EXPORT')}
        routeBase="/reports"
        routeParam="tab"
      />
    </div>
  );
}
