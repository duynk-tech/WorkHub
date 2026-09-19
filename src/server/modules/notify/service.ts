import type { NotifyChannel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';
import { processOutbox } from './zalo';

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
}

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

  const template = await prisma.notificationTemplate.findUnique({ where: { code: input.templateCode } });
  if (!template || !template.isActive) return 0;

  const employees = await prisma.employee.findMany({
    where: { id: { in: Array.from(new Set(input.employeeIds)) } },
    select: { id: true, fullName: true, zaloUserId: true, user: { select: { id: true } } },
  });

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const zaloEnabled = await getSetting<boolean>('zalo.enabled', false);
  const channels = input.channels ?? ['IN_APP', 'ZALO'];
  const baseTime = input.sendAfter ?? new Date();

  let queued = 0;

  for (const emp of employees) {
    const vars = {
      ...input.vars,
      name: emp.fullName,
      appName: process.env.APP_NAME || 'WorkHub',
      link: input.linkPath ? `${appUrl}${input.linkPath}` : appUrl,
    };
    const body = renderTemplate(template.bodyTemplate, vars);
    const title = template.title ? renderTemplate(template.title, vars) : template.name;

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
      }
    }

    if (channels.includes('ZALO') && zaloEnabled && emp.zaloUserId) {
      const sendAfter = await respectQuietHours(baseTime);
      const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${emp.id}` : null;

      // dedupeKey là unique — bỏ qua nếu đã xếp hàng trước đó
      const existing = dedupeKey
        ? await prisma.notificationOutbox.findUnique({ where: { dedupeKey } })
        : null;
      if (existing) continue;

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
