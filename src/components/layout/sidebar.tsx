'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeft, X } from 'lucide-react';
import type { NavSection } from '@/lib/nav';
import { NAV_ICONS } from './icons';
import { cn } from '@/lib/utils';

interface Props {
  sections: NavSection[];
  appName: string;
  badges: Record<string, number>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  sections, appName, badges, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  const [hoveredTooltip, setHoveredTooltip] = useState<{ top: number; text: string } | null>(null);

  useEffect(() => {
    onCloseMobile();
    setHoveredTooltip(null);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHoveredTooltip(null);
  }, [collapsed]);

  const showTooltip = (e: React.MouseEvent<HTMLElement>, text: string) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTooltip({
      top: rect.top + rect.height / 2,
      text,
    });
  };

  const hideTooltip = () => setHoveredTooltip(null);

  const isActive = (href: string) =>
    href === '/settings' ? pathname === '/settings' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}

      <aside className={cn('sidebar', collapsed && 'sidebar-collapsed', mobileOpen && 'sidebar-mobile-open')}>
        <div className="sidebar-head">
          {collapsed ? (
            <button
              type="button"
              className="sidebar-brand-btn"
              onClick={onToggleCollapsed}
              onMouseEnter={(e) => showTooltip(e, 'Mở rộng menu')}
              onMouseLeave={hideTooltip}
              aria-label="Mở rộng menu"
            >
              <span className="login-logo">
                <span className="logo-letter">W</span>
                <PanelLeft className="logo-expand-icon" size={18} />
              </span>
            </button>
          ) : (
            <>
              <Link href="/dashboard" className="sidebar-brand">
                <span className="login-logo">W</span>
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
          {sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              {section.title && !collapsed && <div className="nav-section">{section.title}</div>}
              {section.title && collapsed && <div className="nav-section-divider" />}
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                const labelWithCount = `${item.label}${count > 0 ? ` (${count})` : ''}`;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-item"
                    data-active={isActive(item.href)}
                    onMouseEnter={(e) => showTooltip(e, labelWithCount)}
                    onMouseLeave={hideTooltip}
                  >
                    {Icon && <Icon />}
                    {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                    {!collapsed && count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
                    {collapsed && count > 0 && <span className="nav-badge-dot" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleCollapsed}
            onMouseEnter={(e) => showTooltip(e, collapsed ? 'Mở rộng menu' : 'Thu gọn menu')}
            onMouseLeave={hideTooltip}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {collapsed ? <PanelLeft /> : <PanelLeftClose />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
        </div>

        {/* Tooltip nổi ngoài container cuộn, không bị che khuất và cho phép sidebar cuộn tự do */}
        {collapsed && hoveredTooltip && (
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
