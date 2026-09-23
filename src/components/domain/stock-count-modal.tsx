'use client';

import React, { useEffect, useState } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Button, Field, Input, Select, SearchableSelect } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ClipboardList, Save, CheckCircle2 } from 'lucide-react';
import {
  createStockCountAction,
  listStockCountsAction,
  getStockCountAction,
  saveStockCountItemsAction,
  submitStockCountAction,
} from '@/server/modules/spare-parts/actions';

/**
 * Kiểm kê kho: mở đợt → nhập số đếm thực tế → chốt.
 * Chênh lệch sinh ra phiếu điều chỉnh chờ duyệt, đây là đường hợp lệ duy nhất
 * để sửa tồn kho thay vì tạo phiếu xuất/nhập tùy tiện.
 */

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  COUNTING: { label: 'Đang kiểm đếm', color: '#b45309', bg: '#fef3c7' },
  SUBMITTED: { label: 'Chờ duyệt chênh lệch', color: '#1d4ed8', bg: '#dbeafe' },
  COMPLETED: { label: 'Đã cân bằng kho', color: '#15803d', bg: '#dcfce7' },
  CANCELLED: { label: 'Đã hủy', color: '#64748b', bg: '#f1f5f9' },
};

export function StockCountModal({
  open,
  onClose,
  warehouses = [],
  spareParts = [],
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  warehouses?: any[];
  spareParts?: any[];
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState<number | ''>(warehouses[0]?.id || '');
  const [note, setNote] = useState('');
  /** Số đếm thực tế đang nhập, theo itemId. */
  const [counted, setCounted] = useState<Record<number, string>>({});

  const partName = (itemId: number) => spareParts.find((p: any) => p.id === itemId)?.name || `#${itemId}`;
  const partUnit = (itemId: number) => spareParts.find((p: any) => p.id === itemId)?.unit || '';

  const loadList = async () => {
    const res = await listStockCountsAction();
    if (res.ok) setCounts(res.counts);
  };

  useEffect(() => {
    if (open) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openCount = async (id: number) => {
    const res = await getStockCountAction(id);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setCurrent(res.count);
    const map: Record<number, string> = {};
    for (const it of res.count.items) {
      map[it.itemId] = it.countedQty === null ? '' : String(it.countedQty);
    }
    setCounted(map);
  };

  const handleCreate = async () => {
    if (!warehouseId) {
      toast.error('Vui lòng chọn kho cần kiểm kê');
      return;
    }
    setLoading(true);
    const res = await createStockCountAction(Number(warehouseId), note);
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setNote('');
      await loadList();
      await openCount(res.count.id);
      onSuccess?.();
    } else toast.error(res.message);
  };

  const handleSave = async () => {
    if (!current) return;
    setLoading(true);
    const lines = current.items.map((it: any) => ({
      itemId: it.itemId,
      countedQty: counted[it.itemId] === '' || counted[it.itemId] === undefined ? null : Number(counted[it.itemId]),
    }));
    const res = await saveStockCountItemsAction(current.id, lines);
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setCurrent(res.count);
    } else toast.error(res.message);
  };

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const handleSubmit = () => {
    if (!current) return;
    setConfirmSubmitOpen(true);
  };

  const doSubmit = async () => {
    if (!current) return;
    setLoading(true);
    setConfirmSubmitOpen(false);
    await handleSaveSilently();
    const res = await submitStockCountAction(current.id);
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      await loadList();
      await openCount(current.id);
      onSuccess?.();
    } else toast.error(res.message);
  };

  const handleSaveSilently = async () => {
    if (!current) return;
    const lines = current.items.map((it: any) => ({
      itemId: it.itemId,
      countedQty: counted[it.itemId] === '' || counted[it.itemId] === undefined ? null : Number(counted[it.itemId]),
    }));
    await saveStockCountItemsAction(current.id, lines);
  };

  const editable = current?.status === 'COUNTING';
  const diffOf = (it: any) => {
    const v = counted[it.itemId];
    if (v === '' || v === undefined) return null;
    return Number(v) - it.systemQty;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kiểm kê kho phụ tùng"
      description="Đối chiếu tồn sổ sách với số đếm thực tế, chênh lệch phải qua duyệt mới điều chỉnh"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Đóng
          </Button>
          {current && editable && (
            <>
              <Button variant="secondary" onClick={handleSave} loading={loading}>
                <Save size={14} style={{ marginRight: 6 }} /> Lưu số đếm
              </Button>
              <Button variant="primary" onClick={handleSubmit} loading={loading}>
                <CheckCircle2 size={14} style={{ marginRight: 6 }} /> Chốt đợt kiểm kê
              </Button>
            </>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Mở đợt mới */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr 150px',
            gap: 10,
            alignItems: 'flex-end',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-base)',
          }}
        >
          <Field label="Kho cần kiểm kê">
            <SearchableSelect
              sizeSm
              value={String(warehouseId ?? '')}
              onChange={(val) => setWarehouseId(val ? Number(val) : '')}
              options={warehouses.map((w: any) => ({ value: String(w.id), label: w.name, subLabel: w.code }))}
              placeholder="-- Chọn kho --"
              searchPlaceholder="Tìm kho…"
            />
          </Field>
          <Field label="Ghi chú đợt kiểm">
            <Input
              placeholder="VD: Kiểm kê định kỳ cuối quý 3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              sizeSm
            />
          </Field>
          <Button variant="primary" onClick={handleCreate} loading={loading}>
            <ClipboardList size={14} style={{ marginRight: 6 }} /> Mở đợt kiểm
          </Button>
        </div>

        {/* Danh sách đợt */}
        {counts.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {counts.map((c: any) => {
              const st = STATUS_LABELS[c.status] || STATUS_LABELS.COUNTING;
              const active = current?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCount(c.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-base)'}`,
                    background: active ? 'var(--brand-soft)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>{c.countCode}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.warehouse?.name} · {c.items?.length || 0} mặt hàng
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color }}>{st.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Bảng kiểm đếm */}
        {current && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>
                {current.countCode} · {current.warehouse?.name}
              </strong>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: (STATUS_LABELS[current.status] || STATUS_LABELS.COUNTING).bg,
                  color: (STATUS_LABELS[current.status] || STATUS_LABELS.COUNTING).color,
                }}
              >
                {(STATUS_LABELS[current.status] || STATUS_LABELS.COUNTING).label}
              </span>
              {!editable && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Đợt đã chốt — chỉ xem lại số liệu
                </span>
              )}
            </div>

            <div style={{ maxHeight: '44vh', overflowY: 'auto', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-sunken)',
                      color: 'var(--text-muted)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    <th style={{ padding: '9px 12px', textAlign: 'left' }}>Mặt hàng</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', width: 110 }}>Tồn sổ sách</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', width: 130 }}>Đếm thực tế</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', width: 110 }}>Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {current.items.map((it: any) => {
                    const diff = diffOf(it);
                    return (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--border-base)' }}>
                        <td style={{ padding: '7px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>
                          {partName(it.itemId)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          {it.systemQty} {partUnit(it.itemId)}
                        </td>
                        <td style={{ padding: '5px 12px', textAlign: 'right' }}>
                          <Input
                            type="number"
                            min="0"
                            value={counted[it.itemId] ?? ''}
                            onChange={(e) => setCounted({ ...counted, [it.itemId]: e.target.value })}
                            disabled={!editable}
                            sizeSm
                            style={{ textAlign: 'right' }}
                          />
                        </td>
                        <td
                          style={{
                            padding: '7px 12px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: diff === null ? 'var(--text-muted)' : diff === 0 ? '#15803d' : diff > 0 ? '#1d4ed8' : '#b91c1c',
                          }}
                        >
                          {diff === null ? 'chưa đếm' : diff === 0 ? 'khớp' : diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirmSubmitOpen && (
        <ConfirmDialog
          open={confirmSubmitOpen}
          onClose={() => setConfirmSubmitOpen(false)}
          onConfirm={doSubmit}
          title="Chốt đợt kiểm kê"
          message="Bạn có chắc chắn muốn chốt đợt kiểm kê này? Chênh lệch tồn kho sẽ được tự động tạo thành phiếu điều chỉnh chờ duyệt."
          confirmText="Chốt kiểm kê"
          loading={loading}
        />
      )}
    </Modal>
  );
}
