'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, ListChecks, LayoutGrid, List as ListIcon, Filter, MessageSquare, CheckSquare,
  Paperclip, ChevronLeft, ChevronRight, Clock, AlertTriangle, GitBranch,
} from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Avatar, EmptyState, SearchInput, Select, Progress, PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';
import { TaskFormModal, type TaskFormValue } from './task-form-modal';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';
import { fmtDate } from '@/lib/date';
import { updateTaskStatusAction } from '@/server/modules/task/actions';

interface TaskRow {
  id: number; code: string; title: string; status: string; priority: string;
  dueDate: string | null; startDate: string | null; progress: number;
  assignee: { id: number; fullName: string; avatarUrl: string | null } | null;
  creator?: { id: number; fullName: string };
  department?: { id: number; name: string } | null;
  _count: { comments: number; checklist: number; subTasks: number; attachments?: number };
}

interface Props {
  view: 'list' | 'board';
  data: { rows: TaskRow[]; total: number; page: number; pageCount: number; statusCounts: Record<string, number> } | null;
  board: { status: string; tasks: TaskRow[]; total: number }[] | null;
  departments: { id: number; name: string; level: number }[];
  employees: { id: number; fullName: string; code: string; avatarUrl: string | null }[];
  filter: { search: string; status: string[]; assigneeId: number | null; departmentId: number | null; onlyMine: boolean; overdue: boolean; sort: string; page: number };
  currentEmployeeId: number;
  canCreate: boolean;
  canAssign: boolean;
  canDelete: boolean;
}

