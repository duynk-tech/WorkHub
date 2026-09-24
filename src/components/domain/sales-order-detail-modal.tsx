'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Phone, MapPin, Wallet, Undo2, FileText, Wrench, ExternalLink, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Badge, Button, EmptyState } from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { readVndInWords } from '@/lib/number-to-words';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
} from '@/server/modules/customer/types';
import { getSalesOrderDetailAction } from '@/server/modules/customer/actions';
import { CustomerOrderPrintModal } from '@/components/domain/customer-order-print-modal';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Popup chi tiết đơn bán, dùng chung cho mọi màn có hiện đơn.
 *
 * Trước đây bấm vào đơn là nhảy sang hồ sơ khách rồi tự tìm lại đúng đơn đó —
 * mất chỗ đang đứng và phải bấm ngược về. Popup giữ nguyên ngữ cảnh: xem xong
 * đóng lại là vẫn ở đúng danh sách và đúng trang đang lọc.
 *
 * Tự nạp dữ liệu theo orderId nên nơi gọi chỉ cần truyền id, không màn nào phải
 * tự truy vấn thêm.
 */

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;

const ITEM_TYPES: Record<string, string> = {
  EQUIPMENT: 'Máy móc',
  SPARE_PART: 'Phụ tùng',
  SERVICE: 'Dịch vụ',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 118, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-strong)', minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-base)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--border-base)',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon}
        {title}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

