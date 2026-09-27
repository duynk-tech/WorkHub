'use client';

import { useActionState, useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, LogIn, AlertCircle, CheckSquare, CalendarCheck, Clock3, GitBranch } from 'lucide-react';
import { loginAction, type ActionState } from '@/server/modules/auth/actions';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const HIGHLIGHTS = [
  { icon: CheckSquare, title: 'Giao việc & nhắc việc', desc: 'Theo dõi tiến độ, nhắc hạn tự động qua Zalo Bot' },
  { icon: CalendarCheck, title: 'Nghỉ phép có duyệt', desc: 'Quy trình duyệt nhiều bước cấu hình được theo phòng ban' },
  { icon: Clock3, title: 'Chấm công đa nguồn', desc: 'Check-in web, Zalo, import máy chấm công, HR điều chỉnh' },
  { icon: GitBranch, title: 'Phân quyền theo cây', desc: 'Phạm vi dữ liệu bám theo cấu trúc phòng ban phân cấp' },
];

export function LoginForm({ googleEnabled = false, ssoError,
  appName, logoUrl, logoText, appDescription, next,
}: {
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
  appDescription?: string;
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
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }} className="login-shell">
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}><ThemeToggle /></div>

      <div className="login-grid">
        {/* Cột thương hiệu */}
        <aside className="login-hero">
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                className={`login-logo ${logoUrl ? 'has-image' : ''}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  overflow: 'hidden',
                  flexShrink: 0,
                  ...(logoUrl
                    ? {
                        background: '#ffffff',
                        padding: 6,
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    : {}),
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  displayLogoLetter
                )}
              </div>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{appName}</span>
            </div>

            <div>
              <h2 style={{ color: '#fff', fontSize: 28, lineHeight: 1.25, marginBottom: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {appDescription ? appDescription : 'Công việc, nghỉ phép và chấm công trong một hệ thống'}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, maxWidth: 440, lineHeight: 1.55 }}>
                {appName} — Quản lý phòng ban phân cấp, quy trình duyệt linh hoạt và thông báo tức thời qua Zalo.
              </p>

              <div style={{ display: 'grid', gap: 14, marginTop: 30 }}>
                {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
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
              © {new Date().getFullYear()} {appName}. Tất cả quyền được bảo lưu.
            </div>
          </div>
        </aside>

        {/* Cột biểu mẫu */}
        <main className="login-panel">
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div className="login-logo-mobile">
              <div
                className={`login-logo ${logoUrl ? 'has-image' : ''}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  overflow: 'hidden',
                  flexShrink: 0,
                  ...(logoUrl
                    ? {
                        background: 'var(--surface-card, #ffffff)',
                        padding: 6,
                        border: '1px solid var(--border-base)',
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    : {}),
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  displayLogoLetter
                )}
              </div>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-strong)' }}>{appName}</span>
            </div>

            <h1 style={{ fontSize: 23, marginBottom: 6 }}>Đăng nhập</h1>
            <p className="page-desc" style={{ marginBottom: 24 }}>Đăng nhập vào hệ thống {appName}</p>

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
                    onClick={() => setShowPassword((v) => !v)}
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
