'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Mail, Bell, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, SearchableSelect } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtDateTime } from '@/lib/date';
import { saveReportScheduleAction, toggleReportScheduleAction, deleteReportScheduleAction } from '@/server/modules/report/schedule-actions';

interface ScheduleRow {
  id: number; name: string; reportLabel: string; frequency: string; channel: string;
  isActive: boolean; lastRunAt: string | null; owner: string; recipients: string[];
}

const WEEKDAYS = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
function describeFrequency(f: string) {
  if (f === 'daily') return 'Hằng ngày (số liệu hôm qua)';
  const [k, n] = f.split(':');
  if (k === 'weekly') return `${WEEKDAYS[Number(n)]} hằng tuần (7 ngày qua)`;
  if (k === 'monthly') return `Ngày ${n} hằng tháng (tháng trước)`;
  return f;
}

export function SchedulesScreen({
  canCreate, emailReady, currentEmployeeId, reports, employees, schedules,
}: {
  canCreate: boolean; emailReady: boolean; currentEmployeeId: number;
  reports: { key: string; label: string }[];
  employees: { id: number; name: string; hasEmail: boolean }[];
  schedules: ScheduleRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', reportKey: reports[0]?.key ?? '', kind: 'weekly', day: '1',
    channel: emailReady ? 'EMAIL' : 'IN_APP', employeeIds: [currentEmployeeId] as number[],
  });

  const frequency = form.kind === 'daily' ? 'daily' : `${form.kind}:${form.day}`;
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message); after?.(); router.refresh(); } else toast.error(r.message);
    });

  return (
    <div className="stack">
      <PageHeader
        title="Lịch gửi báo cáo"
        description="Tự động gửi báo cáo theo ngày, tuần hoặc tháng — qua email kèm file Excel hoặc thông báo trong ứng dụng."
        actions={
          <>
            <Link href="/reports" className="btn btn-ghost">Về Báo cáo</Link>
            {canCreate && <Button variant="primary" onClick={() => setOpen(true)}><Plus /> Tạo lịch gửi</Button>}
          </>
        }
      />

      {schedules.length === 0 ? (
        <Card><EmptyState icon={<CalendarClock size={20} />} title="Chưa có lịch gửi nào" description="Ví dụ: gửi báo cáo tiến độ công việc cho trưởng phòng mỗi sáng thứ Hai." /></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Lịch gửi</th><th>Tần suất</th><th>Kênh</th><th>Người nhận</th><th>Lần gửi gần nhất</th><th style={{ width: 90 }} /></tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.55 }}>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{s.name}</div>
                    <div className="hint">{s.reportLabel} · lập bởi {s.owner}</div>
                  </td>
                  <td>{describeFrequency(s.frequency)}</td>
                  <td>{s.channel === 'EMAIL' ? <Badge tone="info"><Mail size={11} /> Email + Excel</Badge> : <Badge><Bell size={11} /> Trong app</Badge>}</td>
                  <td className="hint" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{s.recipients.join(', ')}</td>
                  <td className="hint">{s.lastRunAt ? fmtDateTime(s.lastRunAt) : 'Chưa gửi'}</td>
                  <td>
                    <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="ghost" iconOnly title={s.isActive ? 'Tạm dừng' : 'Bật lại'} onClick={() => run(() => toggleReportScheduleAction(s.id))} disabled={pending}>
                        {s.isActive ? <Pause /> : <Play />}
                      </Button>
                      <Button size="sm" variant="ghost" iconOnly title="Xoá" onClick={() => run(() => deleteReportScheduleAction(s.id))} disabled={pending}><Trash2 /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tạo lịch gửi báo cáo"
        description="Báo cáo được dựng theo quyền xem dữ liệu của bạn."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <Button variant="primary" loading={pending} onClick={() => run(
              () => saveReportScheduleAction({ name: form.name, reportKey: form.reportKey, frequency, channel: form.channel, employeeIds: form.employeeIds }),
              () => setOpen(false),
            )}>Lưu lịch gửi</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Tên lịch gửi" required className="span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd. Tiến độ công việc tuần — Phòng Kỹ thuật" />
          </Field>
          <Field label="Báo cáo" required>
            <Select value={form.reportKey} onChange={(e) => setForm({ ...form, reportKey: e.target.value })}>
              {reports.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Kênh gửi" hint={!emailReady ? 'Máy chủ chưa cấu hình email (SMTP)' : form.channel === 'EMAIL' ? 'Chỉ báo cáo Công việc, Chấm công, Nghỉ phép có file Excel; báo cáo khác gửi link.' : undefined}>
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="EMAIL" disabled={!emailReady}>Email kèm file Excel</option>
              <option value="IN_APP">Thông báo trong app + đẩy</option>
            </Select>
          </Field>
          <Field label="Tần suất">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, day: '1' })}>
              <option value="daily">Hằng ngày</option>
              <option value="weekly">Hằng tuần</option>
              <option value="monthly">Hằng tháng</option>
            </Select>
          </Field>
          {form.kind !== 'daily' && (
            <Field label={form.kind === 'weekly' ? 'Vào thứ' : 'Vào ngày'}>
              <Select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                {form.kind === 'weekly'
                  ? WEEKDAYS.slice(1).map((w, i) => <option key={w} value={i + 1}>{w}</option>)
                  : Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>Ngày {i + 1}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Người nhận" required className="span-2" hint="Gửi lúc khoảng 07:30 sáng theo giờ Việt Nam">
            <div className="stack" style={{ gap: 8 }}>
              <SearchableSelect
                value=""
                onChange={(v) => v && setForm({ ...form, employeeIds: Array.from(new Set([...form.employeeIds, Number(v)])) })}
                options={employees.filter((e) => !form.employeeIds.includes(e.id)).map((e) => ({ value: String(e.id), label: e.name, subLabel: form.channel === 'EMAIL' && !e.hasEmail ? 'chưa có email' : undefined }))}
                placeholder="Thêm người nhận…"
              />
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {form.employeeIds.map((id) => (
                  <Badge key={id} tone="info">
                    {employees.find((e) => e.id === id)?.name ?? id}
                    <button type="button" aria-label="Bỏ" onClick={() => setForm({ ...form, employeeIds: form.employeeIds.filter((x) => x !== id) })} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex', padding: 0 }}><X size={11} /></button>
                  </Badge>
                ))}
              </div>
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
