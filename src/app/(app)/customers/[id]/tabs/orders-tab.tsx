'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { MapPin, Calendar, Clock, Truck, PackageCheck, Wallet, Undo2, Printer, ShoppingCart, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { ORDER_TYPES, ORDER_STATUSES } from '@/server/modules/customer/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "orders" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function OrdersTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, canManage, customer, expandedOrderItems, setFulfillment, setPaymentOrderId, setPrintingOrder, setReturnOrder, toggleOrderItems } = s;
  return (
    <>
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                Danh sách Đơn hàng ({customer.orders?.length || 0})
              </div>
              <Link href={`/sales?customerId=${customer.id}`} className="btn btn-primary btn-sm">
                <ShoppingCart size={14} style={{ marginRight: 6 }} /> Tạo đơn
              </Link>
            </div>
          )}
          {customer.orders?.length === 0 ? (
            <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Chưa có đơn hàng hoặc lịch sử mua máy nào cho khách hàng này
            </Card>
          ) : (
            customer.orders.map((o: any) => {
              const typeInfo = ORDER_TYPES[o.orderType] || { label: o.orderType, color: '#64748b', bg: '#f1f5f9' };
              const stInfo = ORDER_STATUSES[o.status] || { label: o.status, color: '#64748b', bg: '#f1f5f9' };

              return (
                <Card key={o.id} id={`customer-order-${o.id}`} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                          Đơn hàng: {o.orderCode}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: typeInfo.bg,
                            color: typeInfo.color,
                            border: `1px solid ${typeInfo.color}35`,
                          }}
                        >
                          {typeInfo.label}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: stInfo.bg,
                            color: stInfo.color,
                            border: `1px solid ${stInfo.color}35`,
                          }}
                        >
                          {stInfo.label}
                        </span>

                        {o.stockIssuedAt && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11.5,
                              fontWeight: 600,
                              background: '#dcfce7',
                              color: '#15803d',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <PackageCheck size={11} /> Đã xuất kho
                          </span>
                        )}

                        {o.location && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 11.5,
                              fontWeight: 600,
                              background: '#ecfdf5',
                              color: '#047857',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <MapPin size={11} /> {o.location.name}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={13} /> Ngày đặt: {new Date(o.orderDate).toLocaleDateString('vi-VN')}
                        </span>
                        {o.deliveryDate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={13} /> Bàn giao: {new Date(o.deliveryDate).toLocaleDateString('vi-VN')}
                          </span>
                        )}
                      </div>

                      {o.notes && (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>
                          Ghi chú: {o.notes}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Khách phải trả</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>
                          {new Intl.NumberFormat('vi-VN').format(Number(o.totalAmount || 0))} ₫
                        </div>
                        {(() => {
                          const total = o.status === 'CANCELLED' ? 0 : Number(o.totalAmount || 0);
                          const paid = Number(o.paidAmount || 0);
                          const returned = Math.min(total, Number(o.returnedAmount || 0));
                          const remaining = Math.max(0, total - returned - paid);
                          const overdue =
                            remaining > 0 &&
                            o.dueDate &&
                            new Date(o.dueDate) < new Date(new Date().toDateString());
                          if (total <= 0) return null;
                          return (
                            <div style={{ fontSize: 11.5, marginTop: 3 }}>
                              {remaining === 0 ? (
                                <span style={{ color: '#15803d', fontWeight: 700 }}>Đã thu đủ</span>
                              ) : (
                                <span style={{ color: overdue ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                                  Còn nợ {new Intl.NumberFormat('vi-VN').format(remaining)} ₫
                                  {paid > 0 && ` (đã thu ${new Intl.NumberFormat('vi-VN').format(paid)})`}
                                  {overdue && ' · QUÁ HẠN'}
                                </span>
                              )}
                              {returned > 0 && (
                                <span style={{ color: '#7c3aed' }}>
                                  {' '}
                                  · đã trả lại {new Intl.NumberFormat('vi-VN').format(returned)} ₫
                                </span>
                              )}
                              {o.dueDate && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {' '}
                                  · hạn {new Date(o.dueDate).toLocaleDateString('vi-VN')}
                                </span>
                              )}
                              {o.invoiceNo && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {' '}
                                  · HĐ {o.invoiceSerial ? `${o.invoiceSerial}-` : ''}
                                  {o.invoiceNo}
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {(Number(o.shippingFee) > 0 || Number(o.vatAmount) > 0) && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            Hàng {new Intl.NumberFormat('vi-VN').format(Number(o.goodsAmount || 0))}
                            {Number(o.shippingFee) > 0 &&
                              ` · Cước ${new Intl.NumberFormat('vi-VN').format(Number(o.shippingFee))}`}
                            {Number(o.vatAmount) > 0 &&
                              ` · VAT ${Number(o.vatRate)}% ${new Intl.NumberFormat('vi-VN').format(Number(o.vatAmount))}`}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                          <button
                            type="button"
                            onClick={() => setPrintingOrder(o)}
                            style={{
                              padding: '6px 9px',
                              borderRadius: 'var(--radius-sm)',
                              background: '#faf5ff',
                              color: '#7c3aed',
                              border: '1px solid #ddd6fe',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <Printer size={14} />
                          </button>
                          <span className="tooltip">In hóa đơn & bàn giao (A4/PDF)</span>
                        </div>

                        {canManage && (
                          <>
                            {Number(o.totalAmount || 0) > Number(o.paidAmount || 0) &&
                              o.status !== 'CANCELLED' && (
                                <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                                  <button
                                    type="button"
                                    onClick={() => setPaymentOrderId(o.id)}
                                    style={{
                                      padding: '6px 9px',
                                      borderRadius: 'var(--radius-sm)',
                                      background: '#fef3c7',
                                      color: '#b45309',
                                      border: '1px solid #fde68a',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Wallet size={14} />
                                  </button>
                                  <span className="tooltip">Thu tiền đơn hàng</span>
                                </div>
                              )}

                            {o.status !== 'CANCELLED' && (o.items || []).length > 0 && (
                              <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                                <button
                                  type="button"
                                  onClick={() => setReturnOrder(o)}
                                  style={{
                                    padding: '6px 9px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: '#f5f3ff',
                                    color: '#7c3aed',
                                    border: '1px solid #e9d5ff',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Undo2 size={14} />
                                </button>
                                <span className="tooltip">Khách trả hàng</span>
                              </div>
                            )}

                            {o.items?.some((it: any) => it.itemType === 'SPARE_PART') && (
                              <>
                                <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                                  <button
                                    type="button"
                                    onClick={() => setFulfillment({ order: o, mode: 'SUPPLIER' })}
                                    style={{
                                      padding: '6px 9px',
                                      borderRadius: 'var(--radius-sm)',
                                      background: '#ede9fe',
                                      color: '#6d28d9',
                                      border: '1px solid #ddd6fe',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Truck size={14} />
                                  </button>
                                  <span className="tooltip">Đặt hàng NCC (PO)</span>
                                </div>
                                <div className="tooltip-host" style={{ display: 'inline-flex' }}>
                                  <button
                                    type="button"
                                    onClick={() => setFulfillment({ order: o, mode: 'ISSUE' })}
                                    style={{
                                      padding: '6px 9px',
                                      borderRadius: 'var(--radius-sm)',
                                      background: o.stockIssuedAt ? '#dcfce7' : '#e0f2fe',
                                      color: o.stockIssuedAt ? '#15803d' : '#0369a1',
                                      border: o.stockIssuedAt ? '1px solid #bbf7d0' : '1px solid #bae6fd',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <PackageCheck size={14} />
                                  </button>
                                  <span className="tooltip">
                                    {o.stockIssuedAt
                                      ? `Đã xuất kho (${new Date(o.stockIssuedAt).toLocaleDateString('vi-VN')})`
                                      : 'Xuất kho giao khách'}
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Chi tiết sản phẩm */}
                  {o.items && o.items.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-base)', paddingTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => toggleOrderItems(o.id)}
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
                          {expandedOrderItems[String(o.id)] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>Chi tiết sản phẩm / thiết bị ({o.items.length})</span>
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: 'var(--brand)',
                            fontWeight: 600,
                          }}
                        >
                          {expandedOrderItems[String(o.id)] ? 'Thu gọn' : 'Xem chi tiết'}
                        </span>
                      </button>

                      {expandedOrderItems[String(o.id)] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                          {o.items.map((it: any) => (
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: it.itemType === 'EQUIPMENT' ? '#e0f2fe' : '#ede9fe',
                                    color: it.itemType === 'EQUIPMENT' ? '#0369a1' : '#6d28d9',
                                  }}
                                >
                                  {it.itemType === 'EQUIPMENT' ? 'Thiết bị' : it.itemType === 'SPARE_PART' ? 'Linh kiện' : 'Dịch vụ'}
                                </span>
                                <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{it.name}</span>
                                <span style={{ color: 'var(--text-muted)' }}>x {it.quantity}</span>
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

      {/* ── TAB: CÔNG NỢ & THANH TOÁN ── */}
    </>
  );
}
