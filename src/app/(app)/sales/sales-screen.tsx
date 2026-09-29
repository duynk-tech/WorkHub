'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ShoppingCart, Plus, Wallet, Truck, AlertTriangle, Printer, Undo2, PackageCheck, CircleX } from 'lucide-react';
import {
  Badge, Button, Card, PageHeader, Pagination, SearchInput, SearchableSelect, StatCard, usePaged,
} from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { SalesOrderDetailModal } from '@/components/domain/sales-order-detail-modal';
import { QuickSaleModal } from '@/components/domain/quick-sale-modal';
import { CustomerOrderModal } from '@/components/domain/customer-modals';
import { CustomerPaymentModal } from '@/components/domain/customer-payment-modal';
import { CustomerReturnModal } from '@/components/domain/customer-return-modal';
import { CustomerOrderPrintModal } from '@/components/domain/customer-order-print-modal';
import { OrderFulfillmentModal, type FulfillmentMode } from '@/components/domain/order-fulfillment-modal';
import { cancelCustomerOrderAction, getCustomerOrderContextAction, getSalesOrderDetailAction } from '@/server/modules/customer/actions';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
} from '@/server/modules/customer/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;
const orderActionButton = (background: string, color: string, borderColor: string): React.CSSProperties => ({
  width: 34,
  height: 34,
  padding: 0,
  borderRadius: 'var(--radius-sm)',
  background,
  color,
  border: `1px solid ${borderColor}`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

function OrderActionButton({
  label,
  style,
  disabled,
  onClick,
  children,
}: {
  label: string;
  style: React.CSSProperties;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; anchorLeft: number; top: number; arrowLeft?: number } | null>(null);
  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const center = rect.left + rect.width / 2;
      setTooltipPosition({ left: center, anchorLeft: center, top: rect.top - 7 });
    }
  };
  useEffect(() => {
    if (!tooltipPosition || !tooltipRef.current) return;
    const tooltipWidth = tooltipRef.current.getBoundingClientRect().width;
    const margin = 8;
    const minCenter = tooltipWidth / 2 + margin;
    const maxCenter = window.innerWidth - minCenter;
    const left = Math.min(Math.max(tooltipPosition.anchorLeft, minCenter), maxCenter);
    const arrowLeft = Math.min(100, Math.max(0, ((tooltipPosition.anchorLeft - left + tooltipWidth / 2) / tooltipWidth) * 100));
    if (left !== tooltipPosition.left || arrowLeft !== tooltipPosition.arrowLeft) {
      setTooltipPosition((current) => current ? { ...current, left, arrowLeft } : current);
    }
  }, [tooltipPosition]);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        style={style}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltipPosition(null)}
      >
        {children}
      </button>
      {tooltipPosition && typeof document !== 'undefined' && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            left: tooltipPosition.left,
            top: tooltipPosition.top,
            transform: 'translate(-50%, -100%)',
            zIndex: 10000,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            padding: '5px 9px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-inverse)',
            color: 'var(--text-inverse)',
            fontSize: 11.5,
            fontWeight: 500,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {label}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '100%',
              left: `${tooltipPosition.arrowLeft ?? 50}%`,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid var(--surface-inverse)',
            }}
          />
        </span>,
        document.body,
      )}
    </>
  );
}

const isCompletedOrCancelled = (o: any) =>
  ['COMPLETED', 'CANCELLED'].includes(o.status) || (Boolean(o.stockIssuedAt) && Number(o.remaining || 0) <= 0);

/** Nhóm theo việc kinh doanh phải làm, không theo cột dữ liệu. */
const CHIPS: { key: string; label: string; color: string; match: (o: any) => boolean }[] = [
  { key: 'ALL', label: 'Tất cả', color: 'var(--brand)', match: () => true },
  {
    key: 'OPEN',
    label: 'Chưa hoàn tất',
    color: '#d97706',
    match: (o) => !isCompletedOrCancelled(o),
  },
  {
    key: 'AWAITING',
    label: 'Chờ xuất kho',
    color: '#7c3aed',
    match: (o) => !o.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(o.status),
  },
  { key: 'DEBT', label: 'Còn phải thu', color: '#dc2626', match: (o) => Number(o.remaining) > 0 },
];

