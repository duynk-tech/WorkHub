'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CustomerWorkspacePanel } from '@/components/domain/customer-workspace-panel';
import { Utensils, AlertTriangle, Package, Clock, CheckCircle2, Wallet, ShoppingCart, ChevronRight } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { ORDER_STATUSES } from '@/server/modules/customer/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "overview" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function OverviewTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, canExport, canManage, customer, debt, employees, purchasedParts, setActiveTab, totalSpent } = s;
  return (
    <>
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stats Grid - Colorful circle icon cards identical to Spare Parts report */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {[
              { label: 'Giá trị đơn (gồm VAT)', value: totalSpent, color: '#2563eb', bg: '#eff6ff', Icon: ShoppingCart },
              { label: 'Đã phân bổ thu vào đơn', value: debt.paid, color: '#0f766e', bg: '#f0fdfa', Icon: Wallet },
              { label: 'Còn phải thu', value: debt.outstanding, color: '#d97706', bg: '#fffbeb', Icon: Clock },
              {
                label: 'Nợ quá hạn',
                value: debt.overdue,
                color: debt.overdue > 0 ? '#dc2626' : '#16a34a',
                bg: debt.overdue > 0 ? '#fef2f2' : '#f0fdf4',
                Icon: AlertTriangle,
              },
            ].map((c) => (
              <Card key={c.label} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.bg,
                    color: c.color,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <c.Icon size={19} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>
                    {new Intl.NumberFormat('vi-VN').format(Number(c.value))} ₫
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{c.label}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* Cần theo dõi */}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>
              Cần theo dõi
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Button size="sm" variant={debt.overdueOrders > 0 ? 'secondary' : 'ghost'} onClick={() => setActiveTab('payments')}>
                <AlertTriangle size={13} style={{ marginRight: 6, color: debt.overdueOrders > 0 ? '#dc2626' : undefined }} />
                {debt.overdueOrders} đơn quá hạn
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setActiveTab('orders')}>
                {(customer.orders || []).filter((o: any) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length} đơn chưa hoàn tất
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setActiveTab('machines')}>
                <Utensils size={13} style={{ marginRight: 6 }} />
                {customer.machines?.length || 0} thiết bị
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setActiveTab('parts')}>
                <Package size={13} style={{ marginRight: 6 }} />
                {purchasedParts.length} dòng phụ tùng đã mua
              </Button>
            </div>
          </Card>

          {/* Đơn hàng gần đây */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-base)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart size={16} style={{ color: 'var(--brand)' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                  Đơn hàng gần đây
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {customer.orders?.length || 0}
                </span>
              </div>
              {(customer.orders || []).length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setActiveTab('orders')}
                  style={{ fontSize: 12, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                >
                  Xem tất cả ({customer.orders.length}) <ChevronRight size={13} />
                </button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="customer-purchase-table" style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Mã đơn hàng</th>
                    <th style={{ width: 110 }}>Ngày đặt</th>
                    <th>Chi tiết mặt hàng</th>
                    <th style={{ width: 130 }}>Trạng thái</th>
                    <th style={{ width: 140, textAlign: 'right' }}>Tổng tiền</th>
                    <th style={{ width: 160 }}>Thanh toán</th>
                    <th style={{ width: 70, textAlign: 'center' }}>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(customer.orders || [])]
                    .sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
                    .slice(0, 5)
                    .map((o: any) => {
                      const total = o.status === 'CANCELLED' ? 0 : Number(o.totalAmount || 0);
                      const paid = Number(o.paidAmount || 0);
                      const remaining = Math.max(0, total - paid);
                      const items = o.items || [];
                      const firstItem = items[0];
                      const itemsCount = items.length;
                      const stInfo = ORDER_STATUSES[o.status] || { label: o.status, color: '#64748b', bg: '#f1f5f9' };

                      return (
                        <tr key={o.id}>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)', padding: '2px 6px', height: 'auto', minHeight: 26 }}
                              onClick={() => setActiveTab('orders', o.id)}
                            >
                              {o.orderCode}
                            </button>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                            {new Date(o.orderDate).toLocaleDateString('vi-VN')}
                          </td>
                          <td>
                            {firstItem ? (
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                                  {firstItem.name}
                                  {firstItem.quantity > 1 && (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
                                      × {firstItem.quantity}
                                    </span>
                                  )}
                                </div>
                                {itemsCount > 1 && (
                                  <div
                                    className="tooltip-host"
                                    style={{
                                      fontSize: 11.5,
                                      color: 'var(--brand)',
                                      marginTop: 2,
                                      cursor: 'pointer',
                                      display: 'inline-block',
                                    }}
                                  >
                                    +{itemsCount - 1} mặt hàng khác
                                    <span className="tooltip tooltip-bottom" style={{ width: 220, textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.4 }}>
                                      {items.slice(1).map((it: any) => `${it.name}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`).join(', ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>Chưa có mặt hàng</span>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 10px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: stInfo.color,
                                background: stInfo.bg,
                              }}
                            >
                              {stInfo.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13.5, color: 'var(--text-strong)' }}>
                              {new Intl.NumberFormat('vi-VN').format(Number(o.totalAmount || 0))} ₫
                            </strong>
                          </td>
                          <td>
                            {o.status === 'CANCELLED' ? (
                              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Đã hủy</span>
                            ) : remaining === 0 && total > 0 ? (
                              <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={13} /> Đã đủ
                              </span>
                            ) : remaining > 0 ? (
                              <div>
                                <span style={{ color: '#d97706', fontWeight: 600, fontSize: 12 }}>
                                  Còn nợ {new Intl.NumberFormat('vi-VN').format(remaining)} ₫
                                </span>
                                {paid > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Đã trả {new Intl.NumberFormat('vi-VN').format(paid)} ₫
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>0 ₫</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              style={{ padding: '4px 8px', color: 'var(--brand)' }}
                              onClick={() => setActiveTab('orders', o.id)}
                              title="Xem chi tiết đơn hàng"
                            >
                              <ChevronRight size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {!customer.orders?.length && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                        Chưa có đơn hàng nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {['profile', 'contacts', 'care', 'customer-report'].includes(activeTab) && <CustomerWorkspacePanel customer={customer} view={activeTab} canManage={canManage} canExport={canExport} employees={employees} onOrder={id => setActiveTab('orders', id)} />}

      {/* 4. Tab Contents */}

      {/* ── TAB 1: THIẾT BỊ & MÁY MÓC ── */}
    </>
  );
}
