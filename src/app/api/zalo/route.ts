import { NextResponse, type NextRequest, after } from 'next/server';
import { handleZaloCommand } from '@/server/modules/zalo/commands';
import { findEmployeeByZaloId } from '@/server/modules/zalo/link';
import { handleZaloAiQuery } from '@/server/modules/zalo/ai-agent';
import { sendZaloMessage } from '@/server/modules/notify/zalo';
import { getSetting } from '@/server/modules/settings/service';
import { safeEqual } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ZaloWebhookBody {
  // Định dạng Zalo Bot Platform (tương tự Telegram)
  update_id?: number;
  message?: {
    message_id?: number | string;
    from?: { id: number | string; name?: string };
    chat?: { id: number | string; type?: string };
    text?: string;
  };

  // Định dạng Zalo OA Webhook
  event_name?: string;
  sender?: { id: string };
  recipient?: { id: string };

  // Định dạng rút gọn / test trực tiếp
  chat_id?: string | number;
  sender_id?: string | number;
  text?: string;
  content?: string;
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
  let body: ZaloWebhookBody = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      body = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Zalo Webhook] Lỗi phân tích JSON payload:', err);
    return NextResponse.json({ ok: false, error: 'JSON không hợp lệ' }, { status: 400 });
  }

  // 4. Trích xuất sender ID và nội dung tin nhắn hỗ trợ đa dạng cấu trúc payload
  const messageObj = typeof body.message === 'object' && body.message !== null ? body.message : undefined;
  const messageStr = typeof body.message === 'string' ? body.message : undefined;

  const senderId =
    messageObj?.chat?.id ??
    messageObj?.from?.id ??
    body.sender?.id ??
    body.chat_id ??
    body.sender_id ??
    (body as Record<string, unknown>).user_id_by_app ??
    (body as Record<string, unknown>).from_id;

  const rawText =
    messageObj?.text ??
    messageStr ??
    body.text ??
    body.content ??
    '';

  if (!senderId || !rawText.trim()) {
    // Xử lý sự kiện follow (quan tâm OA / Bot) nếu có
    if (body.event_name === 'follow' && senderId) {
      const zaloUserId = String(senderId);
      const welcomeMsg =
        '👋 Xin chào! Cảm ơn bạn đã quan tâm WorkHub Assistant.\n\n' +
        'Hãy nhắn /help để xem danh sách lệnh hoặc nhắn /lienket <mã> để liên kết tài khoản nhân sự của bạn.';
      sendZaloMessage(zaloUserId, welcomeMsg).catch((e) =>
        console.error('[Zalo Follow Welcome Error]:', e),
      );
    }
    return NextResponse.json({ ok: true, message: 'Đã nhận webhook (không có nội dung tin nhắn)' });
  }

  const zaloUserId = String(senderId);
  const text = rawText.trim();
  console.log(`[Zalo Webhook] Nhận tin nhắn từ ${zaloUserId}: "${text.slice(0, 60)}"`);

  // 5. Xử lý tác vụ không đồng bộ và gửi phản hồi ngay lập tức cho Zalo
  // Zalo Bot API yêu cầu phản hồi HTTP 200 trong vòng 2 giây. Nếu vượt quá, Zalo coi webhook bị lỗi.
  // Next.js 15 after() cho phép trả về HTTP 200 ngay và tiếp tục chạy AI/Command trong background.
  const dispatchTask = async () => {
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
        return;
      }

      // 5.2. Nếu là ngôn ngữ tự nhiên
      const employee = await findEmployeeByZaloId(zaloUserId);

      if (!employee) {
        const notLinkedReply =
          '👋 Xin chào! Tài khoản Zalo của bạn chưa được liên kết với hệ thống WorkHub.\n\n' +
          'Hãy đăng nhập vào WorkHub trên web, vào mục "Hồ sơ cá nhân" để lấy mã liên kết, sau đó nhắn:\n' +
          '/lienket <mã>';
        const sendRes = await sendZaloMessage(zaloUserId, notLinkedReply);
        if (!sendRes.ok) {
          console.error('[Zalo Webhook] Gửi hướng dẫn liên kết thất bại:', sendRes.error);
        }
        return;
      }

      // Gọi Gemini AI Agent kết hợp các công cụ MCP nội bộ
      const aiReply = await handleZaloAiQuery(employee.id, text);
      const sendRes = await sendZaloMessage(zaloUserId, aiReply);
      if (!sendRes.ok) {
        console.error('[Zalo Webhook] Gửi phản hồi AI thất bại:', sendRes.error);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Zalo Webhook Processing Error]:', errMsg);
      try {
        await sendZaloMessage(
          zaloUserId,
          '⚠️ Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc dùng lệnh /help.',
        );
      } catch (fallbackErr) {
        console.error('[Zalo Webhook Error Fallback Failed]:', fallbackErr);
      }
    }
  };

  if (typeof after === 'function') {
    after(dispatchTask);
  } else {
    dispatchTask().catch((err) => console.error('[Zalo Background Error]:', err));
  }

  return NextResponse.json({ ok: true, status: 'dispatched' });
}
