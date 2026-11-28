'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import type { NavSection } from '@/lib/nav';
import { Sidebar } from './sidebar';
import { Topbar, type TopbarUser, type TopbarNotification } from './topbar';
import { NavigationProgressBar } from './nav-progress-bar';
import { CurrentUserProvider } from './current-user';
import { PrintWatermarkProvider } from './print-watermark-context';
import { AiChatWidget } from './ai-chat-widget';
import type { PrintWatermarkConfig } from '@/server/modules/settings/branding';

export function AppShell({
  appName, logoUrl, logoText, printWatermark, sections, badges, user, notifications, unreadCount, children,
  initialCollapsed = false,
}: {
  /** Đọc từ cookie ở server để lần vẽ đầu đã đúng trạng thái — sidebar không giật khi tải trang. */
  initialCollapsed?: boolean;
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
  printWatermark?: PrintWatermarkConfig | null;
  sections: NavSection[];
  badges: Record<string, number>;
  user: TopbarUser;
  notifications: TopbarNotification[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const live = useLiveShell({ badges, notifications, unreadCount });

  // Service worker: cài app lên màn hình chính (PWA) và nhận thông báo đẩy
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const persist = (next: boolean) => {
    const value = next ? 'collapsed' : 'expanded';
    localStorage.setItem('workhub-sidebar', value);
    document.cookie = `workhub-sidebar=${value}; path=/; max-age=31536000; samesite=lax`;
  };

  // Lần đầu sau khi nâng cấp: chuyển lựa chọn cũ trong localStorage sang cookie
  useEffect(() => {
    if (document.cookie.includes('workhub-sidebar=')) return;
    const saved = localStorage.getItem('workhub-sidebar') === 'collapsed';
    persist(saved);
    if (saved !== initialCollapsed) setCollapsed(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      persist(next);
      return next;
    });
  };

  return (
    <CurrentUserProvider user={user}>
      <PrintWatermarkProvider value={printWatermark}>
        <div className="app-shell">
        <NavigationProgressBar />
        <AiChatWidget />
        <Sidebar
          sections={sections}
          appName={appName}
          logoUrl={logoUrl}
          logoText={logoText}
          badges={live.badges}
          user={user}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="app-main" data-collapsed={collapsed}>
          <Topbar
            user={user}
            notifications={live.notifications}
            unreadCount={live.unreadCount}
            onOpenMobileMenu={() => setMobileOpen(true)}
            onToggleSidebar={toggleCollapsed}
          />
          <main className="app-content">{children}</main>
        </div>
      </div>
      </PrintWatermarkProvider>
    </CurrentUserProvider>
  );
}

type LiveState = { badges: Record<string, number>; notifications: TopbarNotification[]; unreadCount: number };
const LIVE_INTERVAL_MS = 30_000;

/**
 * Chuông + badge menu tự cập nhật: hỏi máy chủ mỗi 30 giây khi tab đang hiện,
 * và hỏi ngay khi người dùng quay lại tab. Có thông báo mới thì hiện toast.
 * Dữ liệu ban đầu vẫn đến từ layout (server), nên lần tải đầu không chờ fetch.
 */
function useLiveShell(initial: LiveState): LiveState {
  const [state, setState] = useState(initial);
  const toast = useToast();
  const lastTopId = useRef(initial.notifications[0]?.id ?? 0);

  // Layout render lại (router.refresh, điều hướng) thì nhận số mới từ server
  useEffect(() => {
    setState(initial);
    lastTopId.current = Math.max(lastTopId.current, initial.notifications[0]?.id ?? 0);
  }, [initial.unreadCount, initial.notifications[0]?.id, initial.badges.pendingApprovals, initial.badges.myTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/notifications/live', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as LiveState;
        const notifications = data.notifications.map((n) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          readAt: n.readAt ? new Date(n.readAt) : null,
        }));
        const fresh = notifications.filter((n) => n.id > lastTopId.current && !n.readAt);
        if (fresh.length && lastTopId.current > 0) {
          toast.info(fresh.length === 1 ? fresh[0].title : `Bạn có ${fresh.length} thông báo mới`);
        }
        lastTopId.current = Math.max(lastTopId.current, notifications[0]?.id ?? 0);
        if (!stopped) setState({ badges: data.badges, notifications, unreadCount: data.unreadCount });
      } catch {
        /* mất mạng tạm thời — lượt sau thử lại */
      }
    };

    const schedule = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, LIVE_INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') { void tick(); schedule(); }
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [toast]);

  return state;
}