export function TaskScreen({
  view, data, board, departments, employees, filter, currentEmployeeId, canCreate, canAssign,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(filter.search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormValue | null>(null);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set(key, value) : params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/tasks?${params.toString()}`);
  };

  const changeStatus = (id: number, status: string) => {
    startTransition(async () => {
      const res = await updateTaskStatusAction(id, status);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      router.refresh();
    });
  };

  const overdue = (t: TaskRow) => t.dueDate && new Date(t.dueDate) < new Date() && !['DONE', 'CANCELLED'].includes(t.status);

  const filterBar = (
    <Card>
      <CardBody style={{ padding: 14 }}>
        <div className="toolbar">
          <form style={{ flex: 1, minWidth: 200, maxWidth: 320 }} onSubmit={(e) => { e.preventDefault(); setParam('q', search); }}>
            <SearchInput placeholder="Tìm mã hoặc tiêu đề công việc…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>

          <Select sizeSm style={{ width: 'auto', minWidth: 150 }} value={filter.status[0] ?? ''} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>

          <Select sizeSm style={{ width: 'auto', minWidth: 150 }} value={filter.assigneeId ?? ''} onChange={(e) => setParam('assignee', e.target.value)}>
            <option value="">Mọi người thực hiện</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>

          <Select sizeSm style={{ width: 'auto', minWidth: 160 }} value={filter.departmentId ?? ''} onChange={(e) => setParam('dept', e.target.value)}>
            <option value="">Mọi phòng ban</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{'　'.repeat(d.level - 1)}{d.name}</option>)}
          </Select>

          <Button size="sm" variant={filter.onlyMine ? 'soft' : 'secondary'} onClick={() => setParam('mine', filter.onlyMine ? '' : '1')}>
            Của tôi
          </Button>
          <Button size="sm" variant={filter.overdue ? 'danger-soft' : 'secondary'} onClick={() => setParam('overdue', filter.overdue ? '' : '1')}>
            <AlertTriangle /> Quá hạn
          </Button>

          {(filter.search || filter.status.length || filter.assigneeId || filter.departmentId || filter.onlyMine || filter.overdue) && (
            <Button size="sm" variant="ghost" onClick={() => router.push(`/tasks?view=${view}`)}><Filter /> Xóa lọc</Button>
          )}

          <div className="row" style={{ marginLeft: 'auto', gap: 4 }}>
            <Button size="sm" variant={view === 'list' ? 'soft' : 'ghost'} iconOnly onClick={() => setParam('view', 'list')} aria-label="Dạng danh sách"><ListIcon /></Button>
            <Button size="sm" variant={view === 'board' ? 'soft' : 'ghost'} iconOnly onClick={() => setParam('view', 'board')} aria-label="Dạng bảng"><LayoutGrid /></Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="stack">
      <PageHeader
        title="Công việc"
        description={view === 'list' && data ? `${data.total} công việc trong phạm vi của bạn` : 'Bảng Kanban theo trạng thái'}
        actions={canCreate ? <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Tạo công việc</Button> : undefined}
      />

      {filterBar}

      {view === 'list' && data && (
        data.rows.length === 0 ? (
          <Card><CardBody><EmptyState icon={<ListChecks size={20} />} title="Không có công việc nào" description="Thử đổi bộ lọc hoặc tạo công việc mới." /></CardBody></Card>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th style={{ width: 140, minWidth: 130 }}>Mã</th>
                    <th>Công việc</th>
                    <th style={{ width: 180, minWidth: 160 }}>Người thực hiện</th>
                    <th style={{ width: 140, minWidth: 125 }}>Trạng thái</th>
                    <th style={{ width: 110, minWidth: 95 }}>Ưu tiên</th>
                    <th style={{ width: 140, minWidth: 130 }}>Hạn</th>
                    <th style={{ width: 130, minWidth: 115 }}>Tiến độ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((t) => (
                    <tr key={t.id} onClick={() => router.push(`/tasks/${t.id}`)}>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.code}</span>
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{t.title}</div>
                        <div className="hint row" style={{ gap: 10, marginTop: 2, alignItems: 'center' }}>
                          {t.department?.name && <span>{t.department.name}</span>}
                          {t._count.comments > 0 && <span className="row" style={{ gap: 3, alignItems: 'center' }}><MessageSquare size={11} />{t._count.comments}</span>}
                          {t._count.checklist > 0 && <span className="row" style={{ gap: 3, alignItems: 'center' }}><CheckSquare size={11} />{t._count.checklist}</span>}
                          {t._count.subTasks > 0 && <span className="row" style={{ gap: 3, alignItems: 'center' }}><GitBranch size={11} />{t._count.subTasks}</span>}
                          {(t._count.attachments ?? 0) > 0 && <span className="row" style={{ gap: 3, alignItems: 'center' }}><Paperclip size={11} />{t._count.attachments}</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {t.assignee ? (
                          <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                            <Avatar name={t.assignee.fullName} src={t.assignee.avatarUrl} size="sm" />
                            <span style={{ fontSize: 13 }}>{t.assignee.fullName}</span>
                          </div>
                        ) : <span className="text-faint">Chưa giao</span>}
                      </td>
                      <td style={{ verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        <Select
                          sizeSm value={t.status}
                          onChange={(e) => changeStatus(t.id, e.target.value)}
                          style={{ minWidth: 110 }}
                        >
                          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </Select>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <TaskPriorityBadge priority={t.priority} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        {t.dueDate ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12.5,
                            whiteSpace: 'nowrap',
                            color: overdue(t) ? 'var(--danger)' : 'var(--text-base)',
                            fontWeight: overdue(t) ? 600 : 400,
                          }}>
                            <Clock size={12} style={{ flexShrink: 0 }} />
                            <span>{fmtDate(t.dueDate)}</span>
                          </span>
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                          <div style={{ flex: 1 }}><Progress value={t.progress} /></div>
                          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>{t.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pageCount > 1 && (
              <div className="row-between">
                <span className="hint">Trang {data.page}/{data.pageCount} · {data.total} công việc</span>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="secondary" disabled={data.page <= 1} onClick={() => setParam('page', String(data.page - 1))}><ChevronLeft /> Trước</Button>
                  <Button size="sm" variant="secondary" disabled={data.page >= data.pageCount} onClick={() => setParam('page', String(data.page + 1))}>Sau <ChevronRight /></Button>
                </div>
              </div>
            )}
          </>
        )
      )}

      {view === 'board' && board && (
        <div className="kanban">
          {board.map((col) => {
            const meta = TASK_STATUS[col.status];
            return (
              <div key={col.status} className="kanban-col">
                <div className="kanban-head">
                  <span className="row" style={{ gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta?.color }} />
                    <span style={{ fontWeight: 620, fontSize: 13 }}>{meta?.label ?? col.status}</span>
                  </span>
                  <Badge>{col.total}</Badge>
                </div>
                <div className="kanban-body scrollbar-none">
                  {col.tasks.length === 0 && <div className="hint" style={{ padding: '16px 8px', textAlign: 'center' }}>Trống</div>}
                  {col.tasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="kanban-card">
                      <div className="row-between" style={{ marginBottom: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{t.code}</span>
                        <TaskPriorityBadge priority={t.priority} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)', marginBottom: 8 }} className="truncate-2">{t.title}</div>
                      <Progress value={t.progress} />
                      <div className="row-between" style={{ marginTop: 9 }}>
                        <div className="row" style={{ gap: 5 }}>
                          {t.assignee && <Avatar name={t.assignee.fullName} src={t.assignee.avatarUrl} size="sm" />}
                          {t.dueDate && (
                            <span style={{ fontSize: 11, color: overdue(t) ? 'var(--danger)' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                              <Clock size={11} style={{ flexShrink: 0 }} />
                              <span>{fmtDate(t.dueDate, 'dd/MM')}</span>
                            </span>
                          )}
                        </div>
                        <div className="row" style={{ gap: 7, color: 'var(--text-faint)', fontSize: 11 }}>
                          {t._count.comments > 0 && <span className="row" style={{ gap: 2 }}><MessageSquare size={11} />{t._count.comments}</span>}
                          {t._count.checklist > 0 && <span className="row" style={{ gap: 2 }}><CheckSquare size={11} />{t._count.checklist}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        departments={departments}
        employees={employees}
        currentEmployeeId={currentEmployeeId}
        canAssign={canAssign}
        onSaved={() => { setFormOpen(false); router.refresh(); }}
      />
    </div>
  );
}
