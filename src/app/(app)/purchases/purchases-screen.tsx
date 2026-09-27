'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plane,
  ShoppingCart,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Edit2,
  RefreshCw,
  Wallet,
  CheckCircle2,
  Clock,
  Truck,
  Building,
  Printer,
  FileDown,
  ClipboardList,
  ShieldCheck,
  MapPin,
  Package,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  usePaged,
  Pagination,
  ActionMenu,
  ConfirmDialog,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { fmtDate } from '@/lib/date';
import {
  ORDER_STATUSES,
  orderStatusLabel,
} from '@/server/modules/spare-parts/types';
import {
  SparePartOrderModal,
  OrderStatusModal,
} from '@/components/domain/spare-part-order-modal';
import { SupplierPaymentModal } from '@/components/domain/supplier-payment-modal';
import { SparePartQuotationModal } from '@/components/domain/spare-part-quotation-modal';

export function PurchasesScreen({
  orders = [],
  warehouses = [],
  spareParts = [],
  pricingConfig,
  companyInfo,
  customers = [],
  equipments = [],
  canManage = false,
}: {
  orders?: any[];
  warehouses?: any[];
  spareParts?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  customers?: any[];
  equipments?: any[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [orderKind, setOrderKind] = useState<'ALL' | 'CUSTOMER' | 'STOCK'>('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [printOrder, setPrintOrder] = useState<any | null>(null);

  const [openOrderIds, setOpenOrderIds] = useState<Set<number>>(new Set());
  const toggleOrder = (id: number) =>
    setOpenOrderIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const stages = [
    { step: 1, key: 'REQUESTED', label: 'Yêu cầu', icon: ClipboardList },
    { step: 2, key: 'ORDERED_SUPPLIER', label: 'Đặt hãng', icon: ShoppingCart },
    { step: 3, key: 'SHIPPING_INTL', label: 'Vận chuyển QT', icon: Plane },
    { step: 4, key: 'CUSTOMS_CLEARING', label: 'Thông quan', icon: ShieldCheck },
    { step: 5, key: 'ARRIVED_WAREHOUSE', label: 'Hàng về', icon: MapPin },
    { step: 6, key: 'INSPECTING', label: 'Kiểm hàng', icon: Search },
    { step: 7, key: 'STOCKED', label: 'Nhập kho', icon: Package },
    { step: 8, key: 'COMPLETED', label: 'Hoàn tất', icon: CheckCircle2 },
  ];

  const filteredOrders = orders.filter((o: any) => {
    if (orderKind === 'CUSTOMER' && !o.customerOrderId) return false;
    if (orderKind === 'STOCK' && Boolean(o.customerOrderId)) return false;
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      const codeMatch = o.orderCode?.toLowerCase().includes(s);
      const supplierMatch = o.supplier?.toLowerCase().includes(s);
      const trackingMatch = o.trackingNumber?.toLowerCase().includes(s);
      const whMatch = o.targetWarehouse?.name?.toLowerCase().includes(s);
      const custMatch = o.customer?.name?.toLowerCase().includes(s);
      return codeMatch || supplierMatch || trackingMatch || whMatch || custMatch;
    }
    return true;
  });

  const ordersPage = usePaged(filteredOrders, 20);

  // Thống kê
  const totalCost = orders.reduce((sum: number, o: any) => sum + Number(o.totalVnd || 0), 0);
  const totalDebt = orders.reduce((sum: number, o: any) => {
    if (o.status === 'CANCELLED') return sum;
    const cost = Number(o.subtotalVnd || 0) > 0 ? Number(o.subtotalVnd) : Number(o.totalVnd || 0);
    return sum + Math.max(0, cost - Number(o.paidAmount || 0));
  }, 0);
  const inTransitCount = orders.filter((o: any) => ['ORDERED_SUPPLIER', 'SHIPPING_INTL', 'CUSTOMS_CLEARING', 'ARRIVED_WAREHOUSE'].includes(o.status)).length;
  const inStockingCount = orders.filter((o: any) => ['INSPECTING', 'STOCKED'].includes(o.status)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Mua hàng Nhà cung cấp (PO)"
        description="Quản lý đơn đặt mua hàng từ hãng & nhà cung cấp, lộ trình vận chuyển quốc tế, tính giá vốn và công nợ NCC."
        actions={
          canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingOrder(null);
                setOrderModalOpen(true);
              }}
              style={{
                background: '#7c3aed',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ShoppingCart size={15} /> Tạo đơn mua hàng (PO)
            </Button>
          )
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tổng số phiếu mua PO</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
            {orders.length}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Đang vận chuyển & thông quan</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
            {inTransitCount}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tổng giá vốn về kho</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>
            {new Intl.NumberFormat('vi-VN').format(totalCost)} ₫
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Còn nợ Nhà cung cấp</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalDebt > 0 ? '#b91c1c' : '#16a34a', marginTop: 4 }}>
            {new Intl.NumberFormat('vi-VN').format(totalDebt)} ₫
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 320 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Tìm mã PO, nhà cung cấp, vận đơn, kho nhận..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: 6,
                border: '1px solid var(--border-base)',
                background: 'var(--surface-card)',
                fontSize: 13,
                color: 'var(--text-strong)',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { key: 'ALL', label: `Tất cả (${orders.length})` },
              {
                key: 'CUSTOMER',
                label: `Theo đơn khách (${orders.filter((o: any) => o.customerOrderId).length})`,
              },
              {
                key: 'STOCK',
                label: `Nhập dự trữ (${orders.filter((o: any) => !o.customerOrderId).length})`,
              },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setOrderKind(tab.key)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: orderKind === tab.key ? '#7c3aed' : 'var(--border-base)',
                  background: orderKind === tab.key ? '#f5f3ff' : 'var(--surface-card)',
                  color: orderKind === tab.key ? '#7c3aed' : 'var(--text-muted)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-base)',
              background: 'var(--surface-card)',
              fontSize: 13,
              color: 'var(--text-strong)',
            }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            {Object.entries(ORDER_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders List Table */}
      {filteredOrders.length === 0 ? (
        <Card style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#f5f3ff',
              color: '#7c3aed',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <ShoppingCart size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>
            Chưa có đơn mua hàng nào
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px' }}>
            Tạo phiếu mua hàng PO để theo dõi tỷ giá ngoại tệ, chi phí vận chuyển quốc tế, hải quan và lộ trình về kho.
          </p>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingOrder(null);
                setOrderModalOpen(true);
              }}
              style={{ background: '#7c3aed', color: '#fff' }}
            >
              <ShoppingCart size={15} style={{ marginRight: 6 }} /> Tạo đơn mua hàng PO đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ width: 36, background: '#f1f5f9' }}></th>
                <th style={{ width: 140, whiteSpace: 'nowrap', background: '#f1f5f9' }}>Mã phiếu</th>
                <th style={{ background: '#f1f5f9' }}>Nhà cung cấp / Kho</th>
                <th style={{ width: 130, background: '#f1f5f9' }}>Loại</th>
                <th style={{ width: 160, background: '#f1f5f9' }}>Trạng thái</th>
                <th style={{ width: 110, background: '#f1f5f9' }}>Dự kiến về</th>
                <th className="num" style={{ width: 150, background: '#f1f5f9' }}>Giá vốn (Trả NCC)</th>
                <th className="num" style={{ width: 140, background: '#f1f5f9' }}>Còn nợ NCC</th>
                <th style={{ width: 92, background: '#f1f5f9' }}></th>
              </tr>
            </thead>
            <tbody>
              {ordersPage.pageRows.map((order: any) => {
                const statusCfg = ORDER_STATUSES[order.status] || {
                  label: order.status,
                  color: '#64748b',
                  bg: '#f1f5f9',
                  step: 0,
                };
                const currentStep = statusCfg.step ?? 0;
                const isOpen = openOrderIds.has(order.id);

                return (
                  <React.Fragment key={order.id}>
                    <tr
                      onClick={() => toggleOrder(order.id)}
                      style={{
                        cursor: 'pointer',
                        background: isOpen ? '#faf5ff' : undefined,
                        borderLeft: isOpen ? '3px solid #7c3aed' : '3px solid transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ width: 36, textAlign: 'center', color: 'var(--text-faint)' }}>
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7c3aed' }}>
                          {order.orderCode}
                        </span>
                        <div className="hint">{order.totalItemsQty || 0} đv · {order._count?.items ?? order.items?.length ?? 0} mã</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{order.supplier}</div>
                        <div className="hint">
                          {order.targetWarehouse?.name ?? 'Chưa chọn kho'}
                          {order.customer ? ` · Khách: ${order.customer.name}` : ''}
                        </div>
                      </td>

                      <td>
                        <Badge
                          style={{
                            background: order.customerOrderId ? '#fef3c7' : '#dcfce7',
                            color: order.customerOrderId ? '#b45309' : '#15803d',
                          }}
                        >
                          {order.customerOrderId ? 'Theo đơn khách' : 'Nhập dự trữ'}
                        </Badge>
                      </td>

                      <td>
                        <Badge style={{ background: statusCfg.bg, color: statusCfg.color }}>
                          {orderStatusLabel(order.status)}
                        </Badge>
                      </td>

                      <td style={{ fontSize: 12.5 }}>
                        {order.etaDate ? fmtDate(order.etaDate) : <span className="text-faint">—</span>}
                      </td>

                      <td className="num">
                        <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                          {new Intl.NumberFormat('vi-VN').format(
                            Number(order.subtotalVnd || 0) > 0
                              ? Number(order.subtotalVnd)
                              : Number(order.totalVnd || 0)
                          )} ₫
                        </div>
                        {(Number(order.shippingFee || 0) > 0 || Number(order.customsFee || 0) > 0) && (
                          <div className="hint" title="Tổng chi phí vốn về kho bao gồm cước vận chuyển & hải quan">
                            Về kho: {new Intl.NumberFormat('vi-VN').format(Number(order.totalVnd || 0))} ₫
                          </div>
                        )}
                      </td>

                      <td className="num">
                        {(() => {
                          const supplierCost =
                            Number(order.subtotalVnd || 0) > 0
                              ? Number(order.subtotalVnd)
                              : Number(order.totalVnd || 0);
                          const total = order.status === 'CANCELLED' ? 0 : supplierCost;
                          const remaining = Math.max(0, total - Number(order.paidAmount || 0));
                          const overdue =
                            remaining > 0 &&
                            order.dueDate &&
                            new Date(order.dueDate) < new Date(new Date().toDateString());
                          if (total <= 0) return <span className="text-faint">—</span>;
                          return remaining === 0 ? (
                            <span style={{ color: '#15803d' }}>Đã trả đủ</span>
                          ) : (
                            <span style={{ fontWeight: 700, color: overdue ? '#b91c1c' : '#b45309' }}>
                              {new Intl.NumberFormat('vi-VN').format(remaining)} ₫
                              {overdue && <div className="hint" style={{ color: '#b91c1c' }}>Quá hạn</div>}
                            </span>
                          );
                        })()}
                      </td>

                      <td onClick={(e) => e.stopPropagation()} style={{ width: 92, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setPrintOrder(order)}
                            title="In phiếu đặt hàng NCC (PO)"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 8px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#6d28d9',
                              background: '#f5f3ff',
                              border: '1px solid #ddd6fe',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Printer size={13} />
                            In
                          </button>
                          <ActionMenu
                            title={order.orderCode}
                            items={[
                              {
                                key: 'print',
                                label: 'In phiếu đặt hàng NCC',
                                icon: <Printer size={15} />,
                                onClick: () => setPrintOrder(order),
                              },
                              ...(canManage && order.status !== 'STOCKED' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED'
                                ? [
                                    {
                                      key: 'edit',
                                      label: 'Chỉnh sửa đơn mua',
                                      icon: <Edit2 size={15} />,
                                      onClick: () => {
                                        setEditingOrder(order);
                                        setOrderModalOpen(true);
                                      },
                                    },
                                  ]
                                : []),
                              ...(canManage && order.status !== 'COMPLETED' && order.status !== 'CANCELLED'
                                ? [
                                    {
                                      key: 'progress',
                                      label: 'Cập nhật tiến trình',
                                      icon: <RefreshCw size={15} />,
                                      onClick: () => {
                                        setSelectedOrder(order);
                                        setStatusModalOpen(true);
                                      },
                                    },
                                  ]
                                : []),
                              ...(canManage &&
                              order.status !== 'CANCELLED' &&
                              (Number(order.subtotalVnd || 0) > 0
                                ? Number(order.subtotalVnd)
                                : Number(order.totalVnd || 0)) > Number(order.paidAmount || 0)
                                ? [
                                    {
                                      key: 'pay',
                                      label: 'Thanh toán đơn hàng',
                                      icon: <Wallet size={15} />,
                                      onClick: () => setPayOrder(order),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td
                          colSpan={9}
                          style={{
                            background: '#f8fafc',
                            padding: '12px 18px 20px',
                            borderBottom: '2px solid #e2e8f0',
                            borderLeft: '3px solid #7c3aed',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Tiến trình 8 bước */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
                                background: '#ffffff',
                                padding: '12px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--border-base)',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                              }}
                            >
                              {stages.map((stage, idx) => {
                                const isDone = currentStep > stage.step;
                                const isCurrent = currentStep === stage.step;
                                const reached = isDone || isCurrent;
                                const IconComp = stage.icon;

                                return (
                                  <div
                                    key={stage.step}
                                    style={{
                                      position: 'relative',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: 4,
                                      minWidth: 0,
                                    }}
                                  >
                                    {idx > 0 && (
                                      <span
                                        style={{
                                          position: 'absolute',
                                          top: 11,
                                          right: '50%',
                                          width: '100%',
                                          height: 2,
                                          background: reached ? '#16a34a' : 'var(--border-base)',
                                          zIndex: 0,
                                        }}
                                      />
                                    )}

                                    <span
                                      style={{
                                        position: 'relative',
                                        zIndex: 1,
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        display: 'grid',
                                        placeItems: 'center',
                                        background: isDone
                                          ? '#16a34a'
                                          : isCurrent
                                          ? '#7c3aed'
                                          : 'var(--surface-card, #ffffff)',
                                        color: isDone || isCurrent ? '#ffffff' : 'var(--text-muted, #94a3b8)',
                                        border: isDone
                                          ? 'none'
                                          : isCurrent
                                          ? '2px solid #6d28d9'
                                          : '1px solid var(--border-base, #cbd5e1)',
                                        boxShadow: isCurrent ? '0 0 0 3px rgba(124, 58, 237, 0.2)' : 'none',
                                        transition: 'all 0.2s ease',
                                      }}
                                      title={`Bước ${stage.step}: ${stage.label}`}
                                    >
                                      <IconComp size={13} strokeWidth={2.3} />
                                    </span>

                                    <span
                                      title={stage.label}
                                      style={{
                                        maxWidth: '100%',
                                        fontSize: 10.5,
                                        fontWeight: isCurrent ? 700 : isDone ? 600 : 500,
                                        color: isCurrent ? '#7c3aed' : isDone ? '#16a34a' : 'var(--text-muted)',
                                        lineHeight: 1.15,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      {stage.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Chi tiết 2 cột */}
                            {(() => {
                              const itemsCount = order.items?.length || 1;
                              const shippingPerLine = (order.items?.length || 0) > 0 ? Number(order.shippingFee || 0) / itemsCount : 0;
                              const otherPerLine = (order.items?.length || 0) > 0 ? Number(order.customsFee || 0) / itemsCount : 0;
                              const exchangeRate = Number(order.exchangeRate || 32500);
                              const curSym = order.currency === 'USD' ? '$' : order.currency === 'VND' ? '₫' : '€';

                              const calculatedCostItems = (order.items || []).map((it: any) => {
                                const qty = Number(it.quantity) || 1;
                                const baseCost =
                                  Number(it.unitPriceVnd || 0) > 0
                                    ? Number(it.unitPriceVnd)
                                    : Number(it.unitPriceEur || 0) > 0
                                    ? Math.round(Number(it.unitPriceEur) * exchangeRate)
                                    : Number(it.item?.avgCost || it.item?.costPrice || 0);
                                const freightPerUnit = qty > 0 ? Math.round(shippingPerLine / qty) : 0;
                                const otherFeePerUnit = qty > 0 ? Math.round(otherPerLine / qty) : 0;
                                const unitCostWithFees = baseCost + freightPerUnit + otherFeePerUnit;
                                return {
                                  ...it,
                                  baseCost,
                                  freightPerUnit,
                                  otherFeePerUnit,
                                  unitCostWithFees,
                                  costSubtotal: baseCost * qty,
                                  totalCostWithFees: unitCostWithFees * qty,
                                };
                              });

                              const totalEur = (order.items || []).reduce(
                                (sum: number, it: any) => sum + Number(it.unitPriceEur || 0) * (Number(it.quantity) || 1),
                                0
                              );

                              return (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                                  {/* Cột trái: Mặt hàng */}
                                  <div
                                    style={{
                                      border: '1px solid var(--border-base)',
                                      borderRadius: 8,
                                      padding: 12,
                                      background: 'var(--surface-card)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                                        Mặt hàng đặt mua ({order.items?.length || 0} mã)
                                      </span>
                                      {canManage && order.status !== 'STOCKED' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingOrder(order);
                                            setOrderModalOpen(true);
                                          }}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            border: 'none',
                                            background: '#f5f3ff',
                                            color: '#7c3aed',
                                            padding: '3px 8px',
                                            borderRadius: 4,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <Edit2 size={12} /> Sửa phiếu
                                        </button>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {calculatedCostItems.map((it: any) => (
                                        <div
                                          key={it.id}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '7px 10px',
                                            borderRadius: 6,
                                            background: 'var(--surface-sunken)',
                                            fontSize: 12.5,
                                          }}
                                        >
                                          <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                                              {it.item?.name || 'Mặt hàng mua'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                              Mã: {it.item?.itemCode || '—'} • Đơn giá mua NCC:{' '}
                                              {Number(it.unitPriceEur || 0) > 0
                                                ? `${Number(it.unitPriceEur).toLocaleString('vi-VN')} ${curSym} (`
                                                : ''}
                                              {new Intl.NumberFormat('vi-VN').format(it.baseCost)} ₫
                                              {Number(it.unitPriceEur || 0) > 0 ? ')' : ''}

                                            </div>
                                          </div>
                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                                              x{it.quantity} {it.item?.unit || 'cái'}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                                              {new Intl.NumberFormat('vi-VN').format(it.costSubtotal)} ₫
                                              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>(Giá vốn)</div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Cột phải: Chi phí & Vận chuyển */}
                                  <div
                                    style={{
                                      border: '1px solid var(--border-base)',
                                      borderRadius: 8,
                                      padding: 12,
                                      background: 'var(--surface-card)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 10,
                                    }}
                                  >
                                    <div>
                                      <div
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: 'var(--text-muted)',
                                          marginBottom: 8,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                        }}
                                      >
                                        <span>Chi phí vốn & Công nợ NCC</span>
                                        <Badge style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 10 }}>
                                          Phiếu mua hàng NCC
                                        </Badge>
                                      </div>

                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>
                                            Tiền hàng mua
                                            {order.currency && order.currency !== 'VND' && exchangeRate !== 1
                                              ? ` (${new Intl.NumberFormat('vi-VN').format(exchangeRate)} ₫/${order.currency}):`
                                              : ':'}
                                          </span>
                                          <span style={{ fontWeight: 600 }}>
                                            {new Intl.NumberFormat('vi-VN').format(Number(order.subtotalVnd))} ₫
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '4px 8px',
                                            background: '#eff6ff',
                                            borderRadius: 4,
                                            color: '#1d4ed8',
                                            fontWeight: 700,
                                          }}
                                        >
                                          <span>Phần trả NCC (Giá vốn hàng):</span>
                                          <span>{new Intl.NumberFormat('vi-VN').format(Number(order.subtotalVnd || 0))} ₫</span>
                                        </div>

                                        {Number(order.shippingFee) > 0 && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                            <span>Cước vận chuyển quốc tế:</span>
                                            <span>{new Intl.NumberFormat('vi-VN').format(Number(order.shippingFee))} ₫</span>
                                          </div>
                                        )}
                                        {Number(order.customsFee) > 0 && (
                                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                            <span>Phí khác / Hải quan:</span>
                                            <span>{new Intl.NumberFormat('vi-VN').format(Number(order.customsFee))} ₫</span>
                                          </div>
                                        )}

                                        <div
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingTop: 8,
                                            marginTop: 4,
                                            borderTop: '2px solid #cbd5e1',
                                            fontSize: 13,
                                            color: '#1d4ed8',
                                          }}
                                        >
                                          <span style={{ fontWeight: 800 }}>TỔNG CỘNG :</span>
                                          <div style={{ textAlign: 'right' }}>
                                            {totalEur > 0 && curSym !== '₫' && (
                                              <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                                                {totalEur.toLocaleString('vi-VN', {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}{' '}
                                                {curSym}
                                              </div>
                                            )}
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>
                                              {new Intl.NumberFormat('vi-VN').format(Number(order.totalVnd))} ₫
                                            </div>
                                          </div>
                                        </div>

                                        {order.customer && (
                                          <div style={{ fontSize: 11, color: '#6b7280', paddingTop: 4 }}>
                                            Khách hàng: <span style={{ fontWeight: 600, color: '#374151' }}>{order.customer.name}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Tracking info */}
                                    <div
                                      style={{
                                        paddingTop: 8,
                                        borderTop: '1px solid var(--border-base)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Mã vận đơn QT:</span>
                                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                          {order.trackingNumber || 'Chưa cập nhật'}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Dự kiến về kho (ETA):</span>
                                        <span>{order.etaDate ? fmtDate(order.etaDate) : 'Chưa có'}</span>
                                      </div>
                                      {order.notes && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 2 }}>
                                          Ghi chú: {order.notes}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <Pagination {...ordersPage} unit="phiếu mua" />
        </div>
      )}

      {orderModalOpen && (
        <SparePartOrderModal
          open={orderModalOpen}
          initialOrder={editingOrder}
          spareParts={spareParts}
          warehouses={warehouses}
          customers={customers}
          equipments={equipments}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          onClose={() => {
            setOrderModalOpen(false);
            setEditingOrder(null);
          }}
          onSuccess={() => {
            setEditingOrder(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {statusModalOpen && selectedOrder && (
        <OrderStatusModal
          open={statusModalOpen}
          order={selectedOrder}
          onClose={() => {
            setStatusModalOpen(false);
            setSelectedOrder(null);
          }}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {payOrder && (
        <SupplierPaymentModal
          open={Boolean(payOrder)}
          order={payOrder}
          companyInfo={companyInfo}
          onClose={() => setPayOrder(null)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {printOrder && (
        <SparePartQuotationModal
          open={Boolean(printOrder)}
          order={printOrder}
          companyInfo={companyInfo}
          pricingConfig={pricingConfig}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  );
}
