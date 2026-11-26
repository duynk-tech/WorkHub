'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  PanelLeft, X, ChevronRight, LogOut,
  ShoppingCart, Boxes, Wrench, ListChecks, Users, BarChart3, Laptop, ShieldCheck, Folder,
  type LucideIcon,
} from 'lucide-react';
import type { NavSection } from '@/lib/nav';
import { Avatar } from '@/components/ui';
import { logoutAction } from '@/server/modules/auth/actions';
import type { TopbarUser } from './topbar';
import { NAV_ICONS } from './icons';
import { cn } from '@/lib/utils';

const GROUP_ICONS: Record<string, LucideIcon> = {
  'Kinh doanh': ShoppingCart,
  'Mua hàng & Kho': Boxes,
  'Dịch vụ': Wrench,
  'Công việc': ListChecks,
  'Nhân sự': Users,
  'Báo cáo': BarChart3,
  'Báo cáo & Chứng từ': BarChart3,
  'Tiện ích': Laptop,
  'Quản trị': ShieldCheck,
};

const SECTION_CATEGORY: Record<string, 'WORKSPACE' | 'VẬN HÀNH' | 'HỆ THỐNG'> = {
  'Kinh doanh': 'VẬN HÀNH',
  'Mua hàng & Kho': 'VẬN HÀNH',
  'Dịch vụ': 'VẬN HÀNH',
  'Công việc': 'VẬN HÀNH',
  'Nhân sự': 'VẬN HÀNH',
  'Báo cáo': 'HỆ THỐNG',
  'Báo cáo & Chứng từ': 'HỆ THỐNG',
  'Tiện ích': 'HỆ THỐNG',
  'Quản trị': 'HỆ THỐNG',
};

interface Props {
  sections: NavSection[];
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
  badges: Record<string, number>;
  user?: TopbarUser;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  sections, appName, logoUrl, logoText, badges, user, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const menuSections = sections.filter((s) => s.items.length > 0);
  useEffect(() => {
    setExpanded((previous) => {
      const next = { ...previous };
      for (const section of sections) {
        if (
          section.title &&
          section.items.some((i) =>
            i.href === '/settings'
              ? pathname === '/settings'
              : pathname === i.href || pathname.startsWith(`${i.href}/`),
          )
        ) {
          next[section.title] = true;
        }
      }
      return next;
    });
  }, [pathname, sections]);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ top: number; text: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Trên mobile/drawer, không bao giờ ở chế độ thu gọn icon-only
  const isEffectiveCollapsed = collapsed && !mobileOpen && !isMobile;

  useEffect(() => {
    onCloseMobile();
    setHoveredTooltip(null);
    setPendingHref(null);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHoveredTooltip(null);
  }, [isEffectiveCollapsed]);

  const showTooltip = (e: React.SyntheticEvent<HTMLElement>, text: string) => {
    if (!isEffectiveCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTooltip({
      top: rect.top + rect.height / 2,
      text,
    });
  };

  const hideTooltip = () => setHoveredTooltip(null);

  const isActive = (href: string) => {
    const current = pendingHref ?? pathname;
    return href === '/settings' ? current === '/settings' : current === href || current.startsWith(`${href}/`);
  };

  const displayLogoLetter = logoText?.trim() || appName.slice(0, 1).toUpperCase() || 'W';

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}

