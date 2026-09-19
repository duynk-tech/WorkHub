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

export function LoginForm({ appName, next }: { appName: string; next?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) {
      passwordRef.current?.focus();
    }
  }, [state.error]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }} className="login-shell">
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}><ThemeToggle /></div>

      <div className="login-grid">
        {/* Cột thương hiệu */}
        <aside className="login-hero">
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="login-logo">W</div>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{appName}</span>
            </div>

            <div>
              <h2 style={{ color: '#fff', fontSize: 27, lineHeight: 1.25, marginBottom: 12, fontWeight: 680 }}>
                Công việc, nghỉ phép và chấm công<br />trong một hệ thống
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, maxWidth: 400 }}>
                Quản lý phòng ban phân cấp, quy trình duyệt linh hoạt và thông báo tức thời qua Zalo.
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

            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              © {new Date().getFullYear()} {appName}
            </div>
          </div>
        </aside>

        {/* Cột biểu mẫu */}
        <main className="login-panel">
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div className="login-logo-mobile">
              <div className="login-logo" style={{ width: 40, height: 40, fontSize: 18 }}>W</div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{appName}</span>
            </div>

            <h1 style={{ fontSize: 23, marginBottom: 6 }}>Đăng nhập</h1>
            <p className="page-desc" style={{ marginBottom: 24 }}>Nhập tài khoản được cấp để vào hệ thống</p>

            {state.error && (
              <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                <AlertCircle />
                <div>{state.error}</div>
              </div>
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
