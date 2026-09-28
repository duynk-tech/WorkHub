'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeft, X, ChevronDown, Settings } from 'lucide-react';
import type { NavSection } from '@/lib/nav';
import { NAV_ICONS } from './icons';
import { cn } from '@/lib/utils';

interface Props {
  sections: NavSection[];
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
  badges: Record<string, number>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  sections, appName, logoUrl, logoText, badges, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const settingsItem = sections.flatMap(s => s.items).find(i => i.href === '/settings');
  const menuSections = sections.map(s => ({ ...s, items: s.items.filter(i => i.href !== '/settings') })).filter(s => s.items.length);
  useEffect(() => {
    setExpanded(previous => {
      const next = { ...previous };
      for (const section of sections) {
        if (section.title && section.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`))) next[section.title] = true;
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
                <span className="sidebar-brand-text">{appName}</span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon sidebar-collapse-btn"
                onClick={onToggleCollapsed}
                aria-label="Thu gọn menu"
              >
                <PanelLeftClose />
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm btn-icon sidebar-close-btn" onClick={onCloseMobile} aria-label="Đóng menu">
            <X />
          </button>
        </div>

        <nav className="sidebar-nav scrollbar-none" onScroll={hideTooltip}>
          {menuSections.map((section, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              {section.title && !isEffectiveCollapsed && <button type="button" className="nav-group-toggle" aria-expanded={expanded[section.title] ?? false} aria-controls={`nav-group-${i}`} onClick={() => setExpanded(previous => ({ ...previous, [section.title!]: !previous[section.title!] }))}>
                <span>{section.title}</span><ChevronDown size={14} style={{ transform: expanded[section.title] ? 'rotate(0)' : 'rotate(-90deg)' }} />
              </button>}
              {section.title && isEffectiveCollapsed && <div className="nav-section-divider" />}
              <div id={`nav-group-${i}`} hidden={!!section.title && !isEffectiveCollapsed && !expanded[section.title]}>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                const labelWithCount = `${item.label}${count > 0 ? ` (${count})` : ''}`;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className="nav-item"
                    data-active={isActive(item.href)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    onClick={() => {
                      if (pathname !== item.href) {
                        setPendingHref(item.href);
                      }
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
              })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {settingsItem && (
            <Link
              href={settingsItem.href}
              className="nav-item"
              data-active={pathname === '/settings'}
              aria-current={pathname === '/settings' ? 'page' : undefined}
              aria-label="Cài đặt hệ thống"
              onMouseEnter={(e) => showTooltip(e, 'Cài đặt hệ thống')}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip(e, 'Cài đặt hệ thống')}
              onBlur={hideTooltip}
            >
              <Settings />
              {!isEffectiveCollapsed && <span style={{ flex: 1 }}>Cài đặt hệ thống</span>}
            </Link>
          )}
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleCollapsed}
            onMouseEnter={(e) => showTooltip(e, isEffectiveCollapsed ? 'Mở rộng menu' : 'Thu gọn menu')}
            onMouseLeave={hideTooltip}
            aria-label={isEffectiveCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {isEffectiveCollapsed ? <PanelLeft /> : <PanelLeftClose />}
            {!isEffectiveCollapsed && <span>Thu gọn menu</span>}
          </button>
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