      <aside
        className={cn('sidebar', isEffectiveCollapsed && 'sidebar-collapsed', mobileOpen && 'sidebar-mobile-open')}
      >
        <div className="sidebar-head">
          {isEffectiveCollapsed ? (
            <button
              type="button"
              className="sidebar-brand-btn"
              onClick={onToggleCollapsed}
              onMouseEnter={(e) => showTooltip(e, 'Mở rộng menu')}
              onMouseLeave={hideTooltip}
              aria-label="Mở rộng menu"
            >
              <span
                className={`login-logo ${logoUrl ? 'has-image' : ''}`}
                style={{
                  overflow: 'hidden',
                  ...(logoUrl ? { background: 'transparent', boxShadow: 'none' } : {}),
                }}
              >
                <span className="logo-letter">
                  {logoUrl ? (
                    <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    displayLogoLetter
                  )}
                </span>
                {!logoUrl && <PanelLeft className="logo-expand-icon" size={18} />}
              </span>
            </button>
          ) : (
            <>
              <Link href="/dashboard" className="sidebar-brand">
                <span
                  className={`login-logo ${logoUrl ? 'has-image' : ''}`}
                  style={{
                    overflow: 'hidden',
                    ...(logoUrl ? { background: 'transparent', boxShadow: 'none' } : {}),
                  }}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    displayLogoLetter
                  )}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="sidebar-brand-text">{appName}</span>
                  <span className="sidebar-brand-sub">Operations console</span>
                </span>
              </Link>
            </>
          )}
          <button className="btn btn-ghost btn-sm btn-icon sidebar-close-btn" onClick={onCloseMobile} aria-label="Đóng menu">
            <X />
          </button>
        </div>

        <nav className="sidebar-nav scrollbar-none" onScroll={hideTooltip}>
          {(['WORKSPACE', 'VẬN HÀNH', 'HỆ THỐNG'] as const).map((cat) => {
            const catSections = menuSections.filter((s) =>
              cat === 'WORKSPACE' ? !s.title : (s.title ? (SECTION_CATEGORY[s.title] ?? 'HỆ THỐNG') === cat : false),
            );
            if (catSections.length === 0) return null;

            return (
              <div key={cat} className="nav-category-block">
                {!isEffectiveCollapsed ? (
                  <div className="nav-category">{cat}</div>
                ) : (
                  cat !== 'WORKSPACE' && <div className="nav-section-divider" />
                )}

                {catSections.map((section, idx) => {
                  // Mục trực tiếp (không có tiêu đề nhóm, VD: Tổng quan)
                  if (!section.title) {
                    return section.items.map((item) => {
                      const Icon = NAV_ICONS[item.icon];
                      const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                      const labelWithCount = `${item.label}${count > 0 ? ` (${count})` : ''}`;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          className="nav-item"
                          data-active={isActive(item.href)}
                          aria-current={isActive(item.href) ? 'page' : undefined}
                          onClick={() => {
                            if (pathname !== item.href) setPendingHref(item.href);
                          }}
                          onMouseEnter={(e) => showTooltip(e, labelWithCount)}
                          onMouseLeave={hideTooltip}
                          onFocus={(e) => showTooltip(e, labelWithCount)}
                          onBlur={hideTooltip}
                          aria-label={labelWithCount}
                        >
                          {Icon && <Icon />}
                          {!isEffectiveCollapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                          {!isEffectiveCollapsed && count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
                          {isEffectiveCollapsed && count > 0 && <span className="nav-badge-dot" />}
                        </Link>
                      );
                    });
                  }

                  // Khi sidebar thu gọn icon-only: hiển thị từng icon mục con
                  if (isEffectiveCollapsed) {
                    return section.items.map((item) => {
                      const Icon = NAV_ICONS[item.icon];
                      const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                      const labelWithCount = `${item.label}${count > 0 ? ` (${count})` : ''}`;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          className="nav-item"
                          data-active={isActive(item.href)}
                          aria-current={isActive(item.href) ? 'page' : undefined}
                          onClick={() => {
                            if (pathname !== item.href) setPendingHref(item.href);
                          }}
                          onMouseEnter={(e) => showTooltip(e, labelWithCount)}
                          onMouseLeave={hideTooltip}
                          onFocus={(e) => showTooltip(e, labelWithCount)}
                          onBlur={hideTooltip}
                          aria-label={labelWithCount}
                        >
                          {Icon && <Icon />}
                          {count > 0 && <span className="nav-badge-dot" />}
                        </Link>
                      );
                    });
                  }

                  // Nhóm có thể mở rộng kiểu FMP Worker: Icon + Tên nhóm + Chevron > / v -> Submenu thụt vào có đường kẻ dọc
                  const GroupIcon = GROUP_ICONS[section.title] ?? Folder;
                  const isOpen = expanded[section.title] ?? false;
                  const hasActiveChild = section.items.some((item) => isActive(item.href));
                  const groupBadgeCount = section.items.reduce(
                    (sum, item) => sum + (item.badgeKey ? badges[item.badgeKey] ?? 0 : 0),
                    0,
                  );

                  return (
                    <div key={`${cat}-${section.title}-${idx}`} className="nav-group">
                      <button
                        type="button"
                        className="nav-group-toggle"
                        data-open={isOpen}
                        data-has-active={hasActiveChild}
                        aria-expanded={isOpen}
                        aria-controls={`nav-group-${cat}-${idx}`}
                        onClick={() =>
                          setExpanded((previous) => ({ ...previous, [section.title!]: !previous[section.title!] }))
                        }
                      >
                        <GroupIcon className="nav-group-icon" />
                        <span className="nav-group-label">{section.title}</span>
                        {!isOpen && groupBadgeCount > 0 && (
                          <span className="nav-badge">{groupBadgeCount > 99 ? '99+' : groupBadgeCount}</span>
                        )}
                        <ChevronRight className="nav-group-chevron" />
                      </button>

                      {isOpen && (
                        <div id={`nav-group-${cat}-${idx}`} className="nav-submenu">
                          {section.items.map((item) => {
                            const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                            const labelWithCount = `${item.label}${count > 0 ? ` (${count})` : ''}`;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                className="nav-subitem"
                                data-active={isActive(item.href)}
                                aria-current={isActive(item.href) ? 'page' : undefined}
                                onClick={() => {
                                  if (pathname !== item.href) setPendingHref(item.href);
                                }}
                                aria-label={labelWithCount}
                              >
                                <span style={{ flex: 1 }}>{item.label}</span>
                                {count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user-row">
              <Link
                href="/profile"
                className="sidebar-user-link"
                onMouseEnter={(e) => showTooltip(e, `${user.fullName} (@${user.username})`)}
                onMouseLeave={hideTooltip}
              >
                <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
                {!isEffectiveCollapsed && (
                  <span className="sidebar-user-meta">
                    <span className="sidebar-user-name">{user.fullName}</span>
                    <span className="sidebar-user-handle">{user.username}</span>
                  </span>
                )}
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm btn-icon"
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                  onMouseEnter={(e) => showTooltip(e, 'Đăng xuất')}
                  onMouseLeave={hideTooltip}
                >
                  <LogOut size={15} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Tooltip nổi ngoài container cuộn, không bị che khuất và cho phép sidebar cuộn tự do */}
        {isEffectiveCollapsed && hoveredTooltip && (
          <div
            className="sidebar-floating-tooltip"
            style={{ top: hoveredTooltip.top }}
          >
            {hoveredTooltip.text}
          </div>
        )}
      </aside>
    </>
  );
}
