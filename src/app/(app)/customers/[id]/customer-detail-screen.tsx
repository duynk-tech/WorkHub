'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CustomerWorkspacePanel } from '@/components/domain/customer-workspace-panel';
import { customerInsights } from '@/lib/customer-insights';
import { CUSTOMER_TABS, resolveCustomerView, customerTabForView, type CustomerView } from '@/lib/customer-tabs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Utensils,
  ShoppingBag,
  Wrench,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Calendar,
  AlertTriangle,
  Package,
  FileText,
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  Wallet,
  Undo2,
  Printer,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { Card, Button, Badge, ConfirmDialog, StatCard, ScrollTabs } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { CustomerModal, CustomerLocationModal } from '@/components/domain/customer-modals';
import {
  CustomerQuotationModal,
  CustomerQuotationPrintModal,
} from '@/components/domain/customer-quotation-modal';
import {
  OrderFulfillmentModal,
  type FulfillmentMode,
} from '@/components/domain/order-fulfillment-modal';
import { CustomerOrderPrintModal } from '@/components/domain/customer-order-print-modal';
import { CustomerPaymentModal } from '@/components/domain/customer-payment-modal';
import { PaymentVoucherModal } from '@/components/domain/payment-voucher-modal';
import { CustomerReturnModal } from '@/components/domain/customer-return-modal';
import { EquipmentHandoverModal } from '@/components/domain/equipment-modals';
import {
  deleteCustomerPaymentAction,
  deleteCustomerQuotationAction,
  convertQuotationToOrderAction,
} from '@/server/modules/customer/actions';
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  QUOTATION_STATUSES,
  PAYMENT_METHODS,
} from '@/server/modules/customer/types';
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/server/modules/equipment/types';

