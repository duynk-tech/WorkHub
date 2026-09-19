import Link from 'next/link';
import {
  ListChecks, AlertTriangle, CheckSquare, CalendarDays, Clock, Users,
  ArrowRight, CircleDot, Plane,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { Card, CardHeader, CardTitle, CardBody, StatCard, Badge, Avatar, EmptyState, Progress, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';
import { CheckinWidget } from '@/components/domain/checkin-widget';

export const metadata = { title: 'Tổng quan' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const scopeIds = await visibleEmployeeIds(ctx);
  const scopeWhere = scopeIds === null ? {} : { in: scopeIds };
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const year = today.getFullYear();

  const [myOpenTasks, myOverdue, pendingApprovals, balance, onLeaveToday, myTasks, teamTaskStats, myAttendance, upcomingLeaves] =
    await Promise.all([
      prisma.task.count({ where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
      prisma.task.count({
        where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, dueDate: { lt: new Date() } },
      }),
      prisma.approvalTask.count({ where: { approverId: ctx.employeeId, status: 'PENDING' } }),
      prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: ctx.employeeId, year } } }),
      prisma.leaveRequestDay.findMany({
        where: {
          date: todayStart,
          request: { status: 'APPROVED', ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
        },
        include: {
          request: {
            select: {
              id: true, code: true, employee: { select: { fullName: true, avatarUrl: true, department: { select: { name: true } } } },
              leaveType: { select: { name: true, color: true } },
            },
          },
        },
        take: 8,
      }),
      prisma.task.findMany({
        where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: 6,
        select: { id: true, code: true, title: true, status: true, priority: true, dueDate: true, progress: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: scopeIds === null ? {} : { assigneeId: scopeWhere },
        _count: { _all: true },
      }),
      prisma.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId: ctx.employeeId, workDate: todayStart } },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { gte: todayStart },
          ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true, code: true, startDate: true, endDate: true, totalDays: true,
          employee: { select: { fullName: true, avatarUrl: true } },
          leaveType: { select: { name: true, color: true } },
        },
      }),
    ]);

  const remaining = balance
    ? Number(balance.standardDays) + Number(balance.bonusDays) + Number(balance.carriedOverDays) - Number(balance.usedDays)
    : 0;
  const statusCount = (s: string) => teamTaskStats.find((t) => t.status === s)?._count._all ?? 0;
  const totalTeamTasks = teamTaskStats.reduce((sum, t) => sum + t._count._all, 0);

  const hour = today.getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const displayName =
    ctx.username.toLowerCase() === 'admin' || ctx.fullName.toLowerCase().includes('quản trị')
      ? ctx.username
      : ctx.fullName.trim().split(/\s+/).slice(-1)[0] || ctx.username;

  return (
    <div className="stack">
      <PageHeader
        title={`${greeting}, ${displayName} 👋`}
        description={`Hôm nay là ${fmtDate(today, "EEEE, 'ngày' dd/MM/yyyy")}${ctx.departmentName ? ` · ${ctx.departmentName}` : ''}`}
      />

      <div className="grid-stats">
        <StatCard
          label="Việc đang mở của tôi" value={myOpenTasks} icon={<ListChecks size={16} />}
          hint={myOpenTasks === 0 ? 'Không còn việc tồn đọng' : 'Đang chờ bạn xử lý'}
        />
        <StatCard
          label="Việc quá hạn" value={myOverdue} icon={<AlertTriangle size={16} />}
          tone={myOverdue > 0 ? 'var(--danger)' : undefined}
          hint={myOverdue > 0 ? 'Cần xử lý ngay' : 'Không có việc trễ hạn'}
        />
        <StatCard
          label="Đơn chờ bạn duyệt" value={pendingApprovals} icon={<CheckSquare size={16} />}
          tone={pendingApprovals > 0 ? 'var(--warning)' : undefined}
          hint={pendingApprovals > 0 ? 'Có đơn đang chờ quyết định' : 'Đã xử lý hết'}
        />
        <StatCard
          label={`Phép còn lại ${year}`} value={formatDays(remaining)} icon={<CalendarDays size={16} />}
          tone="var(--success)"
          hint={balance ? `Đã dùng ${formatDays(balance.usedDays)} · Chờ duyệt ${formatDays(balance.pendingDays)}` : 'Chưa thiết lập quỹ phép'}
        />
      </div>

      <div className="grid-2">
        <div className="stack">
          <CheckinWidget
            record={myAttendance ? {
              checkInAt: myAttendance.checkInAt?.toISOString() ?? null,
              checkOutAt: myAttendance.checkOutAt?.toISOString() ?? null,
              lateMinutes: myAttendance.lateMinutes,
              status: myAttendance.status,
            } : null}
          />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Công việc của tôi</CardTitle>
                <div className="card-subtitle">Sắp xếp theo hạn gần nhất</div>
              </div>
              <Link href="/tasks" className="btn btn-ghost btn-sm">Xem tất cả <ArrowRight /></Link>
            </CardHeader>
            <CardBody style={{ padding: myTasks.length ? '6px 8px' : undefined }}>
              {myTasks.length === 0 ? (
                <EmptyState icon={<ListChecks size={20} />} title="Không có việc nào đang mở" description="Bạn đã hoàn thành hết công việc được giao." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {myTasks.map((t) => {
                    const overdue = t.dueDate && t.dueDate < new Date();
                    return (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="list-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{t.code}</span>
                            <TaskPriorityBadge priority={t.priority} />
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{t.title}</div>
                          <div className="row" style={{ gap: 9, marginTop: 5 }}>
                            <TaskStatusBadge status={t.status} />
                            {t.dueDate && (
                              <span style={{
                                fontSize: 11.5,
                                color: overdue ? 'var(--danger)' : 'var(--text-muted)',
                                fontWeight: overdue ? 600 : 400,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap'
                              }}>
                                <Clock size={11} style={{ flexShrink: 0 }} />
                                <span>{fmtDate(t.dueDate)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: 62, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 4 }}>{t.progress}%</div>
                          <Progress value={t.progress} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Nghỉ phép hôm nay</CardTitle>
                <div className="card-subtitle">{onLeaveToday.length} nhân sự vắng mặt</div>
              </div>
              <Link href="/leaves" className="btn btn-ghost btn-sm">Chi tiết <ArrowRight /></Link>
            </CardHeader>
            <CardBody style={{ padding: onLeaveToday.length ? '6px 8px' : undefined }}>
              {onLeaveToday.length === 0 ? (
                <EmptyState icon={<Users size={20} />} title="Không ai nghỉ hôm nay" description="Toàn bộ nhân sự trong phạm vi của bạn đều có mặt." />
              ) : (
                onLeaveToday.map((d) => (
                  <div key={d.id} className="list-row" style={{ cursor: 'default' }}>
                    <Avatar name={d.request.employee.fullName} src={d.request.employee.avatarUrl} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{d.request.employee.fullName}</div>
                      <div className="hint">{d.request.employee.department?.name ?? '—'}</div>
                    </div>
                    <Badge style={{ background: `${d.request.leaveType.color}1f`, color: d.request.leaveType.color }}>
                      {d.request.leaveType.name}
                    </Badge>
                    {Number(d.portion) < 1 && <Badge tone="outline">Nửa ngày</Badge>}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tiến độ công việc {ctx.dataScope === 'SELF' ? 'của tôi' : 'trong phạm vi'}</CardTitle>
                <div className="card-subtitle">Tổng {totalTeamTasks} công việc</div>
              </div>
            </CardHeader>
            <CardBody>
              {totalTeamTasks === 0 ? (
                <EmptyState icon={<CircleDot size={20} />} title="Chưa có dữ liệu công việc" />
              ) : (
                <div className="stack" style={{ gap: 11 }}>
                  {[
                    { key: 'TODO', label: 'Chờ làm', color: 'var(--text-faint)' },
                    { key: 'IN_PROGRESS', label: 'Đang làm', color: 'var(--info)' },
                    { key: 'REVIEW', label: 'Chờ duyệt', color: 'var(--warning)' },
                    { key: 'DONE', label: 'Hoàn thành', color: 'var(--success)' },
                    { key: 'BLOCKED', label: 'Bị chặn', color: 'var(--danger)' },
                  ].map((s) => {
                    const c = statusCount(s.key);
                    const pct = totalTeamTasks ? Math.round((c / totalTeamTasks) * 100) : 0;
                    return (
                      <div key={s.key}>
                        <div className="row-between" style={{ marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text-base)' }}>{s.label}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }} className="tnum">{c} · {pct}%</span>
                        </div>
                        <Progress value={pct} tone={s.color} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lịch nghỉ sắp tới</CardTitle>
            </CardHeader>
            <CardBody style={{ padding: upcomingLeaves.length ? '6px 8px' : undefined }}>
              {upcomingLeaves.length === 0 ? (
                <EmptyState icon={<Plane size={20} />} title="Không có lịch nghỉ sắp tới" />
              ) : (
                upcomingLeaves.map((l) => (
                  <Link key={l.id} href={`/leaves/${l.id}`} className="list-row">
                    <Avatar name={l.employee.fullName} src={l.employee.avatarUrl} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{l.employee.fullName}</div>
                      <div className="hint">{fmtDate(l.startDate)} → {fmtDate(l.endDate)} · {formatDays(l.totalDays)} ngày</div>
                    </div>
                    <Badge style={{ background: `${l.leaveType.color}1f`, color: l.leaveType.color }}>{l.leaveType.name}</Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
