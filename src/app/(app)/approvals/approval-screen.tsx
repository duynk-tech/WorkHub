'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check, X, CheckSquare, Clock, AlertTriangle, ExternalLink, CalendarDays, Wallet, History,
} from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Avatar, EmptyState, StatCard, PageHeader, Textarea, Alert, Divider,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApprovalStatusBadge } from '@/components/domain/task-badges';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { approveLeaveAction, bulkApproveLeaveAction } from '@/server/modules/leave/actions';
import { Checkbox } from '@/components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ApprovalScreen({
  pending, history, leaves, stats, showHistory, requesters = [],
}: {
  pending: any[]; history: any[]; leaves: any[]; stats: Record<string, number>; showHistory: boolean;
  requesters?: { id: number; fullName: string; avatarUrl: string | null; code: string }[];
}) {
  const requesterById = new Map(requesters.map((r) => [r.id, r]));
  const router = useRouter();
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [decision, setDecision] = useState<{ taskId: number; type: 'APPROVE' | 'REJECT'; leave: any } | null>(null);
  const [comment, setComment] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const leaveTaskIds = pending.filter((t) => t.instance.entityType === 'LEAVE').map((t) => t.id as number);
  const toggle = (id: number) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = leaveTaskIds.length > 0 && leaveTaskIds.every((id) => selected.has(id));

  const bulkApprove = () => {
    const ids = leaveTaskIds.filter((id) => selected.has(id));
    if (!ids.length) return;
    startTransition(async () => {
      const res = await bulkApproveLeaveAction(ids);
      if (res.failed.length) toast.warning(res.message); else toast.success(res.message);
      setSelected(new Set());
      router.refresh();
    });
  };

  const leaveById = new Map(leaves.map((l) => [l.id, l]));
  const overdueCount = pending.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length;

  const act = () => {
    if (!decision) return;
    startTransition(async () => {
      const res = await approveLeaveAction(decision.taskId, decision.type, comment);
      if (res.ok) { toast.success(res.message); setDecision(null); setComment(''); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const quickApprove = (taskId: number) => {
    startTransition(async () => {
      const res = await approveLeaveAction(taskId, 'APPROVE');
      res.ok ? toast.success(res.message) : toast.error(res.message);
      router.refresh();
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Đơn chờ duyệt"
        description="Các bước duyệt đang được giao cho bạn theo quy trình đã cấu hình"
      />

      <div className="grid-stats">
        <StatCard
          label="Đang chờ bạn xử lý" value={pending.length} icon={<Clock size={16} />}
          tone={pending.length > 0 ? 'var(--warning)' : undefined}
        />
        <StatCard
          label="Quá hạn SLA" value={overdueCount} icon={<AlertTriangle size={16} />}
          tone={overdueCount > 0 ? 'var(--danger)' : undefined}
          hint={overdueCount > 0 ? 'Cần xử lý gấp' : 'Không có đơn trễ hạn'}
        />
        <StatCard label="Đã duyệt" value={stats.APPROVED ?? 0} icon={<Check size={16} />} tone="var(--success)" />
        <StatCard label="Đã từ chối" value={stats.REJECTED ?? 0} icon={<X size={16} />} />
      </div>

      <div className="tabs">
        <Link href="/approvals" className="tab" data-active={!showHistory}>Chờ xử lý ({pending.length})</Link>
        <Link href="/approvals?tab=history" className="tab" data-active={showHistory}>
          <History size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
          Lịch sử xử lý
        </Link>
      </div>

      {!showHistory ? (
        pending.length === 0 ? (
          <Card><CardBody><EmptyState icon={<CheckSquare size={20} />} title="Không có đơn nào chờ bạn duyệt" description="Mọi đơn được giao cho bạn đã được xử lý xong." /></CardBody></Card>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {leaveTaskIds.length > 1 && (
              <div className="row-between" style={{ gap: 12, padding: '8px 12px', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)', background: selected.size ? 'var(--brand-soft)' : 'var(--surface-card)' }}>
                <label className="row" style={{ gap: 8, fontSize: 13 }}>
                  <Checkbox checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(leaveTaskIds))} />
                  {selected.size ? `Đã chọn ${selected.size} đơn nghỉ phép` : 'Chọn tất cả đơn nghỉ phép'}
                </label>
                <Button size="sm" variant="primary" disabled={!selected.size} loading={busy} onClick={bulkApprove}>
                  <Check /> Duyệt {selected.size || ''} đơn đã chọn
                </Button>
              </div>
            )}
            {pending.map((task) => {
              const leave = task.instance.entityType === 'LEAVE' ? leaveById.get(task.instance.entityId) : null;
              const overdue = task.dueAt && new Date(task.dueAt) < new Date();
              // Loại phiếu khác đơn nghỉ: hiện thông tin chung và đường dẫn về màn xử lý gốc,
              // thay vì ẩn đi (trước đây phiếu vẫn được đếm nhưng không thấy ở đâu)
              if (!leave) return <GenericApprovalCard key={task.id} task={task} requester={requesterById.get(task.instance.requesterId)} overdue={Boolean(overdue)} />;

              return (
                <Card key={task.id} hover>
                  <CardBody>
                    <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div className="row" style={{ gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                          {leaveTaskIds.length > 1 && (
                            <Checkbox checked={selected.has(task.id)} onChange={() => toggle(task.id)} aria-label={`Chọn đơn ${leave.code}`} />
                          )}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{leave.code}</span>
                          <Badge style={{ background: `${leave.leaveType.color}1f`, color: leave.leaveType.color }}>{leave.leaveType.name}</Badge>
                          <Badge tone="outline">Bước {task.stepOrder}: {task.step.name}</Badge>
                          {overdue && <Badge tone="danger" dot>Quá hạn SLA</Badge>}
                          {task.delegatedFrom && <Badge tone="warning">Chuyển từ {task.delegatedFrom.fullName} do quá SLA</Badge>}
                        </div>

                        <div className="row" style={{ gap: 11, marginBottom: 10 }}>
                          <Avatar name={leave.employee.fullName} src={leave.employee.avatarUrl} size="lg" />
                          <div>
                            <div style={{ fontWeight: 620, color: 'var(--text-strong)', fontSize: 14.5 }}>{leave.employee.fullName}</div>
                            <div className="hint">{leave.employee.code} · {leave.employee.department?.name ?? '—'}</div>
                          </div>
                        </div>

                        <div className="row" style={{ gap: 18, flexWrap: 'wrap', marginBottom: 9 }}>
                          <span style={{ fontSize: 13 }}>
                            <CalendarDays size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 5, color: 'var(--text-faint)' }} />
                            {fmtDate(leave.startDate)}{leave.startDate !== leave.endDate && ` → ${fmtDate(leave.endDate)}`}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{formatDays(leave.totalDays)} ngày</span>
                          <Badge tone={leave.leaveType.deductsBalance ? 'warning' : 'outline'}>
                            <Wallet size={11} />{leave.leaveType.deductsBalance ? 'Trừ quỹ phép' : 'Không trừ phép'}
                          </Badge>
                          {task.dueAt && (
                            <span className="hint" style={{ color: overdue ? 'var(--danger)' : undefined }}>
                              Hạn xử lý: {fmtDateTime(task.dueAt)}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--text-base)', background: 'var(--surface-sunken)', padding: '9px 12px', borderRadius: 'var(--radius-md)' }}>
                          <b>Lý do:</b> {leave.reason}
                          {leave.handoverTo && <div style={{ marginTop: 4 }}><b>Bàn giao cho:</b> {leave.handoverTo.fullName}</div>}
                        </div>
                      </div>

                      <div className="stack" style={{ gap: 7, minWidth: 150 }}>
                        <Button variant="primary" loading={busy} onClick={() => quickApprove(task.id)}><Check /> Duyệt nhanh</Button>
                        <Button variant="danger-soft" onClick={() => { setComment(''); setDecision({ taskId: task.id, type: 'REJECT', leave }); }}>
                          <X /> Từ chối
                        </Button>
                        <Link href={`/leaves/${leave.id}`} className="btn btn-ghost btn-sm"><ExternalLink /> Xem chi tiết</Link>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <Card><CardBody><EmptyState icon={<History size={20} />} title="Chưa có lịch sử duyệt" /></CardBody></Card>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Đơn</th>
                  <th>Người xin</th>
                  <th>Bước duyệt</th>
                  <th>Quyết định</th>
                  <th>Ghi chú</th>
                  <th>Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                {history.map((task) => {
                  const leave = leaveById.get(task.instance.entityId);
                  return (
                    <tr key={task.id}>
                      <td>
                        {leave ? (
                          <Link href={`/leaves/${leave.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)' }}>{leave.code}</Link>
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td>{leave?.employee.fullName ?? '—'}</td>
                      <td><span className="hint">Bước {task.stepOrder}: {task.step.name}</span></td>
                      <td><ApprovalStatusBadge status={task.status} /></td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{task.comment || '—'}</td>
                      <td className="hint">{task.actedAt ? fmtRelative(task.actedAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title="Từ chối đơn nghỉ phép"
        description="Người nộp đơn sẽ nhận thông báo kèm lý do từ chối"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>Hủy</Button>
            <Button variant="danger" loading={busy} onClick={act}><X /> Xác nhận từ chối</Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          {decision?.leave && (
            <Alert tone="warning" icon={<AlertTriangle />}>
              <b>{decision.leave.employee.fullName}</b> xin nghỉ {formatDays(decision.leave.totalDays)} ngày
              từ {fmtDate(decision.leave.startDate)} đến {fmtDate(decision.leave.endDate)}.
            </Alert>
          )}
          <Divider />
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Lý do từ chối (bắt buộc)" autoFocus />
        </div>
      </Modal>
    </div>
  );
}

const ENTITY_LABELS: Record<string, { label: string; href?: (id: number) => string }> = {
  LEAVE: { label: 'Đơn nghỉ phép', href: (id) => `/leaves/${id}` },
  TASK_CLOSE: { label: 'Đóng công việc', href: (id) => `/tasks/${id}` },
  OVERTIME: { label: 'Đăng ký làm thêm giờ', href: () => '/attendance' },
  ATTENDANCE_ADJUST: { label: 'Điều chỉnh chấm công', href: () => '/attendance' },
};

function GenericApprovalCard({ task, requester, overdue }: { task: any; requester?: { fullName: string; avatarUrl: string | null; code: string }; overdue: boolean }) {
  const meta = ENTITY_LABELS[task.instance.entityType] ?? { label: task.instance.entityType };
  return (
    <Card>
      <CardBody>
        <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="row" style={{ gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
              <Badge tone="outline">{meta.label} #{task.instance.entityId}</Badge>
              <Badge tone="outline">Bước {task.stepOrder}: {task.step.name}</Badge>
              {overdue && <Badge tone="danger" dot>Quá hạn SLA</Badge>}
              {task.delegatedFrom && <Badge tone="warning">Chuyển từ {task.delegatedFrom.fullName} do quá SLA</Badge>}
            </div>
            {requester && (
              <div className="row" style={{ gap: 11, marginBottom: 8 }}>
                <Avatar name={requester.fullName} src={requester.avatarUrl} size="lg" />
                <div>
                  <div style={{ fontWeight: 620, color: 'var(--text-strong)', fontSize: 14.5 }}>{requester.fullName}</div>
                  <div className="hint">{requester.code} · gửi {fmtRelative(task.instance.startedAt)}</div>
                </div>
              </div>
            )}
            <div className="hint">
              {task.dueAt ? `Hạn xử lý: ${fmtDateTime(task.dueAt)} · ` : ''}Loại phiếu này được duyệt tại màn hình gốc.
            </div>
          </div>
          {meta.href && (
            <Link href={meta.href(task.instance.entityId)} className="btn btn-secondary btn-sm">
              <ExternalLink /> Mở để xử lý
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
