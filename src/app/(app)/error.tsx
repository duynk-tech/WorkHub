'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: 'var(--surface-card, #ffffff)',
          border: '1px solid var(--border-base, #dcdfea)',
          borderRadius: 'var(--radius-lg, 14px)',
          padding: 28,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={26} />
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
          Đã xảy ra sự cố ngoài ý muốn
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted, #6b7280)', lineHeight: 1.6 }}>
          Trang này tạm thời gặp lỗi khi tải dữ liệu. Bạn có thể thử tải lại hoặc quay về trang tổng quan.
        </p>
        {error.digest && (
          <code
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--surface-sunken, #f3f4f6)',
              color: 'var(--text-muted, #6b7280)',
            }}
          >
            Mã lỗi: {error.digest}
          </code>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 9,
              border: 'none',
              background: 'var(--accent, #2563eb)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={15} />
            Thử lại
          </button>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 9,
              border: '1px solid var(--border-base, #dcdfea)',
              background: 'var(--surface-card, #ffffff)',
              color: 'var(--text-primary, #111827)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <Home size={15} />
            Trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
