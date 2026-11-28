'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapPin, Edit2, Trash2, Calendar, FileText, Clock, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { QUOTATION_STATUSES } from '@/server/modules/customer/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "quotations" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function QuotationsTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, canManage, customer, expandedQuotationItems, handleConvertQuotation, handleDeleteQuotation, setCreateQuotationOpen, setEditingQuotation, setPrintingQuotation, toggleQuotationItems } = s;
  return (
    <>
      {activeTab === 'quotations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                Danh sách Báo giá ({customer.quotations?.length || 0})
              </div>
              <Button size="sm" variant="primary" onClick={() => setCreateQuotationOpen(true)}>
                <FileText size={14} style={{ marginRight: 6 }} /> Tạo báo giá
              </Button>
            </div>
          )}
          {customer.quotations?.length === 0 ? (
            <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Chưa có báo giá nào cho khách hàng này
            </Card>
          ) : (
            customer.quotations.map((q: any) => {
              const stInfo = QUOTATION_STATUSES[q.status] || {
                label: q.status,
                color: '#64748b',
                bg: '#f1f5f9',
              };
              const convertedOrder = q.orders?.[0];
              const expired =
                q.validUntil && new Date(q.validUntil) < new Date() && q.status !== 'ACCEPTED';

              return (
                <Card key={q.id} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                          Báo giá: {q.quoteCode}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: stInfo.bg,
                            color: stInfo.color,
                          }}
                        >
                          {stInfo.label}
                        </span>
                        {expired && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11.5,
                              fontWeight: 600,
                              background: '#fef3c7',
                              color: '#d97706',
                            }}
                          >
                            Quá hạn hiệu lực
                          </span>
                        )}
                        {convertedOrder && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11.5,
                              fontWeight: 600,
                              background: '#ecfdf5',
                              color: '#047857',
                            }}
                          >
                            Đã chốt thành đơn {convertedOrder.orderCode}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={13} /> Ngày báo giá: {new Date(q.quoteDate).toLocaleDateString('vi-VN')}
                        </span>
                        {q.validUntil && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={13} /> Hiệu lực đến: {new Date(q.validUntil).toLocaleDateString('vi-VN')}
                          </span>
                        )}
                        {q.location && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={13} /> {q.location.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Tổng thanh toán{Number(q.vatRate) > 0 ? ` (gồm VAT ${Number(q.vatRate)}%)` : ''}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>
                          {new Intl.NumberFormat('vi-VN').format(Number(q.totalAmount || 0))} ₫
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                          <button
                            type="button"
                            onClick={() => setPrintingQuotation(q)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-sunken)',
                              color: 'var(--brand)',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <FileText size={14} />
                          </button>
                          <span className="tooltip">In báo giá</span>
                        </div>

                        {canManage && !convertedOrder && (
                          <>
                            <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={() => handleConvertQuotation(q)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <span className="tooltip">Tạo đơn từ báo giá</span>
                            </div>
                            <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={() => setEditingQuotation(q)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--text-strong)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <span className="tooltip">Sửa báo giá</span>
                            </div>
                            <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuotation(q.id)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--danger)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                              <span className="tooltip">Xóa báo giá</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hàng hóa / dịch vụ đã báo giá */}
                  {q.items && q.items.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-base)', paddingTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => toggleQuotationItems(q.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px 0',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 650,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {expandedQuotationItems[String(q.id)] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>Hàng hóa / dịch vụ đã báo giá ({q.items.length})</span>
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: 'var(--brand)',
                            fontWeight: 600,
                          }}
                        >
                          {expandedQuotationItems[String(q.id)] ? 'Thu gọn' : 'Xem chi tiết'}
                        </span>
                      </button>

                      {expandedQuotationItems[String(q.id)] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                          {q.items.map((it: any) => (
                            <div
                              key={it.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 12.5,
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-xs)',
                                background: 'var(--surface-sunken)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{it.name}</span>
                                <span style={{ color: 'var(--text-muted)' }}>x {it.quantity}</span>
                                {Number(it.discountVnd) > 0 && (
                                  <span style={{ color: 'var(--danger)', fontSize: 11.5 }}>
                                    CK {new Intl.NumberFormat('vi-VN').format(Number(it.discountVnd))} ₫
                                  </span>
                                )}
                              </div>

                              <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                                {new Intl.NumberFormat('vi-VN').format(Number(it.totalPrice || 0))} ₫
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB 2: LỊCH SỬ MUA MÁY & ĐƠN HÀNG ── */}
    </>
  );
}