export function SalesScreen({
  orders = [],
  customers = [],
  spareParts = [],
  stockMachines = [],
  pricingConfig,
  companyInfo,
  warehouses = [],
  canManage = false,
}: {
  orders?: any[];
  /** Danh sách khách để chọn khi lập đơn — chỉ cần id, mã, tên, điện thoại. */
  customers?: any[];
  spareParts?: any[];
  stockMachines?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  warehouses?: any[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('');
  // Xem chi tiết bằng popup: bấm xong đóng lại là vẫn ở đúng trang và bộ lọc đang xem
  const [detailId, setDetailId] = useState<number | null>(null);
  const [actionOrder, setActionOrder] = useState<any>(null);
  const [actionType, setActionType] = useState<'PRINT' | 'PAYMENT' | 'RETURN' | FulfillmentMode | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [cancelOrder, setCancelOrder] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  /**
   * Lập đơn ngay tại đây: chọn khách trước, lấy dữ liệu riêng của khách đó rồi
   * mở đúng form đang dùng ở hồ sơ khách — một form, một luồng nghiệp vụ.
   */
  const [pickCustomerOpen, setPickCustomerOpen] = useState(false);
  const [pickedCustomerId, setPickedCustomerId] = useState('');
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [orderCtx, setOrderCtx] = useState<any>(null);

  const searchParams = useSearchParams();
  const customerIdParam = searchParams.get('customerId');
  const autoOpenedRef = useRef<string | null>(null);

  const openOrderForm = async (customerId: number) => {
    setLoadingCtx(true);
    const res = await getCustomerOrderContextAction(customerId);
    setLoadingCtx(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setPickCustomerOpen(false);
    setPickedCustomerId('');
    setOrderCtx((res as any).data);
  };

  const openOrderAction = async (order: any, type: 'PRINT' | 'PAYMENT' | 'RETURN' | FulfillmentMode) => {
    if (type === 'PAYMENT') {
      setActionOrder({
        ...order,
        totalAmount: Number(order.total ?? order.totalAmount ?? 0),
        paidAmount: Number(order.paid ?? order.paidAmount ?? 0),
      });
      setActionType(type);
      return;
    }
    setLoadingActionId(order.id);
    const res = await getSalesOrderDetailAction(order.id);
    setLoadingActionId(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setActionOrder((res as any).data);
    setActionType(type);
  };

  const confirmCancelOrder = async () => {
    if (!cancelOrder) return;
    setCancelLoading(true);
    const res = await cancelCustomerOrderAction(cancelOrder.id);
    setCancelLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setCancelOrder(null);
    router.refresh();
  };

  useEffect(() => {
    if (customerIdParam && autoOpenedRef.current !== customerIdParam) {
      const cid = Number(customerIdParam);
      if (!isNaN(cid) && cid > 0) {
        autoOpenedRef.current = customerIdParam;
        setPickedCustomerId(String(cid));
        openOrderForm(cid);
      }
    }
  }, [customerIdParam]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rule = CHIPS.find((c) => c.key === chip)!;
    return orders.filter((o) => {
      if (!rule.match(o)) return false;
      if (typeFilter && o.orderType !== typeFilter) return false;
      if (!s) return true;
      return [o.orderCode, o.customer?.name, o.customer?.code, o.customer?.phone]
        .some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [orders, search, chip, typeFilter]);

  const paged = usePaged(filtered, 20);

  // Số liệu tính trên toàn bộ đơn, không theo bộ lọc: đây là hiện trạng chung
  const totals = useMemo(
    () =>
      orders.reduce(
        (acc, o) => {
          const open = !isCompletedOrCancelled(o);
          return {
            open: acc.open + (open ? 1 : 0),
            awaiting:
              acc.awaiting +
              (!o.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(o.status) ? 1 : 0),
            revenue: acc.revenue + (o.status === 'CANCELLED' ? 0 : Number(o.total || 0)),
            remaining: acc.remaining + Number(o.remaining || 0),
          };
        },
        { open: 0, awaiting: 0, revenue: 0, remaining: 0 },
      ),
    [orders],
  );

  return (
    <div className="stack">
      {quickSaleOpen && <QuickSaleModal onClose={() => setQuickSaleOpen(false)} onSuccess={() => { setQuickSaleOpen(false); toast.success("Đã thanh toán và xuất kho. Mở đơn để in phiếu bán hàng."); router.refresh(); }} />}
      <PageHeader
        title="Bán hàng"
        description={
          filtered.length === orders.length
            ? `${orders.length} đơn bán`
            : `${filtered.length}/${orders.length} đơn khớp bộ lọc`
        }
        actions={
          canManage ? (
            <div style={{ display: "flex", gap: 8 }}><Button onClick={() => setQuickSaleOpen(true)}>Bán nhanh</Button><Button variant="primary" onClick={() => setPickCustomerOpen(true)}>
              <Plus /> Tạo đơn bán
            </Button></div>
          ) : undefined
        }
      />

      <div className="grid-stats">
        <StatCard
          href="/sales" label="Đơn chưa hoàn tất" value={totals.open} icon={<ShoppingCart size={16} />}
          hint={totals.open > 0 ? 'Còn việc phải chốt với khách' : 'Không có đơn tồn đọng'}
        />
        <StatCard
          href="/spare-parts?tab=warehouses"
          label="Chờ xuất kho" value={totals.awaiting} icon={<Truck size={16} />}
          tone={totals.awaiting > 0 ? 'var(--warning)' : undefined}
          hint={totals.awaiting > 0 ? 'Đã chốt đơn nhưng hàng chưa rời kho' : 'Đã xuất hết'}
        />
        <StatCard
          label="Giá trị đơn hàng" value={money(totals.revenue)} icon={<Wallet size={16} />}
          hint="Tổng giá trị đơn, trừ đơn đã hủy"
        />
        <StatCard
          href="/reports" label="Còn phải thu" value={money(totals.remaining)} icon={<AlertTriangle size={16} />}
          tone={totals.remaining > 0 ? 'var(--danger)' : undefined}
          hint={totals.remaining > 0 ? 'Cần nhắc khách thanh toán' : 'Khách đã thanh toán hết'}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchInput
          placeholder="Tìm theo mã đơn, tên khách, mã khách, số điện thoại…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 420 }}
        />
        <SearchableSelect
          sizeSm
          style={{ width: 'auto', minWidth: 190 }}
          value={chip}
          onChange={(val) => setChip(val || 'ALL')}
          options={CHIPS.map((c) => ({
            value: c.key,
            label: `${c.label} (${orders.filter(c.match).length})`,
          }))}
          placeholder="Tất cả trạng thái"
          searchPlaceholder="Lọc trạng thái…"
        />
        <SearchableSelect
          sizeSm
          style={{ width: 'auto', minWidth: 200 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: 'Tất cả loại đơn' },
            ...Object.entries(ORDER_TYPES).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          placeholder="Tất cả loại đơn"
          searchPlaceholder="Tìm loại đơn…"
        />
      </div>

      {filtered.length === 0 ? (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#ecfdf5', color: '#0f9960',
              display: 'grid', placeItems: 'center', margin: '0 auto 16px',
            }}
          >
            <ShoppingCart size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>
            {orders.length === 0 ? 'Chưa có đơn bán nào' : 'Không có đơn nào khớp'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 18px' }}>
            {orders.length === 0
              ? 'Chọn khách rồi lập đơn ngay tại đây — địa điểm giao, máy tại khách và báo giá đã chốt sẽ tự nạp theo khách.'
              : 'Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.'}
          </p>
          {orders.length === 0 && canManage && (
            <Button size="sm" variant="primary" onClick={() => setPickCustomerOpen(true)}>
              <Plus /> Tạo đơn bán đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th style={{ width: 170 }}>Trạng thái đơn</th>
                <th style={{ width: 125 }}>Giao hàng</th>
                <th style={{ width: 110 }}>Ngày đặt</th>
                <th className="num" style={{ width: 130 }}>Tổng tiền</th>
                <th className="num" style={{ width: 130 }}>Còn phải thu</th>
                <th style={{ width: 220, textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((o: any) => {
                const st = ORDER_STATUSES[o.status];
                const isFullyReturned = Boolean(o.hasReturns) && !o.hasReturnableItems;
                return (
                  <tr key={o.id} onClick={() => setDetailId(o.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--brand)', whiteSpace: 'nowrap' }}>
                        {o.orderCode}
                      </span>
                      <div className="hint">{o._count?.items ?? 0} dòng hàng</div>
                    </td>
                    <td style={{ minWidth: 300 }}>
                      <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{o.customer?.name ?? '—'}</div>
                    </td>
                    <td>
                      {st ? (
                        <span
                          className="badge"
                          style={{
                            background: st.bg,
                            color: st.color,
                            border: `1px solid ${st.color}35`,
                            fontWeight: 600,
                          }}
                        >
                          {st.label}
                        </span>
                      ) : (
                        o.status
                      )}
                    </td>
                    <td>
                      {o.status === 'CANCELLED' ? (
                        <span className="badge badge-outline">Không giao</span>
                      ) : o.stockIssuedAt ? (
                        <>
                          <span className="badge badge-success">Đã xuất kho</span>
                          <div className="hint">{fmtDate(o.stockIssuedAt)}</div>
                        </>
                      ) : (
                        <span className="badge badge-warning">Chưa xuất kho</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{fmtDate(o.orderDate)}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                      {money(o.total)}
                    </td>
                    <td className="num">
                      {o.remaining > 0 ? (
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>{money(o.remaining)}</span>
                      ) : (
                        <span style={{ color: '#15803d' }}>Đã thu đủ</span>
                      )}
                    </td>
                    <td
                      style={{ textAlign: 'center', whiteSpace: 'nowrap' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <OrderActionButton style={orderActionButton('#faf5ff', '#7c3aed', '#ddd6fe')} label="In hóa đơn & bàn giao" disabled={loadingActionId === o.id} onClick={() => openOrderAction(o, 'PRINT')}>
                          <Printer size={14} />
                        </OrderActionButton>
                        {canManage && !isFullyReturned && Number(o.remaining || 0) > 0 && !['CANCELLED', 'COMPLETED'].includes(o.status) && (
                          <OrderActionButton style={orderActionButton('#fef3c7', '#b45309', '#fde68a')} label="Thu tiền đơn hàng" onClick={() => openOrderAction(o, 'PAYMENT')}>
                            <Wallet size={14} />
                          </OrderActionButton>
                        )}
                        {canManage && !isFullyReturned && !o.stockIssuedAt && !['CANCELLED', 'COMPLETED'].includes(o.status) && (
                          <OrderActionButton style={orderActionButton('#fff1f2', '#be123c', '#fecdd3')} label="Hủy đơn chưa giao" onClick={() => setCancelOrder(o)}>
                            <CircleX size={14} />
                          </OrderActionButton>
                        )}
                        {canManage && !isFullyReturned && Boolean(o.stockIssuedAt) && o.hasReturnableItems && o.status !== 'CANCELLED' && Number(o._count?.items || 0) > 0 && (
                          <OrderActionButton style={orderActionButton('#f5f3ff', '#7c3aed', '#e9d5ff')} label="Khách trả hàng" disabled={loadingActionId === o.id} onClick={() => openOrderAction(o, 'RETURN')}>
                            <Undo2 size={14} />
                          </OrderActionButton>
                        )}
                        {canManage && !isFullyReturned && o.status !== 'CANCELLED' && Number(o._count?.items || 0) > 0 && (
                          <>
                            {o.needsSupplierOrder && !o.stockIssuedAt && o.status !== 'CANCELLED' && (
                              <OrderActionButton style={orderActionButton('#ede9fe', '#6d28d9', '#ddd6fe')} label="Đặt hàng NCC (PO)" disabled={loadingActionId === o.id} onClick={() => openOrderAction(o, 'SUPPLIER')}>
                                <Truck size={14} />
                              </OrderActionButton>
                            )}
                            {!o.stockIssuedAt && (
                              <OrderActionButton style={orderActionButton('#e0f2fe', '#0369a1', '#bae6fd')} label="Xuất kho giao khách" disabled={loadingActionId === o.id} onClick={() => openOrderAction(o, 'ISSUE')}>
                                <PackageCheck size={14} />
                              </OrderActionButton>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Pagination {...paged} unit="đơn bán" />
        </div>
      )}

      <SalesOrderDetailModal
        open={detailId !== null}
        orderId={detailId}
        companyInfo={companyInfo}
        warehouses={warehouses}
        canManage={canManage}
        onRefresh={() => router.refresh()}
        onClose={() => setDetailId(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelOrder)}
        onClose={() => { if (!cancelLoading) setCancelOrder(null); }}
        onConfirm={confirmCancelOrder}
        title="Hủy đơn bán chưa giao"
        confirmText="Hủy đơn"
        cancelText="Quay lại"
        danger
        loading={cancelLoading}
        message={<>Bạn muốn hủy đơn <strong>{cancelOrder?.orderCode}</strong>? Đơn đã giao phải lập phiếu trả hàng. Đơn này chưa xuất kho nên sẽ được giữ lại trong lịch sử với trạng thái đã hủy; khoản đã thu (nếu có) không tự động hoàn lại.</>}
      />

      {actionOrder && actionType === 'PRINT' && (
        <CustomerOrderPrintModal
          open
          onClose={() => { setActionType(null); setActionOrder(null); }}
          order={actionOrder}
          customer={actionOrder.customer}
          location={actionOrder.location}
          companyInfo={companyInfo}
          machines={actionOrder.machines || []}
        />
      )}
      {actionOrder && actionType === 'PAYMENT' && (
        <CustomerPaymentModal
          open
          customerId={actionOrder.customer.id}
          customerName={actionOrder.customer.name}
          orders={[actionOrder]}
          defaultOrderId={actionOrder.id}
          onClose={() => { setActionType(null); setActionOrder(null); }}
          onSuccess={() => router.refresh()}
        />
      )}
      {actionOrder && actionType === 'RETURN' && (
        <CustomerReturnModal
          open
          order={actionOrder}
          customerId={actionOrder.customer.id}
          warehouses={warehouses}
          onClose={() => { setActionType(null); setActionOrder(null); }}
          onSuccess={() => router.refresh()}
        />
      )}
      {actionOrder && (actionType === 'ISSUE' || actionType === 'SUPPLIER') && (
        <OrderFulfillmentModal
          open
          order={actionOrder}
          mode={actionType}
          customerId={actionOrder.customer.id}
          warehouses={warehouses}
          onClose={() => { setActionType(null); setActionOrder(null); }}
          onSuccess={() => router.refresh()}
        />
      )}

      <Modal
        open={pickCustomerOpen}
        onClose={() => {
          setPickCustomerOpen(false);
          if (searchParams.get('customerId')) {
            router.replace('/sales', { scroll: false });
          }
        }}
        title="Lập đơn bán cho khách nào?"
        description="Chọn khách để nạp sẵn địa điểm giao, máy đang đặt tại khách và báo giá đã chốt"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPickCustomerOpen(false);
                if (searchParams.get('customerId')) {
                  router.replace('/sales', { scroll: false });
                }
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={loadingCtx}
              disabled={!pickedCustomerId}
              onClick={() => openOrderForm(Number(pickedCustomerId))}
            >
              Tiếp tục
            </Button>
          </>
        }
      >
        <SearchableSelect
          value={pickedCustomerId}
          onChange={setPickedCustomerId}
          options={customers.map((c: any) => ({
            value: String(c.id),
            label: c.name,
            subLabel: [c.code, c.phone].filter(Boolean).join(' · '),
            keywords: `${c.code} ${c.phone}`,
          }))}
          placeholder="-- Chọn khách hàng --"
          searchPlaceholder="Tìm theo tên, mã hoặc số điện thoại…"
        />
      </Modal>

      {orderCtx && (
        <CustomerOrderModal
          open={Boolean(orderCtx)}
          customerId={orderCtx.id}
          customerName={orderCtx.name}
          customer={orderCtx}
          locations={orderCtx.locations || []}
          machines={orderCtx.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          quotations={orderCtx.quotations || []}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          onClose={() => {
            setOrderCtx(null);
            if (searchParams.get('customerId')) {
              router.replace('/sales', { scroll: false });
            }
          }}
          onSuccess={() => {
            setOrderCtx(null);
            if (searchParams.get('customerId')) {
              router.replace('/sales', { scroll: false });
            }
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
