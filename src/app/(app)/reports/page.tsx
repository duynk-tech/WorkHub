import { requireAuth, can } from '@/server/auth/context';
import { attendanceReport, taskReport, leaveReport, overviewReport } from '@/server/modules/report/service';
import { ReportScreen } from './report-screen';

export const metadata = { title: 'Báo cáo' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; from?: string; to?: string; year?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;

  const now = new Date();
  const tab = (sp.tab ?? 'attendance') as 'attendance' | 'task' | 'leave';
  const month = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = sp.from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = sp.to ?? now.toISOString().slice(0, 10);
  const year = Number(sp.year ?? now.getFullYear());

  const [overview, attendance, tasks, leaves] = await Promise.all([
    overviewReport(ctx),
    tab === 'attendance' ? attendanceReport(ctx, month) : Promise.resolve(null),
    tab === 'task' ? taskReport(ctx, from, to) : Promise.resolve(null),
    tab === 'leave' ? leaveReport(ctx, year) : Promise.resolve(null),
  ]);

  return (
    <ReportScreen
      tab={tab}
      overview={overview}
      attendance={attendance ? JSON.parse(JSON.stringify(attendance)) : null}
      tasks={tasks ? JSON.parse(JSON.stringify(tasks)) : null}
      leaves={leaves ? JSON.parse(JSON.stringify(leaves)) : null}
      filters={{ month, from, to, year }}
      canExport={can(ctx, 'FEATURE_REPORT_EXPORT')}
    />
  );
}
