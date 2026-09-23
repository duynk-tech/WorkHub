'use client';

import React, { useEffect, useState } from 'react';
import { Card, Button, Field, Input, Select, SearchableSelect, Modal, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Check, X, ChevronLeft, ChevronRight, ClipboardList, ShieldAlert } from 'lucide-react';
import {
  TRANSACTION_TYPES,
  REASON_CODES,
  reasonNeedsApproval,
  parseStockCostMetrics,
  getCleanStockNote,
} from '@/server/modules/spare-parts/types';
import {
  listStockTransactionsAction,
  approveStockTransactionAction,
  rejectStockTransactionAction,
} from '@/server/modules/spare-parts/actions';

/** Lịch sử nhập / xuất / điều chuyển kho: lọc, phân trang và duyệt phiếu ghi giảm. */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

const TX_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: 'Đã ghi sổ', color: '#15803d', bg: '#dcfce7' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', color: '#b45309', bg: '#fef3c7' },
  REJECTED: { label: 'Đã từ chối', color: '#b91c1c', bg: '#fee2e2' },
};

export function StockHistoryPanel({
  warehouses = [],
  canApprove = false,
  onOpenStockCount,
}: {
  warehouses?: any[];
  canApprove?: boolean;
  onOpenStockCount?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [type, setType] = useState('ALL');
  const [reasonCode, setReasonCode] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    const res = await listStockTransactionsAction({
      type,
      reasonCode,
      status,
      warehouseId: warehouseId || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      page,
      pageSize: 20,
    });
    setLoading(false);
    if (res.ok) setData(res.data);
    else toast.error(res.message);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, reasonCode, status, warehouseId, from, to, page]);

  // Đổi bộ lọc thì quay về trang 1, nếu không sẽ rơi vào trang trống
  useEffect(() => {
    setPage(1);
  }, [type, reasonCode, status, warehouseId, from, to]);

  const [approveConfirmTx, setApproveConfirmTx] = useState<any>(null);
  const [rejectModalTx, setRejectModalTx] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = (tx: any) => {
    setApproveConfirmTx(tx);
  };

  const confirmApprove = async () => {
    if (!approveConfirmTx) return;
    const tx = approveConfirmTx;
    setBusyId(tx.id);
    const res = await approveStockTransactionAction(tx.id);
    setBusyId(null);
    setApproveConfirmTx(null);
    if (res.ok) {
      toast.success(res.message);
      load();
    } else toast.error(res.message);
  };

  const handleReject = (tx: any) => {
    setRejectModalTx(tx);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectModalTx) return;
    const tx = rejectModalTx;
    setBusyId(tx.id);
    const res = await rejectStockTransactionAction(tx.id, rejectReason.trim());
    setBusyId(null);
    setRejectModalTx(null);
    if (res.ok) {
      toast.success(res.message);
      load();
    } else toast.error(res.message);
  };

  const rows: any[] = data?.rows || [];
  const pendingCount = rows.filter((r) => r.status === 'PENDING_APPROVAL').length;

  const th: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Bộ lọc */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Field label="Loại phiếu">
            <Select value={type} onChange={(e) => setType(e.target.value)} sizeSm>
              <option value="ALL">Tất cả</option>
              {Object.entries(TRANSACTION_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Lý do">
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} sizeSm>
              <option value="ALL">Tất cả lý do</option>
              {Object.entries(REASON_CODES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Trạng thái">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} sizeSm>
              <option value="ALL">Tất cả</option>
              {Object.entries(TX_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Kho">
            <SearchableSelect
              sizeSm
              value={String(warehouseId ?? '')}
              onChange={(val) => setWarehouseId(val ? Number(val) : '')}
              options={[
                { value: '', label: 'Tất cả kho' },
                ...warehouses.map((w: any) => ({ value: String(w.id), label: w.name, subLabel: w.code })),
              ]}
              placeholder="Tất cả kho"
              searchPlaceholder="Tìm kho…"
            />
          </Field>

          <Field label="Từ ngày">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} sizeSm />
          </Field>

          <Field label="Đến ngày">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} sizeSm />
          </Field>

          <Field label="Tìm mã phiếu / linh kiện">
            <Input
              placeholder="Nhập rồi Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  load();
                }
              }}
              sizeSm
            />
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {data ? `${data.total} phiếu · trang ${data.page}/${data.totalPages}` : 'Đang tải…'}
            {pendingCount > 0 && (
              <strong style={{ color: '#b45309' }}> · {pendingCount} phiếu chờ duyệt ở trang này</strong>
            )}
          </span>

          <div style={{ flex: 1 }} />

          {onOpenStockCount && (
            <Button variant="secondary" size="sm" onClick={onOpenStockCount}>
              <ClipboardList size={14} style={{ marginRight: 6 }} /> Kiểm kê kho
            </Button>
          )}
        </div>
      </Card>

      {/* Bảng lịch sử */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--surface-sunken)',
                  borderBottom: '1px solid var(--border-base)',
                  color: 'var(--text-muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                <th style={th}>Mã phiếu</th>
                <th style={th}>Loại</th>
                <th style={th}>Lý do</th>
                <th style={{ ...th, width: '100%' }}>Chi tiết hàng</th>
                <th style={th}>Giá trị</th>
                <th style={th}>Trạng thái</th>
                <th style={th}>Thời gian</th>
                {canApprove && <th style={th}>Duyệt</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canApprove ? 8 : 7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Đang tải…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canApprove ? 8 : 7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Không có phiếu nào khớp bộ lọc
                  </td>
                </tr>
              ) : (
                rows.map((tx: any) => {
                  const typeCfg = TRANSACTION_TYPES[tx.type] || { label: tx.type, color: '#64748b', bg: '#f1f5f9' };
                  const stCfg = TX_STATUSES[tx.status] || TX_STATUSES.COMPLETED;
                  const reason = REASON_CODES[tx.reasonCode];

                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-base)' }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {tx.transCode}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 11,
                            background: typeCfg.bg,
                            color: typeCfg.color,
                          }}
                        >
                          {typeCfg.label}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {reason?.label || tx.reasonCode}
                        {reasonNeedsApproval(tx.reasonCode) && (
                          <ShieldAlert size={12} color="#b45309" style={{ marginLeft: 4, verticalAlign: -2 }} />
                        )}
                      </td>
                      <td style={td}>
                        {tx.items?.map((it: any) => (
                          <div key={it.id} style={{ color: 'var(--text-strong)' }}>
                            {it.item?.name}{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              × {it.quantity} {it.item?.unit}
                            </span>
                          </div>
                        ))}
                        {tx.reason && (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                            {tx.reason}
                          </div>
                        )}
                        {tx.rejectReason && (
                          <div style={{ color: '#b91c1c', marginTop: 2 }}>Từ chối: {tx.rejectReason}</div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {(() => {
                          const cm = tx.type === 'IN' ? parseStockCostMetrics(tx.note) : null;
                          const val = Number(tx.totalValue) || 0;
                          if (cm && (cm.shippingFee > 0 || cm.otherFee > 0)) {
                            return (
                              <div>
                                <div style={{ color: 'var(--text-strong)' }}>{fmt(val)} ₫</div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                                  Hàng: {fmt(cm.merchandiseTotal)} • Cước: {fmt(cm.shippingFee)}
                                  {cm.otherFee > 0 ? ` • Phí: ${fmt(cm.otherFee)}` : ''}
                                </div>
                              </div>
                            );
                          }
                          return val > 0 ? `${fmt(val)} ₫` : '—';
                        })()}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontWeight: 600,
                            fontSize: 11,
                            background: stCfg.bg,
                            color: stCfg.color,
                          }}
                        >
                          {stCfg.label}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {/* Ngày chứng từ, không phải ngày gõ phiếu vào máy */}
                        {new Date(tx.transDate ?? tx.createdAt).toLocaleDateString('vi-VN')}
                        {tx.partnerName && (
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{tx.partnerName}</div>
                        )}
                      </td>
                      {canApprove && (
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {tx.status === 'PENDING_APPROVAL' ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                disabled={busyId === tx.id}
                                onClick={() => handleApprove(tx)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                                title="Duyệt và ghi sổ"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={busyId === tx.id}
                                onClick={() => handleReject(tx)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                                title="Từ chối"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {data && data.totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '10px 14px',
              borderTop: '1px solid var(--border-base)',
            }}
          >
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={14} /> Trước
            </Button>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Trang {data.page} / {data.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </Card>

      {approveConfirmTx && (
        <ConfirmDialog
          open={Boolean(approveConfirmTx)}
          onClose={() => setApproveConfirmTx(null)}
          onConfirm={confirmApprove}
          title="Duyệt phiếu xuất/điều chỉnh kho"
          message={`Duyệt phiếu ${approveConfirmTx.transCode}? Tồn kho thực tế sẽ được cập nhật ngay lập tức.`}
          confirmText="Duyệt phiếu"
          loading={busyId === approveConfirmTx.id}
        />
      )}

      {rejectModalTx && (
        <Modal
          open={Boolean(rejectModalTx)}
          onClose={() => setRejectModalTx(null)}
          title={`Từ chối phiếu ${rejectModalTx.transCode}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejectModalTx(null)} disabled={busyId === rejectModalTx.id}>Hủy</Button>
              <Button variant="danger" onClick={confirmReject} loading={busyId === rejectModalTx.id}>Từ chối phiếu</Button>
            </>
          }
        >
          <Field label="Lý do từ chối">
            <Input
              autoFocus
              placeholder="Nhập lý do từ chối để người lập phiếu biết..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
