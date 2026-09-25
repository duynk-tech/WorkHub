'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StickyActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  isDirty?: boolean;
  dirtyMessage?: string;
  spacer?: boolean;
}

/**
 * StickyActionBar: Thanh công cụ hành động cố định dưới đáy màn hình.
 * - Cố định (sticky) khi trang hoặc modal cuộn dài.
 * - Phân định rõ: Nút nguy hiểm / phụ bên trái, nút hủy & nút chính (Primary) bên phải.
 * - Hỗ trợ thông báo trạng thái "Có thay đổi chưa lưu" (isDirty).
 */
export function StickyActionBar({
  children,
  leftActions,
  rightActions,
  isDirty,
  dirtyMessage = 'Có thay đổi chưa lưu',
  spacer = true,
  className,
  style,
  ...props
}: StickyActionBarProps) {
  return (
    <>
      {spacer && <div style={{ height: 60 }} aria-hidden="true" />}
      <div
        className={cn('sticky-action-bar', className)}
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          background: 'var(--surface-card)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(8px)',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          ...style,
        }}
        {...props}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isDirty && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 9999,
                background: 'var(--surface-subtle)',
                color: 'var(--text-strong)',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--primary)',
                }}
              />
              {dirtyMessage}
            </div>
          )}
          {leftActions}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {children}
          {rightActions}
        </div>
      </div>
    </>
  );
}
