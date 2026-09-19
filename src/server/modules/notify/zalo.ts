import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';

/**
 * Adapter Zalo Bot API.
 * Mọi lời gọi ra Zalo đều đi qua đây — đổi sang OA chỉ cần thay file này.
 * Endpoint theo Zalo Bot API: https://bot-api.zapps.me/bot<token>/<method>
 */
const BASE_URL = process.env.ZALO_BOT_API_BASE || 'https://bot-api.zaloplatforms.com';

export interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
  data?: unknown;
}

async function callBot(method: string, payload: unknown): Promise<SendResult> {
  const token = await getSetting<string>('zalo.botToken', '');
  if (!token) return { ok: false, error: 'Chưa cấu hình Zalo Bot token' };

  try {
    const res = await fetch(`${BASE_URL}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* phản hồi không phải JSON */ }

    if (!res.ok || data.ok === false) {
      return { ok: false, error: String(data.description ?? data.message ?? `HTTP ${res.status}: ${text.slice(0, 200)}`) };
    }

    const result = data.result as { message_id?: string | number } | undefined;
    return {
      ok: true,
      messageId: result?.message_id ? String(result.message_id) : undefined,
      data: data.result,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lỗi kết nối tới Zalo Bot API' };
  }
}

export interface SendZaloOptions {
  parseMode?: 'markdown' | 'html';
  fallbackToPlainText?: boolean;
}

/**
 * Chuẩn hóa Markdown cho Zalo Bot API:
 * - Chuyển các heading markdown (#, ##, ###) thành **chữ in đậm** vì Zalo render chữ đậm đẹp hơn.
 */
export function formatMarkdownForZalo(text: string): string {
  if (!text) return '';
  return text
    .replace(/^(#{1,6})\s+(.+)$/gm, '**$2**')
    .trim();
}

/**
 * Chia văn bản thành các đoạn ngắn hơn 2000 ký tự (giới hạn của Zalo Bot API)
 */
function splitTextChunks(text: string, maxLength = 1950): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Tìm vị trí xuống dòng gần nhất trước maxLength
    let splitIdx = remaining.lastIndexOf('\n', maxLength);
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx === -1) {
      splitIdx = maxLength;
    }
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

export async function sendZaloMessage(
  chatId: string,
  text: string,
  options?: SendZaloOptions,
): Promise<SendResult> {
  const parseMode = options?.parseMode ?? 'markdown';
  const fallback = options?.fallbackToPlainText !== false;
  const chunks = splitTextChunks(text);

  let lastResult: SendResult = { ok: true };

  for (const chunk of chunks) {
    const formattedChunk = parseMode === 'markdown' ? formatMarkdownForZalo(chunk) : chunk;
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: formattedChunk,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }

    let res = await callBot('sendMessage', payload);

    // Fallback nếu Zalo trả về lỗi cú pháp parse_mode
    if (!res.ok && parseMode && fallback) {
      console.warn(
        `[Zalo Bot] Gửi tin với parse_mode=${parseMode} không thành công (${res.error}), tự động gửi lại dạng văn bản thuần.`,
      );
      res = await callBot('sendMessage', { chat_id: chatId, text: chunk });
    }

    if (!res.ok) return res;
    lastResult = res;
  }

  return lastResult;
}

export async function getBotInfo(): Promise<SendResult & { name?: string }> {
  const result = await callBot('getMe', {});
  return result;
}

export async function setZaloWebhook(url: string): Promise<SendResult> {
  const secret = await getSetting<string>('zalo.webhookSecret', '');
  const payload: Record<string, unknown> = { url };
  if (secret && secret.trim()) {
    payload.secret_token = secret.trim();
  }
  return callBot('setWebhook', payload);
}

export async function getZaloWebhookInfo(): Promise<SendResult> {
  return callBot('getWebhookInfo', {});
}

export async function deleteZaloWebhook(): Promise<SendResult> {
  return callBot('deleteWebhook', {});
}

/**
 * Xử lý hàng đợi outbox: gửi các tin đến hạn, retry lũy tiến khi lỗi.
 * Gọi bởi scheduler hoặc endpoint /api/cron/outbox.
 */
export async function processOutbox(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  const enabled = await getSetting<boolean>('zalo.enabled', false);
  if (!enabled) return { sent: 0, failed: 0, skipped: 0 };

  const pending = await prisma.notificationOutbox.findMany({
    where: { status: 'PENDING', channel: 'ZALO', sendAfter: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { sendAfter: 'asc' },
    take: limit,
  });

  let sent = 0, failed = 0, skipped = 0;

  for (const item of pending) {
    if (!item.zaloUserId) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: 'SKIPPED', error: 'Người nhận chưa liên kết Zalo' },
      });
      skipped++;
      continue;
    }

    const body = item.linkUrl ? `${item.body}` : item.body;
    const result = await sendZaloMessage(item.zaloUserId, body);

    if (result.ok) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: item.attempts + 1, error: null },
      });
      sent++;
    } else {
      const attempts = item.attempts + 1;
      const backoffMinutes = Math.min(60, 2 ** attempts); // 2, 4, 8, 16, 32 phút
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          attempts,
          status: attempts >= 5 ? 'FAILED' : 'PENDING',
          sendAfter: new Date(Date.now() + backoffMinutes * 60000),
          error: result.error?.slice(0, 500),
        },
      });
      failed++;
    }
  }

  return { sent, failed, skipped };
}
