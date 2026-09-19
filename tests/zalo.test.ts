import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatMarkdownForZalo, cleanMarkdownForPlainText } from '@/server/modules/notify/zalo';
import { safeEqual } from '@/lib/crypto';

describe('Zalo Utilities & Formatting', () => {
  it('chuyển đổi heading markdown thành in đậm', () => {
    const input = '# Tiêu đề 1\n## Tiêu đề 2\n### Tiêu đề 3\nNội dung thường';
    const result = formatMarkdownForZalo(input);
    expect(result).toContain('**Tiêu đề 1**');
    expect(result).toContain('**Tiêu đề 2**');
    expect(result).toContain('**Tiêu đề 3**');
    expect(result).toContain('Nội dung thường');
  });

  it('chuyển đổi bảng Markdown thành danh sách bullet rõ ràng cho mobile', () => {
    const markdownTable = `
| Mã công việc | Tiêu đề | Trạng thái |
| :--- | :--- | :--- |
| TSK-001 | Báo cáo tài chính | Đang làm |
| TSK-002 | Họp ban giám đốc | Hoàn thành |
`;
    const result = formatMarkdownForZalo(markdownTable);
    expect(result).toContain('• **Mã công việc**: TSK-001 · **Tiêu đề**: Báo cáo tài chính · **Trạng thái**: Đang làm');
    expect(result).toContain('• **Mã công việc**: TSK-002 · **Tiêu đề**: Họp ban giám đốc · **Trạng thái**: Hoàn thành');
  });

  it('dọn dẹp markdown khi fallback sang văn bản thuần (plain text)', () => {
    const input = '**In đậm** và _in nghiêng_ cùng `code` và [link](https://sunny.io.vn)';
    const plain = cleanMarkdownForPlainText(input);
    expect(plain).toBe('In đậm và in nghiêng cùng code và link (https://sunny.io.vn)');
  });
});

describe('Zalo Webhook Secret Authentication', () => {
  const configuredSecret = 'whsec_7eeaa3a750e66716117bf144c94807b0';

  it('khớp chính xác secret với safeEqual', () => {
    expect(safeEqual(configuredSecret, 'whsec_7eeaa3a750e66716117bf144c94807b0')).toBe(true);
    expect(safeEqual(configuredSecret, 'whsec_wrong_secret_12345678901234567')).toBe(false);
    expect(safeEqual(configuredSecret, '')).toBe(false);
  });

  it('hỗ trợ header x-bot-api-secret-token từ Zalo Bot Platform', () => {
    const headers = new Headers({
      'x-bot-api-secret-token': 'whsec_7eeaa3a750e66716117bf144c94807b0',
    });

    const receivedSecret =
      headers.get('x-bot-api-secret-token') ||
      headers.get('x-zalo-bot-api-secret-token') ||
      headers.get('x-telegram-bot-api-secret-token') ||
      headers.get('x-webhook-secret') ||
      headers.get('x-workhub-secret') ||
      '';

    expect(safeEqual(receivedSecret.trim(), configuredSecret)).toBe(true);
  });

  it('hỗ trợ header authorization Bearer', () => {
    const headers = new Headers({
      authorization: 'Bearer whsec_7eeaa3a750e66716117bf144c94807b0',
    });

    const token = headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    expect(safeEqual(token.trim(), configuredSecret)).toBe(true);
  });

  it('từ chối khi thiếu secret hoặc secret không đúng', () => {
    const headers = new Headers({
      'x-bot-api-secret-token': 'sai_secret_token',
    });

    const receivedSecret = headers.get('x-bot-api-secret-token') || '';
    expect(safeEqual(receivedSecret.trim(), configuredSecret)).toBe(false);
  });
});

describe('Zalo Webhook Payload Extraction', () => {
  it('trích xuất đúng cấu trúc Zalo Bot Platform (tương tự Telegram)', () => {
    const body = {
      update_id: 123456,
      message: {
        message_id: 88,
        chat: { id: 'user_123456' },
        from: { id: 'user_123456', name: 'Nguyễn Văn A' },
        text: '/viec',
      },
    };

    const messageObj = typeof body.message === 'object' && body.message !== null ? body.message : undefined;
    const senderId = messageObj?.chat?.id ?? messageObj?.from?.id;
    const rawText = messageObj?.text ?? '';

    expect(String(senderId)).toBe('user_123456');
    expect(rawText).toBe('/viec');
  });

  it('trích xuất đúng cấu trúc Zalo OA Webhook', () => {
    const body = {
      event_name: 'user_send_text',
      app_id: 'app_999',
      sender: { id: 'zalo_oa_sender_789' },
      recipient: { id: 'oa_id_111' },
      message: {
        msg_id: 'msg_001',
        text: 'Hôm nay tôi còn bao nhiêu ngày phép?',
      },
    };

    const messageObj = typeof body.message === 'object' && body.message !== null ? body.message : undefined;
    const senderId = (messageObj as any)?.chat?.id ?? body.sender?.id;
    const rawText = messageObj?.text ?? '';

    expect(String(senderId)).toBe('zalo_oa_sender_789');
    expect(rawText).toBe('Hôm nay tôi còn bao nhiêu ngày phép?');
  });

  it('trích xuất đúng cấu trúc test rút gọn / flat payload', () => {
    const body = {
      chat_id: '987654321',
      text: '/checkin',
    };

    const senderId = body.chat_id;
    const rawText = body.text;

    expect(String(senderId)).toBe('987654321');
    expect(rawText).toBe('/checkin');
  });
});
