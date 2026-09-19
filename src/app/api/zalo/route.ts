import { NextResponse, type NextRequest, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleZaloCommand } from '@/server/modules/zalo/commands';
import { findEmployeeByZaloId } from '@/server/modules/zalo/link';
import { handleZaloAiQuery } from '@/server/modules/zalo/ai-agent';
import { sendZaloMessage } from '@/server/modules/notify/zalo';
import { getSetting } from '@/server/modules/settings/service';
import { safeEqual } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface ExtractedZaloMessage {
  senderId: string;
  text: string;
  messageId?: string;
  displayName?: string;
  eventName?: string;
  rawItem: unknown;
}

/**
 * Trích xuất danh sách tin nhắn từ Zalo Webhook payload.
 * Hỗ trợ đa dạng cấu trúc:
 * 1. Mảng các event: [ { event_name: "message.text.received", message: { chat, from, text } } ]
 * 2. Đối tượng đơn: { event_name: ..., message: { ... } }
 * 3. Zalo OA format: { event_name: "user_send_text", sender: { id }, message: { text } }
 * 4. Flat format / test trực tiếp: { chat_id, text }
 */
export function extractZaloMessages(body: unknown): ExtractedZaloMessage[] {
  const items = Array.isArray(body)
    ? body
    : typeof body === 'object' && body !== null
      ? [body]
      : [];

  const results: ExtractedZaloMessage[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;

    const eventName = typeof (item as any).event_name === 'string' ? (item as any).event_name : undefined;
    const msgObj =
      typeof (item as any).message === 'object' && (item as any).message !== null
        ? (item as any).message
        : undefined;
    const msgStr = typeof (item as any).message === 'string' ? (item as any).message : undefined;

    const senderId =
      msgObj?.chat?.id ??
      msgObj?.from?.id ??
      (item as any).sender?.id ??
      (item as any).chat_id ??
      (item as any).sender_id ??
      (item as any).user_id_by_app ??
      (item as any).from_id;

    const rawText =
      (typeof msgObj?.text === 'string' ? msgObj.text : null) ??
      msgStr ??
      (typeof (item as any).text === 'string' ? (item as any).text : null) ??
      (typeof (item as any).content === 'string' ? (item as any).content : null) ??
      '';

    const messageId =
      msgObj?.message_id !== undefined
        ? String(msgObj.message_id)
        : msgObj?.msg_id !== undefined
          ? String(msgObj.msg_id)
          : undefined;

    const displayName =
      msgObj?.from?.display_name ??
      msgObj?.from?.name ??
      (item as any).sender?.name ??
      undefined;

    if (senderId && rawText.trim()) {
      results.push({
        senderId: String(senderId),
        text: rawText.trim(),
        messageId,
        displayName: displayName ? String(displayName) : undefined,
        eventName,
        rawItem: item,
      });
    } else if (eventName === 'follow' && senderId) {
      results.push({
        senderId: String(senderId),
        text: '/start',
        displayName: displayName ? String(displayName) : undefined,
        eventName,
        rawItem: item,
      });
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const rawEnabled = await getSetting<unknown>('zalo.enabled', false);
  const enabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === 1 || rawEnabled === '1';

  // Hỗ trợ challenge verification nếu Zalo hoặc proxy ping GET để xác thực URL
  const challenge = req.nextUrl.searchParams.get('challenge') || req.nextUrl.searchParams.get('hub.challenge');
  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({
    status: 'online',
    service: 'WorkHub Zalo Bot Webhook',
    botEnabled: enabled,
  });
}

export async function POST(req: NextRequest) {
  // 1. Kiểm tra secret token xác thực Zalo Webhook
  const configuredSecret = await getSetting<string>('zalo.webhookSecret', '');
  if (configuredSecret && configuredSecret.trim()) {
    const cleanConfigured = configuredSecret.trim();

    // Hỗ trợ đầy đủ các header chuẩn của Zalo Bot Platform, Telegram và custom header
    const headerSecret =
      req.headers.get('x-bot-api-secret-token') ||
      req.headers.get('x-zalo-bot-api-secret-token') ||
      req.headers.get('x-telegram-bot-api-secret-token') ||
      req.headers.get('x-webhook-secret') ||
      req.headers.get('x-workhub-secret') ||
      req.headers.get('x-secret-token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      req.nextUrl.searchParams.get('secret') ||
      req.nextUrl.searchParams.get('secret_token') ||
      req.nextUrl.searchParams.get('token') ||
      '';

    const cleanHeader = headerSecret.trim();

    if (!cleanHeader || !safeEqual(cleanHeader, cleanConfigured)) {
      console.warn('[Zalo Webhook] Unauthorized: Sai hoặc thiếu webhook secret token', {
        hasHeaderSecret: Boolean(cleanHeader),
        receivedLength: cleanHeader.length,
        expectedLength: cleanConfigured.length,
      });
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Sai hoặc thiếu webhook secret (x-bot-api-secret-token)' },
        { status: 401 },
      );
    }
  }

  // 2. Kiểm tra trạng thái kích hoạt bot
  const rawEnabled = await getSetting<unknown>('zalo.enabled', false);
  const enabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === 1 || rawEnabled === '1';
  if (!enabled) {
    console.warn('[Zalo Webhook] Nhận được webhook nhưng Zalo Bot đang tắt trong cấu hình');
    return NextResponse.json(
      { ok: false, error: 'Zalo Bot đang tắt trong cấu hình hệ thống (vào Cài đặt -> Tích hợp để bật)' },
      { status: 403 },
    );
  }

  // 3. Đọc dữ liệu JSON an toàn
  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      body = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Zalo Webhook] Lỗi phân tích JSON payload:', err);
    return NextResponse.json({ ok: false, error: 'JSON không hợp lệ' }, { status: 400 });
  }

  // 4. Trích xuất danh sách tin nhắn (hỗ trợ cả mảng sự kiện Zalo Bot và đối tượng đơn)
  const messages = extractZaloMessages(body);

  if (messages.length === 0) {
    console.log('[Zalo Webhook] Đã nhận webhook nhưng không tìm thấy tin nhắn văn bản hợp lệ');
    return NextResponse.json({ ok: true, message: 'Đã nhận webhook (không có tin nhắn cần xử lý)' });
  }

  // 5. Xử lý tác vụ không đồng bộ và gửi phản hồi ngay lập tức cho Zalo (trong 2 giây)
  const dispatchTask = async () => {
    for (const msg of messages) {
      const zaloUserId = msg.senderId;
      const text = msg.text;
      const displayName = msg.displayName;
      console.log(`[Zalo Webhook] Đang xử lý tin nhắn từ ${displayName || zaloUserId} (${zaloUserId}): "${text.slice(0, 60)}"`);

      // Ghi nhận log đầu vào vào CSDL
      const logRecord = await prisma.zaloInboundLog.create({
        data: {
          messageId: msg.messageId,
          zaloUserId: zaloUserId,
          text: text,
          payloadJson: msg.rawItem as any,
          handled: false,
        },
      }).catch((e) => {
        console.error('[Zalo Inbound Log Create Error]:', e);
        return null;
      });

      try {
        // 5.1. Nếu là lệnh slash (bắt đầu bằng '/')
        if (text.startsWith('/')) {
          const cmdResult = await handleZaloCommand(zaloUserId, text);
          if (cmdResult.reply) {
            const sendRes = await sendZaloMessage(zaloUserId, cmdResult.reply);
            if (!sendRes.ok) {
              console.error(`[Zalo Webhook] Gửi phản hồi lệnh "${text}" thất bại:`, sendRes.error);
            }
          }
          if (logRecord) {
            await prisma.zaloInboundLog.update({
              where: { id: logRecord.id },
              data: { handled: true, response: cmdResult.reply || 'Đã thực thi lệnh' },
            }).catch(() => {});
          }
          continue;
        }

        // 5.2. Nếu là ngôn ngữ tự nhiên
        const employee = await findEmployeeByZaloId(zaloUserId);

        if (!employee) {
          const notLinkedReply =
            `👋 Xin chào${displayName ? ` ${displayName}` : ''}! Tài khoản Zalo của bạn chưa được liên kết với hệ thống WorkHub.\n\n` +
            'Hãy đăng nhập vào WorkHub trên web, vào mục "Hồ sơ cá nhân" để lấy mã liên kết, sau đó nhắn cho mình theo cú pháp:\n' +
            '/lienket <mã>';
          const sendRes = await sendZaloMessage(zaloUserId, notLinkedReply);
          if (!sendRes.ok) {
            console.error('[Zalo Webhook] Gửi hướng dẫn liên kết thất bại:', sendRes.error);
          }
          if (logRecord) {
            await prisma.zaloInboundLog.update({
              where: { id: logRecord.id },
              data: { handled: true, response: notLinkedReply },
            }).catch(() => {});
          }
          continue;
        }

        // Gọi Gemini AI Agent kết hợp các công cụ MCP nội bộ
        const aiReply = await handleZaloAiQuery(employee.id, text);
        const sendRes = await sendZaloMessage(zaloUserId, aiReply);
        if (!sendRes.ok) {
          console.error('[Zalo Webhook] Gửi phản hồi AI thất bại:', sendRes.error);
        }

        if (logRecord) {
          await prisma.zaloInboundLog.update({
            where: { id: logRecord.id },
            data: { handled: true, response: aiReply },
          }).catch(() => {});
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Zalo Webhook Processing Error - ${zaloUserId}]:`, errMsg);
        try {
          await sendZaloMessage(
            zaloUserId,
            '⚠️ Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc dùng lệnh /help.',
          );
        } catch (fallbackErr) {
          console.error('[Zalo Webhook Error Fallback Failed]:', fallbackErr);
        }

        if (logRecord) {
          await prisma.zaloInboundLog.update({
            where: { id: logRecord.id },
            data: { handled: false, response: `Lỗi: ${errMsg}` },
          }).catch(() => {});
        }
      }
    }
  };

  if (typeof after === 'function') {
    after(dispatchTask);
  } else {
    dispatchTask().catch((err) => console.error('[Zalo Background Error]:', err));
  }

  return NextResponse.json({ ok: true, status: 'dispatched', count: messages.length });
}
