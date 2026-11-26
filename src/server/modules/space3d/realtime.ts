import 'server-only';
import { SignJWT } from 'jose';
import { z } from 'zod';

/**
 * Hạ tầng Realtime cho Không gian 3D (Supabase Realtime: Broadcast + Presence).
 * App dùng session riêng (jose) nên server tự ký JWT Supabase ngắn hạn cho nhân viên,
 * để RLS trên `realtime.messages` nhận diện `employee_id`.
 */

export const REALTIME_TOKEN_TTL_SEC = 60 * 60;
export const DM_MAX_LENGTH = 1000;
export const DM_RATE_LIMIT = { max: 10, windowMs: 10_000 };

export interface RealtimeServerConfig {
  url: string;
  anonKey: string;
  jwtSecret: string | null;
  serviceRoleKey: string | null;
}

export function getRealtimeConfig(): RealtimeServerConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
  if (!url || !anonKey) return null;
  return {
    url,
    anonKey,
    jwtSecret: process.env.SUPABASE_JWT_SECRET?.trim() || null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  };
}

export async function mintRealtimeToken(
  employeeId: number,
  jwtSecret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowSec + REALTIME_TOKEN_TTL_SEC;
  const token = await new SignJWT({ role: 'authenticated', employee_id: String(employeeId) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(`emp:${employeeId}`)
    .setAudience('authenticated')
    .setIssuedAt(nowSec)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(jwtSecret));
  return { token, expiresAt };
}

/** Gửi broadcast từ server (service role, bỏ qua RLS) — dùng cho tin nhắn 1-1. */
export async function broadcastServer(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const cfg = getRealtimeConfig();
  if (!cfg?.serviceRoleKey) return false;
  try {
    const res = await fetch(`${cfg.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
        apikey: cfg.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const dmInputSchema = z.object({
  toEmployeeId: z.number().int().positive(),
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'Tin nhắn trống').max(DM_MAX_LENGTH, `Tối đa ${DM_MAX_LENGTH} ký tự`)),
});

export function validateDmInput(fromEmployeeId: number, raw: unknown) {
  const parsed = dmInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Tin nhắn không hợp lệ' };
  }
  if (parsed.data.toEmployeeId === fromEmployeeId) {
    return { ok: false as const, message: 'Không thể tự nhắn cho chính mình' };
  }
  return { ok: true as const, data: parsed.data };
}

export function isDmRateLimited(recentCount: number): boolean {
  return recentCount >= DM_RATE_LIMIT.max;
}
