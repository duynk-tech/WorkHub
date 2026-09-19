import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Viết tắt tên để hiển thị avatar: "Nguyễn Văn An" → "NA" */
export function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Prisma Decimal, string hay number đều nhận được */
export type Numberish = number | string | null | undefined | { toString(): string };

function toNumber(value: Numberish): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export function formatNumber(value: Numberish, digits = 0) {
  const n = toNumber(value);
  return n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 1.5 → "1,5" — bỏ phần thập phân thừa cho số ngày phép */
export function formatDays(value: Numberish) {
  const n = toNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function formatMinutes(total: number) {
  const h = Math.floor(Math.abs(total) / 60);
  const m = Math.abs(total) % 60;
  const sign = total < 0 ? '-' : '';
  if (h === 0) return `${sign}${m} phút`;
  return m === 0 ? `${sign}${h} giờ` : `${sign}${h} giờ ${m} phút`;
}

export function slugifyCode(input: string) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function randomToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/** Mã liên kết Zalo — bỏ ký tự dễ nhầm (0/O, 1/I) */
export function randomLinkCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tạo Webhook Secret ngẫu nhiên bảo mật cao (tiền tố whsec_ + 32 ký tự hex ngẫu nhiên) */
export function generateWebhookSecret(prefix = 'whsec_'): string {
  return `${prefix}${randomToken(32)}`;
}
