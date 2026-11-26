import { unstable_cache, revalidateTag } from 'next/cache';
import { SECRET_SETTING_KEYS } from './policy';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

export const SETTINGS_CACHE_TAG = 'settings';

export function invalidateSettingsCache() {
  if (process.env.VITEST) return;
  try {
    revalidateTag(SETTINGS_CACHE_TAG);
  } catch {
    // Ignore outside Next.js request lifecycle (e.g. CLI scripts / tests)
  }
}

/** Đọc nhiều cấu hình trong 1 truy vấn duy nhất (giảm round-trip tới Supabase). */
export async function getSettingsByKeys(keys: string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const rows = await prisma.systemSetting
    .findMany({ where: { key: { in: keys } } })
    .catch(() => []);
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const value = row.valueJson;
    if (row.isSecret && typeof value === 'string') {
      out[row.key] = value ? decryptSecret(value) : '';
    } else {
      out[row.key] = value;
    }
  }
  return out;
}

/** Bọc hàm đọc cấu hình không nhạy cảm vào Next.js Data Cache (5 phút, tự xóa khi lưu Cài đặt). */
export function cachedSettings<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return fetcher();
  }
  try {
    return unstable_cache(fetcher, [SETTINGS_CACHE_TAG, cacheKey], {
      revalidate: 300,
      tags: [SETTINGS_CACHE_TAG],
    })();
  } catch {
    return fetcher();
  }
}

/** Đọc một cấu hình hệ thống, trả về giá trị mặc định nếu chưa có. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } }).catch(() => null);
  if (!row) return fallback;
  const value = row.valueJson as T;
  if (row.isSecret && typeof value === 'string') {
    return (value ? decryptSecret(value) : '') as T;
  }
  return (value ?? fallback) as T;
}

/** Đọc cả nhóm cấu hình. Secret chỉ trả về dấu sao để không lộ giá trị ra client. */
export async function getSettings(group?: string): Promise<Record<string, unknown>> {
  const rows = await prisma.systemSetting.findMany({ where: group ? { groupName: group } : undefined }).catch(() => []);
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key === 'ai.customTools') continue;
    out[row.key] = (row.isSecret || SECRET_SETTING_KEYS.has(row.key)) ? (row.valueJson ? '********' : '') : row.valueJson;
  }
  return out;
}

export async function setSetting(key: string, value: unknown, options?: { group?: string; isSecret?: boolean }) {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  const isSecret = options?.isSecret ?? existing?.isSecret ?? false;
  const stored = isSecret && typeof value === 'string' && value ? encryptSecret(value) : value;

  const result = await prisma.systemSetting.upsert({
    where: { key },
    update: { valueJson: stored as never, groupName: options?.group ?? existing?.groupName ?? 'general', isSecret },
    create: { key, valueJson: stored as never, groupName: options?.group ?? 'general', isSecret },
  });
  invalidateSettingsCache();
  return result;
}
