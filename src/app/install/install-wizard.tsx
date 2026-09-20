'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database, Building2, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Rocket,
} from 'lucide-react';
import { Button, Card, CardBody, Field, Input, Checkbox, Alert, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { runInstallAction } from '@/server/modules/setup/actions';

const STEPS = [
  { key: 'db', title: 'Kiểm tra database', icon: Database },
  { key: 'company', title: 'Thông tin công ty', icon: Building2 },
  { key: 'admin', title: 'Tài khoản quản trị', icon: ShieldCheck },
];

export function InstallWizard({
  databaseOk,
  databaseError,
  appName,
  logoUrl,
  logoText,
}: {
  databaseOk: boolean;
  databaseError?: string;
  appName: string;
  logoUrl?: string | null;
  logoText?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    companyName: '', companyShortName: '',
    adminFullName: '', adminUsername: 'admin', adminEmail: '', adminPassword: '', confirmPassword: '',
    withDemo: false,
  });

  const install = () => {
    if (form.adminPassword !== form.confirmPassword) {
      toast.error('Xác nhận mật khẩu không khớp');
      return;
    }
    startTransition(async () => {
      const res = await runInstallAction({
        companyName: form.companyName, companyShortName: form.companyShortName,
        adminFullName: form.adminFullName, adminUsername: form.adminUsername,
        adminEmail: form.adminEmail, adminPassword: form.adminPassword, withDemo: form.withDemo,
      });
      if (res.ok) { setDone(true); toast.success(res.message); }
      else toast.error(res.message);
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--surface-app)' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}><ThemeToggle /></div>

      <div style={{ width: '100%', maxWidth: 560 }}>
        <div className="row" style={{ gap: 11, justifyContent: 'center', marginBottom: 22 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={appName}
              className="login-logo"
              style={{ objectFit: 'contain', padding: 2 }}
            />
          ) : (
            <span className="login-logo">{logoText || appName.slice(0, 1).toUpperCase() || 'W'}</span>
          )}
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>{appName}</span>
        </div>

        {done ? (
          <Card>
            <CardBody style={{ textAlign: 'center', padding: 36 }}>
              <div style={{ display: 'grid', placeItems: 'center', width: 60, height: 60, borderRadius: 16, background: 'var(--success-soft)', color: 'var(--success)', margin: '0 auto 16px' }}>
                <CheckCircle2 size={30} />
              </div>
              <h2 style={{ marginBottom: 8 }}>Cài đặt hoàn tất</h2>
              <p className="page-desc" style={{ marginBottom: 22 }}>
                Hệ thống đã sẵn sàng. Bạn đã được đăng nhập bằng tài khoản quản trị vừa tạo.
              </p>
              <div className="stack" style={{ gap: 9, textAlign: 'left', marginBottom: 22 }}>
                {[
                  'Tạo cây phòng ban tại mục Phòng ban',
                  'Thêm nhân sự và cấp tài khoản đăng nhập',
                  'Kết nối Zalo Bot tại Cấu hình → Zalo Bot',
                  'Điều chỉnh quy trình duyệt nghỉ phép nếu cần',
                ].map((s, i) => (
                  <div key={i} className="row" style={{ gap: 9, fontSize: 13 }}>
                    <Badge tone="brand">{i + 1}</Badge>{s}
                  </div>
                ))}
              </div>
              <Button variant="primary" size="lg" block onClick={() => router.push('/dashboard')}>
                <Rocket /> Vào hệ thống
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody style={{ padding: 28 }}>
              {/* Chỉ báo bước */}
              <div className="row" style={{ gap: 0, marginBottom: 26 }}>
                {STEPS.map((s, i) => (
                  <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                        background: i <= step ? 'var(--brand)' : 'var(--surface-sunken)',
                        color: i <= step ? '#fff' : 'var(--text-faint)',
                        transition: 'all 0.2s var(--ease-out)',
                      }}>
                        <s.icon size={15} />
                      </div>
                      <span style={{ fontSize: 11, color: i <= step ? 'var(--text-strong)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                        {s.title}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: i < step ? 'var(--brand)' : 'var(--border-base)', margin: '0 6px 20px' }} />
                    )}
                  </div>
                ))}
              </div>

              {step === 0 && (
                <div className="stack" style={{ gap: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 18, marginBottom: 5 }}>Kiểm tra kết nối database</h2>
                    <p className="page-desc">Hệ thống dùng thông tin kết nối trong biến môi trường DATABASE_URL</p>
                  </div>

                  {databaseOk ? (
                    <Alert tone="success" icon={<CheckCircle2 />}>
                      <b>Kết nối MySQL thành công.</b> Cấu trúc bảng đã sẵn sàng để nạp dữ liệu khởi tạo.
                    </Alert>
                  ) : (
                    <Alert tone="danger" icon={<AlertTriangle />}>
                      <b>Không kết nối được database.</b>
                      <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{databaseError}</div>
                      <div style={{ marginTop: 8 }}>
                        Kiểm tra DATABASE_URL trong file .env, hoặc chạy <code>npm run setup</code> ở terminal để cấu hình lại.
                      </div>
                    </Alert>
                  )}

                  <Button variant="primary" block disabled={!databaseOk} onClick={() => setStep(1)}>
                    Tiếp tục <ArrowRight />
                  </Button>
                </div>
              )}

              {step === 1 && (
                <div className="stack" style={{ gap: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 18, marginBottom: 5 }}>Thông tin công ty</h2>
                    <p className="page-desc">Hiển thị trên giao diện và các báo cáo xuất ra</p>
                  </div>

                  <Field label="Tên công ty" required>
                    <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Công ty TNHH ABC" autoFocus />
                  </Field>
                  <Field label="Tên viết tắt" hint="Hiển thị ở góc trên sidebar">
                    <Input value={form.companyShortName} onChange={(e) => setForm((f) => ({ ...f, companyShortName: e.target.value }))} placeholder="ABC" />
                  </Field>

                  <label className="row" style={{ gap: 9, fontSize: 13, alignItems: 'flex-start' }}>
                    <Checkbox checked={form.withDemo} onChange={(e) => setForm((f) => ({ ...f, withDemo: e.target.checked }))} />
                    <div>
                      <div style={{ fontWeight: 540 }}>Nạp dữ liệu demo</div>
                      <div className="hint">Cây phòng ban 3 cấp, 14 nhân sự mẫu và một số công việc để dùng thử (mật khẩu: Workhub@123)</div>
                    </div>
                  </label>

                  <div className="row" style={{ gap: 9 }}>
                    <Button variant="secondary" onClick={() => setStep(0)}><ArrowLeft /> Quay lại</Button>
                    <Button variant="primary" style={{ flex: 1 }} disabled={!form.companyName.trim()} onClick={() => setStep(2)}>
                      Tiếp tục <ArrowRight />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="stack" style={{ gap: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 18, marginBottom: 5 }}>Tài khoản quản trị</h2>
                    <p className="page-desc">Tài khoản này có toàn quyền trên hệ thống</p>
                  </div>

                  <Field label="Họ và tên" required>
                    <Input value={form.adminFullName} onChange={(e) => setForm((f) => ({ ...f, adminFullName: e.target.value }))} placeholder="Nguyễn Văn A" autoFocus />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Tên đăng nhập" required>
                      <Input value={form.adminUsername} onChange={(e) => setForm((f) => ({ ...f, adminUsername: e.target.value.toLowerCase() }))} />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={form.adminEmail} onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))} />
                    </Field>
                    <Field label="Mật khẩu" required hint="Tối thiểu 8 ký tự, gồm chữ và số">
                      <Input type="password" value={form.adminPassword} onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))} />
                    </Field>
                    <Field label="Xác nhận mật khẩu" required>
                      <Input type="password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
                    </Field>
                  </div>

                  <div className="row" style={{ gap: 9 }}>
                    <Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft /> Quay lại</Button>
                    <Button
                      variant="primary" style={{ flex: 1 }} loading={pending}
                      disabled={!form.adminFullName.trim() || !form.adminPassword}
                      onClick={install}
                    >
                      <Rocket /> Hoàn tất cài đặt
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
          Trình cài đặt chỉ chạy được khi hệ thống chưa có tài khoản nào.
        </p>
      </div>
    </div>
  );
}
