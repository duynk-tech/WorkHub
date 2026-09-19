'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, RefreshCw, Pencil, Clock, CalendarCheck, AlertTriangle, Plane, Download, FileSpreadsheet,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Avatar, EmptyState, Select, Input,
  Field, PageHeader, StatCard, Alert, Textarea,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { CheckinWidget } from '@/components/domain/checkin-widget';
import { ATTENDANCE_STATUS } from '@/lib/enums';
import { fmtDate, fmtTime } from '@/lib/date';
import { formatMinutes } from '@/lib/utils';
import { adjustAttendanceAction, rollupDayAction, importAttendanceAction } from '@/server/modules/attendance/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  sheet: { rows: any[]; days: string[]; holidays: Record<string, string> };
  myRecord: { checkInAt: string | null; checkOutAt: string | null; lateMinutes: number; status: string } | null;
  departments: { id: number; name: string; level: number }[];
  month: string;
  selectedDept: string;
  canEdit: boolean;
  canImport: boolean;
}

const SHORT_STATUS: Record<string, string> = {
  PRESENT: '✓', LATE: 'M', EARLY_LEAVE: 'S', ABSENT: 'V', LEAVE: 'P',
  HALF_DAY: '½', HOLIDAY: 'L', WEEKEND: '—', WFH: 'R', MISSING_CHECKOUT: '!',
};

