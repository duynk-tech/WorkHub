'use client';

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { fmtDateTime } from '@/lib/date';
import { getCustomerHistoryAction, type HistoryEntry } from '@/server/modules/history/actions';

const ENTITY_LABEL: Record<string, string> = {
  Customer: 'Hồ sơ khách', CustomerOrder: 'Đơn hàng', CustomerQuotation: 'Báo giá',
  ServiceTicket: 'Phiếu sự cố', CustomerPayment: 'Phiếu thu',
};
const ACTION_LABEL: Record<string, string> = {
  CREATE: 'tạo mới', UPDATE: 'cập nhật', DELETE: 'xoá', CANCEL: 'huỷ', ASSIGN: 'phân công', STATUS: 'đổi trạng thái',
  QUICK_SALE: 'bán nhanh', CONVERT: 'chốt thành đơn', EXPIRE: 'hết hiệu lực', RECORD: 'ghi nhận',
};
const FIELD_LABEL: Record<string, string> = {
  name: 'Tên', code: 'Mã', contactName: 'Người liên hệ', phone: 'Điện thoại', email: 'Email', address: 'Địa chỉ', notes: 'Ghi chú',
  status: 'Trạng thái', totalAmount: 'Tổng tiền', orderDate: 'Ngày đặt', deliveryDate: 'Ngày giao', dueDate: 'Hạn thanh toán',
  salespersonId: 'Nhân viên KD', validUntil: 'Hiệu lực đến', assignedTo: 'Kỹ thuật', resolutionNote: 'Ghi chú xử lý',
};

const show = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return new Intl.NumberFormat('vi-VN').format(v);
  return String(v);
};

function describe(e: HistoryEntry): { title: string; changes: [string, unknown, unknown][] } {
  const d = (e.diff ?? {}) as Record<string, unknown>;
  const code = (d.orderCode ?? d.quoteCode ?? d.ticketCode ?? d.code ?? '') as string;
  const title = `${ENTITY_LABEL[e.entityType] ?? e.entityType}${code ? ` ${code}` : ''} — ${ACTION_LABEL[e.action] ?? e.action.toLowerCase()}`;
  const raw = (d.changes ?? (e.entityType === 'Customer' ? d : null)) as Record<string, { from: unknown; to: unknown }> | null;
  const changes: [string, unknown, unknown][] = raw
    ? Object.entries(raw).filter(([, v]) => v && typeof v === 'object' && 'to' in v).map(([k, v]) => [FIELD_LABEL[k] ?? k, v.from, v.to])
    : [];
  if (e.action === 'STATUS' && d.status) changes.push(['Trạng thái', null, d.status]);
  if (e.action === 'ASSIGN' && d.assignedTo) changes.push(['Kỹ thuật', null, d.assignedTo]);
  return { title, changes };
}

/** Nút "Lịch sử" ở hồ sơ khách: mở dòng thời gian mọi thay đổi của khách và chứng từ liên quan. */
export function CustomerHistoryButton({ customerId }: { customerId: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: number) => {
    setLoading(true);
    const r = await getCustomerHistoryAction(customerId, after).catch(() => ({ ok: false, message: 'Không tải được lịch sử', items: [], nextCursor: null }));
    setLoading(false);
    if (!r.ok) { setError(r.message ?? 'Không tải được lịch sử'); return; }
    setItems((cur) => (after ? [...(cur ?? []), ...r.items] : r.items));
    setCursor(r.nextCursor);
  }, [customerId]);

  useEffect(() => { if (open && items === null) void load(); }, [open, items, load]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><History /> Lịch sử thay đổi</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Lịch sử thay đổi" description="Ai đã sửa gì trên hồ sơ, đơn hàng, báo giá, phiếu thu và phiếu sự cố của khách này" size="lg">
        {error ? (
          <div className="alert alert-danger">{error}</div>
        ) : items === null ? (
          <div className="stack" style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 44 }} />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<History size={20} />} title="Chưa có thay đổi nào được ghi nhận" description="Các lần sửa từ nay về sau sẽ hiện ở đây." />
        ) : (
          <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((e) => {
              const { title, changes } = describe(e);
              return (
                <li key={e.id} className="timeline-item">
                  <span className="timeline-dot" data-state={e.action === 'DELETE' || e.action === 'CANCEL' ? 'rejected' : e.action === 'CREATE' ? 'approved' : undefined}>
                    <History />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-strong)' }}>{title}</div>
                    <div className="hint">{e.actor ?? 'Hệ thống'} · {fmtDateTime(e.at)}</div>
                    {changes.length > 0 && (
                      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', fontSize: 12.5 }}>
                        {changes.map(([f, from, to]) => (
                          <li key={f} style={{ color: 'var(--text-base)' }}>
                            <span className="hint">{f}:</span>{' '}
                            {from !== null && from !== undefined && <><s style={{ color: 'var(--text-muted)' }}>{show(from)}</s> → </>}
                            <strong style={{ fontWeight: 500 }}>{show(to)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {cursor && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Button variant="ghost" size="sm" loading={loading} onClick={() => load(cursor)}>Xem cũ hơn</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
