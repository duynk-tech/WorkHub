'use client';
import { useActionState } from 'react';
import { linkGoogleAction, unlinkGoogleAction } from '@/server/auth/google/actions';
import { Card, CardHeader, CardTitle, CardBody, Field, Input, Button } from '@/components/ui';
export function GoogleAccount({ email, enabled, result }: { email: string | null; enabled: boolean; result?: string }) {
  const [state, action, pending] = useActionState(email ? unlinkGoogleAction : linkGoogleAction, {});
  if (!enabled && !email) return null;
  return <Card><CardHeader><CardTitle>Tài khoản Google</CardTitle></CardHeader><CardBody>
    <p>{email ? `Đã liên kết: ${email}` : 'Xác nhận mật khẩu WorkHub để liên kết Google. Sau đó bạn có thể đăng nhập bằng Google.'}</p>
    {result === 'linked' && <p role="status">Đã liên kết Google thành công.</p>}
    {result === 'failed' && <p role="alert">Không thể liên kết. Kiểm tra tài khoản Google và thử lại.</p>}
    <form action={action} className="stack" style={{ maxWidth: 420, marginTop: 12 }}>
      <Field label="Mật khẩu hiện tại"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <Button type="submit" loading={pending}>{email ? 'Hủy liên kết Google' : 'Liên kết Google'}</Button>
    </form>
  </CardBody></Card>;
}
