import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchOutboundWebhook } from '@/server/modules/webhook/dispatcher';
import { hmacSha256 } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outboundWebhook: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Outbound Webhook Dispatcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('trả về mảng rỗng nếu không có webhook nào kích hoạt', async () => {
    vi.mocked(prisma.outboundWebhook.findMany).mockResolvedValue([]);
    const results = await dispatchOutboundWebhook('task.created', { id: 1 });
    expect(results).toEqual([]);
    expect(prisma.outboundWebhook.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  it('lọc webhook theo đúng sự kiện đăng ký hoặc wildcard', async () => {
    const mockWebhooks = [
      { id: 1, name: 'Task Hook', url: 'https://hook1.example.com', events: 'task.created,task.completed', secret: null, isActive: true },
      { id: 2, name: 'Leave Hook', url: 'https://hook2.example.com', events: 'leave.submitted', secret: 'sec123', isActive: true },
      { id: 3, name: 'All Hook', url: 'https://hook3.example.com', events: '*', secret: 'allsec', isActive: true },
    ];
    vi.mocked(prisma.outboundWebhook.findMany).mockResolvedValue(mockWebhooks as never);

    let calledUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrls.push(url);
      return { ok: true, status: 200 } as Response;
    });

    const results = await dispatchOutboundWebhook('task.created', { taskId: 99 });

    // Chỉ có webhook 1 (task.created) và webhook 3 (*) được gọi, webhook 2 bị bỏ qua
    expect(calledUrls).toEqual(['https://hook1.example.com', 'https://hook3.example.com']);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('gửi đúng Header và chữ ký HMAC-SHA256 khi có secret', async () => {
    const mockWebhooks = [
      { id: 10, name: 'Signed Hook', url: 'https://api.example.com/webhook', events: 'attendance.checkin', secret: 'my-super-secret', isActive: true },
    ];
    vi.mocked(prisma.outboundWebhook.findMany).mockResolvedValue(mockWebhooks as never);

    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      capturedBody = init.body as string;
      return { ok: true, status: 200 } as Response;
    });

    await dispatchOutboundWebhook('attendance.checkin', { employeeId: 5, lateMinutes: 0 });

    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['X-WorkHub-Event']).toBe('attendance.checkin');
    expect(capturedHeaders['X-WorkHub-Delivery']).toBeDefined();

    const expectedSignature = hmacSha256('my-super-secret', capturedBody);
    expect(capturedHeaders['X-WorkHub-Signature']).toBe(expectedSignature);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.event).toBe('attendance.checkin');
    expect(parsed.data).toEqual({ employeeId: 5, lateMinutes: 0 });

    expect(prisma.outboundWebhook.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ lastStatus: 200 }),
    });
  });

  it('xử lý lỗi kết nối mượt mà và cập nhật status = 0 mà không văng ngoại lệ', async () => {
    const mockWebhooks = [
      { id: 20, name: 'Failing Hook', url: 'https://bad-domain.invalid', events: '*', secret: null, isActive: true },
    ];
    vi.mocked(prisma.outboundWebhook.findMany).mockResolvedValue(mockWebhooks as never);

    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection timeout'));

    const results = await dispatchOutboundWebhook('task.completed', { id: 123 });

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].status).toBe(0);
    expect(results[0].error).toContain('Network connection timeout');

    expect(prisma.outboundWebhook.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ lastStatus: 0 }),
    });
  });
});
