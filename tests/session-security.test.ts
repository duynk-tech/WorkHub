import { describe, expect, it, vi } from 'vitest';
import { signSession, verifySessionToken } from '@/server/auth/session';
import { SignJWT } from 'jose';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
describe('credential-bound sessions', () => {
  it('round-trips the credential version and rejects unversioned legacy tokens', async () => {
    vi.stubEnv('AUTH_SECRET', 'a-test-only-secret-at-least-32-characters');
    try {
      const payload = { userId: 1, username: 'staff', credentialVersion: 'version-one' };
      expect(await verifySessionToken(await signSession(payload))).toEqual(payload);
      const old = await new SignJWT({ userId: 1, username: 'staff' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('workhub').setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
      expect(await verifySessionToken(old)).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});
