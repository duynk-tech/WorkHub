import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
const mocks = vi.hoisted(() => ({ setting: vi.fn(), cookies: new Map<string, string>(), key: null as CryptoKey | null }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => mocks.cookies.has(key) ? { value: mocks.cookies.get(key) } : undefined, set: (key: string, value: string) => mocks.cookies.set(key, value) }) }));
vi.mock('@/server/modules/settings/service', () => ({ getSetting: mocks.setting }));
vi.mock('jose', async (original) => ({ ...await original<typeof import('jose')>(), createRemoteJWKSet: () => async () => mocks.key }));
import { beginGoogleFlow, consumeGoogleFlow, exchangeGoogleCode, validateGoogleClaims, type GoogleFlow } from '@/server/auth/google/service';
beforeEach(() => {
  vi.unstubAllGlobals();
  mocks.cookies.clear();
  vi.stubEnv('AUTH_SECRET', 'this-is-a-test-secret-with-32-characters');
  vi.stubEnv('APP_URL', 'https://workhub.test');
  mocks.setting.mockImplementation(async (key) => ({ 'sso.google.enabled': true, 'sso.google.clientId': 'test.apps.googleusercontent.com', 'sso.google.clientSecret': 'test-secret', 'sso.google.domains': 'company.vn' })[key as string]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Google OAuth flow', () => {
  it('uses random state, nonce, PKCE and a fixed callback', async () => {
    const url = new URL(await beginGoogleFlow('//evil.test'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://workhub.test/api/auth/google/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const flow = await consumeGoogleFlow(url.searchParams.get('state'));
    expect(flow.next).toBe('/dashboard');
    expect(flow.verifier.length).toBeGreaterThan(40);
    await expect(consumeGoogleFlow(url.searchParams.get('state'))).rejects.toThrow();
  });
  it('rejects mismatched state and deletes the browser flow', async () => {
    await beginGoogleFlow();
    await expect(consumeGoogleFlow('wrong-state')).rejects.toThrow();
    expect(mocks.cookies.get('workhub_google_flow')).toBe('');
  });
  it('checks nonce, verified email and Workspace hd, never just email suffix', () => {
    const claims = { sub: 'google-subject', email: 'staff@company.vn', email_verified: true, nonce: 'expected', hd: 'company.vn' };
    expect(validateGoogleClaims(claims, 'expected', ['company.vn']).subject).toBe('google-subject');
    expect(() => validateGoogleClaims({ ...claims, hd: undefined }, 'expected', ['company.vn'])).toThrow();
    expect(() => validateGoogleClaims({ ...claims, email_verified: false }, 'expected', [])).toThrow();
    expect(() => validateGoogleClaims(claims, 'wrong', [])).toThrow();
  });
  it('verifies Google token signature, issuer and audience before accepting identity', async () => {
    const pair = await generateKeyPair('RS256');
    mocks.key = pair.publicKey;
    const flow = { clientId: 'test.apps.googleusercontent.com', nonce: 'expected', verifier: 'verifier', state: 'state', next: '/dashboard' } as GoogleFlow;
    const sign = (aud: string) => new SignJWT({ sub: 'sub-1', email: 'a@company.vn', hd: 'company.vn', email_verified: true, nonce: 'expected' }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id_token: await sign(flow.clientId) }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await exchangeGoogleCode('code', flow)).toEqual({ subject: 'sub-1', email: 'a@company.vn' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id_token: await sign('attacker-client') }) });
    await expect(exchangeGoogleCode('code', flow)).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
