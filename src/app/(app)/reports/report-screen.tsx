'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import {
  Download, Users, ListChecks, AlertTriangle, CheckCircle2, CalendarDays, Clock, TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, StatCard, PageHeader, Input, Select, EmptyState,
} from '@/components/ui';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';
import { formatMinutes } from '@/lib/utils';
import { REPORT_GROUPS, type ReportDef, type ReportGroupKey } from '@/server/modules/report/registry';
import { InventoryReportPanel } from '@/components/domain/inventory-report-panel';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CHART_COLORS = ['#2447eb', '#0f9960', '#c77700', '#d92d20', '#8b5cf6', '#0b7fd4', '#ec4899'];

const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' };
const tooltipStyle = {
  background: 'var(--surface-card)', border: '1px solid var(--border-base)',
  borderRadius: 8, fontSize: 12, boxShadow: 'var(--shadow-md)', color: 'var(--text-strong)',
};

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

export function ReportScreen({
  tab, reports, groups, overview, attendance, tasks, leaves, debt, filters, canExport,
}: {
  tab: string;
  reports: ReportDef[];
  groups: ReportGroupKey[];
  overview: { headcount: number; openTasks: number; overdueTasks: number; doneThisMonth: number; pendingLeaves: number; onLeaveToday: number };
  attendance: any; tasks: any; leaves: any; debt: any;
  filters: { month: string; from: string; to: string; year: number };
  canExport: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/reports?${params.toString()}`);
  };

  const current = reports.find((r) => r.key === tab);
  const activeGroup = current?.group;
  const groupReports = reports.filter((r) => r.group === activeGroup);

  /** Chọn nhóm thì mở báo cáo đầu tiên của nhóm đó. */
  const openGroup = (g: ReportGroupKey) => {
    const first = reports.find((r) => r.group === g);
    if (first) setParam('tab', first.key);
  };

  // Chỉ ba báo cáo nhân sự / công việc có sẵn file xuất; báo cáo bán hàng tự xuất trong panel
  const exportUrl = tab === 'attendance'
    ? `/api/reports/export?type=attendance&month=${filters.month}`
    : tab === 'task'
      ? `/api/reports/export?type=task&from=${filters.from}&to=${filters.to}`
      : tab === 'leave'
        ? `/api/reports/export?type=leave&year=${filters.year}`
        : '';

  return (
    <div className="stack">
      <PageHeader
        title="Báo cáo"
        description={activeGroup ? REPORT_GROUPS[activeGroup].description : 'Chưa có báo cáo nào được bật'}
        actions={canExport && exportUrl ? <a href={exportUrl} className="btn btn-primary"><Download /> Xuất Excel</a> : undefined}
      />

      {reports.length === 0 ? (
        <EmptyState
          title="Chưa có báo cáo nào được bật"
          description="Vào Cấu hình hệ thống → Báo cáo để bật những báo cáo đơn vị cần dùng"
        />
      ) : (
        <>
          <div className="tabs">
            {groups.map((g) => (
              <div key={g} className="tab" data-active={activeGroup === g} onClick={() => openGroup(g)}>
                {REPORT_GROUPS[g].label}
              </div>
            ))}
          </div>

          {/* Nhóm chỉ có một báo cáo thì không cần hàng chọn thứ hai */}
          {groupReports.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {groupReports.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setParam('tab', r.key)}
                  title={r.description}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: tab === r.key ? 'var(--brand)' : 'var(--border-base)',
                    background: tab === r.key ? 'var(--brand-soft, #eef2ff)' : 'var(--surface-card)',
                    color: tab === r.key ? 'var(--brand)' : 'var(--text-muted)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'attendance' && attendance && (
        <div className="stack">
          <div className="grid-stats">
            <StatCard label="Nhân sự đang làm việc" value={overview.headcount} icon={<Users size={16} />} />
            <StatCard
              label="Đơn nghỉ chờ duyệt" value={overview.pendingLeaves} icon={<CalendarDays size={16} />}
              hint={`${overview.onLeaveToday} người nghỉ hôm nay`}
            />
          </div>

          <Card>
            <CardBody style={{ padding: 14 }}>
              <div className="toolbar">
                <span className="label">Tháng báo cáo</span>
                <Input type="month" sizeSm style={{ width: 160 }} value={filters.month} onChange={(e) => setParam('month', e.target.value)} />
              </div>
            </CardBody>
          </Card>

          <div className="grid-stats">
            <StatCard label="Tổng lượt công" value={attendance.totals.workDays} icon={<CheckCircle2 size={16} />} />
            <StatCard label="Lượt đi muộn" value={attendance.totals.lateCount} icon={<Clock size={16} />} tone="var(--warning)" />
            <StatCard label="Lượt vắng" value={attendance.totals.absentCount} icon={<AlertTriangle size={16} />} tone={attendance.totals.absentCount > 0 ? 'var(--danger)' : undefined} />
            <StatCard label="Tổng giờ làm" value={attendance.totals.workedHours} icon={<TrendingUp size={16} />} hint="Giờ công thực tế toàn danh sách" />
          </div>

          <Card>
            <CardHeader><CardTitle>Chấm công theo phòng ban</CardTitle></CardHeader>
            <CardBody>
              {attendance.byDepartment.length === 0 ? <EmptyState title="Chưa có dữ liệu" /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={attendance.byDepartment} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="department" tick={axisStyle} interval={0} angle={-12} textAnchor="end" height={64} />
                    <YAxis tick={axisStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="workDays" name="Số công" fill="#2447eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lateCount" name="Lượt muộn" fill="#c77700" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="absentCount" name="Lượt vắng" fill="#d92d20" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Chi tiết theo nhân sự</CardTitle></CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Nhân sự</th><th>Phòng ban</th>
                    <th className="num">Công</th><th className="num">Muộn</th><th className="num">Phút muộn</th>
                    <th className="num">Vắng</th><th className="num">Nghỉ phép</th><th className="num">Giờ làm</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.employees.map((e: any) => (
                    <tr key={e.code}>
                      <td>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{e.fullName}</div>
                        <div className="hint">{e.code}</div>
                      </td>
                      <td className="hint">{e.department}</td>
                      <td className="num tnum">{e.workDays}</td>
                      <td className="num tnum" style={{ color: e.lateCount > 0 ? 'var(--warning)' : undefined }}>{e.lateCount}</td>
                      <td className="num tnum hint">{e.lateMinutes ? formatMinutes(e.lateMinutes) : '—'}</td>
                      <td className="num tnum" style={{ color: e.absentCount > 0 ? 'var(--danger)' : undefined }}>{e.absentCount}</td>
                      <td className="num tnum">{e.leaveDays}</td>
                      <td className="num tnum">{e.workedHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'task' && tasks && (
        <div className="stack">
          {/* Số liệu tức thời, không phụ thuộc khoảng ngày của báo cáo bên dưới */}
          <div className="grid-stats">
            <StatCard
              label="Việc đang mở" value={overview.openTasks} icon={<ListChecks size={16} />}
              hint={`${overview.doneThisMonth} việc hoàn thành trong tháng`}
            />
            <StatCard
              label="Việc quá hạn" value={overview.overdueTasks} icon={<AlertTriangle size={16} />}
              tone={overview.overdueTasks > 0 ? 'var(--danger)' : undefined}
            />
          </div>

          <Card>
            <CardBody style={{ padding: 14 }}>
              <div className="toolbar">
                <span className="label">Từ ngày</span>
                <Input type="date" sizeSm style={{ width: 150 }} value={filters.from} onChange={(e) => setParam('from', e.target.value)} />
                <span className="label">Đến ngày</span>
                <Input type="date" sizeSm style={{ width: 150 }} value={filters.to} onChange={(e) => setParam('to', e.target.value)} />
              </div>
            </CardBody>
          </Card>

          <div className="grid-stats">
            <StatCard label="Tổng công việc" value={tasks.totals.total} icon={<ListChecks size={16} />} />
            <StatCard label="Tỷ lệ hoàn thành" value={`${tasks.totals.completionRate}%`} icon={<CheckCircle2 size={16} />} tone="var(--success)" hint={`${tasks.totals.done} việc đã xong`} />
            <StatCard label="Tỷ lệ đúng hạn" value={`${tasks.totals.onTimeRate}%`} icon={<Clock size={16} />} hint={`${tasks.totals.lateDone} việc hoàn thành trễ`} />
            <StatCard label="Đang quá hạn" value={tasks.totals.overdueOpen} icon={<AlertTriangle size={16} />} tone={tasks.totals.overdueOpen > 0 ? 'var(--danger)' : undefined} />
          </div>

          <div className="grid-2">
            <Card>
              <CardHeader><CardTitle>Phân bố theo trạng thái</CardTitle></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={Object.entries(tasks.byStatus).map(([k, v]) => ({ name: TASK_STATUS[k]?.label ?? k, value: v }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}
                    >
                      {Object.keys(tasks.byStatus).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>Phân bố theo mức ưu tiên</CardTitle></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={Object.entries(tasks.byPriority).map(([k, v]) => ({ name: TASK_PRIORITY[k]?.label ?? k, value: v }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="name" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Số việc" fill="#2447eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Hiệu suất theo nhân sự</CardTitle></CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Nhân sự</th><th>Phòng ban</th>
                    <th className="num">Tổng</th><th className="num">Xong</th><th className="num">Đúng hạn</th>
                    <th className="num">Trễ</th><th className="num">Đang mở</th><th className="num">Quá hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.byAssignee.map((a: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{a.name}</td>
                      <td className="hint">{a.department}</td>
                      <td className="num tnum">{a.total}</td>
                      <td className="num tnum">{a.done}</td>
                      <td className="num tnum" style={{ color: 'var(--success)' }}>{a.onTime}</td>
                      <td className="num tnum" style={{ color: a.late > 0 ? 'var(--warning)' : undefined }}>{a.late}</td>
                      <td className="num tnum">{a.open}</td>
                      <td className="num tnum" style={{ color: a.overdue > 0 ? 'var(--danger)' : undefined }}>{a.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'sales-inventory' && <InventoryReportPanel />}

      {tab === 'customer-debt' && debt && (
        <div className="stack">
          <div className="grid-stats">
            <StatCard label="Tổng phải thu" value={`${money(debt.totals.outstanding)} ₫`} icon={<Wallet size={16} />} hint={`${debt.customerCount} khách còn nợ`} />
            <StatCard label="Trong đó quá hạn" value={`${money(debt.totals.overdue)} ₫`} icon={<AlertTriangle size={16} />} tone={debt.totals.overdue > 0 ? 'var(--danger)' : undefined} />
            <StatCard label="Đã xuất hóa đơn" value={`${money(debt.totals.totalBilled)} ₫`} icon={<TrendingUp size={16} />} />
            <StatCard label="Đã thu" value={`${money(debt.totals.totalPaid)} ₫`} icon={<CheckCircle2 size={16} />} tone="var(--success)" />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tuổi nợ phải thu</CardTitle>
                <div className="card-subtitle">
                  Tính theo số ngày quá hạn thanh toán của từng đơn; đơn chưa đặt hạn được xếp vào cột trong hạn
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={[
                    { name: 'Trong hạn', value: debt.totals.buckets.current },
                    { name: 'Quá 1–30 ngày', value: debt.totals.buckets.d1to30 },
                    { name: 'Quá 31–60 ngày', value: debt.totals.buckets.d31to60 },
                    { name: 'Quá trên 60 ngày', value: debt.totals.buckets.over60 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="name" tick={axisStyle} />
                  <YAxis tick={axisStyle} tickFormatter={(v: number) => money(v / 1_000_000)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${money(Number(v))} ₫`} />
                  <Bar dataKey="value" name="Số tiền" radius={[4, 4, 0, 0]}>
                    {['#0f9960', '#c77700', '#d97706', '#d92d20'].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="hint" style={{ textAlign: 'right', marginTop: 4 }}>Đơn vị trục dọc: triệu đồng</div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Công nợ theo khách hàng</CardTitle>
                <div className="card-subtitle">Sắp xếp theo số phải thu giảm dần</div>
              </div>
            </CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th className="num">Số đơn</th>
                    <th className="num">Đã xuất</th>
                    <th className="num">Đã thu</th>
                    <th className="num">Còn phải thu</th>
                    <th className="num">Quá hạn</th>
                    <th className="num">Trễ nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {debt.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Không còn khoản phải thu nào
                      </td>
                    </tr>
                  ) : (
                    debt.rows.map((r: any) => (
                      <tr key={r.customerId}>
                        <td>
                          <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{r.name}</div>
                          <div className="hint">{[r.code, r.phone].filter(Boolean).join(' · ') || '—'}</div>
                        </td>
                        <td className="num tnum">{r.orderCount}</td>
                        <td className="num tnum hint">{money(r.totalBilled)}</td>
                        <td className="num tnum hint">{money(r.totalPaid)}</td>
                        <td className="num tnum" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                          {money(r.outstanding)}
                        </td>
                        <td className="num tnum" style={{ color: r.overdue > 0 ? 'var(--danger)' : undefined }}>
                          {r.overdue > 0 ? money(r.overdue) : '—'}
                        </td>
                        <td className="num tnum">
                          {r.maxOverdueDays > 0 ? (
                            <Badge tone={r.maxOverdueDays > 60 ? 'danger' : 'warning'}>{r.maxOverdueDays} ngày</Badge>
                          ) : (
                            <span className="hint">Trong hạn</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'leave' && leaves && (
        <div className="stack">
          <div className="grid-stats">
            <StatCard label="Nhân sự đang làm việc" value={overview.headcount} icon={<Users size={16} />} />
            <StatCard
              label="Đơn nghỉ chờ duyệt" value={overview.pendingLeaves} icon={<CalendarDays size={16} />}
              hint={`${overview.onLeaveToday} người nghỉ hôm nay`}
            />
          </div>

          <Card>
            <CardBody style={{ padding: 14 }}>
              <div className="toolbar">
                <span className="label">Năm báo cáo</span>
                <Select sizeSm style={{ width: 'auto' }} value={filters.year} onChange={(e) => setParam('year', e.target.value)}>
                  {[filters.year + 1, filters.year, filters.year - 1, filters.year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </div>
            </CardBody>
          </Card>

          <div className="grid-stats">
            <StatCard label="Tổng đơn nghỉ" value={leaves.totals.requests} icon={<CalendarDays size={16} />} />
            <StatCard label="Đã duyệt" value={leaves.totals.approved} icon={<CheckCircle2 size={16} />} tone="var(--success)" />
            <StatCard label="Chờ duyệt" value={leaves.totals.pending} icon={<Clock size={16} />} tone={leaves.totals.pending > 0 ? 'var(--warning)' : undefined} />
            <StatCard label="Tổng ngày nghỉ" value={leaves.totals.totalDays} icon={<TrendingUp size={16} />} />
          </div>

          <div className="grid-2">
            <Card>
              <CardHeader><CardTitle>Ngày nghỉ theo tháng</CardTitle></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={leaves.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="days" name="Số ngày nghỉ" stroke="#2447eb" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>Theo loại nghỉ phép</CardTitle></CardHeader>
              <CardBody>
                {leaves.byType.length === 0 ? <EmptyState title="Chưa có đơn nào được duyệt" /> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={leaves.byType} dataKey="days" nameKey="type" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                        {leaves.byType.map((t: any, i: number) => <Cell key={i} fill={t.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quỹ phép nhân sự {filters.year}</CardTitle>
                <div className="card-subtitle">Sắp xếp theo số ngày còn lại — nhắc nhở nhân sự dùng phép trước khi hết hạn</div>
              </div>
            </CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Nhân sự</th><th>Phòng ban</th>
                    <th className="num">Chuẩn</th><th className="num">Thưởng</th><th className="num">Chuyển tiếp</th>
                    <th className="num">Đã dùng</th><th className="num">Chờ duyệt</th><th className="num">Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.balances.map((b: any) => (
                    <tr key={b.code}>
                      <td>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{b.fullName}</div>
                        <div className="hint">{b.code}</div>
                      </td>
                      <td className="hint">{b.department}</td>
                      <td className="num tnum">{b.standard}</td>
                      <td className="num tnum">{b.bonus}</td>
                      <td className="num tnum">{b.carried}</td>
                      <td className="num tnum">{b.used}</td>
                      <td className="num tnum">{b.pending}</td>
                      <td className="num tnum">
                        <Badge tone={b.remaining > 5 ? 'warning' : b.remaining > 0 ? 'success' : 'neutral'}>{b.remaining}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
