'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Save, Target, UserPlus } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Progress } from '@/components/ui';
import { PriceInput } from '@/components/ui/price-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/components/ui/toast';
import { targetProgress } from '@/lib/sales-target';
import { saveSalesTargetsAction, copyPreviousTargetsAction } from '@/server/modules/customer/target-actions';

interface Row { employeeId: number; name: string; department: string | null; target: number; billed: number; orders: number }

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

export function TargetsScreen({
  year, month, canManage, progressDay, daysInMonth, rows: initialRows, allEmployees,
}: {
  year: number; month: number; canManage: boolean;
  /** 0 = tháng tương lai (chưa có tiến độ). */
  progressDay: number; daysInMonth: number;
  rows: Row[]; allEmployees: { id: number; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState('');
  const dirty = rows.some((r) => r.target !== (initialRows.find((i) => i.employeeId === r.employeeId)?.target ?? 0));

  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);

  const totals = useMemo(() => {
    const target = rows.reduce((s, r) => s + r.target, 0);
    const billed = rows.reduce((s, r) => s + r.billed, 0);
    return { target, billed, p: progressDay ? targetProgress(billed, target, progressDay, daysInMonth) : null };
  }, [rows, progressDay, daysInMonth]);

  const save = () => startTransition(async () => {
    const r = await saveSalesTargetsAction(year, month, rows.map((x) => ({ employeeId: x.employeeId, amount: x.target })));
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.message);
  });
  const copyPrev = () => startTransition(async () => {
    const r = await copyPreviousTargetsAction(year, month);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.message);
  });
  const addEmployee = (id: string) => {
    const emp = allEmployees.find((e) => String(e.id) === id);
    if (emp && !rows.some((r) => r.employeeId === emp.id)) {
      setRows((rs) => [...rs, { employeeId: emp.id, name: emp.name, department: null, target: 0, billed: 0, orders: 0 }]);
    }
    setAdding('');
  };

  return (
    <div className="stack">
      <PageHeader
        title="Chỉ tiêu doanh số"
        description="Đặt chỉ tiêu theo tháng cho từng nhân viên kinh doanh; doanh số tính theo ngày đặt đơn, không gồm đơn hủy."
        actions={
          <>
            <Link href="/sales" className="btn btn-ghost">Về Bán hàng</Link>
            {canManage && <Button variant="secondary" onClick={copyPrev} disabled={pending}><Copy /> Chép tháng trước</Button>}
            {canManage && <Button variant="primary" onClick={save} loading={pending} disabled={!dirty}><Save /> Lưu chỉ tiêu</Button>}
          </>
        }
      />

      <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6 }}>
          <Link href={`/sales/targets?m=${prev}`} className="btn btn-secondary btn-sm btn-icon" aria-label="Tháng trước"><ChevronLeft /></Link>
          <strong style={{ minWidth: 120, textAlign: 'center', fontSize: 15 }}>Tháng {month}/{year}</strong>
          <Link href={`/sales/targets?m=${next}`} className="btn btn-secondary btn-sm btn-icon" aria-label="Tháng sau"><ChevronRight /></Link>
        </div>
        {canManage && (
          <div style={{ width: 280 }}>
            <SearchableSelect
              value={adding}
              onChange={addEmployee}
              placeholder="Thêm nhân viên vào bảng…"
              options={allEmployees.filter((e) => !rows.some((r) => r.employeeId === e.id)).map((e) => ({ value: String(e.id), label: e.name }))}
              sizeSm
            />
          </div>
        )}
      </div>

      <div className="grid-stats">
        <Card className="stat-card"><span className="stat-label">Tổng chỉ tiêu</span><span className="stat-value">{money(totals.target)}</span></Card>
        <Card className="stat-card"><span className="stat-label">Đã đạt</span><span className="stat-value">{money(totals.billed)}</span>
          {totals.p?.pct != null && <span className="hint">{Math.round(totals.p.pct * 100)}% chỉ tiêu</span>}</Card>
        <Card className="stat-card"><span className="stat-label">Dự báo cuối tháng</span><span className="stat-value">{progressDay ? money(totals.p?.forecast ?? 0) : '—'}</span>
          {totals.p?.forecastPct != null && <span className="hint">{Math.round(totals.p.forecastPct * 100)}% chỉ tiêu nếu giữ tốc độ hiện tại</span>}</Card>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<Target size={20} />} title="Chưa có nhân viên nào trong bảng" description={canManage ? 'Dùng ô "Thêm nhân viên" để bắt đầu đặt chỉ tiêu.' : undefined} /></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th className="num" style={{ width: 200 }}>Chỉ tiêu</th>
                <th className="num">Đã đạt</th>
                <th style={{ width: 220 }}>Tiến độ</th>
                <th className="num">Dự báo cuối tháng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = progressDay ? targetProgress(r.billed, r.target, progressDay, daysInMonth) : null;
                return (
                  <tr key={r.employeeId}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{r.name}</div>
                      <div className="hint">{r.department ?? ''}{r.department ? ' · ' : ''}{r.orders} đơn</div>
                    </td>
                    <td className="num">
                      {canManage ? (
                        <PriceInput
                          value={r.target || undefined}
                          onChange={(v) => setRows((rs) => rs.map((x) => (x.employeeId === r.employeeId ? { ...x, target: v ?? 0 } : x)))}
                          placeholder="0"
                          style={{ textAlign: 'right', height: 32 }}
                        />
                      ) : money(r.target)}
                    </td>
                    <td className="num">{money(r.billed)}</td>
                    <td>
                      {p?.pct != null ? (
                        <div className="row" style={{ gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <Progress value={Math.round(p.pct * 100)} tone={p.pct >= 1 ? 'var(--success)' : (p.forecastPct ?? 0) >= 1 ? 'var(--brand)' : 'var(--warning)'} />
                          </div>
                          <span className="tnum" style={{ fontSize: 12.5, width: 40, textAlign: 'right' }}>{Math.round(p.pct * 100)}%</span>
                        </div>
                      ) : <span className="hint">{r.target ? 'Chưa tới tháng' : 'Chưa đặt chỉ tiêu'}</span>}
                    </td>
                    <td className="num">{p ? money(p.forecast) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canManage && <p className="hint" style={{ margin: 0 }}><UserPlus size={12} style={{ verticalAlign: -2 }} /> Để chỉ tiêu bằng 0 rồi lưu để bỏ người đó khỏi tháng này.</p>}
    </div>
  );
}
