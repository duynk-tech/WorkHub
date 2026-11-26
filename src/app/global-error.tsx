'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 28,
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700 }}>
            Hệ thống tạm gián đoạn
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
            Đã có lỗi nghiêm trọng xảy ra trong quá trình hiển thị. Vui lòng thử tải lại trang.
          </p>
          {error.digest && (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8' }}>
              Mã lỗi: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tải lại trang
          </button>
        </div>
      </body>
    </html>
  );
}
