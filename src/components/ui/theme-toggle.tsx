'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

export function applyTheme(theme: Theme) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem('workhub-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('system');

  React.useEffect(() => {
    const saved = (localStorage.getItem('workhub-theme') as Theme) || 'system';
    setTheme(saved);
  }, []);

  const cycle = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
    applyTheme(next);
  };

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Theo hệ thống';

  return (
    <button className="btn btn-ghost btn-sm btn-icon tooltip-host" onClick={cycle} aria-label={`Giao diện: ${label}`}>
      <Icon />
      <span className="tooltip tooltip-bottom">Giao diện: {label}</span>
    </button>
  );
}

/** Script chặn nhấp nháy theme trước khi React hydrate */
export const themeScript = `
(function(){try{var t=localStorage.getItem('workhub-theme')||'system';
var d=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
document.documentElement.dataset.theme=d;}catch(e){}})();
`;
