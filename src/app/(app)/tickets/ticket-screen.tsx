'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Input, Select, Field, usePaged, Pagination, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  Wrench,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  UserCheck,
  Package,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/server/modules/equipment/types';
import {
  updateTicketStatusAction,
  deleteTicketAction,
} from '@/server/modules/equipment/ticket-actions';
import { TicketModal, TicketCloseModal } from '@/components/domain/ticket-modals';
import { QuickReplacePartModal } from '@/components/domain/spare-parts-modals';

/** Màn hình tiếp nhận và xử lý sự cố / bảo dưỡng máy F&B. */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

/** Nút biểu tượng trong cột thao tác — giữ hàng gọn, chú thích bằng tooltip. */
const iconBtn = (bg: string, color: string): React.CSSProperties => ({
  padding: '5px 7px',
  borderRadius: 'var(--radius-sm)',
  background: bg,
  color,
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
});

export function TicketScreen({
  tickets,
  metrics,
  equipments,
  technicians,
  spareParts,
  warehouses,
  canManage,
}: {
  tickets: any[];
  metrics: { open: number; inProgress: number; overdueSla: number; resolvedThisMonth: number };
  equipments: any[];
  technicians: any[];
  spareParts: any[];
  warehouses: any[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = useState('OPEN_ONLY');
  const [priority, setPriority] = useState('ALL');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<any>(null);
  const [closeTicket, setCloseTicket] = useState<any>(null);
  const [partTicket, setPartTicket] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const visible = tickets.filter((t: any) => {
    if (status === 'OPEN_ONLY' && ['RESOLVED', 'CLOSED'].includes(t.status)) return false;
    if (status !== 'ALL' && status !== 'OPEN_ONLY' && t.status !== status) return false;
    if (priority !== 'ALL' && t.priority !== priority) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${t.ticketCode} ${t.title} ${t.equipment?.machineCode} ${t.equipment?.name} ${t.customer?.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Phiếu sự cố dồn theo năm; chỉ đổ ra màn hình một trang mỗi lần
  const paged = usePaged(visible, 20);

  const handleStatus = async (ticket: any, next: string) => {
    const res = await updateTicketStatusAction(ticket.id, next);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.message);
  };

  const [deleteTicket, setDeleteTicket] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDeleteTicket = async () => {
    if (!deleteTicket) return;
    setDeleting(true);
    try {
      const res = await deleteTicketAction(deleteTicket.id);
      if (res.ok) {
        toast.success(res.message);
        setDeleteTicket(null);
        router.refresh();
      } else toast.error(res.message);
    } finally {
      setDeleting(false);
    }
  };

  const cards = [
    { label: 'Chờ tiếp nhận / đã phân công', value: metrics.open, color: '#d97706', bg: '#fef3c7', icon: AlertTriangle },
    { label: 'Đang xử lý', value: metrics.inProgress, color: '#2563eb', bg: '#eff6ff', icon: Wrench },
    { label: 'Trễ cam kết SLA', value: metrics.overdueSla, color: '#dc2626', bg: '#fee2e2', icon: Clock },
    { label: 'Hoàn tất trong tháng', value: metrics.resolvedThisMonth, color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle2 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
            Sự cố & Sửa chữa
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Tiếp nhận báo hỏng, phân công kỹ thuật, thay linh kiện và nghiệm thu
          </p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} style={{ marginRight: 6 }} /> Tạo phiếu sự cố
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, color: c.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <c.icon size={19} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{c.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Field label="Trạng thái">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} sizeSm>
              <option value="OPEN_ONLY">Đang mở (chưa đóng)</option>
              <option value="ALL">Tất cả</option>
              {Object.entries(TICKET_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mức độ">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} sizeSm>
              <option value="ALL">Tất cả</option>
              {['P1_CRITICAL', 'P2_MAJOR', 'MEDIUM', 'P3_ROUTINE'].map((k) => (
                <option key={k} value={k}>
                  {TICKET_PRIORITIES[k]?.label || k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tìm kiếm">
            <Input
              placeholder="Mã phiếu, tên máy, khách hàng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sizeSm
            />
          </Field>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
          Hiển thị {visible.length} / {tickets.length} phiếu
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Không có phiếu nào khớp bộ lọc
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--surface-sunken)',
                    borderBottom: '1px solid var(--border-base)',
                    color: 'var(--text-muted)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>Mã phiếu</th>
                  <th style={{ padding: '10px 12px', width: '100%' }}>Sự cố / Máy</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>Mức độ</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>Kỹ thuật viên</th>
                  <th style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>Hạn xử lý</th>
                  {canManage && <th style={{ padding: '10px 12px' }} />}
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((t: any) => {
                  const pr = TICKET_PRIORITIES[t.priority] || { label: t.priority, color: '#64748b', bg: '#f1f5f9' };
                  const st = TICKET_STATUSES[t.status] || { label: t.status, color: '#64748b', bg: '#f1f5f9' };
                  const closed = ['RESOLVED', 'CLOSED'].includes(t.status);
                  const overdue = !closed && t.slaDeadline && new Date(t.slaDeadline) < new Date();
                  const expanded = expandedId === t.id;
                  const parts = t.partsUsed || [];
                  const partsCost = parts.reduce(
                    (sum: number, p: any) => sum + Number(p.unitCost || p.unitPrice || 0) * p.quantity,
                    0,
                  );

                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        style={{ borderBottom: '1px solid var(--border-base)', cursor: 'pointer' }}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                          {t.ticketCode}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{t.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {t.equipment?.machineCode} · {t.equipment?.name}
                            {t.customer ? ` — ${t.customer.name}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: pr.bg, color: pr.color }}>
                            {pr.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: t.assignedTo ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                          {t.assignedTo?.fullName || 'Chưa phân công'}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
                          {t.slaDeadline
                            ? new Date(t.slaDeadline).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                            : '—'}
                          {overdue && ' · TRỄ'}
                        </td>
                        {canManage && (
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {!closed && t.status !== 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatus(t, 'IN_PROGRESS')}
                                  style={iconBtn('#fef3c7', '#b45309')}
                                  title="Bắt đầu xử lý"
                                >
                                  <PlayCircle size={14} />
                                </button>
                              )}
                              {!closed && (
                                <button type="button" onClick={() => setPartTicket(t)} style={iconBtn('#eff6ff', '#2563eb')} title="Thay linh kiện">
                                  <Package size={14} />
                                </button>
                              )}
                              {t.status !== 'CLOSED' && (
                                <button type="button" onClick={() => setCloseTicket(t)} style={iconBtn('#dcfce7', '#15803d')} title="Nghiệm thu & đóng phiếu">
                                  <CheckCircle2 size={14} />
                                </button>
                              )}
                              <button type="button" onClick={() => setEditTicket(t)} style={iconBtn('var(--surface-sunken)', 'var(--text-strong)')} title="Sửa / phân công">
                                <UserCheck size={14} />
                              </button>
                              {parts.length === 0 && (
                                <button type="button" onClick={() => setDeleteTicket(t)} style={iconBtn('var(--surface-sunken)', 'var(--danger)')} title="Xóa phiếu">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {expanded && (
                        <tr style={{ borderBottom: '1px solid var(--border-base)', background: 'var(--surface-sunken)' }}>
                          <td colSpan={canManage ? 7 : 6} style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                              {t.description && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Mô tả: </span>
                                  {t.description}
                                </div>
                              )}
                              <div style={{ color: 'var(--text-muted)' }}>
                                Tiếp nhận {new Date(t.createdAt).toLocaleString('vi-VN')}
                                {t.reportedBy && ` · báo bởi ${t.reportedBy}`}
                                {t.reportedPhone && ` (${t.reportedPhone})`}
                                {t.location && ` · ${t.location.name}`}
                              </div>
                              {parts.length > 0 && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Linh kiện đã thay: </span>
                                  {parts.map((p: any, i: number) => (
                                    <span key={p.id}>
                                      {i > 0 && ', '}
                                      {p.item?.name} × {p.quantity}
                                    </span>
                                  ))}
                                  <span style={{ color: 'var(--text-muted)' }}> · giá vốn {fmt(partsCost)} ₫</span>
                                </div>
                              )}
                              {t.resolutionNote && (
                                <div style={{ color: '#15803d' }}>Kết quả: {t.resolutionNote}</div>
                              )}
                              {t.equipment && (
                                <Link href={`/equipment/${t.equipment.id}`} style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                                  Mở hồ sơ máy →
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination {...paged} unit="phiếu sự cố" />
        </Card>
      )}

      {(createOpen || editTicket) && (
        <TicketModal
          open={createOpen || Boolean(editTicket)}
          ticket={editTicket}
          equipments={equipments}
          technicians={technicians}
          onClose={() => {
            setCreateOpen(false);
            setEditTicket(null);
          }}
          onSuccess={() => router.refresh()}
        />
      )}

      {closeTicket && (
        <TicketCloseModal
          open={Boolean(closeTicket)}
          ticket={closeTicket}
          onClose={() => setCloseTicket(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {partTicket && (
        <QuickReplacePartModal
          open={Boolean(partTicket)}
          equipment={partTicket.equipment}
          ticketId={partTicket.id}
          spareParts={spareParts}
          warehouses={warehouses}
          onClose={() => setPartTicket(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTicket)}
        onClose={() => setDeleteTicket(null)}
        onConfirm={confirmDeleteTicket}
        title="Xóa phiếu sự cố"
        message={`Bạn có chắc chắn muốn xóa phiếu ${deleteTicket?.ticketCode}? Thao tác này không thể hoàn tác.`}
        confirmText="Xác nhận xóa"
        danger
        loading={deleting}
      />
    </div>
  );
}
