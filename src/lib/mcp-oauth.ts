import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export interface OAuthClientData {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  createdAt: number;
}

export interface AuthCodeData {
  code: string;
  userId: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  expiresAt: number;
}

function getOAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET chưa được cấu hình (tối thiểu 16 ký tự) cho MCP OAuth');
  }
  return 'dev-only-mcp-oauth-secret-do-not-use-in-production';
}

export function getAppUrl(req?: Request): string {
  if (req) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      // Bỏ cổng nếu là cổng chuẩn
      const cleanHost = host.replace(/:80$/, '').replace(/:443$/, '');
      return `${proto}://${cleanHost}`;
    }
  }
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/** Lưu thông tin client DCR vào SystemSetting */
export async function saveOAuthClient(client: OAuthClientData): Promise<void> {
  const key = `oauth.client.${client.clientId}`;
  await prisma.systemSetting.upsert({
    where: { key },
    update: { valueJson: client as never },
    create: { key, valueJson: client as never },
  });
}

/** Lấy thông tin client DCR */
export async function getOAuthClient(clientId: string): Promise<OAuthClientData | null> {
  const key = `oauth.client.${clientId}`;
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting?.valueJson) return null;
  return setting.valueJson as unknown as OAuthClientData;
}

/** Sinh Authorization Code cho OAuth 2.1 PKCE */
export async function createAuthCode(data: {
  userId: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  scope?: string;
}): Promise<string> {
  const code = `mcp_code_${crypto.randomBytes(24).toString('hex')}`;
  const authData: AuthCodeData = {
    code,
    userId: data.userId,
    clientId: data.clientId,
    redirectUri: data.redirectUri,
    codeChallenge: data.codeChallenge,
    codeChallengeMethod: data.codeChallengeMethod || 'S256',
    scope: data.scope || 'mcp',
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 phút
  };

  const key = `oauth.code.${code}`;
  await prisma.systemSetting.create({
    data: {
      key,
      valueJson: authData as never,
    },
  });

  return code;
}

/** Đổi và tiêu hủy Authorization Code (single-use) */
export async function consumeAuthCode(code: string): Promise<AuthCodeData | null> {
  const key = `oauth.code.${code}`;
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting?.valueJson) return null;

  // Xóa ngay lập tức để bảo đảm chỉ dùng 1 lần
  await prisma.systemSetting.delete({ where: { key } }).catch(() => {});

  const data = setting.valueJson as unknown as AuthCodeData;
  if (data.expiresAt < Date.now()) {
    return null; // Mã đã hết hạn
  }

  return data;
}

/** Kiểm tra PKCE (Proof Key for Code Exchange) */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method = 'S256'): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  // Mặc định S256 theo OAuth 2.1
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const computed = base64url(hash);
  return computed === codeChallenge;
}

/** Phát hành Access Token có chữ ký HMAC-SHA256 (30 ngày) */
export function issueOAuthToken(
  userId: number,
  clientId: string,
  scope = 'mcp',
  credentialVersion?: string,
): string {
  const payload: Record<string, unknown> = {
    uid: userId,
    cid: clientId,
    scp: scope,
    exp: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 ngày
  };
  if (credentialVersion) payload.cv = credentialVersion;

  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const hmac = crypto.createHmac('sha256', getOAuthSecret());
  hmac.update(payloadB64);
  const sig = base64url(hmac.digest());

  return `mcp_tok_${payloadB64}.${sig}`;
}

/** Xác minh Access Token */
export function verifyOAuthToken(
  token: string,
): { userId: number; clientId: string; scope: string; credentialVersion?: string } | null {
  if (!token.startsWith('mcp_tok_')) return null;
  const raw = token.slice('mcp_tok_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  const hmac = crypto.createHmac('sha256', getOAuthSecret());
  hmac.update(payloadB64);
  const expectedSig = base64url(hmac.digest());

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(payloadB64));
    if (!payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // Hết hạn

    return {
      userId: Number(payload.uid),
      clientId: String(payload.cid || 'chatgpt'),
      scope: String(payload.scp || 'mcp'),
      ...(typeof payload.cv === 'string' ? { credentialVersion: payload.cv } : {}),
    };
  } catch {
    return null;
  }
}