export function SalesOrderDetailModal({
  open,
  orderId,
  companyInfo,
  onClose,
}: {
  open: boolean;
  orderId: number | null;
  companyInfo?: any;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let alive = true;
    setLoading(true);
    setError('');
    setOrder(null);

    getSalesOrderDetailAction(orderId).then((res) => {
      // Đóng popup trước khi tải xong thì bỏ kết quả, đừng ghi vào state đã gỡ
      if (!alive) return;
      setLoading(false);
      if (res.ok) setOrder((res as any).data);
      else setError(res.message);
    });

    return () => {
      alive = false;
    };
  }, [open, orderId]);

  const st = order ? ORDER_STATUSES[order.status] : null;
  const ty = order ? ORDER_TYPES[order.orderType] : null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={order ? `Đơn bán ${order.orderCode}` : 'Chi tiết đơn bán'}
        description={order ? order.customer?.name : undefined}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div>
              {order && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPrintOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: '1px solid #ddd6fe',
                    color: '#6d28d9',
                    background: '#faf5ff',
                    fontWeight: 600,
                  }}
                  title="Xem trước và in hóa đơn (A4 / PDF)"
                >
                  <Printer size={14} /> In / Xem hóa đơn
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {order?.customer?.id && (
                <Link href={`/customers/${order.customer.id}`} className="btn btn-secondary">
                  <ExternalLink size={14} /> Mở hồ sơ khách
                </Link>
              )}
              <Button variant="primary" onClick={onClose}>Đóng</Button>
            </div>
          </div>
        }
      >
      {loading && <EmptyState title="Đang tải chi tiết đơn…" />}
      {!loading && error && <EmptyState title="Không mở được đơn" description={error} />}

      {!loading && order && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Dải trạng thái kiêm số tiền: hai thứ người xem cần biết trước nhất */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-base)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {ty && (
                <span
                  className="badge"
                  style={{
                    background: ty.bg,
                    color: ty.color,
                    border: `1px solid ${ty.color}40`,
                    fontWeight: 650,
                  }}
                >
                  {ty.label}
                </span>
              )}
              {st && (
                <span
                  className="badge"
                  style={{
                    background: st.bg,
                    color: st.color,
                    border: `1px solid ${st.color}40`,
                    fontWeight: 650,
                  }}
                >
                  {st.label}
                </span>
              )}
              {!order.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(order.status) && (
                <span
                  className="badge"
                  style={{
                    background: '#f5f3ff',
                    color: '#6d28d9',
                    border: '1px solid #c4b5fd',
                    fontWeight: 650,
                  }}
                >
                  Chưa xuất kho
                </span>
              )}
            </span>
            <div>
              {order.remaining > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#92400e',
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  Còn phải thu {money(order.remaining)}
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#15803d',
                    background: '#dcfce7',
                    border: '1px solid #86efac',
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  ✓ Đã thu đủ
                </span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPrintOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  border: '1px solid #ddd6fe',
                  color: '#6d28d9',
                  background: '#fff',
                  fontWeight: 600,
                  fontSize: 12,
                  padding: '4px 10px',
                  height: 'auto',
                }}
                title="Xem trước và in hóa đơn / biên bản bàn giao (A4 / PDF)"
              >
                <Printer size={13} /> In / Xuất hóa đơn
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <Section title="Khách hàng" icon={<Building2 size={13} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Row label="Tên khách">{order.customer?.name ?? '—'}</Row>
                <Row label="Mã khách">{order.customer?.code ?? '—'}</Row>
                {order.customer?.contactName && <Row label="Người liên hệ">{order.customer.contactName}</Row>}
                <Row label={'Điện thoại'}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Phone size={12} /> {order.customer?.phone ?? '—'}
                  </span>
                </Row>
                {order.location && (
                  <Row label="Điểm giao">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <MapPin size={12} /> {order.location.name}
                    </span>
                  </Row>
                )}
              </div>
            </Section>

            <Section title="Thông tin đơn" icon={<FileText size={13} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Row label="Ngày đặt">{fmtDate(order.orderDate)}</Row>
                {order.deliveryDate && <Row label="Ngày giao">{fmtDate(order.deliveryDate)}</Row>}
                {order.dueDate && <Row label="Hạn thanh toán">{fmtDate(order.dueDate)}</Row>}
                {order.stockIssuedAt && <Row label="Đã xuất kho">{fmtDate(order.stockIssuedAt)}</Row>}
                {order.invoiceNo && (
                  <Row label="Hóa đơn VAT">
                    {order.invoiceSerial ? `${order.invoiceSerial} · ` : ''}{order.invoiceNo}
                  </Row>
                )}
                {order.quotation && <Row label="Từ báo giá">{order.quotation.quoteCode}</Row>}
                {order.serviceTicket && (
                  <Row label="Từ phiếu sự cố">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Wrench size={12} /> {order.serviceTicket.ticketCode}
                    </span>
                  </Row>
                )}
              </div>
            </Section>
          </div>

          <Section title={`Hàng hóa & dịch vụ (${order.items?.length ?? 0})`}>
            {(order.items ?? []).length === 0 ? (
              <div className="hint">Đơn chưa có dòng hàng nào</div>
            ) : (
              <div>
                <table className="table table-compact" style={{ fontSize: 12.5, width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Tên hàng</th>
                      <th style={{ width: 96 }}>Loại</th>
                      <th className="num" style={{ width: 60 }}>SL</th>
                      <th className="num" style={{ width: 110 }}>Đơn giá</th>
                      <th className="num" style={{ width: 120 }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((it: any) => (
                      <tr key={it.id}>
                        <td>
                          {it.name}
                          {it.notes && <div className="hint">{it.notes}</div>}
                        </td>
                        <td>{ITEM_TYPES[it.itemType] ?? it.itemType}</td>
                        <td className="num">{it.quantity}</td>
                        <td className="num">{money(Number(it.unitPrice))}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(Number(it.totalPrice))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {/* 1. Tổng tiền hàng */}
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-base, #cbd5e1)', fontWeight: 700 }}>
                      <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-strong)' }}>
                        Tổng cộng ({(order.items ?? []).length} mặt hàng):
                      </td>
                      <td style={{ padding: '8px 2px', textAlign: 'center', fontWeight: 700, color: 'var(--text-strong)' }}>
                        {(order.items ?? []).reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0)} cái
                      </td>
                      <td></td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)' }}>
                        {money(Number(order.goodsAmount))}
                      </td>
                    </tr>

                    {/* 2. Chiết khấu (nếu có) */}
                    {(() => {
                      const discountAmount = Math.max(
                        0,
                        (order.items ?? []).reduce(
                          (sum: number, it: any) =>
                            sum + Math.max(0, (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) - Number(it.totalPrice || 0)),
                          0,
                        ),
                      );
                      if (discountAmount <= 0) return null;
                      return (
                        <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                          <td
                            colSpan={4}
                            style={{
                              padding: '6px 10px',
                              textAlign: 'right',
                              fontWeight: 600,
                              color: 'var(--text-strong)',
                            }}
                          >
                            Chiết khấu:
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: '#b91c1c',
                            }}
                          >
                            -{money(discountAmount)}
                          </td>
                        </tr>
                      );
                    })()}

                    {/* 3. Thuế VAT */}
                    <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                      <td
                        colSpan={4}
                        style={{
                          padding: '6px 10px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: 'var(--text-strong)',
                        }}
                      >
                        Thuế VAT ({Number(order.vatRate)}%):
                      </td>
                      <td
                        style={{
                          padding: '6px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: Number(order.vatAmount) > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
                        }}
                      >
                        {Number(order.vatAmount) > 0
                          ? `+${money(Number(order.vatAmount))}`
                          : '0 ₫'}
                      </td>
                    </tr>

                    {/* 4. Hàng trả lại (nếu có) */}
                    {order.returned > 0 && (
                      <tr style={{ background: '#fffbeb', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                        <td
                          colSpan={4}
                          style={{
                            padding: '6px 10px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#b45309',
                          }}
                        >
                          Hàng khách trả lại:
                        </td>
                        <td
                          style={{
                            padding: '6px 10px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: '#b45309',
                          }}
                        >
                          -{money(order.returned)}
                        </td>
                      </tr>
                    )}

                    {/* 5. Tổng cộng thanh toán */}
                    <tr style={{ background: '#f1f5f9', borderTop: '1px solid #94a3b8', fontWeight: 800 }}>
                      <td
                        colSpan={4}
                        style={{
                          padding: '10px',
                          textAlign: 'right',
                          textTransform: 'uppercase',
                          color: 'var(--text-strong)',
                          fontSize: 13,
                        }}
                      >
                        TỔNG CỘNG THANH TOÁN (VND){Number(order.vatRate) > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                      </td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#7c3aed', fontSize: 14 }}>
                        {money(order.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12.5,
                    fontStyle: 'italic',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                  }}
                >
                  Bằng chữ: {readVndInWords(order.total)}
                </div>
              </div>
            )}
          </Section>

          <Section title={`Đã thu của khách (${order.payments?.length ?? 0})`} icon={<Wallet size={13} />}>
            {(order.payments ?? []).length === 0 ? (
              <div className="hint">Chưa thu khoản nào</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {order.payments.map((p: any) => (
                  <div
                    key={p.id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}
                  >
                    <span style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{p.paymentCode}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(p.paidAt)} · {PAYMENT_METHODS[p.method]?.label ?? p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                    </span>
                    <strong style={{ color: '#15803d', whiteSpace: 'nowrap' }}>
                      +{money(Number(p.amount))}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {(order.returns ?? []).length > 0 && (
            <Section title={`Hàng khách trả lại (${order.returns.length})`} icon={<Undo2 size={13} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {order.returns.map((r: any) => (
                  <div
                    key={r.id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}
                  >
                    <span style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.returnCode}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {fmtDate(r.returnedAt)}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </span>
                    </span>
                    <strong style={{ color: '#b45309', whiteSpace: 'nowrap' }}>
                      -{money(Number(r.totalValue || 0))}
                    </strong>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {order.notes && (
            <Section title="Ghi chú">
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{order.notes}</div>
            </Section>
          )}
        </div>
      )}
    </Modal>

    {printOpen && order && (
      <CustomerOrderPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        order={order}
        customer={order.customer}
        location={order.location}
        companyInfo={companyInfo}
        machines={[...(order.customer?.machines || []), ...(order.machines || [])]}
      />
    )}
  </>
  );
}
