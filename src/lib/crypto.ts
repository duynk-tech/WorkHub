import crypto from 'node:crypto';

/**
 * Mã hóa secret lưu trong DB (bot token, webhook secret…) bằng AES-256-GCM.
 * Khóa lấy từ APP_ENCRYPTION_KEY (base64 hoặc hex, 32 byte).
 */
function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('Thiếu APP_ENCRYPTION_KEY trong .env');
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length === 32) return buf;
  // Cho phép chuỗi tự do: băm về đúng 32 byte
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return payload; // dữ liệu cũ chưa mã hóa
  try {
    const [, iv, tag, data] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[crypto] decryptSecret failed:', err);
    return payload;
  }
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** So sánh chống timing attack */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = 'whk_' + crypto.randomBytes(4).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${prefix}.${secret}`;
  return { key, prefix, hash: sha256(key) };
}
