'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, KeyRound, Copy, Unlink, CheckCircle2, Building2, User, Clock,
  Briefcase, Mail, Phone, CalendarDays, AlertCircle,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Avatar, Field, Input, StatCard,
  PageHeader, Alert, Divider,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { EMPLOYMENT_TYPE } from '@/lib/enums';
import { changePasswordAction, type ActionState } from '@/server/modules/auth/actions';
import { requestZaloLinkCodeAction, unlinkZaloAction } from '@/server/modules/settings/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ProfileScreen({
  employee, user, balance, stats, zaloLinked,
}: {
  employee: any;
  user: { username: string; roleNames: string[] };
  balance: { remaining: number; used: number; pending: number; year: number };
  stats: { openTasks: number; doneTasks: number; approvedLeaves: number };
  zaloLinked: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [pwState, pwAction, pwPending] = useActionState<ActionState, FormData>(changePasswordAction, {});

  const getCode = () => {
    startTransition(async () => {
      const res = await requestZaloLinkCodeAction();
      if (res.ok && res.code) { setLinkCode(res.code); toast.success(res.message); }
      else toast.error(res.message);
    });
  };

  const unlink = () => {
    startTransition(async () => {
      const res = await unlinkZaloAction();
      res.ok ? toast.success(res.message) : toast.error(res.message);
      setLinkCode(null);
      router.refresh();
    });
  };

  return (
    <div className="stack">
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin nhân sự, liên kết Zalo và bảo mật tài khoản" />

      <Card>
        <CardBody>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Avatar name={employee.fullName} src={employee.avatarUrl} size="lg" className="profile-avatar" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ fontSize: 19 }}>{employee.fullName}</h2>
              <div className="hint">@{user.username} · {employee.code}</div>
              <div className="row" style={{ gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                {user.roleNames.map((r) => <Badge key={r} tone="brand">{r}</Badge>)}
                {zaloLinked && <Badge tone="success" dot>Đã liên kết Zalo</Badge>}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid-stats">
        <StatCard label={`Phép còn lại ${balance.year}`} value={formatDays(balance.remaining)} tone="var(--success)" icon={<CalendarDays size={16} />} hint={`Đã dùng ${formatDays(balance.used)} ngày`} />
        <StatCard label="Việc đang mở" value={stats.openTasks} icon={<Briefcase size={16} />} />
        <StatCard label="Việc đã hoàn thành" value={stats.doneTasks} icon={<CheckCircle2 size={16} />} />
        <StatCard label="Đơn nghỉ đã duyệt" value={stats.approvedLeaves} icon={<CalendarDays size={16} />} />
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader><CardTitle>Thông tin nhân sự</CardTitle></CardHeader>
          <CardBody className="stack" style={{ gap: 12 }}>
            <Row icon={<Building2 size={13} />} label="Phòng ban" value={employee.department?.name ?? '—'} />
            <Row icon={<Briefcase size={13} />} label="Chức danh" value={employee.position?.name ?? '—'} />
            <Row icon={<User size={13} />} label="Quản lý trực tiếp" value={employee.manager?.fullName ?? '—'} />
            <Row icon={<Mail size={13} />} label="Email" value={employee.email ?? '—'} />
            <Row icon={<Phone size={13} />} label="Điện thoại" value={employee.phone ?? '—'} />
            <Row icon={<Clock size={13} />} label="Ca làm việc" value={employee.workShift ? `${employee.workShift.name} (${employee.workShift.startTime}–${employee.workShift.endTime})` : '—'} />
            <Row icon={<Briefcase size={13} />} label="Loại hợp đồng" value={EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType} />
            <Row icon={<CalendarDays size={13} />} label="Ngày vào làm" value={employee.joinDate ? fmtDate(employee.joinDate) : '—'} />
          </CardBody>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Liên kết Zalo Bot</CardTitle>
                <div className="card-subtitle">Nhận nhắc việc và duyệt đơn ngay trong Zalo</div>
              </div>
              {zaloLinked && <Badge tone="success" dot>Đã liên kết</Badge>}
            </CardHeader>
            <CardBody className="stack" style={{ gap: 12 }}>
              {zaloLinked ? (
                <>
                  <Alert tone="success" icon={<CheckCircle2 />}>
                    Tài khoản Zalo của bạn đã được liên kết. Gõ <b>/help</b> trong chat với bot để xem các lệnh.
                  </Alert>
                  <div>
                    <Button variant="danger-soft" size="sm" onClick={unlink} loading={pending}><Unlink /> Hủy liên kết</Button>
                  </div>
                </>
              ) : linkCode ? (
                <>
                  <Alert tone="info" icon={<MessageCircle />}>
                    Mở chat với bot trên Zalo và nhắn đúng nội dung dưới đây (mã có hiệu lực 10 phút):
                  </Alert>
                  <div className="row" style={{ gap: 9 }}>
                    <code style={{
                      flex: 1, fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: '0.06em',
                      background: 'var(--surface-sunken)', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                      color: 'var(--brand)', textAlign: 'center',
                    }}>
                      /lienket {linkCode}
                    </code>
                    <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(`/lienket ${linkCode}`); toast.success('Đã sao chép'); }}>
                      <Copy /> Chép
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={getCode} loading={pending}>Lấy mã khác</Button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-base)' }}>
                    Liên kết để nhận thông báo giao việc, nhắc hạn và duyệt đơn nghỉ phép ngay trong Zalo.
                  </p>
                  <div>
                    <Button variant="primary" onClick={getCode} loading={pending}><MessageCircle /> Lấy mã liên kết</Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card id="password">
            <CardHeader><CardTitle>Đổi mật khẩu</CardTitle></CardHeader>
            <CardBody>
              {pwState.error && <Alert tone="danger" icon={<AlertCircle />} className="mb-3">{pwState.error}</Alert>}
              {pwState.success && <Alert tone="success" icon={<CheckCircle2 />}>{pwState.success}</Alert>}
              <form action={pwAction} className="stack" style={{ gap: 13, marginTop: pwState.error || pwState.success ? 12 : 0 }}>
                <Field label="Mật khẩu hiện tại" required>
                  <Input type="password" name="currentPassword" autoComplete="current-password" required />
                </Field>
                <Field label="Mật khẩu mới" required hint="Tối thiểu 8 ký tự, gồm chữ và số">
                  <Input type="password" name="newPassword" autoComplete="new-password" required />
                </Field>
                <Field label="Xác nhận mật khẩu mới" required>
                  <Input type="password" name="confirmPassword" autoComplete="new-password" required />
                </Field>
                <div>
                  <Button type="submit" variant="primary" loading={pwPending}><KeyRound /> Đổi mật khẩu</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="row-between">
      <span className="row hint" style={{ gap: 7 }}>{icon}{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
