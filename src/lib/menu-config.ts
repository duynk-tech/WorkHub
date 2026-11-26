import { NAV_SECTIONS, type NavItem } from '@/lib/nav';

export const DISABLED_MENUS_KEY = 'menus.disabled';

/**
 * Các menu lõi luôn hiển thị để quản trị viên không bao giờ tự khóa mình khỏi trang cấu hình / phân quyền.
 */
export const PROTECTED_MENU_HREFS = new Set<string>([
  '/dashboard',
  '/settings',
  '/settings/roles',
  '/settings/accounts',
]);

export interface ToggleableMenuGroup {
  title: string;
  items: NavItem[];
}

export const TOGGLEABLE_MENU_GROUPS: ToggleableMenuGroup[] = NAV_SECTIONS
  .map((section) => ({
    title: section.title || 'Chung',
    items: section.items.filter((item) => !PROTECTED_MENU_HREFS.has(item.href)),
  }))
  .filter((group) => group.items.length > 0);

export const ALL_TOGGLEABLE_MENU_HREFS = new Set<string>(
  TOGGLEABLE_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
);
