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

export function Modal({ open, onClose, title, description, size = 'md', footer, children, closeOnOverlay = true, zIndex, className, overlayClassName }: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn('modal-overlay', overlayClassName)}
      style={zIndex === undefined ? undefined : { zIndex }}
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose(); }}
    >
      <div className={cn('modal', size !== 'md' && `modal-${size}`, className)} role="dialog" aria-modal="true">
        {(title || description) && (
          <div className="modal-header">
            <div>
              {title && <h3 style={{ fontSize: 16 }}>{title}</h3>}
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
