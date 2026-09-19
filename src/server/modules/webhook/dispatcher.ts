import { prisma } from '@/lib/prisma';
import { hmacSha256 } from '@/lib/crypto';
import crypto from 'node:crypto';

export type WebhookEvent =
  | 'task.created'
  | 'task.completed'
  | 'leave.submitted'
  | 'leave.approved'
  | 'leave.rejected'
  | 'attendance.checkin'
  | (string & {});

export interface WebhookDispatchResult {
  webhookId: number;
  url: string;
  success: boolean;
  status?: number;
  error?: string;
}

/**
 * Phát sự kiện webhook tới tất cả các outbound webhook đang kích hoạt và đã đăng ký sự kiện tương ứng.
 * Ký xác thực payload bằng HMAC-SHA256 nếu webhook có cấu hình secret.
 */
export async function dispatchOutboundWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<WebhookDispatchResult[]> {
  try {
    const webhooks = await prisma.outboundWebhook.findMany({
      where: { isActive: true },
    });

    if (!webhooks.length) return [];

    const matching = webhooks.filter((wh) => {
      const subscribed = wh.events.split(',').map((e) => e.trim());
      return subscribed.includes('*') || subscribed.includes(event);
    });

    if (!matching.length) return [];

    const deliveryId = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    const payload = JSON.stringify({
      id: deliveryId,
      event,
      sentAt,
      data,
    });

    const results = await Promise.allSettled(
      matching.map(async (wh) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-WorkHub-Event': event,
          'X-WorkHub-Delivery': deliveryId,
        };

        if (wh.secret && wh.secret.trim()) {
          headers['X-WorkHub-Signature'] = hmacSha256(wh.secret.trim(), payload);
        }

        try {
          const res = await fetch(wh.url, {
            method: 'POST',
            headers,
            body: payload,
            signal: AbortSignal.timeout(10000),
          });

          await prisma.outboundWebhook.update({
            where: { id: wh.id },
            data: {
              lastStatus: res.status,
              lastCalledAt: new Date(),
            },
          });

          return {
            webhookId: wh.id,
            url: wh.url,
            success: res.ok,
            status: res.status,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await prisma.outboundWebhook.update({
            where: { id: wh.id },
            data: {
              lastStatus: 0,
              lastCalledAt: new Date(),
            },
          });

          return {
            webhookId: wh.id,
            url: wh.url,
            success: false,
            status: 0,
            error: errMsg,
          };
        }
      }),
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        webhookId: matching[i].id,
        url: matching[i].url,
        success: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });
  } catch (err) {
    console.error('[OutboundWebhook Dispatcher Error]:', err);
    return [];
  }
}
