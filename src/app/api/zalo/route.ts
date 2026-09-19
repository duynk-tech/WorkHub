import { NextResponse, type NextRequest } from 'next/server';
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
}

export async function GET() {
  const enabled = await getSetting<boolean>('zalo.enabled', false);
  return NextResponse.json({
    status: 'online',
    service: 'WorkHub Zalo Bot Webhook',
    botEnabled: enabled,
  });
}

export async function POST(req: NextRequest) {
  const enabled = await getSetting<boolean>('zalo.enabled', false);
  if (!enabled) {
    return NextResponse.json({ ok: false, error: 'Zalo Bot đang tắt trong cấu hình hệ thống' }, { status: 403 });
  }

  const configuredSecret = await getSetting<string>('zalo.webhookSecret', '');
  if (configuredSecret && configuredSecret.trim()) {
    const headerSecret =
      req.headers.get('x-zalo-bot-api-secret-token') ||
      req.headers.get('x-telegram-bot-api-secret-token') ||
      req.headers.get('x-webhook-secret') ||
      req.headers.get('x-workhub-secret') ||
      req.nextUrl.searchParams.get('secret') ||
      '';

    if (!headerSecret || !safeEqual(headerSecret, configuredSecret.trim())) {
      return NextResponse.json({ ok: false, error: 'Unauthorized: Sai hoặc thiếu webhook secret' }, { status: 401 });
    }
  }

  let body: ZaloWebhookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON không hợp lệ' }, { status: 400 });
  }

  // Trích xuất sender ID và nội dung tin nhắn hỗ trợ đa dạng cấu trúc payload
  const senderId =
    body.message?.chat?.id ??
    body.message?.from?.id ??
    body.sender?.id ??
    body.chat_id ??
    body.sender_id;

  const rawText =
    body.message?.text ??
    body.text ??
    '';

  if (!senderId || !rawText.trim()) {
    return NextResponse.json({ ok: true, message: 'Bỏ qua tin nhắn trống' });
  }

  const zaloUserId = String(senderId);
  const text = rawText.trim();

  // Xử lý không đồng bộ hoặc xử lý ngay lập tức rồi trả lời Zalo
  // 1. Nếu là lệnh slash (bắt đầu bằng '/')
  if (text.startsWith('/')) {
    const cmdResult = await handleZaloCommand(zaloUserId, text);
    if (cmdResult.reply) {
      await sendZaloMessage(zaloUserId, cmdResult.reply);
    }
    return NextResponse.json({ ok: true, type: 'command', handled: cmdResult.handled });
  }

  // 2. Nếu là ngôn ngữ tự nhiên
  const employee = await findEmployeeByZaloId(zaloUserId);

  if (!employee) {
    const notLinkedReply =
      '👋 Xin chào! Tài khoản Zalo của bạn chưa được liên kết với hệ thống WorkHub.\n\n' +
      'Hãy đăng nhập vào WorkHub trên web, vào mục "Hồ sơ cá nhân" để lấy mã liên kết, sau đó nhắn:\n' +
      '/lienket <mã>';
    await sendZaloMessage(zaloUserId, notLinkedReply);
    return NextResponse.json({ ok: true, type: 'not_linked' });
  }

  try {
    // Gọi Gemini AI Agent kết hợp các công cụ MCP nội bộ
    const aiReply = await handleZaloAiQuery(employee.id, text);
    await sendZaloMessage(zaloUserId, aiReply);
    return NextResponse.json({ ok: true, type: 'ai_response' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Zalo Webhook Error]:', errMsg);
    await sendZaloMessage(
      zaloUserId,
      '⚠️ Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc dùng lệnh /help.',
    );
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
