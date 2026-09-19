'use client';

import { useState, useEffect } from 'react';
import type { NavSection } from '@/lib/nav';
import { Sidebar } from './sidebar';
import { Topbar, type TopbarUser, type TopbarNotification } from './topbar';

export function AppShell({
  appName, sections, badges, user, notifications, unreadCount, children,
}: {
  appName: string;
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
    <div className="app-shell">
      <Sidebar
        sections={sections}
        appName={appName}
        badges={badges}
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
        />
        <main className="app-content animate-in">{children}</main>
      </div>
    </div>
  );
}
