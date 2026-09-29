'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, SearchableSelect } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Undo2 } from 'lucide-react';
import { createCustomerReturnAction } from '@/server/modules/customer/actions';

/**
 * Khách trả hàng: chọn dòng và số lượng trả, nhập lại kho phần có mã danh mục,
 * rồi chọn giảm trừ công nợ hay hoàn tiền.
 */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

export function CustomerReturnModal({
  open,
  onClose,
  order,
  customerId,
  warehouses = [],
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  order: any;
  customerId: number;
  warehouses?: any[];
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  /** Số lượng trả của từng dòng, theo id dòng đơn hàng. */
  const [qty, setQty] = useState<Record<number, string>>({});
  const [settlement, setSettlement] = useState(
    Number(order?.paidAmount || 0) > 0 ? 'REFUND' : 'CREDIT',
  );
  const [warehouseId, setWarehouseId] = useState<number | ''>(warehouses[0]?.id || '');
  const [reason, setReason] = useState('');
  const [returnedAt, setReturnedAt] = useState(new Date().toISOString().slice(0, 10));

  const lines: any[] = order?.items || [];
  const returnedQuantityByLine = new Map<number, number>();
  for (const customerReturn of order?.returns || []) {
    for (const returnedLine of customerReturn.items || []) {
      if (!returnedLine.orderItemId) continue;
      returnedQuantityByLine.set(
        returnedLine.orderItemId,
        (returnedQuantityByLine.get(returnedLine.orderItemId) || 0) + Number(returnedLine.quantity || 0),
      );
    }
  }
  const remainingQuantity = (line: any) => Math.max(0, Number(line.quantity || 0) - (returnedQuantityByLine.get(line.id) || 0));
  const picked = lines
    .map((l) => ({ line: l, q: Number(qty[l.id] || 0) }))
    .filter((x) => x.q > 0);
  const totalValue = picked.reduce(
    (sum, x) => sum + x.q * Number(x.line.unitPrice || 0),
    0,
  );
  const hasStockable = picked.some((x) => x.line.inventoryItemId);

  const handleSave = async () => {
    if (picked.length === 0) {
      toast.error('Vui lòng nhập số lượng trả cho ít nhất một dòng hàng');
      return;
    }
    const over = picked.find((x) => x.q > remainingQuantity(x.line));
    if (over) {
      toast.error(`Số lượng trả của "${over.line.name}" vượt quá số đã bán`);
      return;
    }

    setLoading(true);
    const res = await createCustomerReturnAction({
      customerId,
      orderId: order.id,
      settlement,
      reason: reason.trim() || undefined,
      returnedAt,
      warehouseId: hasStockable && warehouseId ? Number(warehouseId) : undefined,
      items: picked.map((x) => ({
        orderItemId: x.line.id,
        inventoryItemId: x.line.inventoryItemId || undefined,
        name: x.line.name,
        quantity: x.q,
        unitPrice: Number(x.line.unitPrice || 0),
      })),
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else toast.error(res.message);
  };

  if (!order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Khách trả hàng: ${order.orderCode}`}
      description="Nhập lại kho phần hàng có mã danh mục và xử lý phần tiền tương ứng"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            <Undo2 size={14} style={{ marginRight: 6 }} /> Lập phiếu trả hàng
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
            Chọn hàng khách trả lại
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lines.map((l: any) => (
              <div
                key={l.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 90px 110px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-base)',
                  fontSize: 12.5,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {l.inventoryItemId ? 'Có mã kho — nhập lại được' : 'Không có mã kho — chỉ giảm tiền'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                  Còn trả {remainingQuantity(l)} / {l.quantity}
                </div>
                <Input
                  type="number"
                  min="0"
                  max={remainingQuantity(l)}
                  placeholder="0"
                  value={qty[l.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                  disabled={remainingQuantity(l) === 0}
                  sizeSm
                  style={{ textAlign: 'right' }}
                />
                <div style={{ textAlign: 'right', fontWeight: 600 }}>
                  {fmt(Number(qty[l.id] || 0) * Number(l.unitPrice || 0))} ₫
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Xử lý tiền">
            <Select value={settlement} onChange={(e) => setSettlement(e.target.value)}>
              <option value="CREDIT">Giảm trừ công nợ</option>
              <option value="REFUND">Hoàn tiền cho khách</option>
            </Select>
          </Field>

          <Field label="Kho nhận lại hàng">
            <SearchableSelect
              value={String(warehouseId ?? '')}
              onChange={(val) => setWarehouseId(val ? Number(val) : '')}
              disabled={!hasStockable}
              options={warehouses.map((w: any) => ({ value: String(w.id), label: w.name, subLabel: w.code }))}
              placeholder="-- Chọn kho --"
              searchPlaceholder="Tìm kho…"
            />
          </Field>

          <Field label="Ngày trả">
            <Input type="date" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Lý do trả hàng">
          <Input
            placeholder="VD: Giao nhầm mã, hàng lỗi kỹ thuật..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: settlement === 'REFUND' ? '#fef3c7' : '#e0f2fe',
            color: settlement === 'REFUND' ? '#92400e' : '#0369a1',
            fontSize: 13,
          }}
        >
          <span>
            {settlement === 'REFUND'
              ? 'Hoàn tiền: số đã thu của đơn giảm tương ứng'
              : 'Giảm trừ: công nợ còn lại của đơn giảm tương ứng'}
          </span>
          <strong style={{ fontSize: 16 }}>{fmt(totalValue)} ₫</strong>
        </div>
      </div>
    </Modal>
  );
}
