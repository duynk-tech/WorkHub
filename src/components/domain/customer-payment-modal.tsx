'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Wallet } from 'lucide-react';
import { PAYMENT_METHODS } from '@/server/modules/customer/types';
import { recordCustomerPaymentAction } from '@/server/modules/customer/actions';

/** Ghi nhận khách thanh toán — cho một đơn cụ thể hoặc thu chung trừ dần công nợ. */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

export function CustomerPaymentModal({
  open,
  onClose,
  customerId,
  customerName,
  orders = [],
  defaultOrderId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  orders?: any[];
  defaultOrderId?: number;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  /** Đơn còn nợ, kèm số còn lại để gợi ý thu đúng số. */
  const unpaid = orders
    .filter((o: any) => o.status !== 'CANCELLED')
    .map((o: any) => ({
      ...o,
      remaining: Math.max(0, Number(o.totalAmount || 0) - Number(o.paidAmount || 0)),
    }))
    .filter((o: any) => o.remaining > 0);

  const [orderId, setOrderId] = useState<number | ''>(defaultOrderId || '');
  const selected = unpaid.find((o: any) => o.id === Number(orderId));

  const [amount, setAmount] = useState<number>(selected?.remaining || 0);
  const [method, setMethod] = useState('TRANSFER');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const totalOutstanding = unpaid.reduce((sum: number, o: any) => sum + o.remaining, 0);

  const handleSelectOrder = (id: number | '') => {
    setOrderId(id);
    const o = unpaid.find((x: any) => x.id === Number(id));
    setAmount(o ? o.remaining : totalOutstanding);
  };

  const handleSave = async () => {
    if (!amount || amount <= 0) {
      toast.error('Vui lòng nhập số tiền đã thu');
      return;
    }

    setLoading(true);
    const res = await recordCustomerPaymentAction({
      customerId,
      orderId: orderId ? Number(orderId) : undefined,
      amount,
      method,
      paidAt,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else toast.error(res.message);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ghi nhận thanh toán: ${customerName}`}
      description="Trừ vào công nợ của đơn được chọn, hoặc thu chung trừ dần từ đơn cũ nhất"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            <Wallet size={14} style={{ marginRight: 6 }} /> Ghi nhận đã thu
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: totalOutstanding > 0 ? '#fef3c7' : '#dcfce7',
            color: totalOutstanding > 0 ? '#92400e' : '#15803d',
            fontSize: 13,
          }}
        >
          Công nợ hiện tại: <strong>{fmt(totalOutstanding)} ₫</strong>
          {unpaid.length > 0 && ` · ${unpaid.length} đơn chưa thu đủ`}
        </div>

        <Field label="Thu cho đơn hàng">
          <Select
            value={orderId}
            onChange={(e) => handleSelectOrder(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">-- Thu chung, trừ dần từ đơn cũ nhất --</option>
            {unpaid.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.orderCode} · còn nợ {fmt(o.remaining)} ₫
                {o.dueDate ? ` · hạn ${new Date(o.dueDate).toLocaleDateString('vi-VN')}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Số tiền đã thu (₫)" required>
            <PriceInput value={amount} onChange={(val) => setAmount(val || 0)} placeholder="0" showInWords exactWords />
          </Field>

          <Field label="Hình thức">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ngày thu">
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Số chứng từ / UNC">
            <Input
              placeholder="VD: UNC-20260922-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {selected && amount > selected.remaining && (
          <div style={{ fontSize: 12.5, color: '#b45309' }}>
            Số tiền lớn hơn công nợ của đơn {selected.orderCode} ({fmt(selected.remaining)} ₫) — phần dư vẫn
            ghi vào đơn này, kiểm tra lại trước khi lưu.
          </div>
        )}
      </div>
    </Modal>
  );
}
