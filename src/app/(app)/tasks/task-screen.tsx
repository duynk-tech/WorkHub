'use client';

import { SavedViewsBar } from '@/components/ui/saved-views';
import React, { useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, ListChecks, LayoutGrid, List as ListIcon, Filter, MessageSquare, CheckSquare,
  Paperclip, ChevronLeft, ChevronRight, Clock, AlertTriangle, GitBranch, Download, SlidersHorizontal,
} from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Avatar, EmptyState, SearchInput, Select, SearchableSelect, Input, Progress, PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useDebouncedSearch } from '@/components/ui/url-state';
import { isTaskOverdue } from '@/lib/task-state';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';
import { TaskFormModal, type TaskFormValue } from './task-form-modal';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';
import { fmtDate } from '@/lib/date';
import { bulkTaskAction, updateTaskStatusAction } from '@/server/modules/task/actions';
import {
  TASK_DATE_FIELDS, TASK_DATE_PRESETS, describeDateFilter,
  type TaskDateField, type TaskDatePreset,
} from '@/server/modules/task/date-filter';

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
  filter: {
    search: string; status: string[]; pickedStatus: string[]; scope: string;
    priority: string[];
    assigneeId: number | null; departmentId: number | null;
    onlyMine: boolean; overdue: boolean; sort: string; page: number;
    dateField: TaskDateField; datePreset: TaskDatePreset;
    dateFrom: string | null; dateTo: string | null; noDate: boolean;
    customFrom: string; customTo: string;
  };
  scopeCounts: { open: number; closed: number; all: number };
  currentEmployeeId: number;
  canCreate: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export function TaskScreen({
  view, data, board, departments, employees, filter, scopeCounts, currentEmployeeId, canCreate, canAssign,
  canDelete, canExport,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const search = useDebouncedSearch();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormValue | null>(null);
  const [draggingTask, setDraggingTask] = useState<{ id: number; status: string } | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // Kéo thả trên Kanban: thẻ chuyển cột ngay lập tức, server xác nhận sau.
  // Lỗi (thiếu quyền, checklist chưa xong...) thì refresh trả thẻ về chỗ cũ.
  const [optimisticBoard, moveOptimistic] = useOptimistic(
    board,
    (state, move: { id: number; from: string; to: string }) => {
      if (!state) return state;
      const card = state.find((c) => c.status === move.from)?.tasks.find((t) => t.id === move.id);
      if (!card) return state;
      return state.map((c) => {
        if (c.status === move.from) return { ...c, tasks: c.tasks.filter((t) => t.id !== move.id), total: c.total - 1 };
        if (c.status === move.to) return { ...c, tasks: [{ ...card, status: move.to }, ...c.tasks], total: c.total + 1 };
        return c;
      });
    },
  );

  const moveTask = (id: number, from: string, to: string) => {
    if (from === to) return;
    startTransition(async () => {
      moveOptimistic({ id, from, to });
      const res = await updateTaskStatusAction(id, to);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  };

  const handleKanbanDrop = (targetStatus: string) => {
    setDragOverStatus(null);
    if (!draggingTask || draggingTask.status === targetStatus) {
      setDraggingTask(null);
      return;
    }
    const { id, status } = draggingTask;
    setDraggingTask(null);
    moveTask(id, status, targetStatus);
  };

  // Chọn nhiều dòng để thao tác hàng loạt
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const pageIds = data?.rows.map((t) => t.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(pageIds));

  const runBulk = async (payload: { action: 'status' | 'assign' | 'delete'; status?: string; assigneeId?: number | null }) => {
    if (!selected.size) return;
    if (payload.action === 'delete' && !window.confirm(`Xóa ${selected.size} công việc đã chọn? Không thể hoàn tác.`)) return;
    setBulkBusy(true);
    const res = await bulkTaskAction({ ids: [...selected], ...payload });
    setBulkBusy(false);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
    if (res.failed.length) {
      toast.error(res.failed.slice(0, 3).map((f) => f.message).join(' · '));
    }
    setSelected(new Set());
    router.refresh();
  };

  const setParam = (key: string, value: string) => setParams({ [key]: value });

  /** Đặt nhiều tham số trong một lần điều hướng; giá trị rỗng thì xóa tham số. */
  const setParams = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      value ? params.set(key, value) : params.delete(key);
    }
    if (!('page' in next)) params.delete('page');
    router.push(`/tasks?${params.toString()}`);
  };

  /**
   * File Excel phải khớp với danh sách đang xem, nên dùng lại nguyên tham số URL
   * hiện tại, chỉ bỏ phân trang vì bản xuất lấy hết chứ không theo trang.
   */
  const exportUrl = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    params.delete('view');
    const qs = params.toString();
    return `/api/tasks/export${qs ? `?${qs}` : ''}`;
  })();

  const dateLabel = describeDateFilter(filter.dateField, filter.datePreset, {
    from: filter.dateFrom, to: filter.dateTo, noDate: filter.noDate,
  });

  const overdue = (t: TaskRow) => isTaskOverdue(t);

  const advancedFilterCount =
    (filter.pickedStatus.length ? 1 : 0) +
    (filter.priority.length ? 1 : 0) +
    (filter.assigneeId ? 1 : 0) +
    (filter.departmentId ? 1 : 0) +
    (dateLabel ? 1 : 0);
  const [showFilters, setShowFilters] = useState(advancedFilterCount > 0);
  const hasAnyFilter = Boolean(
    filter.search || advancedFilterCount > 0 || filter.onlyMine || filter.overdue,
  );

  const filterBar = (
    <Card>
      <CardBody style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Hàng 1 gọn 1 dòng: Tìm kiếm + Lọc nhanh + Nút Bộ lọc nâng cao + Chuyển chế độ xem */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 220px', maxWidth: 340 }}>
            <SearchInput placeholder="Tìm mã hoặc tiêu đề công việc…" value={search.value} onChange={(e) => search.onChange(e.target.value)} />
          </div>

          <Button size="sm" variant={filter.onlyMine ? 'soft' : 'secondary'} onClick={() => setParam('mine', filter.onlyMine ? '' : '1')}>
            Của tôi
          </Button>
          <Button size="sm" variant={filter.overdue ? 'danger-soft' : 'secondary'} onClick={() => setParam('overdue', filter.overdue ? '' : '1')}>
            <AlertTriangle /> Quá hạn
          </Button>

          <Button
            size="sm"
            variant={showFilters || advancedFilterCount > 0 ? 'soft' : 'secondary'}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} />
            <span>Bộ lọc{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}</span>
          </Button>

          {hasAnyFilter && (
            <Button size="sm" variant="ghost" onClick={() => router.push(`/tasks?view=${view}`)}>
              <Filter /> Xóa lọc
            </Button>
          )}

          <div className="row" style={{ marginLeft: 'auto', gap: 4 }}>
            <Button size="sm" variant={view === 'list' ? 'soft' : 'ghost'} iconOnly onClick={() => setParam('view', 'list')} aria-label="Dạng danh sách"><ListIcon /></Button>
            <Button size="sm" variant={view === 'board' ? 'soft' : 'ghost'} iconOnly onClick={() => setParam('view', 'board')} aria-label="Dạng bảng"><LayoutGrid /></Button>
          </div>
        </div>

        {/* Hàng 2 (ẩn gọn mặc định, mở khi bấm Bộ lọc): lưới tự co giãn theo màn hình */}
        {showFilters && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
              gap: 8,
              paddingTop: 10,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <Select
              sizeSm
              value={filter.pickedStatus[0] ?? ''}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(TASK_STATUS)
                .filter(([k]) => filter.scope === 'all' || filter.status.length === 0 || filter.status.includes(k) || filter.pickedStatus.includes(k))
                .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>

            <Select
              sizeSm
              value={filter.priority[0] ?? ''}
              onChange={(e) => setParam('priority', e.target.value)}
            >
              <option value="">Mọi ưu tiên</option>
              {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>

            <SearchableSelect
              sizeSm
              value={filter.assigneeId ? String(filter.assigneeId) : ''}
              onChange={(val) => setParam('assignee', val)}
              options={[
                { value: '', label: 'Mọi người thực hiện' },
                ...employees.map((e) => ({ value: String(e.id), label: e.fullName, subLabel: e.code })),
              ]}
              placeholder="Mọi người thực hiện"
              searchPlaceholder="Tìm nhân sự…"
            />

            <SearchableSelect
              sizeSm
              value={filter.departmentId ? String(filter.departmentId) : ''}
              onChange={(val) => setParam('dept', val)}
              options={[
                { value: '', label: 'Mọi phòng ban' },
                ...departments.map((d) => ({ value: String(d.id), label: `${'　'.repeat(d.level - 1)}${d.name}` })),
              ]}
              placeholder="Mọi phòng ban"
              searchPlaceholder="Tìm phòng ban…"
            />

            <Select
              sizeSm
              value={filter.dateField}
              onChange={(e) => setParams({ dfield: e.target.value })}
            >
              {Object.entries(TASK_DATE_FIELDS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>

            <Select
              sizeSm
              value={filter.datePreset}
              onChange={(e) =>
                setParams(
                  e.target.value === 'CUSTOM'
                    ? { drange: 'CUSTOM' }
                    : { drange: e.target.value === 'ALL' ? '' : e.target.value, dfrom: '', dto: '' },
                )
              }
            >
              {Object.entries(TASK_DATE_PRESETS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>

            {filter.datePreset === 'CUSTOM' && (
              <div className="row" style={{ gap: 6, gridColumn: 'span 2' }}>
                <Input
                  type="date" sizeSm
                  value={filter.customFrom}
                  onChange={(e) => setParams({ dfrom: e.target.value })}
                />
                <span className="hint">→</span>
                <Input
                  type="date" sizeSm
                  value={filter.customTo}
                  onChange={(e) => setParams({ dto: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="stack">
      <PageHeader
        title="Công việc"
        description={
          view !== 'list'
            ? 'Bảng Kanban theo trạng thái'
            : (dateLabel ? `${dateLabel} · ` : '') + (filter.scope === 'closed'
              ? `${data?.total ?? 0} việc đã hoàn thành hoặc đã hủy — tra cứu lại khi cần`
              : filter.scope === 'all'
                ? `${data?.total ?? 0} công việc, tính cả việc đã đóng`
                : `${data?.total ?? 0} việc còn đang chạy trong phạm vi của bạn`)
        }
        actions={
          canExport || canCreate ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canExport && (
                <a href={exportUrl} className="btn btn-secondary" title="Tải danh sách đang lọc ra file Excel">
                  <Download /> Xuất Excel
                </a>
              )}
              {canCreate && (
                <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus /> Tạo công việc
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <SavedViewsBar module="tasks" />

      {view === 'list' && (
        <div className="tabs">
          {([
            { key: 'open', label: 'Đang làm', count: scopeCounts.open },
            { key: 'closed', label: 'Đã đóng', count: scopeCounts.closed },
            { key: 'all', label: 'Tất cả', count: scopeCounts.all },
          ] as const).map((t) => (
            <div
              key={t.key}
              className="tab"
              data-active={filter.scope === t.key}
              onClick={() => setParam('scope', t.key === 'open' ? '' : t.key)}
            >
              {t.label} ({t.count})
            </div>
          ))}
        </div>
      )}

      {filterBar}

      {view === 'list' && data && (
        data.rows.length === 0 ? (
          <Card><CardBody><EmptyState
            icon={<ListChecks size={20} />}
            title={filter.scope === 'closed' ? 'Chưa có việc nào được đóng' : 'Không có việc nào đang chạy'}
            description={
              filter.scope === 'closed'
                ? 'Việc hoàn thành hoặc bị hủy sẽ được lưu lại ở đây.'
                : scopeCounts.closed > 0
                  ? `Tất cả đã xong. Xem ${scopeCounts.closed} việc đã đóng ở tab "Đã đóng".`
                  : 'Thử đổi bộ lọc hoặc tạo công việc mới.'
            }
          /></CardBody></Card>
        ) : (
          <>
            {selected.size > 0 && (
              <Card style={{ position: 'sticky', top: 8, zIndex: 5 }}>
                <CardBody style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>Đã chọn {selected.size}</strong>
                  <Select
                    sizeSm
                    value=""
                    disabled={bulkBusy}
                    aria-label="Đổi trạng thái các việc đã chọn"
                    onChange={(e) => e.target.value && runBulk({ action: 'status', status: e.target.value })}
                    style={{ width: 'auto' }}
                  >
                    <option value="">Đổi trạng thái…</option>
                    {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                  {canAssign && (
                    <Select
                      sizeSm
                      value=""
                      disabled={bulkBusy}
                      aria-label="Giao các việc đã chọn cho"
                      onChange={(e) => e.target.value && runBulk({ action: 'assign', assigneeId: e.target.value === 'none' ? null : Number(e.target.value) })}
                      style={{ width: 'auto', maxWidth: 220 }}
                    >
                      <option value="">Giao cho…</option>
                      <option value="none">— Bỏ người thực hiện —</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </Select>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="danger-soft" loading={bulkBusy} onClick={() => runBulk({ action: 'delete' })}>
                      Xóa
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
                </CardBody>
              </Card>
            )}
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Chọn tất cả công việc trên trang" />
                    </th>
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
                    <tr key={t.id} onClick={() => router.push(`/tasks/${t.id}`)} data-selected={selected.has(t.id) || undefined}>
                      <td style={{ verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Chọn ${t.code}`} />
                      </td>
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
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <TaskStatusBadge status={t.status} />
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

            <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <span className="hint">
                Hiện <strong>{(data.page - 1) * 20 + 1}</strong>–
                <strong>{Math.min(data.page * 20, data.total)}</strong> trong{' '}
                <strong>{data.total}</strong> công việc
              </span>

              {data.pageCount > 1 && (
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="secondary" disabled={data.page <= 1} onClick={() => setParam('page', String(data.page - 1))}><ChevronLeft /> Trước</Button>
                  <span className="hint" style={{ minWidth: 78, textAlign: 'center' }}>Trang {data.page} / {data.pageCount}</span>
                  <Button size="sm" variant="secondary" disabled={data.page >= data.pageCount} onClick={() => setParam('page', String(data.page + 1))}>Sau <ChevronRight /></Button>
                </div>
              )}
            </div>
          </>
        )
      )}

      {view === 'board' && optimisticBoard && (
        <div className="kanban">
          {optimisticBoard.map((col, colIndex) => {
            const meta = TASK_STATUS[col.status];
            const isDropTarget = dragOverStatus === col.status && draggingTask?.status !== col.status;
            return (
              <div
                key={col.status}
                className="kanban-col"
                style={{
                  '--col': meta?.color ?? 'var(--text-muted)',
                  outline: isDropTarget ? '2px dashed var(--brand)' : undefined,
                  background: isDropTarget ? 'var(--brand-soft)' : undefined,
                  transition: 'outline 120ms ease, background 120ms ease',
                } as React.CSSProperties}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== col.status) setDragOverStatus(col.status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDragOverStatus((prev) => (prev === col.status ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleKanbanDrop(col.status);
                }}
              >
                <div className="kanban-head">
                  <span style={{ fontWeight: 620, fontSize: 13, color: 'var(--text-strong)' }}>
                    {meta?.label ?? col.status}
                  </span>
                  <span className="kanban-count">{col.total}</span>
                </div>
                <div className="kanban-body scrollbar-none">
                  {col.tasks.length === 0 && (
                    <div className="hint" style={{ padding: '16px 8px', textAlign: 'center' }}>
                      {isDropTarget ? 'Thả vào đây để chuyển trạng thái' : 'Trống'}
                    </div>
                  )}
                  {col.tasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      draggable
                      onDragStart={() => setDraggingTask({ id: t.id, status: col.status })}
                      onDragEnd={() => { setDraggingTask(null); setDragOverStatus(null); }}
                      onKeyDown={(e) => {
                        // Bàn phím thay cho kéo thả: Shift + ←/→ chuyển thẻ sang cột kế bên
                        if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                        e.preventDefault();
                        const target = optimisticBoard[colIndex + (e.key === 'ArrowRight' ? 1 : -1)];
                        if (target) moveTask(t.id, col.status, target.status);
                      }}
                      title="Kéo thả hoặc Shift + ←/→ để chuyển trạng thái"
                      className="kanban-card"
                      data-overdue={Boolean(overdue(t))}
                      data-muted={['DONE', 'CANCELLED'].includes(t.status)}
                      style={{ opacity: draggingTask?.id === t.id ? 0.5 : 1, cursor: 'grab' }}
                    >
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
                          {t._count.subTasks > 0 && <span className="row" style={{ gap: 2 }}><GitBranch size={11} />{t._count.subTasks}</span>}
                          {(t._count.attachments ?? 0) > 0 && <span className="row" style={{ gap: 2 }}><Paperclip size={11} />{t._count.attachments}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {col.tasks.length < col.total && (
                    <Button
                      size="sm"
                      variant="ghost"
                      style={{ width: '100%' }}
                      onClick={() => setParams({ more: String(Math.max(...optimisticBoard.map((c) => c.tasks.length)) + 50), view: 'board' })}
                    >
                      Xem thêm {col.total - col.tasks.length} thẻ
                    </Button>
                  )}
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
