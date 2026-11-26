'use client';

import { useActionState, useState, useRef, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  ShoppingCart,
  Boxes,
  Wrench,
  Users,
} from 'lucide-react';
import { loginAction, type ActionState } from '@/server/modules/auth/actions';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const HIGHLIGHTS = [
  {
    icon: ShoppingCart,
    title: 'Kinh doanh & Bán hàng',
    desc: 'Báo giá, đơn hàng, chính sách giá margin và công nợ khách hàng',
  },
  {
    icon: Boxes,
    title: 'Kho vận & Phụ tùng',
    desc: 'Quản lý kho trung tâm, kho chi nhánh, tồn kho và mua hàng NCC',
  },
  {
    icon: Wrench,
    title: 'Thiết bị & Dịch vụ kỹ thuật',
    desc: 'Theo dõi máy tại khách, bảo hành, phiếu bàn giao và sửa chữa bảo trì',
  },
  {
    icon: Users,
    title: 'Nhân sự & Vận hành',
    desc: 'Quản lý công việc, quy trình xét duyệt nhiều cấp, chấm công và nghỉ phép',
  },
];

export function LoginForm({ googleEnabled = false, ssoError,
  appName, logoUrl, logoText, appDescription, next,
  currentYear,
}: {
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
  appDescription?: string;
  currentYear: number;
  next?: string;
  googleEnabled?: boolean;
  ssoError?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) {
      passwordRef.current?.focus();
    }
  }, [state.error]);

  const displayLogoLetter = logoText?.trim() || appName.slice(0, 1).toUpperCase() || 'W';

  return (
    <div className="login-shell">
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}><ThemeToggle /></div>

      <div className="login-grid">
        {/* Cột thương hiệu */}
        <aside className="login-hero">
          <div className="login-watermark" aria-hidden="true">
            <div className="login-watermark-mark">
              {logoUrl ? <img src={logoUrl} alt="" /> : <span>{displayLogoLetter}</span>}
            </div>
          </div>
          <div className="login-hero-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {logoUrl ? (
                <div className="login-hero-logo-box">
                  <img src={logoUrl} alt={appName} />
                </div>
              ) : (
                <div className="login-logo" style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }}>
                  {displayLogoLetter}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  {appName}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.65)' }}>
                  Operations console
                </span>
              </div>
            </div>

            <div className="login-hero-copy">
              <h2 className="login-hero-title">
                {appDescription || 'Quản trị kinh doanh, thiết bị, kho vận và công việc'}
              </h2>
              <p className="login-hero-description">
                {appName} — Nền tảng hợp nhất quản trị bán hàng, theo dõi thiết bị khách hàng, quản lý kho linh kiện và vận hành doanh nghiệp.
              </p>

              <div className="login-feature-list">
                {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="login-feature">
                    <span className="login-feature-icon"><Icon size={16} /></span>
                    <div>
                      <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>{title}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              © {currentYear} {appName}. Tất cả quyền được bảo lưu.
            </div>
          </div>
        </aside>

        {/* Cột biểu mẫu */}
        <main className="login-panel">
          <div className="login-form-card">
            <div className="login-card-brand">
              {logoUrl ? (
                <div className="login-card-logo-box">
                  <img src={logoUrl} alt={appName} />
                </div>
              ) : (
                <div className="login-logo" style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0 }}>
                  {displayLogoLetter}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}>{appName}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Operations console</span>
              </div>
            </div>

            <div className="login-eyebrow">CỔNG THÔNG TIN NỘI BỘ</div>
            <h1 className="login-form-title">Đăng nhập</h1>
            <p className="page-desc login-form-description">Đăng nhập vào hệ thống {appName}</p>

            {state.error && (
              <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                <AlertCircle />
                <div>{state.error}</div>
              </div>
            )}

            {ssoError && <p role="alert" className="alert alert-danger">Không thể đăng nhập Google. Hãy đăng nhập bằng mật khẩu, kiểm tra liên kết Google tại Hồ sơ cá nhân hoặc liên hệ quản trị viên.</p>}
            {googleEnabled && <a className="btn btn-secondary" style={{ width: '100%', marginBottom: 16 }} href={`/api/auth/google?next=${encodeURIComponent(next || '/dashboard')}`}>Đăng nhập bằng Google</a>}

            <form action={formAction} style={{ display: 'grid', gap: 15 }}>
              <input type="hidden" name="next" value={next ?? '/dashboard'} />

              <Field label="Tên đăng nhập" required>
                <Input
                  name="username"
                  autoComplete="username"
                  autoFocus
                  placeholder="vd: dungtq"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>

              <Field label="Mật khẩu" required>
                <div style={{ position: 'relative' }}>
                  <Input
                    ref={passwordRef}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v: boolean) => !v)}
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ position: 'absolute', right: 3, top: 3 }}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </Field>

              <Button type="submit" variant="primary" size="lg" block loading={pending}>
                {!pending && <LogIn />}
                Đăng nhập
              </Button>
            </form>

            <p className="hint" style={{ marginTop: 20, textAlign: 'center' }}>
              Quên mật khẩu? Liên hệ quản trị viên hoặc phòng Nhân sự để được đặt lại.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
