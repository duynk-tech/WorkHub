'use client';

import { useActionState, useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { loginAction, type ActionState } from '@/server/modules/auth/actions';
import { Button, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ui/theme-toggle';

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
      <div className="login-theme-toggle"><ThemeToggle /></div>

      <main className="login-card">
        <div className="login-brand">
          {logoUrl ? (
            <div className="login-brand-logo">
              <img src={logoUrl} alt={appName} />
            </div>
          ) : (
            <div className="login-brand-logo is-letter" aria-hidden="true">{displayLogoLetter}</div>
          )}
          <div className="login-brand-name">{appName}</div>
          <h1 className="login-form-title">Đăng nhập</h1>
          <p className="login-form-description">Đăng nhập để tiếp tục vào hệ thống {appName}</p>
        </div>

        {state.error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <AlertCircle />
            <div>{state.error}</div>
          </div>
        )}

        {ssoError && <p role="alert" className="alert alert-danger">Không thể đăng nhập Google. Hãy đăng nhập bằng mật khẩu, kiểm tra liên kết Google tại Hồ sơ cá nhân hoặc liên hệ quản trị viên.</p>}
        {googleEnabled && (
          <>
            <a className="btn btn-secondary" style={{ width: '100%' }} href={`/api/auth/google?next=${encodeURIComponent(next || '/dashboard')}`}>
              Đăng nhập bằng Google
            </a>
            <div className="login-divider">hoặc dùng tài khoản nội bộ</div>
          </>
        )}

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

        <p className="login-hint">
          Quên mật khẩu? Liên hệ quản trị viên hoặc phòng Nhân sự để được đặt lại.
        </p>
      </main>

      <footer className="login-footer">© {currentYear} {appName}. Tất cả quyền được bảo lưu.</footer>
    </div>
  );
}
