'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Wallet } from 'lucide-react';
import { PAYMENT_METHODS } from '@/server/modules/customer/types';
import { recordSupplierPaymentAction } from '@/server/modules/spare-parts/actions';
import { PaymentVoucherModal } from '@/components/domain/payment-voucher-modal';
import type { CompanyInfo } from '@/server/modules/settings/branding';

/** Ghi nhận công ty trả tiền cho nhà cung cấp theo phiếu đặt hàng. */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

export function SupplierPaymentModal({
  open,
  onClose,
  order,
  onSuccess,
  companyInfo,
}: {
  open: boolean;
  onClose: () => void;
  order: any;
  onSuccess?: () => void;
  /** Thông tin công ty in trên phiếu chi. */
  companyInfo?: CompanyInfo;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const supplierCost =
    order?.subtotalVnd !== undefined && order?.subtotalVnd !== null && Number(order.subtotalVnd) > 0
      ? Math.max(0, Number(order.subtotalVnd) - Number(order.discountVnd || 0))
      : Number(order?.totalVnd || 0);
  const total = supplierCost;
  const paid = Number(order?.paidAmount || 0);
  const remaining = Math.max(0, total - paid);

  const [amount, setAmount] = useState<number>(remaining);
  const [method, setMethod] = useState('TRANSFER');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [voucher, setVoucher] = useState<any>(null);

  const handleSave = async () => {
    if (!amount || amount <= 0) {
      toast.error('Vui lòng nhập số tiền đã trả');
      return;
    }

    setLoading(true);
    const res = await recordSupplierPaymentAction({
      supplier: order.supplier,
      orderId: order.id,
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
      // Giữ modal lại và mở phiếu in: chi tiền xong là lúc cần tờ phiếu ký,
      // bắt người dùng đi tìm lại phiếu vừa tạo là thừa một bước
      if ((res as any).payment) setVoucher((res as any).payment);
      else onClose();
    } else toast.error(res.message);
  };

  if (!order) return null;

  if (voucher) {
    return (
      <PaymentVoucherModal
        open
        onClose={() => {
          setVoucher(null);
          onClose();
        }}
        direction="OUT"
        payment={voucher}
        partnerName={order.supplier}
        company={companyInfo}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Trả tiền nhà cung cấp: ${order.orderCode}`}
      description={`Nhà cung cấp ${order.supplier}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            <Wallet size={14} style={{ marginRight: 6 }} /> Ghi nhận đã trả
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: remaining > 0 ? '#fef3c7' : '#dcfce7',
            color: remaining > 0 ? '#92400e' : '#15803d',
            fontSize: 13,
          }}
        >
          <span>
            Giá vốn trả NCC {fmt(total)} ₫ · đã trả {fmt(paid)} ₫
          </span>
          <strong>Còn nợ {fmt(remaining)} ₫</strong>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Số tiền trả (₫)" required>
            <PriceInput value={amount} onChange={(v) => setAmount(v || 0)} placeholder="0" showInWords exactWords />
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
          <Field label="Ngày trả">
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Số chứng từ / UNC">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
