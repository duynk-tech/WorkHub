import 'server-only';
import { getSetting } from './service';
import { DISABLED_MENUS_KEY, PROTECTED_MENU_HREFS } from '@/lib/menu-config';

/** Trả về danh sách đường dẫn menu đang bị tắt trên toàn hệ thống. */
export async function getDisabledMenuHrefs(): Promise<string[]> {
  const raw = await getSetting<unknown>(DISABLED_MENUS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (href): href is string =>
      typeof href === 'string' && href.startsWith('/') && !PROTECTED_MENU_HREFS.has(href),
  );
}
