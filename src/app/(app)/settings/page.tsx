import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/server/modules/settings/service';
import { SettingsScreen } from './settings-screen';

export const metadata = { title: 'Cấu hình hệ thống' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = searchParams ? await searchParams : {};
  const initialTab = (sp.tab as any) || 'general';
  const year = new Date().getFullYear();

  const [settings, holidays, shifts, leaveTypes] = await Promise.all([
    getSettings(),
    prisma.holiday.findMany({ where: { year: { gte: year - 1 } }, orderBy: { date: 'asc' } }),
    prisma.workShift.findMany({ orderBy: { code: 'asc' } }),
    prisma.leaveType.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <SettingsScreen
      initialTab={initialTab}
      settings={settings}
      holidays={JSON.parse(JSON.stringify(holidays))}
      shifts={JSON.parse(JSON.stringify(shifts))}
      leaveTypes={JSON.parse(JSON.stringify(leaveTypes))}
      webhookUrl={`${process.env.APP_URL || 'http://localhost:3000'}/api/zalo`}
      permissions={{
        general: can(ctx, 'FEATURE_SETTING_GENERAL'),
        zalo: can(ctx, 'FEATURE_SETTING_ZALO'),
        holiday: can(ctx, 'FEATURE_SETTING_HOLIDAY'),
        shift: can(ctx, 'FEATURE_ATTENDANCE_SHIFT_MANAGE'),
        leaveType: can(ctx, 'FEATURE_LEAVE_TYPE_MANAGE'),
      }}
    />
  );
}
