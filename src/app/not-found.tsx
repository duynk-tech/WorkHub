import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: 'var(--surface-card, #ffffff)',
          border: '1px solid var(--border-base, #dcdfea)',
          borderRadius: 'var(--radius-lg, 14px)',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--accent, #2563eb)', lineHeight: 1 }}>
          404
        </div>
        <h1 style={{ margin: '12px 0 8px', fontSize: 19, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
          Không tìm thấy trang
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted, #6b7280)', lineHeight: 1.6 }}>
          Đường dẫn bạn truy cập không tồn tại hoặc bạn không có quyền xem nội dung này.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 18px',
            borderRadius: 9,
            background: 'var(--accent, #2563eb)',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Về trang tổng quan
        </Link>
      </div>
    </div>
  );
}
