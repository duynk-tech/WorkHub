'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; tone: ToastTone; message: string; title?: string }

interface ToastApi {
  show: (message: string, tone?: ToastTone, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 />, error: <XCircle />, warning: <AlertTriangle />, info: <Info />,
};
const COLORS: Record<ToastTone, string> = {
  success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const remove = React.useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const api = React.useMemo<ToastApi>(() => {
    const show = (message: string, tone: ToastTone = 'info', title?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, tone, message, title }]);
      setTimeout(() => remove(id), tone === 'error' ? 7000 : 4200);
    };
    return {
      show,
      success: (m, t) => show(m, 'success', t),
      error: (m, t) => show(m, 'error', t),
      warning: (m, t) => show(m, 'warning', t),
      info: (m, t) => show(m, 'info', t),
    };
  }, [remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 380 }}>
          {toasts.map((t) => (
            <div key={t.id} className="card animate-in" style={{ display: 'flex', gap: 10, padding: '12px 14px', boxShadow: 'var(--shadow-lg)', alignItems: 'flex-start' }}>
              <span style={{ color: COLORS[t.tone], display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <span style={{ width: 17, height: 17, display: 'block' }}>{ICONS[t.tone]}</span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {t.title && <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>{t.title}</div>}
                <div style={{ fontSize: 13, color: 'var(--text-base)', wordBreak: 'break-word' }}>{t.message}</div>
              </div>
              <button onClick={() => remove(t.id)} className="btn btn-ghost btn-sm btn-icon" aria-label="Đóng"><X /></button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
