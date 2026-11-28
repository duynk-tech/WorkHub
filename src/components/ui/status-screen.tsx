import type { ReactNode } from 'react';

/**
 * Màn trạng thái toàn trang (404, lỗi hệ thống, mất quyền) theo AuthCard của fmp-web:
 * card giữa màn, logo thương hiệu, ô icon, tiêu đề lớn, lời giải thích dễ hiểu,
 * mã lỗi để gửi hỗ trợ và các nút thao tác.
 */
export function StatusScreen({
  icon,
  tone = 'neutral',
  eyebrow,
  title,
  description,
  code,
  brand,
  alert,
  fullPage = true,
  children,
}: {
  icon: ReactNode;
  tone?: 'neutral' | 'danger' | 'warning';
  /** Dòng nhỏ phía trên tiêu đề, vd. "Lỗi 404". */
  eyebrow?: string;
  title: string;
  description: ReactNode;
  /** Mã ngắn cho bộ phận hỗ trợ — không bao giờ là thông báo lỗi thô. */
  code?: string;
  brand?: { name: string; logoUrl?: string | null; logoText?: string };
  /** Màn lỗi: đọc ngay cho trình đọc màn hình. */
  alert?: boolean;
  /** false khi nằm trong khung app (đã có sidebar/topbar). */
  fullPage?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="status-screen" data-full-page={fullPage || undefined}>
      <section className="status-card" role={alert ? 'alert' : undefined} aria-labelledby="status-title">
        {brand && (
          <div className="status-brand" translate="no">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="status-brand-logo" />
            ) : (
              <span className="login-logo" style={{ width: 32, height: 32, fontSize: 14, boxShadow: 'none' }}>
                {brand.logoText || brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="status-brand-name">{brand.name}</span>
          </div>
        )}
        <span className="status-icon" data-tone={tone} aria-hidden>{icon}</span>
        <div className="status-text">
          {eyebrow && <p className="status-eyebrow">{eyebrow}</p>}
          <h1 id="status-title" className="status-title">{title}</h1>
          <p className="status-desc">{description}</p>
          {code && (
            <p className="status-code">
              Mã lỗi · <span translate="no">{code}</span>
            </p>
          )}
        </div>
        {children && <div className="status-actions">{children}</div>}
      </section>
    </main>
  );
}
