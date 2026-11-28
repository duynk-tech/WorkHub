import type { NotifyChannel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { processOutbox } from './zalo';
import { isEmailConfigured } from './email';
import { sendPushToUsers, type PushPayload } from './push';
import { getNotifyPrefsMap, DEFAULT_NOTIFY_PREFS } from './prefs';
import { ensureBuiltinTemplate } from './templates';

/** Thay {{biến}} trong mẫu thông báo. Biến thiếu trả về chuỗi rỗng. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export interface NotifyInput {
  templateCode: string;
  /** Nhân sự nhận thông báo */
  employeeIds: number[];
  vars: Record<string, unknown>;
  linkPath?: string;
  /** Khóa chống gửi trùng, vd: "TASK_DUE:12:2026-09-19" */
  dedupeKey?: string;
  channels?: NotifyChannel[];
  sendAfter?: Date;
  /** Tuỳ biến thông báo đẩy, vd. thêm nút Duyệt / Từ chối. */
  push?: Partial<PushPayload>;
}

/** Mặc định gửi mọi kênh; từng người tắt bớt trong trang Hồ sơ. */
const DEFAULT_CHANNELS: NotifyChannel[] = ['IN_APP', 'ZALO', 'PUSH', 'EMAIL'];

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Lùi thời điểm gửi ra khỏi khung giờ im lặng (vd 22:00–07:00). */
export async function respectQuietHours(at: Date): Promise<Date> {
  const start = await getSetting<string>('zalo.quietHoursStart', '22:00');
  const end = await getSetting<string>('zalo.quietHoursEnd', '07:00');
  if (!start || !end) return at;

  const minutes = at.getHours() * 60 + at.getMinutes();
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const inQuiet = s > e ? minutes >= s || minutes < e : minutes >= s && minutes < e;
  if (!inQuiet) return at;

  const next = new Date(at);
  if (s > e && minutes >= s) next.setDate(next.getDate() + 1); // qua đêm
  next.setHours(Math.floor(e / 60), e % 60, 0, 0);
  return next;
}

/**
 * Đưa thông báo vào outbox. Worker sẽ gửi đi theo từng kênh.
 * Luôn tạo thông báo in-app; kênh Zalo chỉ khi nhân sự đã liên kết và bot đang bật.
 */
export async function notify(input: NotifyInput): Promise<number> {
  if (input.employeeIds.length === 0) return 0;

  const template =
    (await prisma.notificationTemplate.findUnique({ where: { code: input.templateCode } })) ??
    (await ensureBuiltinTemplate(input.templateCode));
  if (!template || !template.isActive) return 0;

  const employees = await prisma.employee.findMany({
    where: { id: { in: Array.from(new Set(input.employeeIds)) } },
    select: { id: true, fullName: true, email: true, zaloUserId: true, user: { select: { id: true } } },
  });

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const branding = await getAppBranding();
  const zaloEnabled = await getSetting<boolean>('zalo.enabled', false);
  const channels = input.channels ?? DEFAULT_CHANNELS;
  const baseTime = input.sendAfter ?? new Date();
  const prefs = await getNotifyPrefsMap(employees.flatMap((e) => (e.user ? [e.user.id] : [])));
  const emailOn = channels.includes('EMAIL') && isEmailConfigured();

  let queued = 0;
  const pushJobs: Promise<unknown>[] = [];

  for (const emp of employees) {
    const vars = {
      ...input.vars,
      name: emp.fullName,
      appName: branding.name,
      link: input.linkPath ? `${appUrl}${input.linkPath}` : appUrl,
    };
    const body = renderTemplate(template.bodyTemplate, vars);
    const title = template.title ? renderTemplate(template.title, vars) : template.name;
    const pref = (emp.user && prefs.get(emp.user.id)) || DEFAULT_NOTIFY_PREFS;

    if (channels.includes('IN_APP') && emp.user) {
      let skipInApp = false;
      if (input.dedupeKey) {
        const recent = await prisma.inAppNotification.findFirst({
          where: {
            userId: emp.user.id,
            title,
            linkUrl: input.linkPath ?? null,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (recent) skipInApp = true;
      }

      if (!skipInApp) {
        await prisma.inAppNotification.create({
          data: { userId: emp.user.id, title, body, linkUrl: input.linkPath ?? null },
        });
        queued++;
        // Push đi cùng thông báo trong app (đã qua chống trùng), gửi ngay không qua hàng đợi
        if (channels.includes('PUSH') && pref.push) {
          pushJobs.push(
            sendPushToUsers([emp.user.id], {
              title,
              body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
              url: input.linkPath ?? '/dashboard',
              tag: input.dedupeKey ?? template.code,
              ...(input.push ?? {}),
            }).catch(() => 0),
          );
        }
      }
    }

    if (channels.includes('ZALO') && zaloEnabled && emp.zaloUserId && pref.zalo) {
      const sendAfter = await respectQuietHours(baseTime);
      const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${emp.id}` : null;

      // dedupeKey là unique — bỏ qua nếu đã xếp hàng trước đó
      const existing = dedupeKey
        ? await prisma.notificationOutbox.findUnique({ where: { dedupeKey } })
        : null;
      if (!existing) {
        await prisma.notificationOutbox.create({
          data: {
            channel: 'ZALO',
            templateCode: template.code,
            recipientEmployeeId: emp.id,
            zaloUserId: emp.zaloUserId,
            title, body,
            linkUrl: input.linkPath ?? null,
            payloadJson: vars as never,
            sendAfter,
            dedupeKey,
          },
        });
        queued++;
      }
    }

    if (emailOn && emp.email && pref.email) {
      const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${emp.id}:email` : null;
      const existing = dedupeKey ? await prisma.notificationOutbox.findUnique({ where: { dedupeKey } }) : null;
      if (!existing) {
        await prisma.notificationOutbox.create({
          data: {
            channel: 'EMAIL',
            templateCode: template.code,
            recipientEmployeeId: emp.id,
            recipientEmail: emp.email,
            title, body,
            linkUrl: input.linkPath ? `${appUrl}${input.linkPath}` : null,
            sendAfter: baseTime,
            dedupeKey,
          },
        });
        queued++;
      }
    }
  }

  if (pushJobs.length) await Promise.all(pushJobs);
  if (queued > 0) {
    processOutbox(10).catch(() => {});
  }

  return queued;
}

/** Gửi tin nhắn Zalo tự do (không qua mẫu) — dùng cho phản hồi lệnh chat. */
export async function enqueueRawZalo(zaloUserId: string, body: string, employeeId?: number) {
  const row = await prisma.notificationOutbox.create({
    data: { channel: 'ZALO', zaloUserId, body, recipientEmployeeId: employeeId ?? null },
  });
  processOutbox(10).catch(() => {});
  return row;
}
