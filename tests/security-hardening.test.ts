import { describe, expect, it, vi, afterEach } from 'vitest';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { settingsPolicy } from '@/server/modules/settings/policy';
import { isPublicAddress, resolveOutboundTarget } from '@/server/security/outbound-http';
import { lookup } from 'node:dns/promises';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('redirect boundary', () => {
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/\nevil.example'])('rejects %s', (path) => {
    expect(safeRedirectPath(path)).toBe('/dashboard');
  });
  it('preserves local deep links', () => expect(safeRedirectPath('/tasks?status=TODO#list')).toBe('/tasks?status=TODO#list'));
});
describe('settings authority boundary', () => {
  it('rejects keys outside the selected group', () => {
    expect(settingsPolicy('general').schema.safeParse({ 'zalo.botToken': 'secret' }).success).toBe(false);
    expect(settingsPolicy('zalo').schema.safeParse({ 'ai.customTools': [] }).success).toBe(false);
    expect(() => settingsPolicy('__proto__')).toThrow();
  });
  it('validates numeric ranges and preserves supported fulfillment modes', () => {
    expect(settingsPolicy('ai').schema.safeParse({ 'ai.maxIterations': 999 }).success).toBe(false);
    expect(settingsPolicy('general').schema.safeParse({ 'inventory.salesFulfillmentMode': 'AUTO_DEDUCT' }).success).toBe(true);
  });
});
describe('outbound SSRF boundary', () => {
  it.each(['127.0.0.1', '10.2.3.4', '169.254.169.254', '192.168.1.1', '100.64.1.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2002:7f00:1::'])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it('allows ordinary public IPs', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('requires exact deployment allowlist', async () => {
    vi.stubEnv('AI_TOOL_ALLOWED_ORIGINS', 'https://api.example.com');
    await expect(resolveOutboundTarget('https://api.example.com.evil.test/')).rejects.toThrow('chưa được cho phép');
    expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers', async () => {
    vi.stubEnv('AI_TOOL_ALLOWED_ORIGINS', 'https://api.example.com');
    vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }] as never);
    await expect(resolveOutboundTarget('https://api.example.com/')).rejects.toThrow('mạng nội bộ');
  });
});
