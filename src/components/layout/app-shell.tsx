'use client';

import { useState, useEffect } from 'react';
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
          badges={badges}
          user={user}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="app-main" data-collapsed={collapsed}>
          <Topbar
            user={user}
            notifications={notifications}
            unreadCount={unreadCount}
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
