'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Send, Plus, X, Clock, CalendarDays, Building2, User,
  CheckSquare, MessageSquare, Activity, Timer, GitBranch, Eye,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Avatar, Field, Input, Textarea,
  Select, Checkbox, Progress, EmptyState, Divider,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';
import { TaskFormModal, type TaskFormValue } from '../task-form-modal';
import { TASK_STATUS } from '@/lib/enums';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/date';
import {
  updateTaskStatusAction, updateTaskProgressAction, deleteTaskAction, addCommentAction,
  toggleChecklistAction, addChecklistItemAction, deleteChecklistItemAction, logTimeAction,
} from '@/server/modules/task/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  task: any;
  employees: { id: number; fullName: string; code: string; avatarUrl: string | null }[];
  departments: { id: number; name: string; level: number }[];
  currentEmployeeId: number;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  initialTab?: string;
}

export function TaskDetail({
  task, employees, departments, currentEmployeeId, canEdit, canDelete, canAssign,
  initialTab = 'comments',
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState('');
  const [checklistDraft, setChecklistDraft] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timeLog, setTimeLog] = useState({ hours: '', workDate: new Date().toISOString().slice(0, 10), description: '' });

  const validTabs = ['comments', 'activity', 'time'];
  const initialValidTab = validTabs.includes(initialTab) ? (initialTab as 'comments' | 'activity' | 'time') : 'comments';
  const [tab, setTab] = useState<'comments' | 'activity' | 'time'>(initialValidTab);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as 'comments' | 'activity' | 'time' | null;
      if (t && validTabs.includes(t)) {
        setTab(t);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (newTab: 'comments' | 'activity' | 'time') => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newTab === 'comments') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', newTab);
      }
      window.history.replaceState(null, '', url.toString());
    }
  };

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => {
    startTransition(async () => {
      const res = await fn();
      res.ok ? toast.success(res.message) : toast.error(res.message);
      router.refresh();
    });
  };

  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && !['DONE', 'CANCELLED'].includes(task.status);
  const doneCount = task.checklist.filter((c: any) => c.isDone).length;

  const editValue: TaskFormValue = {
    id: task.id, title: task.title, description: task.description ?? '',
    departmentId: task.departmentId, assigneeId: task.assigneeId, reviewerId: task.reviewerId,
    parentTaskId: task.parentTaskId, status: task.status, priority: task.priority,
    startDate: task.startDate ? task.startDate.slice(0, 10) : '',
    dueDate: task.dueDate ? task.dueDate.slice(0, 16) : '',
    estimateHours: task.estimateHours ? Number(task.estimateHours) : null,
    tags: task.tags ?? '', progress: task.progress,
    watcherIds: task.watchers.map((w: any) => w.employeeId),
    checklist: [], reminderOffsetMinutes: task.reminders[0]?.offsetMinutesBeforeDue ?? null,
  };

  return (
    <div className="stack">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <Link href="/tasks" className="btn btn-ghost btn-sm btn-icon" aria-label="Quay lại"><ArrowLeft /></Link>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{task.code}</span>
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              {overdue && <Badge tone="danger">Quá hạn</Badge>}
            </div>
            <h1 className="page-title">{task.title}</h1>
          </div>
        </div>
        {canEdit && (
          <div className="toolbar">
            <Select
              sizeSm value={task.status} style={{ width: 'auto', minWidth: 140 }}
              onChange={(e) => run(() => updateTaskStatusAction(task.id, e.target.value))}
            >
              {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}><Pencil /> Sửa</Button>
            {canDelete && <Button size="sm" variant="danger-soft" iconOnly onClick={() => setConfirmDelete(true)}><Trash2 /></Button>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 330px', gap: 16, alignItems: 'start' }} className="detail-layout">
        <div className="stack">
          <Card>
            <CardHeader>
              <CardTitle>Mô tả công việc</CardTitle>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                  <Pencil size={13} /> {task.description ? 'Sửa' : 'Thêm mô tả'}
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {task.description ? (
                <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', color: 'var(--text-base)', lineHeight: 1.6 }}>
                  {task.description}
                </p>
              ) : (
                <div
                  className={canEdit ? 'clickable' : undefined}
                  onClick={canEdit ? () => setEditOpen(true) : undefined}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--border-subtle)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--text-faint)',
                    fontSize: 13,
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                >
                  {canEdit ? 'Chưa có mô tả chi tiết. Bấm vào đây để thêm mô tả cho công việc này…' : 'Chưa có mô tả chi tiết.'}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Checklist</CardTitle>
                <div className="card-subtitle">{doneCount}/{task.checklist.length} mục hoàn thành</div>
              </div>
              <Badge tone={task.checklist.length && doneCount === task.checklist.length ? 'success' : 'neutral'}>{task.progress}%</Badge>
            </CardHeader>
            <CardBody>
              {task.checklist.length > 0 && <div style={{ marginBottom: 12 }}><Progress value={task.progress} /></div>}
              <div className="stack" style={{ gap: 2 }}>
                {task.checklist.map((item: any) => (
                  <div key={item.id} className="row" style={{ gap: 9, padding: '6px 4px' }}>
                    <Checkbox
                      checked={item.isDone}
                      disabled={!canEdit || pending}
                      onChange={(e) => run(() => toggleChecklistAction(item.id, e.target.checked))}
                    />
                    <span style={{
                      flex: 1, fontSize: 13.5,
                      textDecoration: item.isDone ? 'line-through' : undefined,
                      color: item.isDone ? 'var(--text-faint)' : 'var(--text-base)',
                    }}>
                      {item.content}
                    </span>
                    {canEdit && (
                      <Button size="sm" variant="ghost" iconOnly onClick={() => run(() => deleteChecklistItemAction(item.id))} aria-label="Xóa"><X /></Button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 7, marginTop: task.checklist.length ? 10 : 0 }}>
                  <Input
                    sizeSm value={checklistDraft} placeholder="Thêm mục mới…"
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && checklistDraft.trim()) {
                        run(() => addChecklistItemAction(task.id, checklistDraft));
                        setChecklistDraft('');
                      }
                    }}
                  />
                  <Button
                    size="sm" variant="secondary" iconOnly disabled={!checklistDraft.trim()}
                    onClick={() => { run(() => addChecklistItemAction(task.id, checklistDraft)); setChecklistDraft(''); }}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
              {task.checklist.length === 0 && !canEdit && (
                <EmptyState icon={<CheckSquare size={18} />} title="Chưa có checklist" />
              )}
            </CardBody>
          </Card>

          {task.subTasks.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Công việc con ({task.subTasks.length})</CardTitle></CardHeader>
              <CardBody style={{ padding: '6px 8px' }}>
                {task.subTasks.map((s: any) => (
                  <Link key={s.id} href={`/tasks/${s.id}`} className="list-row">
                    <GitBranch size={14} style={{ color: 'var(--text-faint)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{s.title}</div>
                      <div className="hint">{s.code}</div>
                    </div>
                    <TaskStatusBadge status={s.status} />
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <div className="tabs" style={{ padding: '0 16px' }}>
              <div className="tab" data-active={tab === 'comments'} onClick={() => handleTabChange('comments')}>
                <MessageSquare size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
                Bình luận ({task.comments.length})
              </div>
              <div className="tab" data-active={tab === 'time'} onClick={() => handleTabChange('time')}>
                <Timer size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
                Chấm giờ ({task.timeLogs.length})
              </div>
              <div className="tab" data-active={tab === 'activity'} onClick={() => handleTabChange('activity')}>
                <Activity size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
                Lịch sử
              </div>
            </div>

            <CardBody>
              {tab === 'comments' && (
                <div className="stack" style={{ gap: 14 }}>
                  <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                    <Avatar name="" size="sm" />
                    <div style={{ flex: 1 }}>
                      <Textarea
                        rows={2} value={comment} placeholder="Viết bình luận, cập nhật tiến độ…"
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 7 }}>
                        <Button
                          size="sm" variant="primary" disabled={!comment.trim()} loading={pending}
                          onClick={() => { run(() => addCommentAction(task.id, comment)); setComment(''); }}
                        >
                          <Send /> Gửi
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Divider />

                  {task.comments.length === 0 ? (
                    <EmptyState icon={<MessageSquare size={18} />} title="Chưa có bình luận" />
                  ) : (
                    task.comments.map((c: any) => (
                      <div key={c.id} className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                        <Avatar name={c.author.fullName} src={c.author.avatarUrl} size="sm" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 7 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{c.author.fullName}</span>
                            <span className="hint">{fmtRelative(c.createdAt)}</span>
                          </div>
                          <p style={{ fontSize: 13.5, color: 'var(--text-base)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'time' && (
                <div className="stack">
                  {canEdit && (
                    <div style={{ display: 'grid', gridTemplateColumns: '110px 150px 1fr auto', gap: 8, alignItems: 'end' }} className="timelog-form">
                      <Field label="Số giờ">
                        <Input sizeSm type="number" step="0.5" min="0" value={timeLog.hours} onChange={(e) => setTimeLog((t) => ({ ...t, hours: e.target.value }))} />
                      </Field>
                      <Field label="Ngày làm">
                        <Input sizeSm type="date" value={timeLog.workDate} onChange={(e) => setTimeLog((t) => ({ ...t, workDate: e.target.value }))} />
                      </Field>
                      <Field label="Nội dung">
                        <Input sizeSm value={timeLog.description} onChange={(e) => setTimeLog((t) => ({ ...t, description: e.target.value }))} placeholder="Làm gì trong khoảng thời gian này" />
                      </Field>
                      <Button
                        size="sm" variant="secondary" disabled={!timeLog.hours}
                        onClick={() => {
                          run(() => logTimeAction(task.id, Number(timeLog.hours), timeLog.workDate, timeLog.description));
                          setTimeLog({ hours: '', workDate: new Date().toISOString().slice(0, 10), description: '' });
                        }}
                      >
                        <Plus /> Ghi nhận
                      </Button>
                    </div>
                  )}
                  <Divider />
                  {task.timeLogs.length === 0 ? (
                    <EmptyState icon={<Timer size={18} />} title="Chưa ghi nhận giờ làm" />
                  ) : (
                    task.timeLogs.map((t: any) => (
                      <div key={t.id} className="row-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div>
                          <div style={{ fontSize: 13 }}>{t.employee.fullName} · <b className="tnum">{Number(t.hours)}h</b></div>
                          {t.description && <div className="hint">{t.description}</div>}
                        </div>
                        <span className="hint">{fmtDate(t.workDate)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'activity' && (
                <div className="timeline">
                  {task.activities.length === 0 ? (
                    <EmptyState icon={<Activity size={18} />} title="Chưa có hoạt động" />
                  ) : (
                    task.activities.map((a: any) => (
                      <div key={a.id} className="timeline-item">
                        <span className="timeline-dot"><Activity size={12} /></span>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text-base)' }}>
                            {a.action === 'CREATE' && 'Tạo công việc'}
                            {a.action === 'UPDATE' && 'Cập nhật thông tin'}
                            {a.action === 'STATUS' && <>Chuyển trạng thái: <b>{a.oldValue}</b> → <b>{a.newValue}</b></>}
                            {a.action === 'PROGRESS' && <>Cập nhật tiến độ: <b>{a.newValue}%</b></>}
                            {a.action === 'COMMENT' && 'Thêm bình luận'}
                            {a.action === 'CHECKLIST' && <>Checklist &ldquo;{a.field}&rdquo;: {a.newValue}</>}
                          </div>
                          <div className="hint">{fmtDateTime(a.createdAt)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader><CardTitle>Thông tin</CardTitle></CardHeader>
            <CardBody className="stack" style={{ gap: 13 }}>
              <Info icon={<User size={13} />} label="Người thực hiện">
                {task.assignee ? (
                  <div className="row" style={{ gap: 7 }}>
                    <Avatar name={task.assignee.fullName} src={task.assignee.avatarUrl} size="sm" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 540 }}>{task.assignee.fullName}</div>
                      {task.assignee.department && <div className="hint">{task.assignee.department.name}</div>}
                    </div>
                  </div>
                ) : <span className="text-faint">Chưa giao</span>}
              </Info>

              <Info icon={<User size={13} />} label="Người tạo">
                <span style={{ fontSize: 13 }}>{task.creator.fullName}</span>
              </Info>

              {task.reviewer && (
                <Info icon={<Eye size={13} />} label="Người nghiệm thu">
                  <span style={{ fontSize: 13 }}>{task.reviewer.fullName}</span>
                </Info>
              )}

              <Info icon={<Building2 size={13} />} label="Phòng ban">
                <span style={{ fontSize: 13 }}>{task.department?.name ?? '—'}</span>
              </Info>

              <Info icon={<CalendarDays size={13} />} label="Thời gian">
                <div style={{ fontSize: 13 }}>
                  <div>Bắt đầu: {task.startDate ? fmtDate(task.startDate) : '—'}</div>
                  <div style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: overdue ? 600 : 400 }}>
                    Hạn: {task.dueDate ? fmtDateTime(task.dueDate) : '—'}
                  </div>
                  {task.completedAt && <div style={{ color: 'var(--success)' }}>Hoàn thành: {fmtDateTime(task.completedAt)}</div>}
                </div>
              </Info>

              <Info icon={<Clock size={13} />} label="Giờ công">
                <span style={{ fontSize: 13 }} className="tnum">
                  {task.actualHours ? Number(task.actualHours) : 0}h thực tế
                  {task.estimateHours ? ` / ${Number(task.estimateHours)}h ước lượng` : ''}
                </span>
              </Info>

              {task.tags && (
                <Info icon={<Badge tone="outline" style={{ padding: 0, background: 'none' }}>#</Badge>} label="Nhãn">
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {task.tags.split(',').map((t: string) => <Badge key={t} tone="outline">{t.trim()}</Badge>)}
                  </div>
                </Info>
              )}
            </CardBody>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Cập nhật nhanh tiến độ</CardTitle></CardHeader>
              <CardBody>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {[0, 25, 50, 75, 100].map((p) => (
                    <Button
                      key={p} size="sm"
                      variant={task.progress === p ? 'soft' : 'secondary'}
                      onClick={() => run(() => updateTaskProgressAction(task.id, p))}
                    >
                      {p}%
                    </Button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {task.watchers.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Người theo dõi ({task.watchers.length})</CardTitle></CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {task.watchers.map((w: any) => (
                    <div key={w.employeeId} className="row" style={{ gap: 6, background: 'var(--surface-sunken)', padding: '4px 9px 4px 4px', borderRadius: 'var(--radius-full)' }}>
                      <Avatar name={w.employee.fullName} src={w.employee.avatarUrl} size="sm" />
                      <span style={{ fontSize: 12.5 }}>{w.employee.fullName}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <TaskFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={editValue}
        departments={departments}
        employees={employees}
        currentEmployeeId={currentEmployeeId}
        canAssign={canAssign}
        onSaved={() => { setEditOpen(false); router.refresh(); }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => startTransition(async () => {
          const res = await deleteTaskAction(task.id);
          if (res.ok) { toast.success(res.message); router.push('/tasks'); }
          else toast.error(res.message);
        })}
        loading={pending}
        danger
        title="Xóa công việc"
        confirmText="Xóa"
        message={<>Xóa công việc <b>{task.code}</b>? Toàn bộ bình luận, checklist và lịch sử sẽ bị xóa theo.</>}
      />
    </div>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{icon}</span>
        <span className="hint">{label}</span>
      </div>
      {children}
    </div>
  );
}