export function AttendanceScreen({ sheet, myRecord, departments, month, selectedDept, canEdit, canImport }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editCell, setEditCell] = useState<{ row: any; cell: any } | null>(null);
  const [editForm, setEditForm] = useState({ checkInAt: '', checkOutAt: '', status: 'PRESENT', note: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<any | null>(null);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    value ? params.set(key, value) : params.delete(key);
    router.push(`/attendance?${params.toString()}`);
  };

  const totals = sheet.rows.reduce(
    (acc, r) => ({
      present: acc.present + r.summary.present,
      late: acc.late + r.summary.late,
      absent: acc.absent + r.summary.absent,
      leave: acc.leave + r.summary.leave,
      lateMinutes: acc.lateMinutes + r.summary.totalLateMinutes,
    }),
    { present: 0, late: 0, absent: 0, leave: 0, lateMinutes: 0 },
  );

  const openEdit = (row: any, dateKey: string) => {
    if (!canEdit) return;
    const cell = row.cells[dateKey];
    setEditForm({
      checkInAt: cell?.checkInAt ? cell.checkInAt.slice(0, 16) : `${dateKey}T08:00`,
      checkOutAt: cell?.checkOutAt ? cell.checkOutAt.slice(0, 16) : `${dateKey}T17:30`,
      status: cell?.status ?? 'PRESENT',
      note: '',
    });
    setEditCell({ row, cell: cell ?? { date: dateKey, recordId: null } });
  };

  const saveEdit = () => {
    if (!editCell?.cell.recordId) {
      toast.error('Chưa có bản ghi cho ngày này — hãy chạy "Chốt công" trước để khởi tạo');
      return;
    }
    startTransition(async () => {
      const res = await adjustAttendanceAction({
        recordId: editCell.cell.recordId,
        checkInAt: editForm.checkInAt || null,
        checkOutAt: editForm.checkOutAt || null,
        status: editForm.status,
        note: editForm.note,
      });
      if (res.ok) { toast.success(res.message); setEditCell(null); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const rollup = () => {
    startTransition(async () => {
      const res = await rollupDayAction(new Date().toISOString().slice(0, 10));
      res.ok ? toast.success(res.message) : toast.error(res.message);
      router.refresh();
    });
  };

  /** Parse CSV/TSV dán từ máy chấm công: mã NV, ngày, giờ vào, giờ ra */
  const runImport = () => {
    const lines = importText.trim().split('\n').filter(Boolean);
    const rows = lines
      .map((line) => line.split(/[,\t;]/).map((c) => c.trim()))
      .filter((cols) => cols.length >= 2 && !/^m[aã]/i.test(cols[0]))
      .map((cols) => ({ employeeCode: cols[0], date: cols[1], checkIn: cols[2], checkOut: cols[3] }));

    if (rows.length === 0) { toast.error('Không đọc được dòng dữ liệu hợp lệ nào'); return; }

    startTransition(async () => {
      const res = await importAttendanceAction({ fileName: `paste-${Date.now()}.csv`, rows });
      if (res.ok) { toast.success(res.message); setImportResult(res.result); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const exportCsv = () => {
    const header = ['Mã NV', 'Họ tên', 'Phòng ban', ...sheet.days.map((d) => d.slice(8)), 'Công', 'Muộn', 'Vắng', 'Nghỉ phép', 'Tổng giờ'];
    const lines = [header.join(',')];
    for (const row of sheet.rows) {
      lines.push([
        row.code, `"${row.fullName}"`, `"${row.departmentName ?? ''}"`,
        ...sheet.days.map((d) => SHORT_STATUS[row.cells[d]?.status] ?? ''),
        row.summary.present, row.summary.late, row.summary.absent, row.summary.leave,
        row.summary.totalWorkedHours.toFixed(1),
      ].join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bang-cong-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <PageHeader
        title="Chấm công"
        description={`Bảng công tháng ${month.split('-')[1]}/${month.split('-')[0]} · ${sheet.rows.length} nhân sự`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}><Download /> Xuất CSV</Button>
            {canImport && <Button variant="secondary" onClick={() => { setImportResult(null); setImportOpen(true); }}><Upload /> Import máy chấm công</Button>}
            {canEdit && <Button variant="primary" onClick={rollup} loading={pending}><RefreshCw /> Chốt công hôm nay</Button>}
          </>
        }
      />

      <CheckinWidget record={myRecord} />

      <div className="grid-stats">
        <StatCard label="Lượt công trong tháng" value={totals.present} icon={<CalendarCheck size={16} />} />
        <StatCard label="Lượt đi muộn" value={totals.late} icon={<Clock size={16} />} tone={totals.late > 0 ? 'var(--warning)' : undefined} hint={formatMinutes(totals.lateMinutes)} />
        <StatCard label="Lượt vắng" value={totals.absent} icon={<AlertTriangle size={16} />} tone={totals.absent > 0 ? 'var(--danger)' : undefined} />
        <StatCard label="Lượt nghỉ phép" value={totals.leave} icon={<Plane size={16} />} />
      </div>

      <Card>
        <CardBody style={{ padding: 14 }}>
          <div className="toolbar">
            <Field label="">
              <Input type="month" sizeSm value={month} onChange={(e) => setParam('month', e.target.value)} style={{ width: 160 }} />
            </Field>
            <Select sizeSm style={{ width: 'auto', minWidth: 180 }} value={selectedDept} onChange={(e) => setParam('dept', e.target.value)}>
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{'　'.repeat(d.level - 1)}{d.name}</option>)}
            </Select>
            <div className="row" style={{ gap: 9, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {Object.entries(SHORT_STATUS).map(([k, v]) => (
                <span key={k} className="hint row" style={{ gap: 4 }}>
                  <span style={{
                    display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: 4,
                    fontSize: 10, fontWeight: 700,
                    background: `color-mix(in srgb, ${ATTENDANCE_STATUS[k]?.color ?? 'var(--text-faint)'} 16%, transparent)`,
                    color: ATTENDANCE_STATUS[k]?.color,
                  }}>{v}</span>
                  {ATTENDANCE_STATUS[k]?.label}
                </span>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {sheet.rows.length === 0 ? (
        <Card><CardBody><EmptyState icon={<CalendarCheck size={20} />} title="Không có dữ liệu chấm công" description="Chọn tháng khác hoặc chạy chốt công." /></CardBody></Card>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact attendance-table">
            <thead>
              <tr>
                <th className="sticky-col">Nhân sự</th>
                {sheet.days.map((d) => {
                  const dow = new Date(d).getUTCDay();
                  const isHoliday = Boolean(sheet.holidays[d]);
                  return (
                    <th
                      key={d}
                      style={{
                        textAlign: 'center', padding: '6px 2px', minWidth: 30,
                        color: isHoliday ? 'var(--brand)' : dow === 0 || dow === 6 ? 'var(--text-faint)' : undefined,
                      }}
                      title={sheet.holidays[d] ?? fmtDate(d)}
                    >
                      {d.slice(8)}
                    </th>
                  );
                })}
                <th className="num">Công</th>
                <th className="num">Muộn</th>
                <th className="num">Giờ</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.employeeId}>
                  <td className="sticky-col">
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar name={row.fullName} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{row.fullName}</div>
                        <div className="hint" style={{ whiteSpace: 'nowrap' }}>{row.code}</div>
                      </div>
                    </div>
                  </td>
                  {sheet.days.map((d) => {
                    const cell = row.cells[d];
                    const meta = cell ? ATTENDANCE_STATUS[cell.status] : null;
                    return (
                      <td
                        key={d}
                        style={{ textAlign: 'center', padding: '4px 2px', cursor: canEdit ? 'pointer' : 'default' }}
                        onClick={() => openEdit(row, d)}
                        title={cell
                          ? `${meta?.label}${cell.checkInAt ? ` · vào ${fmtTime(cell.checkInAt)}` : ''}${cell.checkOutAt ? ` · ra ${fmtTime(cell.checkOutAt)}` : ''}${cell.lateMinutes ? ` · muộn ${cell.lateMinutes}p` : ''}`
                          : 'Chưa có dữ liệu'}
                      >
                        {cell ? (
                          <span style={{
                            display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 5,
                            fontSize: 11, fontWeight: 700,
                            background: `color-mix(in srgb, ${meta?.color ?? 'var(--text-faint)'} 15%, transparent)`,
                            color: meta?.color,
                          }}>
                            {SHORT_STATUS[cell.status] ?? '?'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--border-strong)' }}>·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="num tnum">{row.summary.present}</td>
                  <td className="num tnum" style={{ color: row.summary.late > 0 ? 'var(--warning)' : undefined }}>{row.summary.late}</td>
                  <td className="num tnum">{row.summary.totalWorkedHours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(editCell)}
        onClose={() => setEditCell(null)}
        title={`Điều chỉnh công — ${editCell?.row.fullName ?? ''}`}
        description={editCell ? fmtDate(editCell.cell.date, 'EEEE, dd/MM/yyyy') : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditCell(null)}>Hủy</Button>
            <Button variant="primary" onClick={saveEdit} loading={pending}><Pencil /> Lưu điều chỉnh</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Giờ vào">
            <Input type="datetime-local" value={editForm.checkInAt} onChange={(e) => setEditForm((f) => ({ ...f, checkInAt: e.target.value }))} />
          </Field>
          <Field label="Giờ ra">
            <Input type="datetime-local" value={editForm.checkOutAt} onChange={(e) => setEditForm((f) => ({ ...f, checkOutAt: e.target.value }))} />
          </Field>
          <Field label="Trạng thái" className="span-2">
            <Select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
              {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Lý do điều chỉnh" className="span-2" hint="Ghi nhận vào nhật ký hệ thống">
            <Input value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} placeholder="vd: Quên quẹt thẻ, có xác nhận của quản lý" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import dữ liệu máy chấm công"
        description="Dán dữ liệu CSV/TSV theo thứ tự: Mã nhân sự, Ngày, Giờ vào, Giờ ra"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Đóng</Button>
            <Button variant="primary" onClick={runImport} loading={pending}><FileSpreadsheet /> Nhập dữ liệu</Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <Alert tone="info">
            Mỗi dòng một bản ghi, phân cách bằng dấu phẩy hoặc tab. Ví dụ:
            <pre style={{ marginTop: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
NV005,2026-09-18,08:02,17:35{'\n'}NV006,2026-09-18,07:58,17:30
            </pre>
            Bản ghi đã được HR chỉnh tay sẽ không bị ghi đè.
          </Alert>
          <Textarea
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="NV001,2026-09-18,08:00,17:30"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
          />
          {importResult && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <Badge tone="success">Thành công: {importResult.ok}</Badge>
                {importResult.failed > 0 && <Badge tone="danger">Lỗi: {importResult.failed}</Badge>}
              </div>
              {importResult.errors?.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12.5 }}>
                  {importResult.errors.map((e: any, i: number) => (
                    <div key={i} className="hint" style={{ color: 'var(--danger)' }}>Dòng {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
