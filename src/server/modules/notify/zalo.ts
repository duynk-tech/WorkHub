import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';

/**
 * Adapter Zalo Bot API.
 * Mọi lời gọi ra Zalo đều đi qua đây — đổi sang OA chỉ cần thay file này.
 * Endpoint theo Zalo Bot API: https://bot-api.zaloplatforms.com/bot<token>/<method>
 */
const DEFAULT_PRIMARY_BASE = 'https://bot-api.zaloplatforms.com';
const DEFAULT_FALLBACK_BASE = 'https://bot-api.zapps.me';

export interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
  data?: unknown;
}

async function callBot(method: string, payload: unknown): Promise<SendResult> {
  const rawToken = await getSetting<string>('zalo.botToken', '');
  if (!rawToken || !rawToken.trim()) {
    return { ok: false, error: 'Chưa cấu hình Zalo Bot token trong Cài đặt hệ thống' };
  }

  // Chuẩn hóa token: xóa khoảng trắng, nháy kép/đơn, và tiền tố "bot" nếu người dùng vô tình dán cả cụm bot...
  let cleanToken = rawToken.trim().replace(/^['"]|['"]$/g, '');
  if (cleanToken.startsWith('bot') && /^bot\d+/.test(cleanToken)) {
    cleanToken = cleanToken.slice(3);
  }

  const customBase = await getSetting<string>('zalo.apiBase', '');
  const primaryBase = (customBase || process.env.ZALO_BOT_API_BASE || DEFAULT_PRIMARY_BASE).replace(/\/+$/, '');
  const fallbackBase = primaryBase.includes('zaloplatforms.com')
    ? DEFAULT_FALLBACK_BASE
    : (primaryBase.includes('zapps.me') ? DEFAULT_PRIMARY_BASE : null);

  const requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  };

  let res: Response;
  let text = '';

  try {
    res = await fetch(`${primaryBase}/bot${cleanToken}/${method}`, requestInit);
    text = await res.text();
  } catch (primaryErr) {
    // Nếu kết nối tới primaryBase thất bại (DNS, timeout, network error), thử fallbackBase
    if (fallbackBase) {
      try {
        console.warn(`[Zalo Bot] Primary endpoint (${primaryBase}) không phản hồi, đang thử fallback sang ${fallbackBase}...`);
        res = await fetch(`${fallbackBase}/bot${cleanToken}/${method}`, requestInit);
        text = await res.text();
      } catch (fallbackErr) {
        const errDetail = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error(`[Zalo Bot Error] Cả primary và fallback đều thất bại:`, errDetail);
        return { ok: false, error: `Lỗi kết nối tới Zalo Bot API: ${errDetail}` };
      }
    } else {
      const errDetail = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.error(`[Zalo Bot Error] Không thể kết nối tới ${primaryBase}:`, errDetail);
      return { ok: false, error: `Lỗi kết nối tới Zalo Bot API: ${errDetail}` };
    }
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* phản hồi không phải JSON */
  }

  // Nhận diện lỗi từ cả định dạng Zalo Bot Platform (ok: false) và Zalo OpenAPI (error != 0)
  const isError =
    !res.ok ||
    data.ok === false ||
    (typeof data.error === 'number' && data.error !== 0) ||
    (typeof data.error_code === 'number' && data.error_code !== 0 && data.error_code !== 200);

  if (isError) {
    const errorMsg = String(
      data.description ??
      data.message ??
      (typeof data.error === 'string' ? data.error : null) ??
      `HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
    console.error(`[Zalo Bot API Error] Method "${method}" thất bại: ${errorMsg}`);
    return { ok: false, error: errorMsg };
  }

  const result = (data.result ?? data.data) as { message_id?: string | number; msg_id?: string | number } | undefined;
  const msgId = result?.message_id ?? result?.msg_id;
  return {
    ok: true,
    messageId: msgId ? String(msgId) : undefined,
    data: data.result ?? data.data ?? data,
  };
}

export interface SendZaloOptions {
  parseMode?: 'markdown' | 'html';
  fallbackToPlainText?: boolean;
}

/**
 * Chuyển bảng Markdown (| Col1 | Col2 |) thành dạng danh sách gạch đầu dòng
 * để hiển thị gọn gàng, rõ ràng trên màn hình điện thoại Zalo.
 */
function convertMarkdownTableToList(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // Kiểm tra dòng phân cách separator (vd: | --- | :---: |)
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        headers = cells;
      } else {
        const rowItems = cells
          .map((c, idx) => {
            const h = headers[idx];
            return h ? `**${h}**: ${c}` : c;
          })
          .filter(Boolean);
        result.push(`• ${rowItems.join(' · ')}`);
      }
    } else {
      if (inTable) {
        inTable = false;
        headers = [];
      }
      result.push(lines[i]);
    }
  }

  return result.join('\n');
}

/**
 * Chuẩn hóa Markdown cho Zalo Bot API:
 * - Chuyển các heading markdown (#, ##, ###) thành **chữ in đậm** vì Zalo render chữ đậm đẹp hơn.
 * - Chuyển bảng markdown thành bullet list để hiển thị tối ưu trên thiết bị di động.
 */
export function formatMarkdownForZalo(text: string): string {
  if (!text) return '';
  let formatted = text.replace(/^(#{1,6})\s+(.+)$/gm, '**$2**');
  formatted = convertMarkdownTableToList(formatted);
  return formatted.trim();
}

/**
 * Dọn dẹp ký tự Markdown khi cần gửi văn bản thuần (fallback)
 */
export function cleanMarkdownForPlainText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
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
  chatId: string | number,
  text: string,
  options?: SendZaloOptions,
): Promise<SendResult> {
  const targetChatId = String(chatId).trim();
  if (!targetChatId) {
    return { ok: false, error: 'chat_id không được để trống' };
  }
  if (!text || !text.trim()) {
    return { ok: true };
  }

  const parseMode = options?.parseMode ?? 'markdown';
  const fallback = options?.fallbackToPlainText !== false;
  const chunks = splitTextChunks(text);

  let lastResult: SendResult = { ok: true };

  for (const chunk of chunks) {
    const formattedChunk = parseMode === 'markdown' ? formatMarkdownForZalo(chunk) : chunk;
    const payload: Record<string, unknown> = {
      chat_id: targetChatId,
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
      const plainChunk = cleanMarkdownForPlainText(chunk);
      res = await callBot('sendMessage', { chat_id: targetChatId, text: plainChunk });
    }

    if (!res.ok) {
      console.error(`[Zalo Bot] Gửi tin thất bại tới ${targetChatId}:`, res.error);
      return res;
    }
    lastResult = res;
  }

  return lastResult;
}

export async function getBotInfo(): Promise<SendResult & { name?: string }> {
  const result = await callBot('getMe', {});
  return result;
}

export async function setZaloWebhook(url: string, explicitSecret?: string): Promise<SendResult> {
  const secret = explicitSecret !== undefined ? explicitSecret : await getSetting<string>('zalo.webhookSecret', '');
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
