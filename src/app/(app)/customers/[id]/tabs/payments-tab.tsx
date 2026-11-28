'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Trash2, Wallet, Printer } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { PAYMENT_METHODS } from '@/server/modules/customer/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "payments" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function PaymentsTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, canManage, customer, debt, handleDeletePayment, insights, setActiveTab, setPaymentOrderId, setPrintPayment } = s;
  return (
    <>
      {activeTab === 'payments' && <Card style={{ padding: 16 }}><strong>Chưa phân bổ: {new Intl.NumberFormat('vi-VN').format(insights.unapplied)} ₫</strong><p className="text-muted">{insights.legacyPayments} phiếu cũ chưa có phân bổ chi tiết · {insights.allocationMismatch} đơn lệch phân bổ. Tiền dư chưa tự trừ vào công nợ.</p><Button size="sm" onClick={() => setActiveTab('customer-report')}>Xem đối soát</Button></Card>}
      {activeTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {[
              { label: 'Tổng phải thu', value: debt.billed, color: 'var(--text-strong)' },
              { label: 'Đã thu', value: debt.paid, color: '#16a34a' },
              { label: 'Còn nợ', value: debt.outstanding, color: debt.outstanding > 0 ? '#d97706' : '#16a34a' },
              { label: `Quá hạn (${debt.overdueOrders} đơn)`, value: debt.overdue, color: '#dc2626' },
            ].map((c) => (
              <Card key={c.label} style={{ padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: c.color, marginTop: 2 }}>
                  {new Intl.NumberFormat('vi-VN').format(c.value)} ₫
                </div>
              </Card>
            ))}
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
              }}
            >
              <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>Lịch sử thu tiền</strong>
              {canManage && (
                <Button variant="primary" size="sm" onClick={() => setPaymentOrderId('GENERAL')}>
                  <Wallet size={14} style={{ marginRight: 6 }} /> Thu tiền
                </Button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-sunken)',
                      borderTop: '1px solid var(--border-base)',
                      borderBottom: '1px solid var(--border-base)',
                      color: 'var(--text-muted)',
                      fontSize: 11.5,
                      fontWeight: 700,
                    }}
                  >
                    <th style={{ padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>Mã phiếu thu</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>Ngày thu</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>Thu cho đơn</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>Hình thức</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', width: '100%' }}>Chứng từ / Ghi chú</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Số tiền</th>
                    {canManage && <th style={{ padding: '10px 14px' }} />}
                  </tr>
                </thead>
                <tbody>
                  {(customer.payments || []).length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 7 : 6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Chưa ghi nhận khoản thanh toán nào
                      </td>
                    </tr>
                  ) : (
                    customer.payments.map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-base)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {p.paymentCode}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {new Date(p.paidAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--brand)' }}>
                          {p.order?.orderCode || 'Thu chung'}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {PAYMENT_METHODS[p.method]?.label || p.method}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {[p.reference, p.note].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                          {new Intl.NumberFormat('vi-VN').format(Number(p.amount))} ₫
                        </td>
                        {canManage && (
                          <td style={{ padding: '10px 14px', display: 'flex', gap: 5 }}>
                            <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={() => setPrintPayment(p)}
                                style={{
                                  padding: '4px 7px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--brand)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Printer size={13} />
                              </button>
                              <span className="tooltip">In phiếu thu</span>
                            </div>
                            <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p.id)}
                                style={{
                                  padding: '4px 7px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--danger)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                              <span className="tooltip">Xóa phiếu thu</span>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB 3: ĐIỂM LẮP ĐẶT / CHI NHÁNH ── */}
    </>
  );
}
