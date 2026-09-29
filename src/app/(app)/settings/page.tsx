import { googleCallbackUrl } from '@/server/auth/google/service';
import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/server/modules/settings/service';
import { SettingsScreen } from './settings-screen';
import { getSparePartPricingConfig } from '@/server/modules/spare-parts/service';

export const metadata = { title: 'Cấu hình hệ thống' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const allowed = {
    general: can(ctx, 'FEATURE_SETTING_GENERAL'),
    pricing: can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE') || ctx.isAdmin,
    zalo: can(ctx, 'FEATURE_SETTING_ZALO'),
    holiday: can(ctx, 'FEATURE_SETTING_HOLIDAY'),
    shift: can(ctx, 'FEATURE_ATTENDANCE_SHIFT_MANAGE'),
    leaveType: can(ctx, 'FEATURE_LEAVE_TYPE_MANAGE'),
  };
  if (!Object.values(allowed).some(Boolean)) notFound();
  const sp = searchParams ? await searchParams : {};
  const initialTab = (sp.tab as any) || 'general';
  const year = new Date().getFullYear();

  const [settings, holidays, shifts, leaveTypes, sparePartPricing] = await Promise.all([
    Promise.all([...(allowed.general ? ['general', 'leave', 'attendance', 'reports'] : []), ...(allowed.zalo ? ['zalo', 'ai'] : []), ...(ctx.isAdmin ? ['sso'] : [])].map((group) => getSettings(group))).then((groups) => Object.assign({}, ...groups)),
    prisma.holiday.findMany({ where: { year: { gte: year - 1 } }, orderBy: { date: 'asc' } }),
    prisma.workShift.findMany({ orderBy: { code: 'asc' } }),
    prisma.leaveType.findMany({ orderBy: { sortOrder: 'asc' } }),
    allowed.pricing ? getSparePartPricingConfig() : Promise.resolve(null),
  ]);

  return (
    <SettingsScreen
      initialTab={initialTab}
      googleCallbackUrl={googleCallbackUrl()}
      settings={settings}
      holidays={JSON.parse(JSON.stringify(holidays))}
      shifts={JSON.parse(JSON.stringify(shifts))}
      leaveTypes={JSON.parse(JSON.stringify(leaveTypes))}
      sparePartPricing={sparePartPricing ? JSON.parse(JSON.stringify(sparePartPricing)) : null}
      webhookUrl={`${process.env.APP_URL || 'http://localhost:3000'}/api/zalo`}
      permissions={{
        isAdmin: ctx.isAdmin,
        sso: ctx.isAdmin,
        general: can(ctx, 'FEATURE_SETTING_GENERAL'),
        pricing: allowed.pricing,
        zalo: can(ctx, 'FEATURE_SETTING_ZALO'),
        holiday: can(ctx, 'FEATURE_SETTING_HOLIDAY'),
        shift: can(ctx, 'FEATURE_ATTENDANCE_SHIFT_MANAGE'),
        leaveType: can(ctx, 'FEATURE_LEAVE_TYPE_MANAGE'),
      }}
    />
  );
}
