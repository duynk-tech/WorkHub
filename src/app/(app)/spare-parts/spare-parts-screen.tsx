'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { fmtDate } from '@/lib/date';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Package,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  Search,
  Truck,
  Building,
  RefreshCw,
  Sparkles,
  Utensils,
  ExternalLink,
  Plane,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  Printer,
  FileDown,
  BarChart3,
  Wallet,
  FilePlus2,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Calculator,
} from 'lucide-react';
import { Card, Button, Input, Badge, usePaged, Pagination, ScrollTabs, ActionMenu, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  PART_CATEGORIES,
  SUPPLY_TYPES,
  WAREHOUSE_TYPES,
  TRANSACTION_TYPES,
  ORDER_STATUSES,
  orderStatusLabel,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import type { CompanyInfo } from '@/server/modules/settings/branding';
import {
  SparePartModal,
  StockTransactionModal,
  WarehouseModal,
  ItemPriceCalculatorModal,
  parseFeesFromDescription,
} from '@/components/domain/spare-parts-modals';
import { saveSparePartAction } from '@/server/modules/spare-parts/actions';
import {
  SparePartOrderModal,
  OrderStatusModal,
} from '@/components/domain/spare-part-order-modal';
import { SparePartPricingModal } from '@/components/domain/spare-part-pricing-modal';
import { InventoryTransactionReportModal } from '@/components/domain/inventory-transaction-report-modal';
import { SparePartQuotationModal } from '@/components/domain/spare-part-quotation-modal';
import { InventoryReportPanel } from '@/components/domain/inventory-report-panel';
import { StockHistoryPanel } from '@/components/domain/stock-history-panel';
import { StockCountModal } from '@/components/domain/stock-count-modal';
import { SupplierPaymentModal } from '@/components/domain/supplier-payment-modal';
import { StockDocumentChooser } from '@/components/domain/stock-document-chooser';
import { PaymentVoucherModal } from '@/components/domain/payment-voucher-modal';
import {
  PAYMENT_METHODS,
  ORDER_STATUSES as SALES_ORDER_STATUSES,
  ORDER_TYPES as SALES_ORDER_TYPES,
} from '@/server/modules/customer/types';
import { EquipmentScreen } from '@/app/(app)/equipment/equipment-screen';
import {
  deleteSparePartAction,
  seedSparePartsAction,
} from '@/server/modules/spare-parts/actions';

export function SparePartsScreen({
  spareParts,
  warehouses,
  transactions,
  transactionTotal = 0,
  orders = [],
  stats,
  canManage,
  pricingConfig,
  companyInfo,
  customers = [],
  equipments = [],
  initialTab,
  equipmentList = [],
  equipmentMetrics,
  equipmentCustomers = [],
}: {
  spareParts: any[];
  warehouses: any[];
  transactions: any[];
  transactionTotal?: number;
  orders?: any[];
  stats: {
    totalItems: number;
    lowStockCount: number;
    totalStockValue: number;
    machineStockValue: number;
    machineQty: number;
    partStockValue: number;
    totalWarehouses: number;
    centralCount: number;
    vanCount: number;
  };
  canManage: boolean;
  pricingConfig?: SparePartPricingConfig;
  companyInfo?: CompanyInfo;
  customers?: any[];
  equipments?: any[];
  /** Tab mở sẵn khi vào từ link ngoài, ví dụ ?tab=machines. */
  initialTab?: string;
  /** Dữ liệu cho tab "Máy móc" — gộp từ màn Thiết bị cũ. */
  equipmentList?: any[];
  equipmentMetrics?: any;
  equipmentCustomers?: any[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  type TabKey = 'parts' | 'machines' | 'orders' | 'warehouses' | 'transactions' | 'report';
  const TAB_KEYS: TabKey[] = ['parts', 'machines', 'orders', 'warehouses', 'transactions', 'report'];
  // Link từ dashboard / tem QR mở thẳng tab cần xem, sai key thì về tab mặc định
  const [activeTab, setActiveTab] = useState<TabKey>(
    TAB_KEYS.includes(initialTab as TabKey) ? (initialTab as TabKey) : 'parts',
  );

  /**
   * Ghi tab đang mở lên URL để F5 / copy link giữ nguyên chỗ đang đứng.
   * Dùng replaceState chứ không router.push: đổi tab là việc của client, đẩy lên
   * server chỉ tổ nạp lại cả trang.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === 'parts') params.delete('tab');
    else params.set('tab', activeTab);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [activeTab]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [supplyTypeFilter, setSupplyTypeFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<number | 'ALL'>('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals state
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<any | null>(null);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [pricingTargetPart, setPricingTargetPart] = useState<any | null>(null);

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [stockCountOpen, setStockCountOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<any>(null);
  const [printVoucher, setPrintVoucher] = useState<{ payment: any; supplier: string } | null>(null);
  const [docChooserOpen, setDocChooserOpen] = useState(false);
  /** Mở thẳng form thêm máy trong tab Máy móc. */
  const [openMachineModal, setOpenMachineModal] = useState(false);
  /** Lọc phiếu đặt hàng theo mục đích: đặt riêng cho khách hay nhập kho dự trữ. */
  const [orderKind, setOrderKind] = useState<'ALL' | 'CUSTOMER' | 'STOCK'>('ALL');
  /**
   * Phiếu mua mặc định thu gọn: mỗi phiếu mở hết chiếm gần một màn hình, mười
   * phiếu là phải cuộn mãi mới thấy phiếu cuối. Dòng gọn đã nói đủ phiếu đang ở
   * bước nào, cần xem chi tiết mới bấm mở.
   */
  const [openOrderIds, setOpenOrderIds] = useState<Set<number>>(new Set());
  const toggleOrder = (id: number) =>
    setOpenOrderIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const visibleOrders = orders.filter((o: any) =>
    orderKind === 'ALL' ? true : orderKind === 'CUSTOMER' ? Boolean(o.customerOrderId) : !o.customerOrderId,
  );
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [transModalOpen, setTransModalOpen] = useState(false);
  const [transDefaultType, setTransDefaultType] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN');
  const [transInitialItemId, setTransInitialItemId] = useState<number | undefined>(undefined);

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any | null>(null);

  const [selectedTxForReport, setSelectedTxForReport] = useState<any | null>(null);
  const [selectedOrderForQuote, setSelectedOrderForQuote] = useState<any | null>(null);

  // Filtered parts
  const filteredParts = spareParts.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (supplyTypeFilter !== 'ALL' && item.supplyType !== supplyTypeFilter) return false;
    if (lowStockOnly && !item.isLowStock) return false;
    if (warehouseFilter !== 'ALL') {
      const hasInWh = item.stocks.some((s: any) => s.warehouseId === warehouseFilter && s.quantity > 0);
      if (!hasInWh) return false;
    }
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      const matchName = item.name?.toLowerCase().includes(s);
      const matchCode = item.itemCode?.toLowerCase().includes(s);
      const matchComp = item.compatibleWith?.toLowerCase().includes(s);
      const matchMfr = item.manufacturer?.toLowerCase().includes(s);
      return matchName || matchCode || matchComp || matchMfr;
    }
    return true;
  });

  /**
   * Tổng tồn và giá trị của tập đang lọc, hiện ở chân bảng.
   *
   * Định giá theo giá vốn BÌNH QUÂN GIA QUYỀN (avgCost) — con số hệ thống tự chốt
   * lại sau mỗi lần nhập, phản ánh tiền thực đã bỏ ra. Giá vốn khai trong danh mục
   * (costPrice) là giá tham chiếu do người dùng gõ, có thể lỗi thời, nên chỉ dùng
   * cho mã chưa từng nhập kho lần nào.
   */
  const filteredTotals = filteredParts.reduce(
    (acc, item: any) => {
      const qty = Number(item.totalStock || 0);
      const unitCost = Number(item.avgCost || 0) || Number(item.costPrice || 0);
      return { qty: acc.qty + qty, value: acc.value + qty * unitCost };
    },
    { qty: 0, value: 0 },
  );

  // Chặn số dòng đổ ra DOM: danh mục và phiếu đặt hàng đều lớn dần theo thời gian
  const partsPage = usePaged(filteredParts, 20);
  const ordersPage = usePaged(visibleOrders, 20);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const handleDeletePart = (id: number) => {
    setConfirmDialog({
      open: true,
      title: 'Xóa phụ tùng',
      message: 'Bạn có chắc chắn muốn xóa phụ tùng này khỏi danh mục? Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        const res = await deleteSparePartAction(id);
        if (res.ok) {
          toast.success(res.message);
          startTransition(() => router.refresh());
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const handleSeedData = () => {
    setConfirmDialog({
      open: true,
      title: 'Khởi tạo dữ liệu mẫu',
      message: 'Khởi tạo 2 kho và 8 mã linh kiện F&B tiêu chuẩn cùng tồn kho mẫu?',
      confirmText: 'Khởi tạo ngay',
      danger: false,
      onConfirm: async () => {
        const res = await seedSparePartsAction();
        if (res.ok) {
          toast.success(res.message);
          startTransition(() => router.refresh());
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const openQuickTrans = (type: 'IN' | 'OUT' | 'TRANSFER', itemId?: number) => {
    setTransDefaultType(type);
    setTransInitialItemId(itemId);
    setTransModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Boxes size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                Máy móc & Phụ tùng
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Danh mục phụ tùng và máy nguyên chiếc, tồn kho, xuất nhập kho và máy đang lắp tại khách
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {spareParts.length === 0 && (
              <Button size="sm" variant="secondary" onClick={handleSeedData}>
                <Sparkles size={15} style={{ marginRight: 6, color: '#d97706' }} /> Khởi tạo dữ liệu mẫu
              </Button>
            )}

            <Button
              size="sm"
              variant="primary"
              onClick={() => setDocChooserOpen(true)}
              title="Khai báo mã mới, thêm máy tại khách, hoặc lập phiếu kho"
            >
              <FilePlus2 size={15} style={{ marginRight: 6 }} /> Tạo mới
            </Button>

            <Button
              size="sm"
              variant="secondary"
              iconOnly
              onClick={() => setPricingModalOpen(true)}
              title="Cấu hình Chính sách Giá & Margin Phụ tùng"
              aria-label="Cấu hình Chính sách Giá & Margin Phụ tùng"
            >
              <SlidersHorizontal size={15} />
            </Button>

          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <ScrollTabs>
        <button
          type="button"
          onClick={() => setActiveTab('parts')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'parts' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'parts' ? '2px solid var(--brand)' : '2px solid transparent',
            color: activeTab === 'parts' ? 'var(--brand)' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Package size={16} /> Phụ tùng ({spareParts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('machines')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'machines' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'machines' ? '2px solid var(--brand)' : '2px solid transparent',
            color: activeTab === 'machines' ? 'var(--brand)' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Utensils size={16} /> Máy móc ({equipmentList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'orders' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'orders' ? '2px solid #7c3aed' : '2px solid transparent',
            color: activeTab === 'orders' ? '#7c3aed' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Plane size={16} /> Mua hàng ({orders.length})
        </button>


        <button
          type="button"
          onClick={() => setActiveTab('warehouses')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'warehouses' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'warehouses' ? '2px solid var(--brand)' : '2px solid transparent',
            color: activeTab === 'warehouses' ? 'var(--brand)' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Building size={16} /> Kho ({warehouses.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'transactions' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'transactions' ? '2px solid var(--brand)' : '2px solid transparent',
            color: activeTab === 'transactions' ? 'var(--brand)' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ArrowLeftRight size={16} /> Lịch sử kho ({transactions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          style={{
            padding: '10px 16px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: activeTab === 'report' ? 700 : 500,
            fontSize: 14,
            borderBottom: activeTab === 'report' ? '2px solid var(--brand)' : '2px solid transparent',
            color: activeTab === 'report' ? 'var(--brand)' : 'var(--text-muted)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <BarChart3 size={16} /> Báo cáo
        </button>
      </ScrollTabs>

      {/* ── TAB: MÁY TẠI KHÁCH HÀNG ── */}
      {activeTab === 'machines' && (
        <EquipmentScreen
          embedded
          equipmentList={equipmentList}
          metrics={equipmentMetrics}
          customers={equipmentCustomers}
          filter={{}}
          canManage={canManage}
          company={companyInfo}
          machineCatalog={spareParts.filter((i: any) => i.category === 'EQUIPMENT')}
          warehouses={warehouses}
          pricingConfig={pricingConfig}
          openCreateSignal={openMachineModal}
          onCreateHandled={() => setOpenMachineModal(false)}
        />
      )}

      {/* ── TAB 1: DANH MỤC PHỤ TÙNG ── */}
      {activeTab === 'parts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 320 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <Input
                  placeholder="Tìm theo tên, mã linh kiện, máy tương thích, thương hiệu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>

              <select
                className="select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ width: 170 }}
              >
                <option value="ALL">Tất cả phân loại</option>
                {Object.entries(PART_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={supplyTypeFilter}
                onChange={(e) => setSupplyTypeFilter(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="ALL">Tất cả hình thức</option>
                <option value="READY_STOCK">Hàng có sẵn trong kho</option>
                <option value="ON_ORDER">Hàng order (Nhập khẩu)</option>
              </select>

              <select
                className="select"
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                style={{ width: 190 }}
              >
                <option value="ALL">Tất cả kho phụ tùng</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.type === 'CENTRAL' ? 'Kho tổng' : 'Chi nhánh'}] {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setLowStockOnly(!lowStockOnly)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: lowStockOnly ? '1px solid #dc2626' : '1px solid var(--border-base)',
                  background: lowStockOnly ? '#fee2e2' : 'var(--surface-card)',
                  color: lowStockOnly ? '#dc2626' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <AlertTriangle size={14} />
                Chỉ xem sắp hết hàng ({stats.lowStockCount})
              </button>
            </div>
          </div>

          {/* Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                    <th style={{ padding: '12px 10px', width: 50, textAlign: 'center' }}>STT</th>
                    <th style={{ padding: '12px 14px', width: '1%', whiteSpace: 'nowrap' }}>Mã phụ tùng</th>
                    <th style={{ padding: '12px 14px' }}>Tên phụ tùng & Phân loại</th>
                    <th style={{ padding: '12px 14px' }}>Máy tương thích</th>
                    <th style={{ padding: '12px 14px', width: 80, textAlign: 'center' }}>ĐVT</th>
                    <th style={{ padding: '12px 14px', width: 160 }}>Tổng tồn kho</th>
                    <th style={{ padding: '12px 14px' }}>Vị trí lưu kho</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Giá vốn / Giá bán</th>
                    <th style={{ padding: '12px 14px', width: 100, textAlign: 'right', whiteSpace: 'nowrap' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Không tìm thấy phụ tùng hoặc linh kiện nào phù hợp với bộ lọc
                      </td>
                    </tr>
                  ) : (
                    partsPage.pageRows.map((item, idx) => {
                      const catInfo = PART_CATEGORIES[item.category] || { label: item.category, color: '#64748b', bg: '#f1f5f9' };

                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border-base)' }} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            {String(partsPage.offset + idx + 1).padStart(2, '0')}
                          </td>

                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                background: 'var(--surface-sunken)',
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border-base)',
                              }}
                            >
                              {item.itemCode}
                            </span>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{item.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: catInfo.bg,
                                  color: catInfo.color,
                                }}
                              >
                                {catInfo.label}
                              </span>
                              {item.supplyType === 'ON_ORDER' ? (
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: '#f5f3ff',
                                    color: '#7c3aed',
                                    border: '1px solid #ddd6fe',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <Plane size={11} /> Hàng order
                                </span>
                              ) : (
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: '#f0fdf4',
                                    color: '#15803d',
                                    border: '1px solid #bbf7d0',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <Package size={11} /> Sẵn trong kho
                                </span>
                              )}
                              {item.manufacturer && (
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                  Hãng: {item.manufacturer}
                                </span>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                            {item.compatibleWith || '—'}
                          </td>

                          <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                            {item.unit}
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 800,
                                  color: item.isLowStock ? '#dc2626' : '#16a34a',
                                }}
                              >
                                {item.totalStock}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.unit}</span>

                              {item.isLowStock && (
                                <span
                                  style={{
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 2,
                                  }}
                                  title={`Tồn kho dưới ngưỡng an toàn (${item.minStockAlert} ${item.unit})`}
                                >
                                  <AlertTriangle size={11} /> Sắp hết
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Ngưỡng an toàn: {item.minStockAlert}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {item.stocks.length === 0 ? (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa có tồn</span>
                              ) : (
                                item.stocks.map((s: any) => (
                                  <span
                                    key={s.id}
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 11.5,
                                      background: s.warehouse.type === 'CENTRAL' ? '#e0f2fe' : '#dcfce7',
                                      color: s.warehouse.type === 'CENTRAL' ? '#0369a1' : '#15803d',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <Building size={11} />
                                    {s.warehouse.code}: <strong>{s.quantity}</strong>
                                  </span>
                                ))
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {item.priceEur && (
                              <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                                Hãng: €{Number(item.priceEur).toLocaleString('vi-VN')}
                              </div>
                            )}
                            {item.costPrice && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Vốn: {new Intl.NumberFormat('vi-VN').format(Number(item.costPrice))} ₫
                              </div>
                            )}
                            {item.sellingPrice ? (
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                                Bán: {new Intl.NumberFormat('vi-VN').format(Number(item.sellingPrice))} ₫
                              </div>
                            ) : (
                              !item.priceEur && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
                            )}
                          </td>

                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {canManage && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                <ActionMenu
                                  title={item.itemCode || item.name}
                                  items={[
                                    {
                                      key: 'pricing',
                                      label: 'Tính giá bán & cước phí',
                                      icon: <Calculator size={15} style={{ color: '#7c3aed' }} />,
                                      onClick: () => {
                                        setPricingTargetPart(item);
                                        setCalcModalOpen(true);
                                      },
                                    },
                                    {
                                      key: 'edit',
                                      label: 'Sửa thông tin',
                                      icon: <Edit2 size={15} style={{ color: 'var(--brand)' }} />,
                                      onClick: () => {
                                        setEditingPart(item);
                                        setPartModalOpen(true);
                                      },
                                    },
                                    {
                                      key: 'delete',
                                      label: 'Xóa phụ tùng',
                                      icon: <Trash2 size={15} />,
                                      danger: true,
                                      onClick: () => handleDeletePart(item.id),
                                    },
                                  ]}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Chân bảng cộng theo bộ lọc đang áp dụng, không phải theo trang —
                    người xem cần tổng của tập đang lọc, không phải của 20 dòng */}
                {filteredParts.length > 0 && (
                  <tfoot>
                    <tr
                      style={{
                        background: 'var(--surface-sunken)',
                        borderTop: '2px solid var(--border-base)',
                        fontWeight: 700,
                        color: 'var(--text-strong)',
                      }}
                    >
                      <td colSpan={4} style={{ padding: '12px 14px', fontSize: 12.5 }}>
                        Tổng {filteredParts.length} mã
                        {filteredParts.length !== spareParts.length && (
                          <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
                            {' '}(đang lọc từ {spareParts.length})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }} />
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>
                        {filteredTotals.qty} đơn vị
                      </td>
                      <td style={{ padding: '12px 14px' }} />
                      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div
                          style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}
                          title="Tính theo giá vốn bình quân gia quyền; mã chưa từng nhập kho thì lấy giá vốn khai trong danh mục"
                        >
                          Giá trị tồn (giá vốn)
                        </div>
                        <div style={{ fontSize: 14 }}>
                          {new Intl.NumberFormat('vi-VN').format(filteredTotals.value)} ₫
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <Pagination {...partsPage} unit="mã phụ tùng" />
          </Card>
        </div>
      )}

      {/* ── TAB: MUA HÀNG (đặt hàng nhà cung cấp & nhập khẩu) ── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Chip lọc và nút tạo nằm chung một hàng, nút canh phải */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              { key: 'ALL', label: `Tất cả phiếu (${orders.length})` },
              {
                key: 'CUSTOMER',
                label: `Đặt theo đơn khách (${orders.filter((o: any) => o.customerOrderId).length})`,
              },
              {
                key: 'STOCK',
                label: `Nhập kho dự trữ (${orders.filter((o: any) => !o.customerOrderId).length})`,
              },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setOrderKind(tab.key)}
                style={{
                  padding: '6px 12px',
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

            {canManage && (
              <Button
                size="sm"
                onClick={() => setOrderModalOpen(true)}
                style={{ background: '#7c3aed', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ShoppingCart size={15} /> Tạo đơn mua
              </Button>
            )}
          </div>

          {/* Orders list */}
          {visibleOrders.length === 0 ? (
            <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
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
                Chưa có đơn mua nào
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 18px' }}>
                Tạo đơn hàng order để tự động tính chiết khấu theo số lượng, chi phí hải quan và theo dõi lộ trình vận chuyển về kho.
              </p>
              {canManage && (
                <Button
                  size="sm"
                  onClick={() => setOrderModalOpen(true)}
                  style={{ background: '#7c3aed', color: '#fff' }}
                >
                  <ShoppingCart size={15} style={{ marginRight: 6 }} /> Tạo đơn hàng Order đầu tiên
                </Button>
              )}
            </Card>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Mã phiếu</th>
                    <th>Nhà cung cấp / Kho</th>
                    <th style={{ width: 130 }}>Loại</th>
                    <th style={{ width: 160 }}>Trạng thái</th>
                    <th style={{ width: 110 }}>Dự kiến về</th>
                    <th className="num" style={{ width: 140 }}>Tổng tiền</th>
                    <th className="num" style={{ width: 140 }}>Còn nợ NCC</th>
                    <th style={{ width: 52 }}></th>
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
                // Phiếu đã hủy có step = 0 nghĩa là KHÔNG ở bước nào. Dùng `|| 1`
                // sẽ tô sáng bước 1 và nói dối rằng phiếu đang chờ xử lý.
                const currentStep = statusCfg.step ?? 0;
                const isOpen = openOrderIds.has(order.id);

                const stages = [
                  { step: 1, key: 'REQUESTED', label: 'Yêu cầu' },
                  { step: 2, key: 'ORDERED_SUPPLIER', label: 'Đặt hãng' },
                  { step: 3, key: 'SHIPPING_INTL', label: 'Vận chuyển QT' },
                  { step: 4, key: 'CUSTOMS_CLEARING', label: 'Thông quan' },
                  { step: 5, key: 'ARRIVED_WAREHOUSE', label: 'Hàng về' },
                  { step: 6, key: 'INSPECTING', label: 'Kiểm hàng' },
                  { step: 7, key: 'STOCKED', label: 'Nhập kho' },
                  { step: 8, key: 'COMPLETED', label: 'Hoàn tất' },
                ];

                return (
                  <React.Fragment key={order.id}>
                    <tr
                      onClick={() => toggleOrder(order.id)}
                      style={{ cursor: 'pointer', background: isOpen ? 'var(--surface-sunken)' : undefined }}
                    >
                      <td style={{ width: 36, textAlign: 'center', color: 'var(--text-faint)' }}>
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </td>

                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7c3aed' }}>
                          {order.orderCode}
                        </span>
                        <div className="hint">{order.totalItemsQty || 0} đv · {order._count?.items ?? order.items?.length ?? 0} mã</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{order.supplier}</div>
                        <div className="hint">
                          {order.targetWarehouse?.name ?? 'Chưa chọn kho'}
                          {order.customer ? ` · ${order.customer.name}` : ''}
                        </div>
                      </td>

                      <td>
                        <Badge
                          style={{ background: order.customerOrderId ? '#fef3c7' : '#dcfce7', color: order.customerOrderId ? '#b45309' : '#15803d' }}
                          title={
                            order.customerOrderId
                              ? 'Hàng đặt riêng cho một đơn khách, về kho là giao ngay'
                              : 'Hàng đặt trước để dự trữ, bán cho khách nào cũng được'
                          }
                        >
                          {order.customerOrderId ? 'Theo đơn khách' : 'Dự trữ'}
                        </Badge>
                      </td>

                      <td>
                        <Badge style={{ background: statusCfg.bg, color: statusCfg.color }}>
                          {orderStatusLabel(order.status)}
                        </Badge>
                        {currentStep > 0 && (
                          <div className="hint">Bước {currentStep}/8</div>
                        )}
                      </td>

                      <td style={{ fontSize: 12.5 }}>
                        {order.etaDate ? fmtDate(order.etaDate) : <span className="text-faint">—</span>}
                      </td>

                      <td className="num" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                        {new Intl.NumberFormat('vi-VN').format(Number(order.totalVnd || 0))} ₫
                      </td>

                      <td className="num">
                        {(() => {
                          const total = order.status === 'CANCELLED' ? 0 : Number(order.totalVnd || 0);
                          const remaining = Math.max(0, total - Number(order.paidAmount || 0));
                          const overdue =
                            remaining > 0 && order.dueDate &&
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

                      {/* Thao tác không kéo theo việc mở dòng */}
                      <td onClick={(e) => e.stopPropagation()} style={{ width: 52 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <ActionMenu
                            title={order.orderCode}
                            items={[
                              {
                                key: 'quote',
                                label: 'Xuất báo giá gửi khách',
                                icon: <FileDown size={15} />,
                                onClick: () => setSelectedOrderForQuote(order),
                              },
                              ...(canManage && order.status !== 'COMPLETED' && order.status !== 'CANCELLED'
                                ? [{
                                    key: 'progress',
                                    label: 'Cập nhật tiến trình',
                                    icon: <RefreshCw size={15} />,
                                    onClick: () => {
                                      setSelectedOrder(order);
                                      setStatusModalOpen(true);
                                    },
                                  }]
                                : []),
                              ...(canManage && order.status !== 'CANCELLED' &&
                                Number(order.totalVnd || 0) > Number(order.paidAmount || 0)
                                ? [{
                                    key: 'pay',
                                    label: 'Trả tiền nhà cung cấp',
                                    icon: <Wallet size={15} />,
                                    onClick: () => setPayOrder(order),
                                  }]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--surface-sunken)', padding: '4px 18px 18px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Tiến trình 8 bước — gói gọn trên một dòng, nối bằng đường ray */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
                        background: 'var(--surface-sunken)',
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: '1px solid var(--border-base)',
                      }}
                    >
                      {stages.map((stage, idx) => {
                        const isDone = currentStep > stage.step;
                        const isCurrent = currentStep === stage.step;
                        const reached = isDone || isCurrent;

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
                            {/* Đường ray nối từ bước trước sang bước này */}
                            {idx > 0 && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 9,
                                  right: '50%',
                                  width: '100%',
                                  height: 2,
                                  background: reached ? '#16a34a' : 'var(--border-base)',
                                }}
                              />
                            )}

                            <span
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 10.5,
                                fontWeight: 800,
                                background: isDone ? '#16a34a' : isCurrent ? '#7c3aed' : 'var(--surface-card)',
                                color: reached ? '#fff' : 'var(--text-muted)',
                                border: reached ? 'none' : '1px solid var(--border-base)',
                              }}
                            >
                              {isDone ? '✓' : stage.step}
                            </span>

                            <span
                              title={stage.label}
                              style={{
                                maxWidth: '100%',
                                fontSize: 10.5,
                                fontWeight: isCurrent ? 700 : 500,
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

                    {/* Content 2 columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                      {/* Left: Items */}
                      <div
                        style={{
                          border: '1px solid var(--border-base)',
                          borderRadius: 8,
                          padding: 12,
                          background: 'var(--surface-card)',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                          Linh kiện đặt hàng ({order.items?.length || 0})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {order.items?.map((it: any) => (
                            <div
                              key={it.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: 6,
                                background: 'var(--surface-sunken)',
                                fontSize: 12.5,
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                                  {it.item?.name || 'Linh kiện'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  Mã: {it.item?.itemCode} • Đơn giá: €{Number(it.unitPriceEur).toLocaleString('vi-VN')}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                                  x{it.quantity} {it.item?.unit || 'cái'}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 600 }}>
                                  {new Intl.NumberFormat('vi-VN').format(Number(it.finalPriceVnd || 0))} ₫
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Pricing & Logistics */}
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
                        {/* Pricing details */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                            Chi tiết tính giá đơn hàng
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Tiền hàng ({new Intl.NumberFormat('vi-VN').format(order.exchangeRate)} ₫/EUR):</span>
                              <span>{new Intl.NumberFormat('vi-VN').format(Number(order.subtotalVnd))} ₫</span>
                            </div>
                            {Number(order.discountVnd) > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                                <span>
                                  Chiết khấu số lượng
                                  {Number(order.discountRate) > 0 && (
                                    <> ({+(Number(order.discountRate) * 100).toFixed(2)}%)</>
                                  )}
                                  :
                                </span>
                                <span>-{new Intl.NumberFormat('vi-VN').format(Number(order.discountVnd))} ₫</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                              <span>Cước vận chuyển:</span>
                              <span>+{new Intl.NumberFormat('vi-VN').format(Number(order.shippingFee))} ₫</span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                paddingTop: 6,
                                marginTop: 4,
                                borderTop: '1px dashed var(--border-base)',
                                fontSize: 14,
                                fontWeight: 800,
                                color: '#7c3aed',
                              }}
                            >
                              <span>Tổng thanh toán:</span>
                              <span>{new Intl.NumberFormat('vi-VN').format(Number(order.totalVnd))} ₫</span>
                            </div>
                          </div>
                        </div>

                        {/* Logistics tracking info */}
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
                            <span style={{ fontWeight: 600 }}>
                              {order.etaDate
                                ? new Date(order.etaDate).toLocaleDateString('vi-VN', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })
                                : 'Chưa xác định'}
                            </span>
                          </div>
                          {order.notes && (
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                              Ghi chú: {order.notes}
                            </div>
                          )}
                          {order.stockedAt && (
                            <div
                              style={{
                                marginTop: 4,
                                padding: '4px 8px',
                                borderRadius: 4,
                                background: '#f0fdf4',
                                color: '#15803d',
                                fontWeight: 600,
                                fontSize: 11,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <CheckCircle2 size={13} /> Đã nhập kho {order.targetWarehouse?.name} ngày{' '}
                              {new Date(order.stockedAt).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lịch sử chi tiền cho phiếu này — chỗ duy nhất in lại được
                        phiếu chi cũ, vì hệ thống chưa có sổ phiếu chi riêng */}
                    {(order.supplierPayments || []).length > 0 && (
                      <div
                        style={{
                          border: '1px solid var(--border-base)',
                          borderRadius: 8,
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
                          }}
                        >
                          Đã chi cho nhà cung cấp ({order.supplierPayments.length})
                        </div>

                        {order.supplierPayments.map((pay: any) => (
                          <div
                            key={pay.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              flexWrap: 'wrap',
                              padding: '8px 12px',
                              borderBottom: '1px solid var(--border-subtle)',
                              fontSize: 12.5,
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{pay.paymentCode}</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {new Date(pay.paidAt).toLocaleDateString('vi-VN')}
                                {' · '}
                                {PAYMENT_METHODS[pay.method]?.label || pay.method}
                                {pay.reference ? ` · ${pay.reference}` : ''}
                              </span>
                            </span>

                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <strong style={{ color: '#dc2626', whiteSpace: 'nowrap' }}>
                                -{new Intl.NumberFormat('vi-VN').format(Number(pay.amount))} ₫
                              </strong>
                              <button
                                type="button"
                                onClick={() => setPrintVoucher({ payment: pay, supplier: order.supplier })}
                                style={{
                                  padding: '4px 7px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--brand)',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                                title="In lại phiếu chi"
                              >
                                <Printer size={13} />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
                </tbody>
              </table>

              <Pagination {...ordersPage} unit="phiếu đặt hàng" />
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: QUẢN LÝ KHO & XE LƯU ĐỘNG ── */}
      {activeTab === 'warehouses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setEditingWarehouse(null);
                  setWarehouseModalOpen(true);
                }}
              >
                <Plus size={15} style={{ marginRight: 6 }} /> Thêm Kho phụ tùng
              </Button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            {warehouses.map((w) => {
              const typeCfg = WAREHOUSE_TYPES[w.type] || { label: w.type, color: '#64748b', bg: '#f1f5f9' };
              const totalItemsInWh = w.stocks?.reduce((sum: number, s: any) => sum + s.quantity, 0) || 0;

              return (
                <Card key={w.id} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 'var(--radius-md)',
                          background: typeCfg.bg,
                          color: typeCfg.color,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Building size={20} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
                            {w.name}
                          </h3>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: typeCfg.bg,
                              color: typeCfg.color,
                            }}
                          >
                            {w.code}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {typeCfg.label}
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingWarehouse(w);
                          setWarehouseModalOpen(true);
                        }}
                        style={{ padding: '4px 6px', height: 'auto' }}
                      >
                        <Edit2 size={14} />
                      </Button>
                    )}
                  </div>

                  {w.address && (
                    <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                      📍 {w.address}
                    </div>
                  )}

                  {w.manager && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                      👤 Phụ trách: <strong style={{ color: 'var(--text-strong)' }}>{w.manager.fullName}</strong>{' '}
                      {w.manager.phone && `(${w.manager.phone})`}
                    </div>
                  )}

                  {/* Thống kê trong kho */}
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-base)',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ background: 'var(--surface-sunken)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Mã linh kiện</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>
                        {w.stocks?.length || 0}
                      </div>
                    </div>

                    <div style={{ background: 'var(--surface-sunken)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Tổng số lượng tồn</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>
                        {totalItemsInWh}
                      </div>
                    </div>
                  </div>

                  {/* Máy móc đang lưu trong kho */}
                  {w.equipments?.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-base)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        Máy F&B đang lưu tại kho ({w.equipments.length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {w.equipments.map((eq: any) => (
                          <Link
                            key={eq.id}
                            href={`/equipment/${eq.id}`}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11.5,
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Utensils size={11} /> {eq.machineCode}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: LỊCH SỬ XUẤT / NHẬP / ĐIỀU CHUYỂN ── */}
      {activeTab === 'report' && <InventoryReportPanel />}

      {activeTab === 'transactions' && (
        <StockHistoryPanel
          warehouses={warehouses}
          canApprove={canManage}
          onOpenStockCount={() => setStockCountOpen(true)}
        />
      )}

      {/* ── MODALS ── */}
      {partModalOpen && (
        <SparePartModal
          open={partModalOpen}
          part={editingPart}
          pricingConfig={pricingConfig}
          onClose={() => setPartModalOpen(false)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {calcModalOpen && pricingTargetPart && (
        <ItemPriceCalculatorModal
          open={calcModalOpen}
          onClose={() => {
            setCalcModalOpen(false);
            setPricingTargetPart(null);
          }}
          itemName={pricingTargetPart.name}
          itemCode={pricingTargetPart.itemCode}
          category={pricingTargetPart.category}
          priceEur={pricingTargetPart.priceEur}
          costPrice={pricingTargetPart.costPrice}
          currentSellingPrice={pricingTargetPart.sellingPrice}
          pricingConfig={pricingConfig}
          initialShippingFee={parseFeesFromDescription(pricingTargetPart.description).shippingFee}
          initialOtherFee={parseFeesFromDescription(pricingTargetPart.description).otherFee}
          onSaveDirectly={async (price, shippingFee, otherFee) => {
            const parsed = parseFeesFromDescription(pricingTargetPart.description);
            let finalDesc = parsed.cleanDesc || '';
            const defShip = Number(pricingConfig?.defaultShippingFee ?? 3500000);
            const defCustoms = Number(pricingConfig?.defaultCustomsFee ?? 1000000);
            if (shippingFee !== defShip || otherFee !== defCustoms) {
              finalDesc = finalDesc
                ? `${finalDesc}\n<!--fees:${JSON.stringify({ shippingFee, otherFee })}-->`
                : `<!--fees:${JSON.stringify({ shippingFee, otherFee })}-->`;
            }
            const payload: any = {
              itemCode: pricingTargetPart.itemCode,
              name: pricingTargetPart.name,
              category: pricingTargetPart.category,
              supplyType: pricingTargetPart.supplyType,
              unit: pricingTargetPart.unit,
              compatibleWith: pricingTargetPart.compatibleWith || '',
              minStockAlert: pricingTargetPart.minStockAlert,
              costPrice: pricingTargetPart.costPrice ? Number(pricingTargetPart.costPrice) : undefined,
              sellingPrice: price,
              priceEur: pricingTargetPart.priceEur ? Number(pricingTargetPart.priceEur) : undefined,
              priceUsd: pricingTargetPart.priceUsd ? Number(pricingTargetPart.priceUsd) : undefined,
              lifespan: pricingTargetPart.lifespan || '',
              leadTimeDays: pricingTargetPart.leadTimeDays,
              manufacturer: pricingTargetPart.manufacturer || '',
              fnbCategory: pricingTargetPart.fnbCategory || 'OTHER',
              description: finalDesc,
              status: pricingTargetPart.status || 'ACTIVE',
            };
            const res = await saveSparePartAction(pricingTargetPart.id, payload);
            if (res.ok) {
              startTransition(() => router.refresh());
              return true;
            }
            throw new Error(res.message || 'Lỗi khi lưu giá');
          }}
        />
      )}

      {transModalOpen && (
        <StockTransactionModal
          open={transModalOpen}
          defaultType={transDefaultType}
          lockType
          warehouses={warehouses}
          spareParts={spareParts}
          initialItemId={transInitialItemId}
          pendingOrders={orders.filter(
            (o: any) =>
              !o.stockedAt && ['ARRIVED_WAREHOUSE', 'INSPECTING'].includes(o.status),
          )}
          onClose={() => setTransModalOpen(false)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {docChooserOpen && (
        <StockDocumentChooser
          open={docChooserOpen}
          onClose={() => setDocChooserOpen(false)}
          extraChoices={[
            {
              key: 'catalog',
              label: 'Thêm vào danh mục',
              desc: 'Khai mã phụ tùng hoặc máy nguyên chiếc mới, tồn kho bắt đầu từ 0',
              color: '#2563eb',
              bg: '#eff6ff',
              icon: Plus,
              onPick: () => {
                setDocChooserOpen(false);
                setEditingPart(null);
                setPartModalOpen(true);
              },
            },
            {
              key: 'po',
              label: 'Mua hàng',
              desc: 'Đặt hàng nhà cung cấp, tự tính chiết khấu số lượng và cước nhập',
              color: '#7c3aed',
              bg: '#f5f3ff',
              icon: Plane,
              onPick: () => {
                setDocChooserOpen(false);
                setActiveTab('orders');
                setOrderModalOpen(true);
              },
            },
            {
              key: 'machine',
              label: 'Thêm máy tại khách',
              desc: 'Khai hồ sơ máy đã lắp sẵn ở khách mà chưa qua kho',
              color: '#0f766e',
              bg: '#f0fdfa',
              icon: Utensils,
              onPick: () => {
                setDocChooserOpen(false);
                setActiveTab('machines');
                setOpenMachineModal(true);
              },
            },
          ]}
          onPick={(kind) => {
            setDocChooserOpen(false);
            if (kind === 'COUNT') setStockCountOpen(true);
            else openQuickTrans(kind);
          }}
        />
      )}

      {printVoucher && (
        <PaymentVoucherModal
          open={Boolean(printVoucher)}
          onClose={() => setPrintVoucher(null)}
          direction="OUT"
          payment={printVoucher.payment}
          partnerName={printVoucher.supplier}
          company={companyInfo}
        />
      )}

      {payOrder && (
        <SupplierPaymentModal
          companyInfo={companyInfo}
          open={Boolean(payOrder)}
          order={payOrder}
          onClose={() => setPayOrder(null)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {stockCountOpen && (
        <StockCountModal
          open={stockCountOpen}
          warehouses={warehouses}
          spareParts={spareParts}
          onClose={() => setStockCountOpen(false)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {warehouseModalOpen && (
        <WarehouseModal
          open={warehouseModalOpen}
          warehouse={editingWarehouse}
          onClose={() => setWarehouseModalOpen(false)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {orderModalOpen && (
        <SparePartOrderModal
          open={orderModalOpen}
          onClose={() => setOrderModalOpen(false)}
          spareParts={spareParts}
          warehouses={warehouses}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          customers={customers}
          equipments={equipments}
          onSuccess={() => startTransition(() => router.refresh())}
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

      {pricingModalOpen && (
        <SparePartPricingModal
          open={pricingModalOpen}
          initialConfig={pricingConfig}
          onClose={() => setPricingModalOpen(false)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {selectedTxForReport && (
        <InventoryTransactionReportModal
          open={Boolean(selectedTxForReport)}
          transaction={selectedTxForReport}
          companyInfo={companyInfo}
          onClose={() => setSelectedTxForReport(null)}
        />
      )}

      {selectedOrderForQuote && (
        <SparePartQuotationModal
          open={Boolean(selectedOrderForQuote)}
          order={selectedOrderForQuote}
          companyInfo={companyInfo}
          pricingConfig={pricingConfig}
          onClose={() => setSelectedOrderForQuote(null)}
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
