import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import { getSetting } from '@/server/modules/settings/service';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { safeEqual } from '@/lib/crypto';

const FLOW_COOKIE = 'workhub_google_flow';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
function key() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET cần ít nhất 32 ký tự');
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}
export function googleCallbackUrl() {
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('SSO yêu cầu APP_URL dùng HTTPS');
  return `${url.origin}/api/auth/google/callback`;
}
export async function googleConfig() {
  const [enabled, clientId, clientSecret, domains] = await Promise.all([
    getSetting('sso.google.enabled', false), getSetting('sso.google.clientId', ''),
    getSetting('sso.google.clientSecret', ''), getSetting('sso.google.domains', ''),
  ]);
  return { enabled: enabled === true, clientId: clientId.trim(), clientSecret: clientSecret.trim(), domains: domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean) };
}
export async function googleReady() {
  const config = await googleConfig();
  return Boolean(config.enabled && config.clientId && config.clientSecret);
}
export interface GoogleFlow extends JWTPayload {
  state: string; nonce: string; verifier: string; next: string; clientId: string;
  linkUserId?: number; credentialVersion?: string;
}
export async function beginGoogleFlow(next?: string, link?: { userId: number; credentialVersion: string }) {
  const config = await googleConfig();
  if (!config.enabled || !config.clientId || !config.clientSecret) throw new Error('Google SSO chưa sẵn sàng');
  const flow: GoogleFlow = {
    state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'), next: safeRedirectPath(next), clientId: config.clientId,
    ...(link ? { linkUserId: link.userId, credentialVersion: link.credentialVersion } : {}),
  };
  const signed = await new SignJWT(flow).setProtectedHeader({ alg: 'HS256' }).setIssuer('workhub-google-flow').setAudience('google-callback').setIssuedAt().setExpirationTime('10m').sign(key());
  (await cookies()).set(FLOW_COOKIE, signed, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google', maxAge: 600 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: googleCallbackUrl(), response_type: 'code', scope: 'openid email', state: flow.state, nonce: flow.nonce, code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return url.toString();
}
export async function consumeGoogleFlow(state: string | null): Promise<GoogleFlow> {
  const store = await cookies();
  const value = store.get(FLOW_COOKIE)?.value;
  store.set(FLOW_COOKIE, '', { path: '/api/auth/google', maxAge: 0, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  if (!value || !state) throw new Error('Phiên đăng nhập đã hết hạn');
  const { payload } = await jwtVerify(value, key(), { issuer: 'workhub-google-flow', audience: 'google-callback', algorithms: ['HS256'] });
  if (typeof payload.state !== 'string' || !safeEqual(payload.state, state) || typeof payload.nonce !== 'string' || typeof payload.verifier !== 'string' || typeof payload.clientId !== 'string') throw new Error('Phiên đăng nhập không hợp lệ');
  return payload as GoogleFlow;
}
export function validateGoogleClaims(payload: JWTPayload, nonce: string, domains: string[]) {
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub || payload.sub.length > 191 || payload.email.length > 191) throw new Error('Danh tính Google không hợp lệ');
  if (domains.length && (typeof payload.hd !== 'string' || !domains.includes(payload.hd.toLowerCase()))) throw new Error('Tài khoản không thuộc miền được phép');
  return { subject: payload.sub, email: payload.email };
}
export async function exchangeGoogleCode(code: string, flow: GoogleFlow) {
  const config = await googleConfig();
  if (!config.enabled || config.clientId !== flow.clientId) throw new Error('Cấu hình SSO đã thay đổi');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: googleCallbackUrl() }),
  });
  if (!response.ok) throw new Error('Google không chấp nhận phiên đăng nhập');
  const tokens = await response.json();
  if (typeof tokens.id_token !== 'string') throw new Error('Thiếu ID token');
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.clientId, algorithms: ['RS256'], maxTokenAge: '10m' });
  return validateGoogleClaims(payload, flow.nonce, config.domains);
}
