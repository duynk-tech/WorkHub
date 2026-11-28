import { prisma } from '@/lib/prisma';
import { loadUserContext, hasPermission } from '@/server/auth/user-context';
import { buildXlsxBuffer } from '@/server/lib/excel';
import { notify } from '@/server/modules/notify/service';
import { sendEmail, renderEmailHtml, isEmailConfigured } from '@/server/modules/notify/email';
import { getAppBranding } from '@/server/modules/settings/branding';
import { buildReportSheets, type ReportParams } from './excel-sheets';
import { REPORTS } from './registry';

/**
 * Báo cáo gửi định kỳ (bảng ReportSchedule). Tần suất lưu ở cột cronExpr:
 *   "daily" · "weekly:1" (thứ Hai … 7 = Chủ nhật) · "monthly:1" (ngày 1 hằng tháng)
 * Job chạy mỗi sáng; lịch đến hạn hôm nay mà chưa chạy hôm nay thì gửi.
 * Dữ liệu dựng theo quyền của người lập lịch — không ai nhận được nhiều hơn người đó được xem.
 */

export type ScheduleFrequency = 'daily' | `weekly:${number}` | `monthly:${number}`;

export interface ScheduleRecipients {
  ownerUserId: number;
  employeeIds: number[];
}

const VN = 'Asia/Ho_Chi_Minh';
const vnDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: VN });
const shift = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Thứ trong tuần theo giờ VN: 1 = thứ Hai … 7 = Chủ nhật. */
function vnWeekday(key: string) {
  const d = new Date(`${key}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isScheduleDue(freq: string, lastRunAt: Date | null, now = new Date()): boolean {
  const today = vnDate(now);
  if (lastRunAt && vnDate(lastRunAt) === today) return false;
  if (freq === 'daily') return true;
  const [kind, raw] = freq.split(':');
  const n = Number(raw);
  if (kind === 'weekly') return vnWeekday(today) === n;
  if (kind === 'monthly') {
    const day = Number(today.slice(8, 10));
    const lastDay = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
    return day === Math.min(n, lastDay); // ngày 31 → tháng ngắn thì gửi vào ngày cuối tháng
  }
  return false;
}

/** Kỳ báo cáo khớp tần suất: hằng ngày → hôm qua, hằng tuần → 7 ngày qua, hằng tháng → tháng trước. */
export function periodFor(freq: string, now = new Date()): ReportParams & { label: string } {
  const today = vnDate(now);
  const year = Number(today.slice(0, 4));
  if (freq.startsWith('monthly')) {
    const prevMonthEnd = shift(`${today.slice(0, 7)}-01`, -1);
    const month = prevMonthEnd.slice(0, 7);
    return { month, from: `${month}-01`, to: prevMonthEnd, year: Number(month.slice(0, 4)), label: `tháng ${month.slice(5)}/${month.slice(0, 4)}` };
  }
  if (freq.startsWith('weekly')) {
    const from = shift(today, -7);
    const to = shift(today, -1);
    return { month: to.slice(0, 7), from, to, year, label: `${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}` };
  }
  const y = shift(today, -1);
  return { month: y.slice(0, 7), from: y, to: y, year, label: `ngày ${y.split('-').reverse().join('/')}` };
}

export async function runReportSchedules(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const schedules = await prisma.reportSchedule.findMany({ where: { isActive: true } });
  let sent = 0;
  let skipped = 0;
  const branding = await getAppBranding();

  for (const s of schedules) {
    if (!isScheduleDue(s.cronExpr, s.lastRunAt, now)) continue;
    const rec = s.recipientsJson as unknown as ScheduleRecipients;
    const def = REPORTS.find((r) => r.key === s.reportKey);
    const owner = rec?.ownerUserId ? await loadUserContext(rec.ownerUserId) : null;
    // Người lập lịch nghỉ việc hoặc mất quyền thì dừng gửi, không lộ dữ liệu
    if (!def || !owner || (def.permission && !hasPermission(owner.ctx, def.permission))) {
      skipped++;
      await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now } });
      continue;
    }

    const period = periodFor(s.cronExpr, now);
    const built = await buildReportSheets(owner.ctx, s.reportKey, period).catch(() => null);
    const employeeIds = Array.from(new Set(rec.employeeIds?.length ? rec.employeeIds : [owner.ctx.employeeId]));
    const link = `/reports?report=${s.reportKey}`;

    if (s.channel === 'EMAIL' && built && isEmailConfigured()) {
      const emails = (await prisma.employee.findMany({ where: { id: { in: employeeIds }, email: { not: null } }, select: { email: true } }))
        .map((e) => e.email!)
        .filter(Boolean);
      if (emails.length) {
        const file = await buildXlsxBuffer(built.sheets, { creator: branding.name });
        const r = await sendEmail({
          to: emails,
          subject: `${s.name} — ${period.label}`,
          html: renderEmailHtml({
            appName: branding.name,
            logoUrl: branding.logoUrl,
            title: `${s.name} — ${period.label}`,
            body: `Báo cáo "${def.label}" kỳ ${period.label} được đính kèm dạng Excel.\nLịch gửi do ${owner.ctx.fullName} thiết lập.`,
            link: `${process.env.APP_URL || ''}${link}`,
            linkLabel: 'Xem trên hệ thống',
          }),
          attachments: [{ filename: built.fileName, content: file, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        });
        if (r.ok) sent++;
      }
    } else {
      await notify({
        templateCode: 'REPORT_SCHEDULE',
        employeeIds,
        vars: { reportName: s.name, period: period.label },
        linkPath: link,
        channels: ['IN_APP', 'PUSH'],
        dedupeKey: `REPORT:${s.id}:${vnDate(now)}`,
      });
      sent++;
    }
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now } });
  }
  return { sent, skipped };
}
