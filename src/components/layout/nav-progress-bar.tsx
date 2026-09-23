'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Complete progress on route/searchParam change
  useEffect(() => {
    if (visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

      setProgress(100);
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global click interceptor for internal links to show instant feedback
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      // Ignore modified clicks or non-primary clicks
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target');

      // Only handle internal links that are not hash links or target="_blank"
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        (!targetAttr || targetAttr === '_self') &&
        !href.startsWith('#')
      ) {
        try {
          const url = new URL(href, window.location.origin);
          // If navigating to a different pathname or search
          if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

            setVisible(true);
            setProgress(30);

            // Trickle progress up to 85%
            timerRef.current = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 85) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  return prev;
                }
                const step = Math.random() * 12 + 6;
                return Math.min(prev + step, 85);
              });
            }, 120);

            // Safety timeout: auto-hide after 8 seconds if route fails or hangs
            safetyTimerRef.current = setTimeout(() => {
              setVisible(false);
              setProgress(0);
            }, 8000);
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    };

    document.addEventListener('click', handleAnchorClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleAnchorClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--brand, #2447eb) 0%, #38bdf8 100%)',
          boxShadow: '0 0 10px rgba(36, 71, 235, 0.6)',
          transition: progress === 100 ? 'width 0.12s ease-out, opacity 0.2s ease-out' : 'width 0.18s ease-out',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
