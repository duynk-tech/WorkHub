import * as webpush from 'web-push';
import { prisma } from '@/lib/prisma';

/**
 * Web Push (VAPID) — miễn phí, trình duyệt tự giao tin kể cả khi tab đã đóng.
 * Sinh khoá: `npm run vapid`, rồi đặt VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 */

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  /** Thông báo cùng tag sẽ thay thế nhau thay vì xếp chồng. */
  tag?: string;
  /** Nút bấm ngay trên thông báo (vd. Duyệt / Từ chối). */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  return (configured = true);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

/** Gửi tới mọi thiết bị của các user; thiết bị đã gỡ (404/410) thì xoá luôn. Trả số lượt gửi thành công. */
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !isPushConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: Array.from(new Set(userIds)) } } });
  if (!subs.length) return 0;

  const body = JSON.stringify(payload);
  const stale: number[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) stale.push(s.id);
      }
    }),
  );
  if (stale.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  return sent;
}
