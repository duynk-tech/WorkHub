import { SignJWT, jwtVerify } from 'jose';

/**
 * Token ngắn hạn gắn vào thông báo đẩy để bấm "Duyệt" ngay trên thông báo.
 * Chỉ chứng minh thông báo do hệ thống phát; người bấm vẫn phải đang đăng nhập
 * và đúng là người duyệt (kiểm tra ở route).
 */
const ISSUER = 'workhub-action';

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET chưa được cấu hình');
  return new TextEncoder().encode(secret);
}

export async function signActionToken(payload: { kind: string; id: number }, ttlSeconds = 7 * 24 * 3600): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key());
}

export async function verifyActionToken(token: string, kind: string): Promise<{ id: number } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, algorithms: ['HS256'] });
    if (payload.kind !== kind || typeof payload.id !== 'number') return null;
    return { id: payload.id };
  } catch {
    return null;
  }
}
