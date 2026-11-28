'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './index';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  children: React.ReactNode;
  closeOnOverlay?: boolean;
  zIndex?: number;
  className?: string;
  overlayClassName?: string;
}

/** Các modal đang mở, theo thứ tự — Escape chỉ đóng cái trên cùng. */
const modalStack: symbol[] = [];
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EXIT_MS = 140;

export function Modal({ open, onClose, title, description, size = 'md', footer, children, closeOnOverlay = true, zIndex, className, overlayClassName }: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  // Giữ modal thêm một nhịp sau khi đóng để chạy hiệu ứng thoát
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = React.useId();

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const t = window.setTimeout(() => { setRendered(false); setClosing(false); }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    const restoreTo = document.activeElement as HTMLElement | null;

    // Focus vào ô nhập đầu tiên (hoặc chính hộp thoại) để bàn phím dùng được ngay
    const raf = requestAnimationFrame(() => {
      const el = dialogRef.current;
      if (!el || el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>('.modal-body ' + FOCUSABLE.split(', ').join(', .modal-body '));
      (first ?? el).focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Bẫy focus: Tab không thoát ra trang phía sau
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.style.overflow = prev;
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus({ preventScroll: true });
    };
  }, [open]);

  if (!mounted || !rendered) return null;

  return createPortal(
    <div
      className={cn('modal-overlay', overlayClassName)}
      data-closing={closing || undefined}
      style={zIndex === undefined ? undefined : { zIndex }}
      onMouseDown={(e) => { if (!closing && closeOnOverlay && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className={cn('modal', size !== 'md' && `modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {(title || description) && (
          <div className="modal-header">
            <div style={{ minWidth: 0 }}>
              {title && <h3 id={titleId} className="modal-title">{title}</h3>}
              {description && <p className="card-subtitle">{description}</p>}
            </div>
            <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Đóng"><X /></Button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmText = 'Xác nhận', cancelText = 'Hủy', danger, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: React.ReactNode; confirmText?: string; cancelText?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmText}</Button>
        </>
      }
    >
      <div style={{ color: 'var(--text-base)', fontSize: 13.5 }}>{message}</div>
    </Modal>
  );
}
