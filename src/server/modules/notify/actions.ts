'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';
import { setSetting } from '@/server/modules/settings/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { notifyPrefsKey, normalizePrefs, type NotifyPrefs } from './prefs';
import { sendPushToUsers, isPushConfigured } from './push';
import { sendEmail, renderEmailHtml, isEmailConfigured } from './email';

type Result = { ok: boolean; message: string };

export async function saveNotifyPrefsAction(prefs: NotifyPrefs): Promise<Result> {
  const ctx = await requireAuth();
  await setSetting(notifyPrefsKey(ctx.userId), normalizePrefs(prefs), { group: 'user' });
  return { ok: true, message: 'Đã lưu tuỳ chọn thông báo' };
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

/** Lưu thiết bị nhận thông báo đẩy. Cùng endpoint đăng nhập user khác thì chuyển chủ. */
export async function subscribePushAction(raw: unknown, userAgent?: string): Promise<Result> {
  const ctx = await requireAuth();
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Thông tin thiết bị không hợp lệ' };
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: ctx.userId, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 255) },
    create: { userId: ctx.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 255) },
  });
  return { ok: true, message: 'Đã bật thông báo trên thiết bị này' };
}

export async function unsubscribePushAction(endpoint: string): Promise<Result> {
  const ctx = await requireAuth();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.userId } });
  return { ok: true, message: 'Đã tắt thông báo trên thiết bị này' };
}

/** Gửi thử qua mọi kênh đang bật cho chính mình — để kiểm tra cấu hình. */
export async function sendTestNotificationAction(): Promise<Result> {
  const ctx = await requireAuth();
  const branding = await getAppBranding();
  const title = 'Thông báo thử';
  const body = `Nếu bạn thấy tin này thì kênh thông báo của ${branding.name} đã hoạt động.`;
  await prisma.inAppNotification.create({ data: { userId: ctx.userId, title, body, linkUrl: '/profile' } });

  const parts = ['trong ứng dụng'];
  if (isPushConfigured()) {
    const n = await sendPushToUsers([ctx.userId], { title, body, url: '/profile', tag: 'test' });
    parts.push(n > 0 ? `đẩy tới ${n} thiết bị` : 'đẩy: chưa có thiết bị nào bật');
  }
  if (isEmailConfigured()) {
    const emp = await prisma.employee.findUnique({ where: { id: ctx.employeeId }, select: { email: true } });
    if (emp?.email) {
      const r = await sendEmail({
        to: emp.email,
        subject: title,
        html: renderEmailHtml({ appName: branding.name, logoUrl: branding.logoUrl, title, body, link: `${process.env.APP_URL || ''}/profile` }),
      });
      parts.push(r.ok ? `email tới ${emp.email}` : `email lỗi: ${r.error}`);
    } else {
      parts.push('email: hồ sơ chưa có địa chỉ email');
    }
  }
  return { ok: true, message: `Đã gửi ${parts.join(', ')}` };
}
