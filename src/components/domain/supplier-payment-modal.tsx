'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Wallet, Printer, Trash2, Plus, Receipt, Truck, Building2, CheckCircle2 } from 'lucide-react';
import { PAYMENT_METHODS } from '@/server/modules/customer/types';
import {
  recordSupplierPaymentAction,
  listSupplierPaymentsAction,
  deleteSupplierPaymentAction,
} from '@/server/modules/spare-parts/actions';
import { PaymentVoucherModal } from '@/components/domain/payment-voucher-modal';
import type { CompanyInfo } from '@/server/modules/settings/branding';

/** Ghi nhận thanh toán đơn mua hàng (trả tiền NCC, cước vận chuyển, phí hải quan/khác). */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const fmtDate = (iso?: string | Date | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  CARD: 'Quẹt thẻ',
  OFFSET: 'Cấn trừ công nợ',
};

type PaymentCategory = 'SUPPLIER_GOODS' | 'SHIPPING_FEE' | 'CUSTOMS_FEE' | 'OTHER';

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
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);

  // Các khoản chi phí của đơn hàng
  const goodsCost = Number(order?.subtotalVnd || 0);
  const shippingFee = Number(order?.shippingFee || 0);
  const customsFee = Number(order?.customsFee || 0);
  const totalCost = Number(order?.totalVnd || goodsCost + shippingFee + customsFee);

  // Tải danh sách các lần thanh toán đã ghi nhận cho đơn hàng này
  const loadPaymentHistory = async () => {
    if (!order?.id) return;
    setLoadingHistory(true);
    try {
      const res = await listSupplierPaymentsAction(undefined, order.id);
      if (res.ok && res.payments) {
        setPayments(res.payments);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (open && order?.id) {
      loadPaymentHistory();
    }
  }, [open, order?.id]);

  // Tính tổng đã trả từ danh sách phiếu chi thực tế hoặc từ order.paidAmount
  const totalPaid = payments.length > 0
    ? payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : Number(order?.paidAmount || 0);
  const totalRemaining = Math.max(0, totalCost - totalPaid);

  // Form states
  const [category, setCategory] = useState<PaymentCategory>('SUPPLIER_GOODS');
  const [recipient, setRecipient] = useState(order?.supplier || '');
  const [amount, setAmount] = useState<number>(() => {
    if (goodsCost > 0) return Math.max(0, goodsCost - Number(order?.paidAmount || 0));
    return totalRemaining;
  });
  const [method, setMethod] = useState('TRANSFER');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState(`Thanh toán tiền hàng mua cho ${order?.supplier || 'NCC'}`);
  const [voucher, setVoucher] = useState<any>(null);

  // Xử lý khi đổi Loại thanh toán
  const handleCategoryChange = (newCat: PaymentCategory) => {
    setCategory(newCat);
    if (newCat === 'SUPPLIER_GOODS') {
      setRecipient(order?.supplier || 'Nhà cung cấp');
      setAmount(Math.max(0, goodsCost - totalPaid));
      setNote(`Thanh toán tiền hàng mua cho ${order?.supplier || 'NCC'} (${order?.orderCode})`);
    } else if (newCat === 'SHIPPING_FEE') {
      setRecipient('Đơn vị vận chuyển (DHL / FedEx / Forwarder)');
      setAmount(shippingFee > 0 ? shippingFee : 0);
      setNote(`Thanh toán cước vận chuyển quốc tế (${order?.orderCode})`);
    } else if (newCat === 'CUSTOMS_FEE') {
      setRecipient('Đại lý hải quan / Chi cục hải quan');
      setAmount(customsFee > 0 ? customsFee : 0);
      setNote(`Thanh toán phí hải quan & thủ tục thông quan (${order?.orderCode})`);
    } else {
      setRecipient('');
      setAmount(0);
      setNote(`Chi phí khác phát sinh đơn hàng ${order?.orderCode}`);
    }
  };

  const handleSave = async () => {
    if (!amount || amount <= 0) {
      toast.error('Vui lòng nhập số tiền thanh toán (> 0 ₫)');
      return;
    }
    if (!recipient.trim()) {
      toast.error('Vui lòng nhập tên đối tác / người nhận thanh toán');
      return;
    }

    setLoading(true);
    const categoryPrefix =
      category === 'SUPPLIER_GOODS'
        ? '[Tiền hàng NCC]'
        : category === 'SHIPPING_FEE'
        ? '[Cước VC]'
        : category === 'CUSTOMS_FEE'
        ? '[Phí hải quan]'
        : '[Chi phí khác]';

    const fullNote = `${categoryPrefix} ${note.trim()}`.trim();

    const res = await recordSupplierPaymentAction({
      supplier: recipient.trim(),
      orderId: order.id,
      amount,
      method,
      paidAt,
      reference: reference.trim() || undefined,
      note: fullNote || undefined,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      await loadPaymentHistory();
      setAmount(0);
      setReference('');
      if ((res as any).payment) setVoucher((res as any).payment);
    } else {
      toast.error(res.message);
    }
  };

  const handleDeletePayment = async (pId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa phiếu chi này? Khoản tiền sẽ được hoàn lại vào công nợ.')) return;
    const res = await deleteSupplierPaymentAction(pId);
    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      await loadPaymentHistory();
    } else {
      toast.error(res.message);
    }
  };

  if (!order) return null;

  if (voucher) {
    return (
      <PaymentVoucherModal
        open
        onClose={() => setVoucher(null)}
        direction="OUT"
        payment={voucher}
        partnerName={voucher.supplier || order.supplier}
        company={companyInfo}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Thanh toán đơn hàng: ${order.orderCode}`}
      description={`Nhà cung cấp: ${order.supplier} • Quản lý chi trả tiền hàng & chi phí khác`}
      size="lg"
      className="supplier-payment-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Đã thanh toán: <strong style={{ color: '#15803d' }}>{fmt(totalPaid)} ₫</strong> / {fmt(totalCost)} ₫
            {totalRemaining > 0 && (
              <span style={{ marginLeft: 8, color: '#b91c1c', fontWeight: 600 }}>
                • Còn nợ: {fmt(totalRemaining)} ₫
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Đóng
            </Button>
            <Button variant="primary" onClick={handleSave} loading={loading} style={{ background: '#7c3aed', color: '#fff' }}>
              <Wallet size={14} style={{ marginRight: 6 }} /> Ghi nhận thanh toán
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. Tóm tắt chi phí & công nợ đơn hàng */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border-base, #e2e8f0)',
            fontSize: 12.5,
          }}
        >
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Tiền hàng mua NCC</div>
            <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>{fmt(goodsCost)} ₫</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Cước vận chuyển quốc tế</div>
            <div style={{ fontWeight: 600, color: '#0284c7', marginTop: 2 }}>{fmt(shippingFee)} ₫</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Phí hải quan / Khác</div>
            <div style={{ fontWeight: 600, color: '#d97706', marginTop: 2 }}>{fmt(customsFee)} ₫</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Tổng chi phí về kho</div>
            <div style={{ fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>{fmt(totalCost)} ₫</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>Trạng thái thanh toán</div>
            <div style={{ fontWeight: 700, color: totalRemaining > 0 ? '#b45309' : '#15803d', marginTop: 2 }}>
              {totalRemaining > 0 ? `Còn nợ ${fmt(totalRemaining)} ₫` : 'Đã thanh toán đủ'}
            </div>
          </div>
        </div>

        {/* 2. Form ghi nhận thanh toán */}
        <div
          style={{
            border: '1px solid var(--border-base, #e2e8f0)',
            borderRadius: 8,
            padding: '12px 14px',
            background: 'var(--surface-card, #fff)',
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wallet size={15} color="#7c3aed" /> Tạo phiếu chi thanh toán mới
          </div>

          {/* Chọn Loại thanh toán */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Khoản thanh toán:
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleCategoryChange('SUPPLIER_GOODS')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: category === 'SUPPLIER_GOODS' ? 700 : 500,
                  border: category === 'SUPPLIER_GOODS' ? '1px solid #7c3aed' : '1px solid var(--border-base, #cbd5e1)',
                  background: category === 'SUPPLIER_GOODS' ? '#f5f3ff' : '#fff',
                  color: category === 'SUPPLIER_GOODS' ? '#7c3aed' : 'var(--text-strong)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Building2 size={13} /> Trả Nhà Cung Cấp (Tiền hàng)
              </button>

              <button
                type="button"
                onClick={() => handleCategoryChange('SHIPPING_FEE')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: category === 'SHIPPING_FEE' ? 700 : 500,
                  border: category === 'SHIPPING_FEE' ? '1px solid #0284c7' : '1px solid var(--border-base, #cbd5e1)',
                  background: category === 'SHIPPING_FEE' ? '#f0f9ff' : '#fff',
                  color: category === 'SHIPPING_FEE' ? '#0284c7' : 'var(--text-strong)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Truck size={13} /> Cước vận chuyển ({fmt(shippingFee)} ₫)
              </button>

              <button
                type="button"
                onClick={() => handleCategoryChange('CUSTOMS_FEE')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: category === 'CUSTOMS_FEE' ? 700 : 500,
                  border: category === 'CUSTOMS_FEE' ? '1px solid #d97706' : '1px solid var(--border-base, #cbd5e1)',
                  background: category === 'CUSTOMS_FEE' ? '#fffbeb' : '#fff',
                  color: category === 'CUSTOMS_FEE' ? '#d97706' : 'var(--text-strong)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Receipt size={13} /> Phí hải quan / Khác ({fmt(customsFee)} ₫)
              </button>

              <button
                type="button"
                onClick={() => handleCategoryChange('OTHER')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: category === 'OTHER' ? 700 : 500,
                  border: category === 'OTHER' ? '1px solid #475569' : '1px solid var(--border-base, #cbd5e1)',
                  background: category === 'OTHER' ? '#f1f5f9' : '#fff',
                  color: category === 'OTHER' ? '#1e293b' : 'var(--text-strong)',
                  cursor: 'pointer',
                }}
              >
                Chi phí khác
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 10 }}>
            <Field label="Đối tượng thụ hưởng / Người nhận tiền" required>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Tên nhà cung cấp hoặc đơn vị vận chuyển..."
              />
            </Field>

            <Field label="Số tiền thanh toán (₫)" required>
              <PriceInput
                value={amount}
                onChange={(v) => setAmount(v || 0)}
                placeholder="0"
                showInWords
                exactWords
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
            <Field label="Hình thức">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ngày thanh toán">
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>

            <Field label="Số chứng từ / Ủy nhiệm chi">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="VD: UNC-98421"
              />
            </Field>
          </div>

          <Field label="Ghi chú thanh toán">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Thanh toán cước VC đợt 1..."
            />
          </Field>
        </div>

        {/* 3. Danh sách các lần ghi nhận thanh toán (Payment History) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={15} color="#7c3aed" /> Danh sách ghi nhận thanh toán ({payments.length} phiếu chi)
            </h4>
            {loadingHistory && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Đang tải...</span>}
          </div>

          {payments.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                borderRadius: 8,
                background: 'var(--surface-sunken, #f8fafc)',
                border: '1px dashed var(--border-base, #cbd5e1)',
                color: 'var(--text-muted)',
                fontSize: 12.5,
              }}
            >
              Chưa có lần thanh toán nào được ghi nhận cho đơn hàng này.
            </div>
          ) : (
            <div
              style={{
                border: '1px solid var(--border-base, #e2e8f0)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken, #f8fafc)', borderBottom: '1px solid var(--border-base, #e2e8f0)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px', width: 115 }}>Mã phiếu chi</th>
                    <th style={{ padding: '8px 10px', width: 95 }}>Ngày chi</th>
                    <th style={{ padding: '8px 10px' }}>Khoản chi / Đối tác</th>
                    <th style={{ padding: '8px 10px', width: 95 }}>Hình thức</th>
                    <th style={{ padding: '8px 10px', width: 115, textAlign: 'right' }}>Số tiền (₫)</th>
                    <th style={{ padding: '8px 10px', width: 110 }}>Chứng từ</th>
                    <th style={{ padding: '8px 10px', width: 75, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const amt = Number(p.amount || 0);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-base, #f1f5f9)' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#7c3aed' }}>
                          {p.paymentCode}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-strong)' }}>
                          {fmtDate(p.paidAt)}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{p.supplier}</div>
                          {p.note && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.note}</div>}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                          {METHOD_LABELS[p.method] || p.method}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                          {fmt(amt)} ₫
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 11.5 }}>
                          {p.reference || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => setVoucher(p)}
                              title="In phiếu chi (A4 / PDF)"
                              style={{
                                border: 'none',
                                background: '#f5f3ff',
                                color: '#7c3aed',
                                padding: '4px 6px',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <Printer size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(p.id)}
                              title="Xóa phiếu chi này"
                              style={{
                                border: 'none',
                                background: '#fef2f2',
                                color: '#dc2626',
                                padding: '4px 6px',
                                borderRadius: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
