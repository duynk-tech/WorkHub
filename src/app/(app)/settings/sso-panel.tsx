'use client';
import { Card, CardHeader, CardTitle, CardBody, Field, Input, Switch, Button } from '@/components/ui';
export function SsoPanel({ values, set, save, pending, callbackUrl }: {
  values: Record<string, unknown>; set: (key: string, value: unknown) => void;
  save: (group: string, keys: string[]) => void; pending: boolean; callbackUrl: string;
}) {
  const keys = ['sso.google.enabled', 'sso.google.clientId', 'sso.google.clientSecret', 'sso.google.domains'];
  return <Card><CardHeader><CardTitle>Google SSO</CardTitle><Button loading={pending} onClick={() => save('sso', keys)}>Lưu</Button></CardHeader><CardBody>
    <div className="stack" style={{ maxWidth: 640 }}>
      <label className="row" style={{ gap: 10 }}><Switch checked={values[keys[0]] === true} onChange={(e) => set(keys[0], e.target.checked)} />Đăng nhập bằng Google</label>
      <Field label="Client ID"><Input value={String(values[keys[1]] ?? '')} onChange={(e) => set(keys[1], e.target.value)} autoComplete="off" /></Field>
      <Field label="Client Secret" hint="Được mã hóa khi lưu. Giữ nguyên dấu sao nếu không đổi secret."><Input type="password" value={String(values[keys[2]] ?? '')} onChange={(e) => set(keys[2], e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Miền Workspace" hint="Phân cách bằng dấu phẩy. Để trống để không giới hạn miền."><Input placeholder="company.vn" value={String(values[keys[3]] ?? '')} onChange={(e) => set(keys[3], e.target.value)} /></Field>
      <Field label="Callback URL" hint="Khai báo đúng URL này trong Google Cloud → OAuth client → Authorized redirect URIs."><Input value={callbackUrl} readOnly onFocus={(e) => e.target.select()} /></Field>
      <p className="hint">Tạo OAuth client loại Web application trong Google Cloud. Người dùng liên kết Google tại Hồ sơ cá nhân bằng mật khẩu WorkHub. SSO không tự tạo tài khoản hoặc cấp quyền.</p>
      <a href="/api/auth/google?next=%2Fsettings%3Ftab%3Dsso" className="btn btn-secondary">Thử đăng nhập Google</a>
    </div>
  </CardBody></Card>;
}
