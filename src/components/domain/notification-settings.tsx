'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell, BellOff, Mail, MessageCircle, Smartphone, Send } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody, Button, Switch } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  saveNotifyPrefsAction, subscribePushAction, unsubscribePushAction, sendTestNotificationAction,
} from '@/server/modules/notify/actions';
import type { NotifyPrefs } from '@/server/modules/notify/prefs';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on' | 'loading';

/** Thẻ "Thông báo" ở trang Hồ sơ: bật đẩy trên thiết bị này, chọn kênh nhận, gửi thử. */
export function NotificationSettings({
  initialPrefs, vapidKey, emailReady, hasEmail,
}: {
  initialPrefs: NotifyPrefs;
  vapidKey: string | null;
  emailReady: boolean;
  hasEmail: boolean;
}) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [push, setPush] = useState<PushState>('loading');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setPush('unsupported');
    if (!vapidKey) return setPush('unconfigured');
    if (Notification.permission === 'denied') return setPush('denied');
    navigator.serviceWorker.getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setPush(sub ? 'on' : 'off'))
      .catch(() => setPush('off'));
  }, [vapidKey]);

  const togglePref = (key: keyof NotifyPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    startTransition(async () => {
      const r = await saveNotifyPrefsAction(next);
      if (!r.ok) toast.error(r.message);
    });
  };

  const enablePush = () => startTransition(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPush(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
      const r = await subscribePushAction(sub.toJSON(), navigator.userAgent);
      if (r.ok) { setPush('on'); toast.success(r.message); } else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không bật được thông báo');
    }
  });

  const disablePush = () => startTransition(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await unsubscribePushAction(sub.endpoint);
      await sub.unsubscribe().catch(() => {});
    }
    setPush('off');
    toast.success('Đã tắt thông báo trên thiết bị này');
  });

  const sendTest = () => startTransition(async () => {
    const r = await sendTestNotificationAction();
    if (r.ok) toast.success(r.message); else toast.error(r.message);
  });

  const pushHint: Record<PushState, string> = {
    loading: 'Đang kiểm tra…',
    unsupported: 'Trình duyệt này chưa hỗ trợ. Trên iPhone, hãy "Thêm vào MH chính" rồi mở từ biểu tượng app.',
    unconfigured: 'Quản trị viên chưa cấu hình khoá VAPID trên máy chủ.',
    denied: 'Bạn đã chặn thông báo — mở cài đặt trang của trình duyệt để cho phép lại.',
    off: 'Nhận thông báo ngay cả khi đã đóng tab.',
    on: 'Thiết bị này đang nhận thông báo đẩy.',
  };

  const Row = ({ icon, label, hint, checked, onChange, disabled }: {
    icon: React.ReactNode; label: string; hint: string; checked: boolean; onChange: () => void; disabled?: boolean;
  }) => (
    <label className="row-between" style={{ gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-subtle)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span className="row" style={{ gap: 10, minWidth: 0 }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>{label}</span>
          <span className="hint">{hint}</span>
        </span>
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled || pending} />
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Thông báo</CardTitle>
          <div className="card-subtitle">Chọn nơi bạn muốn nhận nhắc việc, phê duyệt và cảnh báo</div>
        </div>
        <Button size="sm" variant="ghost" onClick={sendTest} disabled={pending}><Send size={14} /> Gửi thử</Button>
      </CardHeader>
      <CardBody style={{ paddingTop: 6 }}>
        <div className="row-between" style={{ gap: 12, padding: '10px 0' }}>
          <span className="row" style={{ gap: 10, minWidth: 0 }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Smartphone size={18} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>Thông báo đẩy trên thiết bị này</span>
              <span className="hint">{pushHint[push]}</span>
            </span>
          </span>
          {push === 'on' ? (
            <Button size="sm" variant="secondary" onClick={disablePush} disabled={pending}><BellOff size={14} /> Tắt</Button>
          ) : (
            <Button size="sm" variant="primary" onClick={enablePush} disabled={pending || push !== 'off'}><Bell size={14} /> Bật</Button>
          )}
        </div>
        <Row icon={<Bell size={18} />} label="Đẩy tới các thiết bị đã bật" hint="Áp dụng cho mọi máy bạn đã bật ở trên" checked={prefs.push} onChange={() => togglePref('push')} />
        <Row
          icon={<Mail size={18} />}
          label="Email"
          hint={!emailReady ? 'Máy chủ chưa cấu hình gửi email' : hasEmail ? 'Gửi tới email trong hồ sơ của bạn' : 'Hồ sơ chưa có email — cập nhật ở mục Liên hệ'}
          checked={prefs.email}
          onChange={() => togglePref('email')}
          disabled={!emailReady}
        />
        <Row icon={<MessageCircle size={18} />} label="Zalo" hint="Cần liên kết Zalo ở thẻ bên dưới" checked={prefs.zalo} onChange={() => togglePref('zalo')} />
      </CardBody>
    </Card>
  );
}
