'use client';

import { useState, useTransition, useEffect } from 'react';
import { LogIn, LogOut, MapPin, Clock } from 'lucide-react';
import { Card, CardBody, Button, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { checkInAction, checkOutAction } from '@/server/modules/attendance/actions';
import { ATTENDANCE_STATUS } from '@/lib/enums';

interface RecordView {
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  status: string;
}

function clock(iso: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function CheckinWidget({ record }: { record: RecordView | null }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const withPosition = (fn: (lat?: number, lng?: number) => Promise<{ ok: boolean; message: string }>) => {
    const run = (lat?: number, lng?: number) => {
      startTransition(async () => {
        const res = await fn(lat, lng);
        res.ok ? toast.success(res.message) : toast.error(res.message);
      });
    };
    if (!navigator.geolocation) return run();
    navigator.geolocation.getCurrentPosition(
      (pos) => run(pos.coords.latitude, pos.coords.longitude),
      () => run(),
      { timeout: 6000, enableHighAccuracy: false },
    );
  };

  const hasCheckIn = Boolean(record?.checkInAt);
  const hasCheckOut = Boolean(record?.checkOutAt);
  const statusMeta = record ? ATTENDANCE_STATUS[record.status] : null;

  return (
    <Card>
      <CardBody>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="card-title">Chấm công hôm nay</span>
              {statusMeta && hasCheckIn && (
                <Badge tone={statusMeta.tone as never} dot>{statusMeta.label}</Badge>
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-strong)' }} className="tnum">
              {now || '--:--:--'}
            </div>
            <div className="row" style={{ gap: 14, marginTop: 9 }}>
              <span className="hint"><LogIn size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />Vào: <b className="tnum">{clock(record?.checkInAt ?? null)}</b></span>
              <span className="hint"><LogOut size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />Ra: <b className="tnum">{clock(record?.checkOutAt ?? null)}</b></span>
              {record && record.lateMinutes > 0 && (
                <span className="hint" style={{ color: 'var(--warning)' }}>
                  <Clock size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />Muộn {record.lateMinutes} phút
                </span>
              )}
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            {!hasCheckIn && (
              <Button variant="primary" size="lg" loading={pending} onClick={() => withPosition(checkInAction)}>
                <LogIn /> Check-in
              </Button>
            )}
            {hasCheckIn && !hasCheckOut && (
              <Button variant="soft" size="lg" loading={pending} onClick={() => withPosition(checkOutAction)}>
                <LogOut /> Check-out
              </Button>
            )}
            {hasCheckIn && hasCheckOut && (
              <Badge tone="success" dot style={{ padding: '7px 13px', fontSize: 12.5 }}>Đã hoàn tất chấm công hôm nay</Badge>
            )}
          </div>
        </div>
        <div className="hint" style={{ marginTop: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
          <MapPin size={12} /> Vị trí được ghi nhận khi trình duyệt cho phép định vị.
        </div>
      </CardBody>
    </Card>
  );
}