export function CustomerDetailScreen({
  customer,
  canManage,
  canExport = false,
  employees = [],
  companyInfo,
  spareParts = [],
  stockMachines = [],
  warehouses = [],
  pricingConfig,
}: {
  customer: any;
  canManage: boolean;
  canExport?: boolean;
  employees?: { id: number; fullName: string }[];
  companyInfo?: any;
  spareParts?: any[];
  stockMachines?: any[];
  warehouses?: any[];
  pricingConfig?: any;
}) {
  const router = useRouter();
  const toast = useToast();

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = resolveCustomerView(searchParams.get('tab'), searchParams.get('view'));
  const activeGroup = customerTabForView(activeTab);
  const setActiveTab = (view: CustomerView, orderId?: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', customerTabForView(view).key);
    params.set('view', view);
    if (orderId) params.set('order', String(orderId)); else params.delete('order');
    router.push(`${pathname}?${params}`, { scroll: false });
  };
  useEffect(() => {
    const id = searchParams.get('order');
    if (activeTab === 'orders' && id) {
      setExpandedOrderItems(prev => ({ ...prev, [id]: true }));
      document.getElementById(`customer-order-${id}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeTab, searchParams]);
  const insights = customerInsights(customer);
  const purchasedParts = insights.parts;
  const [partsView, setPartsView] = useState<'transactions' | 'items'>('transactions');
  const [printPayment, setPrintPayment] = useState<any>(null);
  const [createQuotationOpen, setCreateQuotationOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any>(null);
  const [printingQuotation, setPrintingQuotation] = useState<any>(null);
  const [printingOrder, setPrintingOrder] = useState<any>(null);
  const [fulfillment, setFulfillment] = useState<{ order: any; mode: FulfillmentMode } | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<number | 'GENERAL' | null>(null);
  const [returnOrder, setReturnOrder] = useState<any>(null);
  const [editCustomerModalOpen, setEditCustomerModalOpen] = useState(false);
  const [createLocationModalOpen, setCreateLocationModalOpen] = useState(false);
  const [handoverEquipment, setHandoverEquipment] = useState<any | null>(null);
  const [expandedOrderItems, setExpandedOrderItems] = useState<Record<string, boolean>>({});
  const [expandedQuotationItems, setExpandedQuotationItems] = useState<Record<string, boolean>>({});

  const toggleOrderItems = (orderId: string | number) => {
    setExpandedOrderItems(prev => ({ ...prev, [String(orderId)]: !prev[String(orderId)] }));
  };

  const toggleQuotationItems = (quoteId: string | number) => {
    setExpandedQuotationItems(prev => ({ ...prev, [String(quoteId)]: !prev[String(quoteId)] }));
  };


  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const handleDeleteQuotation = (quotationId: number) => {
    setConfirmDialog({
      open: true,
      title: 'Xóa báo giá',
      message: 'Bạn có chắc chắn muốn xóa báo giá này? Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        const res = await deleteCustomerQuotationAction(quotationId, customer.id);
        if (res.ok) {
          toast.success(res.message);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const handleConvertQuotation = (q: any) => {
    setConfirmDialog({
      open: true,
      title: 'Chốt đơn hàng từ báo giá',
      message: `Chốt báo giá ${q.quoteCode} thành đơn hàng chính thức cho khách hàng?`,
      confirmText: 'Chốt đơn ngay',
      danger: false,
      onConfirm: async () => {
        const res = await convertQuotationToOrderAction(q.id, customer.id);
        if (res.ok) {
          toast.success(res.message);
          setActiveTab('orders');
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  /** Công nợ: phải thu, đã thu, còn nợ, quá hạn. */
  const debt = insights;

  const handleDeletePayment = (paymentId: number) => {
    setConfirmDialog({
      open: true,
      title: 'Xóa phiếu thu',
      message: 'Bạn có chắc chắn muốn xóa phiếu thu này? Công nợ của đơn hàng sẽ được hoàn lại tương ứng.',
      confirmText: 'Xóa phiếu thu',
      danger: true,
      onConfirm: async () => {
        const res = await deleteCustomerPaymentAction(paymentId, customer.id);
        if (res.ok) {
          toast.success(res.message);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const totalSpent = (customer.orders || []).reduce(
    (sum: number, o: any) => (o.status !== 'CANCELLED' ? sum + Number(o.totalAmount || 0) : sum),
    0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 50 }}>
      {/* 1. Navigation Back & Quick Breadcrumb */}
      <div>
        <Link
          href="/customers"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          className="hover:text-blue-600"
        >
          <ArrowLeft size={16} /> Quay lại danh sách Khách hàng
        </Link>
      </div>

      {/* 2. Customer Profile Header Card */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-lg)',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Building2 size={28} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                  {customer.name}
                </h1>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  {customer.code}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                {customer.contactName && (
                  <div>
                    Người đại diện: <strong style={{ color: 'var(--text-strong)' }}>{customer.contactName}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={13} /> {customer.phone}
                </div>
                {customer.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={13} /> {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={13} /> {customer.address}
                  </div>
                )}
              </div>

            </div>
          </div>

          {canManage && (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setEditCustomerModalOpen(true)}>
                <Edit2 size={13} style={{ marginRight: 6 }} /> Sửa thông tin
              </Button>
            </div>
          )}
        </div>

      </Card>

      {/* ── TABS (Style chuẩn Spare Parts) ── */}
      <ScrollTabs>
        {CUSTOMER_TABS.map((tab) => {
          const isActive = activeGroup.key === tab.key;
          const TabIcon =
            tab.key === 'overview'
              ? LayoutDashboard
              : tab.key === 'transactions'
              ? ShoppingCart
              : tab.key === 'products'
              ? Package
              : tab.key === 'debt'
              ? CreditCard
              : UserCheck;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.views[0].key)}
              style={{
                padding: '10px 16px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 700 : 500,
                fontSize: 14,
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'color 0.15s var(--ease-out), border-color 0.15s var(--ease-out)',
              }}
            >
              <TabIcon size={16} /> {tab.label}
            </button>
          );
        })}
      </ScrollTabs>

      {activeGroup.views.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
          {activeGroup.views.map((view) => {
            const isSubActive = activeTab === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveTab(view.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 12.5,
                  fontWeight: isSubActive ? 600 : 500,
                  background: isSubActive ? 'var(--brand-soft)' : 'var(--surface-sunken)',
                  color: isSubActive ? 'var(--brand)' : 'var(--text-muted)',
                  border: isSubActive ? '1px solid var(--brand-soft-hover)' : '1px solid var(--border-base)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      )}

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
      {activeTab === 'parts' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header"><h3 className="card-title">Phụ tùng</h3><div className="tabs"><button className="tab" data-active={partsView === 'transactions'} onClick={() => setPartsView('transactions')}>Theo giao dịch</button><button className="tab" data-active={partsView === 'items'} onClick={() => setPartsView('items')}>Theo mặt hàng</button></div></div>
          <div style={{ overflowX: 'auto' }}>
            {partsView === 'items' ? <table className="customer-purchase-table" style={{ width: '100%', fontSize: 13 }}><thead><tr><th>Phụ tùng</th><th>SL đã mua</th><th>Đã trả</th><th>Còn lại</th></tr></thead><tbody>{insights.partGroups.map(g => <tr key={g.key}><td>{g.name}</td><td>{g.quantity}</td><td>{g.returnedQty}</td><td>{g.netQty}</td></tr>)}{!insights.partGroups.length && <tr><td colSpan={4}>Chưa có phụ tùng đã mua.</td></tr>}</tbody></table> : (
            <table className="customer-purchase-table" style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead><tr>{['Phụ tùng / Vật tư', 'Đơn hàng', 'Ngày mua', 'SL trên đơn', 'Tiền hàng (chưa VAT)', 'Đã trả / Còn lại'].map(label => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>{purchasedParts.length === 0 ? <tr><td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>Khách hàng này chưa có phụ tùng đã giao</td></tr> : purchasedParts.map(({ item, order: o, returnedQty, netQty }: any) => <tr key={`${o.id}-${item.id}`}>
                <td><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{item.name}</div></td>
                <td><button type="button" onClick={() => { setActiveTab('orders', o.id); }} style={{ color: 'var(--brand)', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>{o.orderCode}</button></td>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(o.orderDate).toLocaleDateString('vi-VN')}</td>
                <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{new Intl.NumberFormat('vi-VN').format(Number(item.totalPrice ?? Number(item.quantity) * Number(item.unitPrice)))} ₫</td>
                <td>{returnedQty} / {netQty}</td>
              </tr>)}</tbody>
            </table>)}
          </div>
          {purchasedParts.length > 0 && <p style={{ padding: '10px 14px', margin: 0, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-base)' }}>Tiền hàng theo đơn gốc; số lượng trả lấy từ dòng phiếu trả liên kết. Đơn cũ chưa có liên kết cần đối soát.</p>}
        </Card>
      )}

      {activeTab === 'machines' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="customer-purchase-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px', width: 130 }}>Mã máy</th>
                  <th style={{ padding: '12px 14px' }}>Tên thiết bị</th>
                  <th style={{ padding: '12px 14px' }}>Điểm đặt máy</th>
                  <th style={{ padding: '12px 14px' }}>Hình thức</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                  <th style={{ padding: '12px 14px' }}>Hạn bảo hành</th>
                  <th style={{ padding: '12px 14px', width: 80, textAlign: 'right' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {customer.machines?.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Khách hàng này chưa được gán thiết bị nào
                    </td>
                  </tr>
                ) : (
                  customer.machines.map((m: any) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-base)' }} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/equipment/${m.id}`}
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: 'var(--brand)',
                            textDecoration: 'none',
                          }}
                        >
                          {m.machineCode}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{m.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          S/N: <span style={{ fontFamily: 'monospace' }}>{m.serialNumber}</span>
                          {m.brand && ` • ${m.brand}`}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {m.location ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-strong)', fontWeight: 500 }}>
                            <MapPin size={13} color="#0284c7" />
                            {m.location.name}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa gán điểm đặt</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: m.ownershipType === 'SOLD' ? '#dcfce7' : ['RENTAL', 'LOAN'].includes(m.ownershipType) ? '#e0f2fe' : '#fef3c7',
                            color: m.ownershipType === 'SOLD' ? '#15803d' : ['RENTAL', 'LOAN'].includes(m.ownershipType) ? '#0369a1' : '#b45309',
                          }}
                        >
                          {m.ownershipType === 'SOLD' ? 'Đã bán' : m.ownershipType === 'RENTAL' ? 'Cho thuê' : m.ownershipType === 'LOAN' ? 'Cho mượn' : 'Ký gửi'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: m.status === 'OPERATING' ? '#f0fdf4' : m.status === 'BREAKDOWN' ? '#fee2e2' : '#fef3c7',
                            color: m.status === 'OPERATING' ? '#16a34a' : m.status === 'BREAKDOWN' ? '#dc2626' : '#d97706',
                          }}
                        >
                          {m.status === 'OPERATING' ? 'Đang chạy tốt' : m.status === 'BREAKDOWN' ? 'Báo sự cố' : 'Bảo dưỡng'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                        {m.warrantyExpiresAt ? new Date(m.warrantyExpiresAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setHandoverEquipment({
                                ...m,
                                customer: { name: customer.name, phone: customer.phone, address: customer.address },
                                location: m.location,
                              })
                            }
                            title="In phiếu bàn giao / Phiếu giao nhận"
                            style={{ padding: '4px 8px', height: 'auto' }}
                          >
                            <FileText size={14} color="#2563eb" />
                          </Button>
                          <Link
                            href={`/equipment/${m.id}`}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-sunken)',
                              color: 'var(--text-strong)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                            title="Xem hồ sơ máy"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB: BÁO GIÁ ── */}
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
      {activeTab === 'locations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateLocationModalOpen(true)}
              >
                <Plus size={14} style={{ marginRight: 6 }} /> Thêm điểm đặt / Chi nhánh
              </Button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {customer.locations?.length === 0 ? (
              <Card style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Chưa có điểm lắp đặt hoặc chi nhánh nào được khai báo
              </Card>
            ) : (
            customer.locations.map((loc: any) => (
              <Card key={loc.id} style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
                      {loc.name}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {loc.address}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-base)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loc.managerName && (
                    <div>
                      Quản lý: <strong style={{ color: 'var(--text-strong)' }}>{loc.managerName}</strong>
                    </div>
                  )}
                  {loc.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                      <Phone size={12} /> {loc.phone}
                    </div>
                  )}
                </div>

                {/* Máy tại điểm này */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-base)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Máy đang lắp tại chi nhánh ({loc.machines?.length || 0}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loc.machines?.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa có máy tại điểm này</span>
                    ) : (
                      loc.machines.map((m: any) => (
                        <Link
                          key={m.id}
                          href={`/equipment/${m.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-sunken)',
                            border: '1px solid var(--border-base)',
                            textDecoration: 'none',
                            color: 'inherit',
                          }}
                          title={EQUIPMENT_CATEGORIES[m.category]?.label}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: 'var(--text-strong)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontFamily: 'monospace',
                                color: 'var(--brand)',
                                marginTop: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.machineCode}
                              {m.serialNumber && (
                                <span style={{ color: 'var(--text-muted)' }}> · S/N: {m.serialNumber}</span>
                              )}
                            </div>
                          </div>
                          {EQUIPMENT_STATUSES[m.status] && (
                            <Badge tone={EQUIPMENT_STATUSES[m.status].badgeTone} style={{ flexShrink: 0 }}>
                              {EQUIPMENT_STATUSES[m.status].label}
                            </Badge>
                          )}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
          </div>
        </div>
      )}

      {/* ── TAB 4: LỊCH SỬ SỬA CHỮA & SỰ CỐ ── */}
      {activeTab === 'tickets' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Mã sự cố</th>
                  <th style={{ padding: '12px 14px', width: '100%', minWidth: 300 }}>Nội dung sự cố</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Thiết bị</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Mức độ</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Kỹ thuật viên</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {customer.tickets?.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Không có sự cố hoặc lịch sử sửa chữa nào cho khách hàng này
                    </td>
                  </tr>
                ) : (
                  customer.tickets.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-base)' }} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                        {t.ticketCode}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{t.title}</div>
                        {t.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {t.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {t.equipment ? (
                          <Link
                            href={`/equipment/${t.equipment.id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: 'var(--brand)',
                              textDecoration: 'none',
                            }}
                          >
                            {t.equipment.machineCode}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11,
                            fontWeight: 700,
                            background: TICKET_PRIORITIES[t.priority]?.bg || '#f1f5f9',
                            color: TICKET_PRIORITIES[t.priority]?.color || '#475569',
                          }}
                        >
                          {TICKET_PRIORITIES[t.priority]?.label || 'Không xác định'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: TICKET_STATUSES[t.status]?.bg || '#f1f5f9',
                            color: TICKET_STATUSES[t.status]?.color || '#475569',
                          }}
                        >
                          {TICKET_STATUSES[t.status]?.label || 'Không xác định'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                        {t.assignedTo?.fullName || 'Chưa gán'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modals */}
      {editCustomerModalOpen && (
        <CustomerModal
          open={editCustomerModalOpen}
          customer={customer}
          onClose={() => setEditCustomerModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {fulfillment && (
        <OrderFulfillmentModal
          open={Boolean(fulfillment)}
          order={fulfillment.order}
          mode={fulfillment.mode}
          customerId={customer.id}
          warehouses={warehouses}
          onClose={() => setFulfillment(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {returnOrder && (
        <CustomerReturnModal
          open={Boolean(returnOrder)}
          order={returnOrder}
          customerId={customer.id}
          warehouses={warehouses}
          onClose={() => setReturnOrder(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printPayment && (
        <PaymentVoucherModal
          open={Boolean(printPayment)}
          onClose={() => setPrintPayment(null)}
          direction="IN"
          payment={printPayment}
          partnerName={customer.name}
          partnerAddress={customer.address}
          company={companyInfo}
        />
      )}

      {paymentOrderId !== null && (
        <CustomerPaymentModal
          open={paymentOrderId !== null}
          customerId={customer.id}
          customerName={customer.name}
          orders={customer.orders || []}
          defaultOrderId={paymentOrderId === 'GENERAL' ? undefined : paymentOrderId}
          onClose={() => setPaymentOrderId(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {createQuotationOpen && (
        <CustomerQuotationModal
          open={createQuotationOpen}
          customerId={customer.id}
          customerName={customer.name}
          locations={customer.locations}
          machines={customer.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          onClose={() => setCreateQuotationOpen(false)}
          onSuccess={() => {
            setActiveTab('quotations');
            router.refresh();
          }}
        />
      )}

      {editingQuotation && (
        <CustomerQuotationModal
          open={Boolean(editingQuotation)}
          customerId={customer.id}
          customerName={customer.name}
          locations={customer.locations}
          machines={customer.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          quotation={editingQuotation}
          onClose={() => setEditingQuotation(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printingQuotation && (
        <CustomerQuotationPrintModal
          open={Boolean(printingQuotation)}
          quotation={printingQuotation}
          customer={customer}
          companyInfo={companyInfo}
          machines={[...(customer.machines || []), ...(stockMachines || [])]}
          onClose={() => setPrintingQuotation(null)}
        />
      )}

      {printingOrder && (
        <CustomerOrderPrintModal
          open={Boolean(printingOrder)}
          order={printingOrder}
          customer={customer}
          machines={[...(customer.machines || []), ...(stockMachines || [])]}
          companyInfo={companyInfo}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {createLocationModalOpen && (
        <CustomerLocationModal
          open={createLocationModalOpen}
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setCreateLocationModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {handoverEquipment && (
        <EquipmentHandoverModal
          open={Boolean(handoverEquipment)}
          equipment={handoverEquipment}
          companyInfo={companyInfo}
          onClose={() => setHandoverEquipment(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const fn = confirmDialog.onConfirm;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          await fn();
        }}
      />
    </div>
  );
}
