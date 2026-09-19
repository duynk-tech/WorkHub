import { requireAuth, can } from '@/server/auth/context';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Card, CardBody, Badge, Avatar, EmptyState, PageHeader } from '@/components/ui';
import { fmtDateTime } from '@/lib/date';
import { RECORD_SOURCE } from '@/lib/enums';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Nhật ký hệ thống' };
export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  LOGIN: { label: 'Đăng nhập', tone: 'info' },
  CREATE: { label: 'Tạo mới', tone: 'success' },
  UPDATE: { label: 'Cập nhật', tone: 'warning' },
  DELETE: { label: 'Xóa', tone: 'danger' },
  APPROVE: { label: 'Duyệt', tone: 'success' },
  REJECT: { label: 'Từ chối', tone: 'danger' },
  ADJUST: { label: 'Điều chỉnh công', tone: 'warning' },
  IMPORT: { label: 'Nhập dữ liệu', tone: 'info' },
  CHANGE_PASSWORD: { label: 'Đổi mật khẩu', tone: 'warning' },
  RESET_PASSWORD: { label: 'Đặt lại mật khẩu', tone: 'danger' },
  CREATE_ACCOUNT: { label: 'Tạo tài khoản', tone: 'success' },
  UPDATE_ROLES: { label: 'Đổi vai trò', tone: 'warning' },
  ENABLE: { label: 'Kích hoạt', tone: 'success' },
  DISABLE: { label: 'Vô hiệu hóa', tone: 'danger' },
};

const ENTITY_LABELS: Record<string, string> = {
  User: 'Tài khoản', Employee: 'Nhân sự', Department: 'Phòng ban', Role: 'Vai trò',
  Task: 'Công việc', LeaveRequest: 'Đơn nghỉ phép', LeaveBalance: 'Quỹ phép',
  AttendanceRecord: 'Chấm công', AttendanceImportBatch: 'Import chấm công',
  WorkflowDefinition: 'Quy trình duyệt', SystemSetting: 'Cấu hình', McpClient: 'MCP client',
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; entity?: string }> }) {
  const ctx = await requireAuth();
  if (!can(ctx, 'MENU_AUDIT')) redirect('/dashboard');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const pageSize = 50;
  const where = sp.entity ? { entityType: sp.entity } : {};

  const [logs, total, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { username: true, employee: { select: { fullName: true, avatarUrl: true } } } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="stack">
      <PageHeader title="Nhật ký hệ thống" description={`${total} bản ghi — mọi thao tác ghi dữ liệu quan trọng đều được lưu vết`} />

      <Card>
        <CardBody style={{ padding: 14 }}>
          <div className="toolbar">
            <Link href="/settings/audit" className={`btn btn-sm ${!sp.entity ? 'btn-soft' : 'btn-secondary'}`}>Tất cả ({total})</Link>
            {entityTypes.map((e) => (
              <Link
                key={e.entityType}
                href={`/settings/audit?entity=${e.entityType}`}
                className={`btn btn-sm ${sp.entity === e.entityType ? 'btn-soft' : 'btn-secondary'}`}
              >
                {ENTITY_LABELS[e.entityType] ?? e.entityType} ({e._count._all})
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      {logs.length === 0 ? (
        <Card><CardBody><EmptyState icon={<ScrollText size={20} />} title="Chưa có nhật ký" /></CardBody></Card>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Thời điểm</th>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
                <th>Chi tiết</th>
                <th style={{ width: 120 }}>Nguồn / IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const action = ACTION_LABELS[log.action] ?? { label: log.action, tone: 'neutral' };
                return (
                  <tr key={log.id}>
                    <td className="hint tnum">{fmtDateTime(log.createdAt)}</td>
                    <td>
                      {log.actor ? (
                        <div className="row" style={{ gap: 7 }}>
                          <Avatar name={log.actor.employee.fullName} src={log.actor.employee.avatarUrl} size="sm" />
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 540, color: 'var(--text-strong)' }}>{log.actor.employee.fullName}</div>
                            <div className="hint">@{log.actor.username}</div>
                          </div>
                        </div>
                      ) : <span className="text-faint">Hệ thống</span>}
                    </td>
                    <td><Badge tone={action.tone as never}>{action.label}</Badge></td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>{ENTITY_LABELS[log.entityType] ?? log.entityType}</div>
                      {log.entityId && <div className="hint">#{log.entityId}</div>}
                    </td>
                    <td>
                      {log.diffJson ? (
                        <code style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', display: 'block', maxWidth: 380 }}>
                          {JSON.stringify(log.diffJson).slice(0, 160)}
                        </code>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="hint">
                      {RECORD_SOURCE[log.source] ?? log.source}
                      {log.ip && <div>{log.ip}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="row-between">
          <span className="hint">Trang {page}/{pageCount}</span>
          <div className="row" style={{ gap: 6 }}>
            <Link href={`/settings/audit?page=${page - 1}${sp.entity ? `&entity=${sp.entity}` : ''}`} className={`btn btn-secondary btn-sm ${page <= 1 ? 'pointer-none' : ''}`} aria-disabled={page <= 1}>
              <ChevronLeft /> Trước
            </Link>
            <Link href={`/settings/audit?page=${page + 1}${sp.entity ? `&entity=${sp.entity}` : ''}`} className={`btn btn-secondary btn-sm ${page >= pageCount ? 'pointer-none' : ''}`} aria-disabled={page >= pageCount}>
              Sau <ChevronRight />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
