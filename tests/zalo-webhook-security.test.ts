import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ count: vi.fn(), setting: vi.fn(), create: vi.fn(), command: vi.fn(), after: vi.fn(), update: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mock.after }));
vi.mock('@/lib/prisma', () => ({ prisma: { zaloInboundLog: { count: mock.count, create: mock.create, update: mock.update } } }));
vi.mock('@/server/modules/settings/service', () => ({ getSetting: mock.setting }));
vi.mock('@/server/modules/zalo/commands', () => ({ handleZaloCommand: mock.command }));
vi.mock('@/server/modules/zalo/ai-agent', () => ({ handleZaloAiQuery: vi.fn() }));
vi.mock('@/server/modules/zalo/link', () => ({ findEmployeeByZaloId: vi.fn() }));
vi.mock('@/server/modules/notify/zalo', () => ({ sendZaloMessage: vi.fn() }));
import { POST } from '@/app/api/zalo/route';
function request(secret?: string, body = JSON.stringify({ message: { message_id: '123', from: { id: 'staff' }, text: '/viec' } })) {
  return new NextRequest('https://workhub.test/api/zalo', { method: 'POST', headers: secret ? { 'x-bot-api-secret-token': secret } : {}, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.setting.mockImplementation(async (key) => key === 'zalo.webhookSecret' ? 'test-secret' : true);
  mock.count.mockResolvedValue(0);
  mock.command.mockResolvedValue({ handled: true, reply: '' });
  mock.update.mockResolvedValue({});
});
describe('actual webhook boundary', () => {
  it('fails closed when secret is not configured', async () => {
    mock.setting.mockResolvedValue('');
    expect((await POST(request())).status).toBe(503);
    expect(mock.after).not.toHaveBeenCalled();
  });
  it('rejects absent or incorrect secret', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request('wrong'))).status).toBe(401);
    expect(mock.after).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies before scheduling work', async () => {
    expect((await POST(request('test-secret', 'a'.repeat(256 * 1024 + 1)))).status).toBe(413);
    expect(mock.after).not.toHaveBeenCalled();
  });
  it('never executes a duplicate event or failed claim', async () => {
    mock.create.mockRejectedValue({ code: 'P2002' });
    expect((await POST(request('test-secret'))).status).toBe(200);
    await mock.after.mock.calls[0][0]();
    expect(mock.command).not.toHaveBeenCalled();
  });
  it('does not dispatch over the per-sender limit', async () => {
    mock.count.mockResolvedValue(30);
    await POST(request('test-secret'));
    await mock.after.mock.calls[0][0]();
    expect(mock.command).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('executes a successfully claimed event once', async () => {
    mock.create.mockResolvedValue({ id: 1 });
    await POST(request('test-secret'));
    await mock.after.mock.calls[0][0]();
    expect(mock.command).toHaveBeenCalledOnce();
    expect(mock.create.mock.calls[0][0].data.messageId).toHaveLength(64);
  });
});
