'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, CalendarDays, Filter, ChevronLeft, ChevronRight, Wallet, Clock3, CheckCircle2,
  Hourglass, Users, Pencil,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Avatar, EmptyState, SearchInput,
  Select, SearchableSelect, StatCard, PageHeader, Progress, Field, Input,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { LeaveStatusBadge } from '@/components/domain/task-badges';
import { LeaveRequestModal } from './leave-request-modal';
import { LEAVE_STATUS } from '@/lib/enums';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { updateBalanceAction } from '@/server/modules/leave/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: { rows: any[]; total: number; page: number; pageCount: number; statusCounts: Record<string, number> };
  myBalance: { year: number; standardDays: number; bonusDays: number; carriedOverDays: number; usedDays: number; pendingDays: number; remaining: number };
  teamBalances: any[];
  leaveTypes: any[];
  departments: { id: number; name: string; level: number }[];
  employees: { id: number; fullName: string; code: string }[];
  filter: { search: string; status: string; leaveTypeId: number | null; departmentId: number | null; onlyMine: boolean; page: number };
  year: number;
  currentEmployeeId: number;
  canRequest: boolean;
  canManageBalance: boolean;
  initialTab?: string;
}

export function LeaveScreen({
  data, myBalance, teamBalances, leaveTypes, departments, employees, filter, year,
  canRequest, canManageBalance, initialTab = 'requests',
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filter.search);
  const [requestOpen, setRequestOpen] = useState(false);
  const [tab, setTab] = useState<'requests' | 'balances'>(
    initialTab === 'balances' ? 'balances' : 'requests'
  );

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab');
      if (t === 'requests' || t === 'balances') {
        setTab(t);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (newTab: 'requests' | 'balances') => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newTab === 'requests') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', newTab);
      }
      window.history.replaceState(null, '', url.toString());
    }
  };

  const [balanceEdit, setBalanceEdit] = useState<any | null>(null);
  const [balanceForm, setBalanceForm] = useState({ standardDays: 12, bonusDays: 0, carriedOverDays: 0, note: '' });

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set(key, value) : params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/leaves?${params.toString()}`);
  };

  const openBalanceEdit = (b: any) => {
    setBalanceForm({
      standardDays: Number(b.standardDays), bonusDays: Number(b.bonusDays),
      carriedOverDays: Number(b.carriedOverDays), note: b.note ?? '',
    });
    setBalanceEdit(b);
  };

  const saveBalance = () => {
    if (!balanceEdit) return;
    startTransition(async () => {
      const res = await updateBalanceAction({
        employeeId: balanceEdit.employeeId, year,
        standardDays: Number(balanceForm.standardDays),
        bonusDays: Number(balanceForm.bonusDays),
        carriedOverDays: Number(balanceForm.carriedOverDays),
        note: balanceForm.note,
      });
      if (res.ok) { toast.success(res.message); setBalanceEdit(null); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const usedPercent = myBalance.standardDays + myBalance.bonusDays + myBalance.carriedOverDays > 0
    ? Math.round((myBalance.usedDays / (myBalance.standardDays + myBalance.bonusDays + myBalance.carriedOverDays)) * 100)
    : 0;

  return (
    <div className="stack">
      <PageHeader
        title="Nghỉ phép"
        description={`Quản lý đơn xin nghỉ và quỹ phép năm ${year}`}
        actions={canRequest ? <Button variant="primary" onClick={() => setRequestOpen(true)}><Plus /> Tạo đơn xin nghỉ</Button> : undefined}
      />

      <div className="grid-stats">
        <StatCard
          label={`Phép còn lại ${year}`} value={formatDays(myBalance.remaining)} icon={<Wallet size={16} />}
          tone="var(--success)" hint={`Tổng quỹ ${formatDays(myBalance.standardDays + myBalance.bonusDays + myBalance.carriedOverDays)} ngày`}
          footer={<div style={{ marginTop: 4 }}><Progress value={usedPercent} tone="var(--success)" /></div>}
        />
        <StatCard label="Đã sử dụng" value={formatDays(myBalance.usedDays)} icon={<CheckCircle2 size={16} />} hint={`${usedPercent}% quỹ phép`} />
        <StatCard
          label="Đang chờ duyệt" value={formatDays(myBalance.pendingDays)} icon={<Hourglass size={16} />}
          tone={myBalance.pendingDays > 0 ? 'var(--warning)' : undefined} hint="Số ngày đã giữ chỗ trong quỹ"
        />
        <StatCard
          label="Đơn trong danh sách" value={data.total} icon={<CalendarDays size={16} />}
          hint={`${data.statusCounts.PENDING ?? 0} chờ duyệt · ${data.statusCounts.APPROVED ?? 0} đã duyệt`}
        />
      </div>

      {canManageBalance && (
        <div className="tabs">
          <div className="tab" data-active={tab === 'requests'} onClick={() => handleTabChange('requests')}>Đơn nghỉ phép</div>
          <div className="tab" data-active={tab === 'balances'} onClick={() => handleTabChange('balances')}>Quỹ phép nhân sự ({teamBalances.length})</div>
        </div>
      )}

      {tab === 'requests' ? (
        <>
          <Card>
            <CardBody style={{ padding: 14 }}>
              <div className="toolbar">
                <form style={{ flex: 1, minWidth: 200, maxWidth: 300 }} onSubmit={(e) => { e.preventDefault(); setParam('q', search); }}>
                  <SearchInput placeholder="Tìm mã đơn, người xin, lý do…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </form>

                <Select sizeSm style={{ width: 'auto', minWidth: 140 }} value={filter.status} onChange={(e) => setParam('status', e.target.value)}>
                  <option value="">Mọi trạng thái</option>
                  {Object.entries(LEAVE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>

                <SearchableSelect
                  sizeSm style={{ width: 'auto', minWidth: 170 }}
                  value={filter.leaveTypeId ? String(filter.leaveTypeId) : ''}
                  onChange={(val) => setParam('type', val)}
                  options={[
                    { value: '', label: 'Mọi loại nghỉ' },
                    ...leaveTypes.map((t) => ({ value: String(t.id), label: t.name })),
                  ]}
                  placeholder="Mọi loại nghỉ"
                  searchPlaceholder="Tìm loại nghỉ…"
                />

                <SearchableSelect
                  sizeSm style={{ width: 'auto', minWidth: 180 }}
                  value={filter.departmentId ? String(filter.departmentId) : ''}
                  onChange={(val) => setParam('dept', val)}
                  options={[
                    { value: '', label: 'Mọi phòng ban' },
                    ...departments.map((d) => ({ value: String(d.id), label: `${'　'.repeat(d.level - 1)}${d.name}` })),
                  ]}
                  placeholder="Mọi phòng ban"
                  searchPlaceholder="Tìm phòng ban…"
                />

                <Button size="sm" variant={filter.onlyMine ? 'soft' : 'secondary'} onClick={() => setParam('mine', filter.onlyMine ? '' : '1')}>
                  Đơn của tôi
                </Button>

                {(filter.search || filter.status || filter.leaveTypeId || filter.departmentId || filter.onlyMine) && (
                  <Button size="sm" variant="ghost" onClick={() => router.push('/leaves')}><Filter /> Xóa lọc</Button>
                )}
              </div>
            </CardBody>
          </Card>

          {data.rows.length === 0 ? (
            <Card><CardBody><EmptyState icon={<CalendarDays size={20} />} title="Chưa có đơn nghỉ phép nào" description="Tạo đơn mới hoặc đổi bộ lọc." /></CardBody></Card>
          ) : (
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th style={{ width: 130, minWidth: 120 }}>Mã đơn</th>
                    <th>Người xin nghỉ</th>
                    <th>Loại nghỉ</th>
                    <th>Thời gian</th>
                    <th style={{ width: 80 }} className="num">Số ngày</th>
                    <th>Tiến trình duyệt</th>
                    <th style={{ width: 120 }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const tasks = r.workflow?.tasks ?? [];
                    const doneSteps = new Set(tasks.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.stepOrder)).size;
                    const totalSteps = new Set(tasks.map((t: any) => t.stepOrder)).size;
                    return (
                      <tr key={r.id} onClick={() => router.push(`/leaves/${r.id}`)}>
                        <td style={{ whiteSpace: 'nowrap' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{r.code}</span></td>
                        <td>
                          <div className="row" style={{ gap: 9 }}>
                            <Avatar name={r.employee.fullName} src={r.employee.avatarUrl} size="sm" />
                            <div>
                              <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{r.employee.fullName}</div>
                              <div className="hint">{r.employee.department?.name ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td><Badge style={{ background: `${r.leaveType.color}1f`, color: r.leaveType.color }}>{r.leaveType.name}</Badge></td>
                        <td style={{ fontSize: 12.5 }}>
                          {fmtDate(r.startDate)}
                          {r.startDate !== r.endDate && <> → {fmtDate(r.endDate)}</>}
                        </td>
                        <td className="num tnum">{formatDays(r.totalDays)}</td>
                        <td>
                          {totalSteps > 0 ? (
                            <div className="row" style={{ gap: 7 }}>
                              <div style={{ width: 54 }}><Progress value={(doneSteps / totalSteps) * 100} /></div>
                              <span className="hint tnum">{doneSteps}/{totalSteps} bước</span>
                            </div>
                          ) : <span className="text-faint">—</span>}
                        </td>
                        <td><LeaveStatusBadge status={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.pageCount > 1 && (
            <div className="row-between">
              <span className="hint">Trang {data.page}/{data.pageCount} · {data.total} đơn</span>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="secondary" disabled={data.page <= 1} onClick={() => setParam('page', String(data.page - 1))}><ChevronLeft /> Trước</Button>
                <Button size="sm" variant="secondary" disabled={data.page >= data.pageCount} onClick={() => setParam('page', String(data.page + 1))}>Sau <ChevronRight /></Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Quỹ phép năm {year}</CardTitle>
              <div className="card-subtitle">HR có thể điều chỉnh phép chuẩn, phép thưởng và phép chuyển từ năm trước</div>
            </div>
            <Select sizeSm style={{ width: 'auto' }} value={year} onChange={(e) => setParam('year', e.target.value)}>
              {[year + 1, year, year - 1, year - 2].map((y) => <option key={y} value={y}>Năm {y}</option>)}
            </Select>
          </CardHeader>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th className="num">Phép chuẩn</th>
                  <th className="num">Thưởng</th>
                  <th className="num">Chuyển tiếp</th>
                  <th className="num">Đã dùng</th>
                  <th className="num">Chờ duyệt</th>
                  <th className="num">Còn lại</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {teamBalances.length === 0 && (
                  <tr><td colSpan={8}><EmptyState icon={<Users size={20} />} title="Chưa có dữ liệu quỹ phép" /></td></tr>
                )}
                {teamBalances.map((b) => {
                  const remaining = Number(b.standardDays) + Number(b.bonusDays) + Number(b.carriedOverDays) - Number(b.usedDays);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="row" style={{ gap: 9 }}>
                          <Avatar name={b.employee.fullName} size="sm" />
                          <div>
                            <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{b.employee.fullName}</div>
                            <div className="hint">{b.employee.code} · {b.employee.department?.name ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num tnum">{formatDays(b.standardDays)}</td>
                      <td className="num tnum">{formatDays(b.bonusDays)}</td>
                      <td className="num tnum">{formatDays(b.carriedOverDays)}</td>
                      <td className="num tnum">{formatDays(b.usedDays)}</td>
                      <td className="num tnum" style={{ color: Number(b.pendingDays) > 0 ? 'var(--warning)' : undefined }}>{formatDays(b.pendingDays)}</td>
                      <td className="num tnum" style={{ fontWeight: 620, color: remaining > 0 ? 'var(--success)' : 'var(--danger)' }}>{formatDays(remaining)}</td>
                      <td>
                        <Button size="sm" variant="ghost" iconOnly onClick={() => openBalanceEdit(b)} aria-label="Sửa quỹ phép"><Pencil /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LeaveRequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        leaveTypes={leaveTypes}
        employees={employees}
        remaining={myBalance.remaining - myBalance.pendingDays}
        onSaved={() => { setRequestOpen(false); router.refresh(); }}
      />

      <Modal
        open={Boolean(balanceEdit)}
        onClose={() => setBalanceEdit(null)}
        title={`Quỹ phép ${year} — ${balanceEdit?.employee.fullName ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBalanceEdit(null)}>Hủy</Button>
            <Button variant="primary" onClick={saveBalance} loading={pending}>Lưu</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Phép chuẩn (ngày)" required>
            <Input type="number" step="0.5" value={balanceForm.standardDays} onChange={(e) => setBalanceForm((f) => ({ ...f, standardDays: Number(e.target.value) }))} />
          </Field>
          <Field label="Phép thưởng thêm">
            <Input type="number" step="0.5" value={balanceForm.bonusDays} onChange={(e) => setBalanceForm((f) => ({ ...f, bonusDays: Number(e.target.value) }))} />
          </Field>
          <Field label="Phép chuyển từ năm trước">
            <Input type="number" step="0.5" value={balanceForm.carriedOverDays} onChange={(e) => setBalanceForm((f) => ({ ...f, carriedOverDays: Number(e.target.value) }))} />
          </Field>
          <Field label="Đã dùng (chỉ đọc)">
            <Input value={formatDays(balanceEdit?.usedDays ?? 0)} disabled />
          </Field>
          <Field label="Ghi chú điều chỉnh" className="span-2">
            <Input value={balanceForm.note} onChange={(e) => setBalanceForm((f) => ({ ...f, note: e.target.value }))} placeholder="vd: Thưởng thêm 2 ngày do thâm niên" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
