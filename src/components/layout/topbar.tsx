'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  Menu, PanelLeft, Bell, LogOut, User, KeyRound, ChevronDown,
  Search, ListChecks, Users, CalendarDays,
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
  user, notifications, unreadCount, onOpenMobileMenu, onToggleSidebar,
}: {
  user: TopbarUser;
  notifications: TopbarNotification[];
  unreadCount: number;
  onOpenMobileMenu: () => void;
  onToggleSidebar?: () => void;
}) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<'user' | 'notif' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

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
    setSearchFocused(false);
    router.push(`/tasks?q=${encodeURIComponent(searchQuery.trim())}`);
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
              placeholder="Tìm kiếm công việc, nhân sự…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
            />
            <kbd className="topbar-search-kbd">⌘K</kbd>
          </div>
        </form>

        {searchFocused && searchQuery.trim() && (
          <div className="topbar-search-dropdown">
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 650, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tìm kiếm nhanh
            </div>
            <button
              type="button"
              className="dropdown-item"
              style={{ width: '100%' }}
              onClick={() => {
                setSearchFocused(false);
                router.push(`/tasks?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
            >
              <ListChecks size={15} style={{ color: 'var(--brand)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>Tìm trong <strong>Công việc</strong>: &ldquo;{searchQuery.trim()}&rdquo;</span>
              </div>
            </button>
            <button
              type="button"
              className="dropdown-item"
              style={{ width: '100%' }}
              onClick={() => {
                setSearchFocused(false);
                router.push(`/employees?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
            >
              <Users size={15} style={{ color: 'var(--success)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>Tìm trong <strong>Nhân sự</strong>: &ldquo;{searchQuery.trim()}&rdquo;</span>
              </div>
            </button>
            <button
              type="button"
              className="dropdown-item"
              style={{ width: '100%' }}
              onClick={() => {
                setSearchFocused(false);
                router.push(`/leaves?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
            >
              <CalendarDays size={15} style={{ color: 'var(--warning)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>Tìm trong <strong>Nghỉ phép</strong>: &ldquo;{searchQuery.trim()}&rdquo;</span>
              </div>
            </button>
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
            <div className="dropdown" style={{ width: 340 }}>
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
