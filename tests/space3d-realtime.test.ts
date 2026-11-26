import { describe, expect, it } from 'vitest';
import { jwtVerify } from 'jose';
import {
  DM_MAX_LENGTH,
  DM_RATE_LIMIT,
  REALTIME_TOKEN_TTL_SEC,
  isDmRateLimited,
  mintRealtimeToken,
  validateDmInput,
} from '@/server/modules/space3d/realtime';

const SECRET = 'test-supabase-jwt-secret-at-least-32-chars!!';

describe('space3d realtime token', () => {
  it('ký JWT Supabase với role authenticated và claim employee_id', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token, expiresAt } = await mintRealtimeToken(42, SECRET, now);
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      audience: 'authenticated',
    });
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.role).toBe('authenticated');
    expect(payload.employee_id).toBe('42');
    expect(payload.sub).toBe('emp:42');
    expect(payload.exp).toBe(now + REALTIME_TOKEN_TTL_SEC);
    expect(expiresAt).toBe(now + REALTIME_TOKEN_TTL_SEC);
  });

  it('token sai secret bị từ chối', async () => {
    const { token } = await mintRealtimeToken(1, SECRET);
    await expect(jwtVerify(token, new TextEncoder().encode('another-secret-another-secret-xx'))).rejects.toThrow();
  });
});

describe('space3d DM validation', () => {
  it('chấp nhận tin hợp lệ và trim khoảng trắng', () => {
    const r = validateDmInput(1, { toEmployeeId: 2, body: '  Xin chào  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.body).toBe('Xin chào');
  });

  it('chặn tự nhắn cho chính mình', () => {
    const r = validateDmInput(5, { toEmployeeId: 5, body: 'hi' });
    expect(r.ok).toBe(false);
  });

  it('chặn tin rỗng và tin quá dài', () => {
    expect(validateDmInput(1, { toEmployeeId: 2, body: '   ' }).ok).toBe(false);
    expect(validateDmInput(1, { toEmployeeId: 2, body: 'a'.repeat(DM_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(validateDmInput(1, { toEmployeeId: 2, body: 'a'.repeat(DM_MAX_LENGTH) }).ok).toBe(true);
  });

  it('chặn người nhận không hợp lệ', () => {
    expect(validateDmInput(1, { toEmployeeId: 0, body: 'hi' }).ok).toBe(false);
    expect(validateDmInput(1, { toEmployeeId: 1.5, body: 'hi' }).ok).toBe(false);
  });

  it('rate-limit theo số tin trong cửa sổ', () => {
    expect(isDmRateLimited(DM_RATE_LIMIT.max - 1)).toBe(false);
    expect(isDmRateLimited(DM_RATE_LIMIT.max)).toBe(true);
  });
});
