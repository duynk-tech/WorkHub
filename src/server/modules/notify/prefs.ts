import { prisma } from '@/lib/prisma';

/** Kênh mỗi người tự bật/tắt. Thông báo trong app luôn bật — đó là bản lưu gốc. */
export interface NotifyPrefs {
  email: boolean;
  push: boolean;
  zalo: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { email: true, push: true, zalo: true };

export const notifyPrefsKey = (userId: number) => `user.${userId}.notify`;

export function normalizePrefs(raw: unknown): NotifyPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof NotifyPrefs, unknown>>;
  return {
    email: typeof v.email === 'boolean' ? v.email : DEFAULT_NOTIFY_PREFS.email,
    push: typeof v.push === 'boolean' ? v.push : DEFAULT_NOTIFY_PREFS.push,
    zalo: typeof v.zalo === 'boolean' ? v.zalo : DEFAULT_NOTIFY_PREFS.zalo,
  };
}

/** Đọc tuỳ chọn của nhiều user trong một query. */
export async function getNotifyPrefsMap(userIds: number[]): Promise<Map<number, NotifyPrefs>> {
  const map = new Map<number, NotifyPrefs>();
  if (!userIds.length) return map;
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: userIds.map(notifyPrefsKey) } },
    select: { key: true, valueJson: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  for (const id of userIds) map.set(id, normalizePrefs(byKey.get(notifyPrefsKey(id))));
  return map;
}
