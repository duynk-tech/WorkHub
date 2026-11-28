'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  Menu, PanelLeft, Bell, LogOut, User, KeyRound, ChevronDown,
  Search, ListChecks,
} from 'lucide-react';
import { Avatar } from '@/components/ui';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { logoutAction } from '@/server/modules/auth/actions';
import { fmtRelative } from '@/lib/date';

export interface TopbarUser {
  fullName: string;
  username: string;
  avatarUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
  roleNames: string[];
  zaloLinked: boolean;
}

export interface TopbarNotification {
  id: number;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function Topbar({
  user, notifications, unreadCount, onOpenMobileMenu, onToggleSidebar, navLinks = [],
}: {
  user: TopbarUser;
  notifications: TopbarNotification[];
  unreadCount: number;
  onOpenMobileMenu: () => void;
  onToggleSidebar?: () => void;
  /** Các menu người dùng được vào — dùng cho lối tắt "Đi tới …" trong ô tìm kiếm. */
  navLinks?: { href: string; label: string }[];
}) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<'user' | 'notif' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMac, setIsMac] = useState(true);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)), []);
  const [searchFocused, setSearchFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [hits, setHits] = useState<{ type: string; id: number; title: string; sub?: string; href: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  // Gõ tới đâu tìm tới đó (chờ 250ms sau phím cuối để không gọi máy chủ mỗi ký tự)
  useEffect(() => {
    const q = searchQuery.trim();
    setActive(0);
    if (q.length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).hits ?? []);
      } catch { /* bị huỷ do gõ tiếp */ } finally { setSearching(false); }
    }, 250);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [searchQuery]);

  const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const q = searchQuery.trim();
  const navMatches = q ? navLinks.filter((l) => fold(l.label).includes(fold(q))).slice(0, 4) : [];
  const options = [
    ...navMatches.map((l) => ({ key: `nav:${l.href}`, group: 'Đi tới', title: l.label, sub: undefined as string | undefined, href: l.href })),
    ...hits.map((h) => ({ key: `${h.type}:${h.id}`, group: h.type, title: h.title, sub: h.sub, href: h.href })),
    { key: 'all:tasks', group: 'Tìm rộng hơn', title: `Tìm "${q}" trong Công việc`, sub: undefined, href: `/tasks?q=${encodeURIComponent(q)}` },
  ];
  const go = (href: string) => {
    setSearchFocused(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
    router.push(href);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && searchFocused) {
        searchInputRef.current?.blur();
        setSearchFocused(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [searchFocused]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    go(options[Math.min(active, options.length - 1)].href);
  };

  return (
    <header className="topbar">
      <button className="btn btn-ghost btn-sm btn-icon topbar-menu-btn" onClick={onOpenMobileMenu} aria-label="Mở menu">
        <Menu />
      </button>
      {onToggleSidebar && (
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon topbar-collapse-btn"
          onClick={onToggleSidebar}
          aria-label="Thu gọn / mở rộng menu"
          title="Thu gọn / mở rộng menu"
        >
          <PanelLeft size={16} />
        </button>
      )}

      {/* Ô tìm kiếm Topbar */}
      <div ref={searchContainerRef} className="topbar-search">
        <form onSubmit={handleSearchSubmit}>
          <div className="input-group">
            <span className="input-group-icon">
              <Search size={15} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              className="input"
              placeholder="Tìm khách, đơn, việc, phụ tùng…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              }}
              role="combobox"
              aria-expanded={searchFocused && q.length > 0}
              aria-controls="topbar-search-results"
              aria-activedescendant={searchFocused && q ? `search-opt-${active}` : undefined}
              autoComplete="off"
            />
            <kbd className="topbar-search-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </div>
        </form>

        {searchFocused && q && (
          <div className="topbar-search-dropdown" id="topbar-search-results" role="listbox">
            {options.map((o, i) => {
              const first = i === 0 || options[i - 1].group !== o.group;
              return (
                <div key={o.key}>
                  {first && <div className="search-group-label">{o.group}</div>}
                  <button
                    type="button"
                    id={`search-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="dropdown-item search-option"
                    data-active={i === active || undefined}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(o.href)}
                  >
                    {o.group === 'Tìm rộng hơn' ? <ListChecks size={15} /> : o.group === 'Đi tới' ? <PanelLeft size={15} /> : <Search size={15} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="search-option-title">{o.title}</span>
                      {o.sub && <span className="search-option-sub">{o.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
            {searching && <div className="search-group-label" style={{ textTransform: 'none' }}>Đang tìm…</div>}
            {!searching && q.length >= 2 && hits.length === 0 && (
              <div className="search-group-label" style={{ textTransform: 'none' }}>Không thấy kết quả khớp “{q}”</div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div ref={ref} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ThemeToggle />

        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => setOpenMenu((m) => (m === 'notif' ? null : 'notif'))}
            aria-label="Thông báo"
          >
            <Bell />
            {unreadCount > 0 && <span className="topbar-dot" />}
          </button>

          {openMenu === 'notif' && (
            <div className="dropdown" style={{ width: 'min(340px, calc(100vw - 24px))' }}>
              <div className="dropdown-head">
                <span>Thông báo</span>
                {unreadCount > 0 && <span className="badge badge-brand">{unreadCount} mới</span>}
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {notifications.length === 0 && (
                  <div className="hint" style={{ padding: '20px 14px', textAlign: 'center' }}>Chưa có thông báo nào</div>
                )}
                {notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.linkUrl || '#'}
                    className="dropdown-item"
                    style={{ alignItems: 'flex-start', background: n.readAt ? undefined : 'var(--brand-soft)' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 580, color: 'var(--text-strong)', fontSize: 13 }}>{n.title}</div>
                      <div className="hint truncate-2" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{fmtRelative(n.createdAt)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className="topbar-user" onClick={() => setOpenMenu((m) => (m === 'user' ? null : 'user'))}>
            <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
            <span className="topbar-user-text">
              <span className="topbar-user-name">{user.fullName}</span>
              <span className="topbar-user-role">{user.positionName || user.roleNames[0] || 'Nhân viên'}</span>
            </span>
            <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />
          </button>

          {openMenu === 'user' && (
            <div className="dropdown" style={{ width: 250 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 620, color: 'var(--text-strong)', fontSize: 13.5 }}>{user.fullName}</div>
                <div className="hint">@{user.username}</div>
                {user.departmentName && <div className="hint">{user.departmentName}</div>}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                  {user.roleNames.map((r) => <span key={r} className="badge badge-brand">{r}</span>)}
                </div>
              </div>
              <Link href="/profile" className="dropdown-item"><User size={15} /> Hồ sơ cá nhân</Link>
              <Link href="/profile#password" className="dropdown-item"><KeyRound size={15} /> Đổi mật khẩu</Link>
              <form action={logoutAction}>
                <button type="submit" className="dropdown-item" style={{ width: '100%', color: 'var(--danger)' }}>
                  <LogOut size={15} /> Đăng xuất
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
