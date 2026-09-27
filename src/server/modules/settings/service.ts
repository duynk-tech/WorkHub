import { SECRET_SETTING_KEYS } from './policy';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

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

  return prisma.systemSetting.upsert({
    where: { key },
    update: { valueJson: stored as never, groupName: options?.group ?? existing?.groupName ?? 'general', isSecret },
    create: { key, valueJson: stored as never, groupName: options?.group ?? 'general', isSecret },
  });
}
