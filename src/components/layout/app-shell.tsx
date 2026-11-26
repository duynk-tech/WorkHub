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
}: {
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('workhub-sidebar') === 'collapsed');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('workhub-sidebar', next ? 'collapsed' : 'expanded');
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
          <main className="app-content animate-in">{children}</main>
        </div>
      </div>
      </PrintWatermarkProvider>
    </CurrentUserProvider>
  );
}
