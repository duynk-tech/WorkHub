import bcrypt from 'bcryptjs';

const ROUNDS = 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

export function checkPasswordStrength(plain: string): PasswordCheck {
  if (plain.length < 8) return { ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' };
  if (!/[a-zA-Z]/.test(plain)) return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ cái' };
  if (!/[0-9]/.test(plain)) return { ok: false, message: 'Mật khẩu phải có ít nhất một chữ số' };
  return { ok: true };
}
