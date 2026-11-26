import 'server-only';
import { cachedSettings, getSetting } from './service';
import { DISABLED_MENUS_KEY, PROTECTED_MENU_HREFS } from '@/lib/menu-config';

/** Trả về danh sách đường dẫn menu đang bị tắt trên toàn hệ thống (cache 5 phút). */
export async function getDisabledMenuHrefs(): Promise<string[]> {
  return cachedSettings('disabled-menus', async () => {
    const raw = await getSetting<unknown>(DISABLED_MENUS_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (href): href is string =>
        typeof href === 'string' && href.startsWith('/') && !PROTECTED_MENU_HREFS.has(href),
    );
  });
}
