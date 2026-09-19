'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Check, X, Ban, CalendarDays, User, Phone, Paperclip, Clock,
  CircleDot, MessageSquare, Building2, Wallet, ArrowRightLeft,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Avatar, Textarea, Alert, Divider,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { LeaveStatusBadge, ApprovalStatusBadge } from '@/components/domain/task-badges';
import { LEAVE_DURATION, APPROVER_TYPE, STEP_MODE } from '@/lib/enums';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { approveLeaveAction, cancelLeaveAction } from '@/server/modules/leave/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function LeaveDetail({
  request, balanceRemaining, myPendingTaskId, isOwner, canApprove, canForceClose,
}: {
  request: any;
  balanceRemaining: number;
  myPendingTaskId: number | null;
  isOwner: boolean;
  canApprove: boolean;
  canForceClose: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [decisionModal, setDecisionModal] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [comment, setComment] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const act = (decision: 'APPROVE' | 'REJECT') => {
    if (!myPendingTaskId) return;
    startTransition(async () => {
      const res = await approveLeaveAction(myPendingTaskId, decision, comment);
      if (res.ok) { toast.success(res.message); setDecisionModal(null); setComment(''); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const doCancel = () => {
    startTransition(async () => {
      const res = await cancelLeaveAction(request.id, comment || undefined);
      if (res.ok) { toast.success(res.message); setConfirmCancel(false); router.refresh(); }
      else toast.error(res.message);
    });
  };

  // Gom phiếu duyệt theo bước để vẽ dòng thời gian
  const steps = new Map<number, any[]>();
  for (const task of request.workflow?.tasks ?? []) {
    if (!steps.has(task.stepOrder)) steps.set(task.stepOrder, []);
    steps.get(task.stepOrder)!.push(task);
  }
  const currentStep = request.workflow?.currentStepOrder ?? 0;
  const canCancel = (isOwner && ['DRAFT', 'PENDING'].includes(request.status)) || (canForceClose && request.status !== 'CANCELLED');

  return (
    <div className="stack">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <Link href="/leaves" className="btn btn-ghost btn-sm btn-icon" aria-label="Quay lại"><ArrowLeft /></Link>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{request.code}</span>
              <LeaveStatusBadge status={request.status} />
              <Badge style={{ background: `${request.leaveType.color}1f`, color: request.leaveType.color }}>{request.leaveType.name}</Badge>
            </div>
            <h1 className="page-title">Đơn xin nghỉ của {request.employee.fullName}</h1>
          </div>
        </div>

        <div className="toolbar">
          {myPendingTaskId && canApprove && (
            <>
              <Button variant="danger-soft" onClick={() => { setComment(''); setDecisionModal('REJECT'); }}><X /> Từ chối</Button>
              <Button variant="primary" onClick={() => { setComment(''); setDecisionModal('APPROVE'); }}><Check /> Duyệt đơn</Button>
            </>
          )}
          {canCancel && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)}><Ban /> Hủy đơn</Button>
          )}
        </div>
      </div>

      {myPendingTaskId && (
        <Alert tone="warning" icon={<Clock />}>
          Đơn này đang chờ <b>bạn</b> duyệt ở bước {currentStep}. Hãy xem thông tin bên dưới trước khi quyết định.
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }} className="detail-layout">
        <div className="stack">
          <Card>
            <CardHeader><CardTitle>Nội dung đơn</CardTitle></CardHeader>
            <CardBody className="stack" style={{ gap: 14 }}>
              <div className="grid-3">
                <Info icon={<CalendarDays size={13} />} label="Từ ngày" value={fmtDate(request.startDate)} />
                <Info icon={<CalendarDays size={13} />} label="Đến ngày" value={fmtDate(request.endDate)} />
                <Info icon={<Clock size={13} />} label="Số ngày nghỉ" value={`${formatDays(request.totalDays)} ngày`} strong />
                <Info icon={<CircleDot size={13} />} label="Thời lượng" value={LEAVE_DURATION[request.durationType]} />
                <Info icon={<Wallet size={13} />} label="Ảnh hưởng quỹ phép" value={request.leaveType.deductsBalance ? 'Có trừ phép' : 'Không trừ phép'} />
                <Info icon={<Clock size={13} />} label="Nộp lúc" value={request.submittedAt ? fmtDateTime(request.submittedAt) : 'Chưa nộp'} />
              </div>

              <Divider />

              <div>
                <div className="hint" style={{ marginBottom: 4 }}>Lý do nghỉ</div>
                <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', color: 'var(--text-base)' }}>{request.reason}</p>
              </div>

              {request.handoverTo && (
                <div>
                  <div className="hint" style={{ marginBottom: 4 }}>Bàn giao công việc</div>
                  <div className="row" style={{ gap: 8 }}>
                    <ArrowRightLeft size={14} style={{ color: 'var(--text-faint)' }} />
                    <Avatar name={request.handoverTo.fullName} src={request.handoverTo.avatarUrl} size="sm" />
                    <span style={{ fontSize: 13.5 }}>{request.handoverTo.fullName}</span>
                  </div>
                  {request.handoverNote && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>{request.handoverNote}</p>}
                </div>
              )}

              {request.contactDuringLeave && (
                <Info icon={<Phone size={13} />} label="Liên hệ khi cần" value={request.contactDuringLeave} />
              )}

              {request.attachmentUrl && (
                <div>
                  <div className="hint" style={{ marginBottom: 4 }}>Giấy tờ đính kèm</div>
                  <a href={request.attachmentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    <Paperclip /> {request.attachmentName || 'Xem tệp đính kèm'}
                  </a>
                </div>
              )}

              {request.closingNote && (
                <Alert tone={request.status === 'APPROVED' ? 'success' : 'danger'} icon={<MessageSquare />}>
                  <b>Ghi chú xử lý:</b> {request.closingNote}
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tiến trình duyệt</CardTitle>
                <div className="card-subtitle">
                  {request.workflow ? `Quy trình: ${request.workflow.definition.name}` : 'Đơn chưa nộp duyệt'}
                </div>
              </div>
              {request.workflow && <Badge tone={request.workflow.status === 'APPROVED' ? 'success' : request.workflow.status === 'REJECTED' ? 'danger' : 'warning'}>{request.workflow.status === 'RUNNING' ? 'Đang duyệt' : request.workflow.status === 'APPROVED' ? 'Hoàn tất' : request.workflow.status === 'REJECTED' ? 'Bị từ chối' : 'Đã hủy'}</Badge>}
            </CardHeader>
            <CardBody>
              {!request.workflow ? (
                <p className="hint">Đơn đang ở trạng thái nháp, chưa khởi tạo quy trình duyệt.</p>
              ) : (
                <div className="timeline">
                  <div className="timeline-item">
                    <span className="timeline-dot" data-state="approved"><Check size={12} /></span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--text-strong)' }}>Nộp đơn</div>
                      <div className="hint">{request.employee.fullName} · {fmtDateTime(request.submittedAt)}</div>
                    </div>
                  </div>

                  {Array.from(steps.entries()).map(([order, tasks]) => {
                    const step = tasks[0].step;
                    const approved = tasks.some((t: any) => t.status === 'APPROVED');
                    const rejected = tasks.some((t: any) => t.status === 'REJECTED');
                    const isCurrent = order === currentStep && request.workflow.status === 'RUNNING';
                    const state = rejected ? 'rejected' : approved ? 'approved' : isCurrent ? 'current' : 'pending';

                    return (
                      <div key={order} className="timeline-item">
                        <span className="timeline-dot" data-state={state}>
                          {rejected ? <X size={12} /> : approved ? <Check size={12} /> : <Clock size={12} />}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--text-strong)' }}>
                              Bước {order}: {step.name}
                            </span>
                            <Badge tone="outline">{APPROVER_TYPE[step.approverType]?.label ?? step.approverType}</Badge>
                            {tasks.length > 1 && <Badge tone="outline">{STEP_MODE[step.mode]}</Badge>}
                          </div>

                          <div className="stack" style={{ gap: 5, marginTop: 7 }}>
                            {tasks.map((t: any) => (
                              <div key={t.id} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                <Avatar name={t.approver.fullName} src={t.approver.avatarUrl} size="sm" />
                                <span style={{ fontSize: 13 }}>{t.approver.fullName}</span>
                                {t.approver.position && <span className="hint">{t.approver.position.name}</span>}
                                <ApprovalStatusBadge status={t.status} />
                                {t.actedAt && <span className="hint">{fmtRelative(t.actedAt)}</span>}
                                {t.comment && <span className="hint" style={{ fontStyle: 'italic' }}>&ldquo;{t.comment}&rdquo;</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {request.workflow.status !== 'RUNNING' && (
                    <div className="timeline-item">
                      <span className="timeline-dot" data-state={request.workflow.status === 'APPROVED' ? 'approved' : 'rejected'}>
                        {request.workflow.status === 'APPROVED' ? <Check size={12} /> : <X size={12} />}
                      </span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--text-strong)' }}>
                          {request.workflow.status === 'APPROVED' ? 'Đơn đã được duyệt' : request.workflow.status === 'REJECTED' ? 'Đơn bị từ chối' : 'Quy trình đã hủy'}
                        </div>
                        <div className="hint">{fmtDateTime(request.workflow.finishedAt)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {request.workflow?.logs?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Nhật ký quy trình</CardTitle></CardHeader>
              <CardBody>
                <div className="stack" style={{ gap: 7 }}>
                  {request.workflow.logs.map((log: any) => (
                    <div key={log.id} className="row-between" style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span>
                        <b>{LOG_LABELS[log.action] ?? log.action}</b>
                        {log.note && <span style={{ color: 'var(--text-muted)' }}> — {log.note}</span>}
                      </span>
                      <span className="hint">{fmtDateTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHeader><CardTitle>Người xin nghỉ</CardTitle></CardHeader>
            <CardBody className="stack" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 11 }}>
                <Avatar name={request.employee.fullName} src={request.employee.avatarUrl} size="lg" />
                <div>
                  <div style={{ fontWeight: 620, color: 'var(--text-strong)' }}>{request.employee.fullName}</div>
                  <div className="hint">{request.employee.code}</div>
                </div>
              </div>
              <Divider />
              <Info icon={<Building2 size={13} />} label="Phòng ban" value={request.employee.department?.name ?? '—'} />
              <Info icon={<User size={13} />} label="Chức danh" value={request.employee.position?.name ?? '—'} />
              <Info icon={<User size={13} />} label="Quản lý trực tiếp" value={request.employee.manager?.fullName ?? '—'} />
              <Info icon={<Phone size={13} />} label="Điện thoại" value={request.employee.phone ?? '—'} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quỹ phép {request.startDate.slice(0, 4)}</CardTitle></CardHeader>
            <CardBody>
              <div className="stat-value" style={{ color: balanceRemaining > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatDays(balanceRemaining)} ngày
              </div>
              <div className="hint" style={{ marginTop: 4 }}>
                Số phép còn lại sau khi tính các đơn đã duyệt
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Các ngày nghỉ ({request.days.length})</CardTitle></CardHeader>
            <CardBody>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {request.days.map((d: any) => (
                  <Badge key={d.id} tone={Number(d.portion) < 1 ? 'warning' : 'brand'}>
                    {fmtDate(d.date, 'dd/MM')}{Number(d.portion) < 1 ? ' ½' : ''}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={decisionModal !== null}
        onClose={() => setDecisionModal(null)}
        title={decisionModal === 'APPROVE' ? 'Duyệt đơn nghỉ phép' : 'Từ chối đơn nghỉ phép'}
        description={decisionModal === 'APPROVE'
          ? 'Đơn sẽ chuyển sang bước duyệt tiếp theo hoặc hoàn tất nếu đây là bước cuối'
          : 'Đơn sẽ bị từ chối ngay và quỹ phép được hoàn lại'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecisionModal(null)}>Hủy</Button>
            <Button
              variant={decisionModal === 'APPROVE' ? 'primary' : 'danger'}
              loading={pending}
              onClick={() => act(decisionModal!)}
            >
              {decisionModal === 'APPROVE' ? <><Check /> Xác nhận duyệt</> : <><X /> Xác nhận từ chối</>}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ fontSize: 13.5 }}>
            <b>{request.employee.fullName}</b> xin nghỉ <b>{formatDays(request.totalDays)} ngày</b> ({request.leaveType.name})
            từ {fmtDate(request.startDate)} đến {fmtDate(request.endDate)}.
          </div>
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={decisionModal === 'APPROVE' ? 'Ghi chú khi duyệt (không bắt buộc)' : 'Lý do từ chối (bắt buộc)'}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={doCancel}
        loading={pending}
        danger
        title="Hủy đơn nghỉ phép"
        confirmText="Hủy đơn"
        cancelText="Đóng"
        message={<>Hủy đơn <b>{request.code}</b>? Quỹ phép đã giữ chỗ sẽ được hoàn lại.</>}
      />
    </div>
  );
}

const LOG_LABELS: Record<string, string> = {
  SUBMIT: 'Nộp đơn', OPEN_STEP: 'Mở bước duyệt', SKIP_STEP: 'Bỏ qua bước',
  APPROVE: 'Duyệt', REJECT: 'Từ chối', CANCEL: 'Hủy', FINISH: 'Kết thúc quy trình',
};

function Info({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{icon}</span>
        <span className="hint">{label}</span>
      </div>
      <div style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 660 : 500, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  );
}
