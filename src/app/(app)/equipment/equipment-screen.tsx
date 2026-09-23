'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  EmptyState,
  SearchableSelect,
  usePaged,
  Pagination,
  ActionMenu,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { StockDocumentChooser } from '@/components/domain/stock-document-chooser';
import { StockTransactionModal } from '@/components/domain/spare-parts-modals';
import {
  EQUIPMENT_CATEGORIES,
  OWNERSHIP_TYPES,
  EQUIPMENT_STATUSES,
} from '@/server/modules/equipment/types';
import {
  EquipmentModal,
  EquipmentPrintStickerModal,
  EquipmentHandoverModal,
} from '@/components/domain/equipment-modals';
import { deleteEquipmentAction } from '@/server/modules/equipment/actions';
import { fmtDate } from '@/lib/date';
import {
  Plus,
  Search,
  Printer,
  FileText,
  Edit,
  Trash2,
  ExternalLink,
  Building2,
  MapPin,
  Utensils,
  Flame,
  Snowflake,
  Coffee,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  PackageCheck,
  Building,
  LayoutGrid,
  List,
  IceCreamCone,
  Cookie,
  FilePlus2,
  Calculator,
} from 'lucide-react';
import { ItemPriceCalculatorModal } from '@/components/domain/item-price-calculator-modal';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

interface EquipmentScreenProps {
  equipmentList: any[];
  /** Thông tin công ty cho tem QR dán máy tại khách. */
  company?: { name?: string; shortName?: string; phone?: string };
  /** Danh mục máy nguyên chiếc trong kho, dùng cho phiếu nhập/xuất/điều chuyển máy. */
  machineCatalog?: any[];
  warehouses?: any[];
  /** Nhúng làm một tab của màn Kho — ẩn tiêu đề trang để không lặp chrome. */
  embedded?: boolean;
  /** Màn cha yêu cầu mở form thêm máy (chọn từ popup Tạo mới). */
  openCreateSignal?: boolean;
  onCreateHandled?: () => void;
  pricingConfig?: any;
  metrics: {
    total: number;
    operating: number;
    breakdown: number;
    underMaintenance: number;
    inStock: number;
  };
  customers: any[];
  filter: {
    search?: string;
    category?: string;
    ownershipType?: string;
    status?: string;
    customerId?: number;
  };
  canManage: boolean;
}

export function EquipmentScreen({
  equipmentList,
  metrics,
  customers,
  filter,
  canManage,
  company,
  machineCatalog = [],
  warehouses = [],
  embedded = false,
  pricingConfig,
  openCreateSignal = false,
  onCreateHandled,
}: EquipmentScreenProps) {
  const router = useRouter();

  const toast = useToast();

  const [search, setSearch] = useState(filter.search || '');
  const [category, setCategory] = useState(filter.category || '');
  const [ownershipType, setOwnershipType] = useState(filter.ownershipType || '');
  const [status, setStatus] = useState(filter.status || '');
  const [customerId, setCustomerId] = useState(filter.customerId ? String(filter.customerId) : '');

  /**
   * Lọc ngay tại client: cả danh sách máy đã nằm sẵn trong props, đẩy filter lên
   * server chỉ tổ nạp lại nguyên trang và mất tab đang mở.
   */
  const filteredList = useMemo(() => {
    const s = search.trim().toLowerCase();
    return equipmentList.filter((item: any) => {
      if (category && item.category !== category) return false;
      if (ownershipType && item.ownershipType !== ownershipType) return false;
      if (status && item.status !== status) return false;
      if (customerId && String(item.customerId ?? '') !== customerId) return false;
      if (!s) return true;
      return [item.name, item.machineCode, item.serialNumber, item.brand, item.model]
        .some((v: any) => String(v || '').toLowerCase().includes(s));
    });
  }, [equipmentList, search, category, ownershipType, status, customerId]);

  /**
   * Tổng giá vốn / giá bán của tập đang lọc.
   * Chỉ cộng máy đã đi qua luồng kho; máy khai tay không có số nên bỏ ra ngoài,
   * và đếm riêng để người xem biết tổng này chưa phủ hết danh sách.
   */
  const machineTotals = filteredList.reduce(
    (acc: { cost: number; price: number; priced: number }, item: any) => {
      if (!item.unitCost && !item.soldPrice) return acc;
      return {
        cost: acc.cost + Number(item.unitCost || 0),
        price: acc.price + Number(item.soldPrice || 0),
        priced: acc.priced + 1,
      };
    },
    { cost: 0, price: 0, priced: 0 },
  );

  // Danh sách máy của toàn bộ khách hàng, cần chặn số thẻ/dòng vẽ ra mỗi lần
  const paged = usePaged(filteredList, 20);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<any | null>(null);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [calcTargetMachine, setCalcTargetMachine] = useState<any | null>(null);
  const [printStickerEquipment, setPrintStickerEquipment] = useState<any | null>(null);
  const [handoverEquipment, setHandoverEquipment] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [docChooserOpen, setDocChooserOpen] = useState(false);
  const [stockDocKind, setStockDocKind] = useState<'IN' | 'OUT' | 'TRANSFER' | null>(null);
  const [needCatalogOpen, setNeedCatalogOpen] = useState(false);

  // Popup "Tạo mới" ở màn cha chọn "Thêm máy tại khách" thì mở thẳng form ở đây
  useEffect(() => {
    if (openCreateSignal) {
      setCreateModalOpen(true);
      onCreateHandled?.();
    }
  }, [openCreateSignal, onCreateHandled]);

  const SETTERS: Record<string, (v: string) => void> = {
    search: setSearch,
    category: setCategory,
    ownershipType: setOwnershipType,
    status: setStatus,
    customerId: setCustomerId,
  };

  /**
   * Đổi filter là việc của client. Vẫn ghi lên URL để copy link hay F5 giữ nguyên
   * bộ lọc, nhưng bằng replaceState nên không kích hoạt điều hướng.
   */
  const handleFilterChange = (updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, val]) => {
      SETTERS[key]?.(val);
      if (val) params.set(key, val);
      else params.delete(key);
    });
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  };

  const [deleteConfirmEquipment, setDeleteConfirmEquipment] = useState<{ id: number; name: string } | null>(null);

  const handleDelete = (id: number, name: string) => {
    setDeleteConfirmEquipment({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmEquipment) return;
    const { id } = deleteConfirmEquipment;
    setDeletingId(id);
    const res = await deleteEquipmentAction(id);
    setDeletingId(null);
    setDeleteConfirmEquipment(null);

    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  const getCategoryMeta = (catKey: string) => {
    switch (catKey) {
      case 'ICE_CREAM_MACHINE':
        return {
          shortLabel: 'Máy làm kem',
          icon: <IceCreamCone style={{ width: 18, height: 18, color: '#e11d48' }} />,
          bg: '#fff1f2',
          border: '#ffe4e6',
          accent: '#e11d48',
        };
      case 'CHOCOLATE_MACHINE':
        return {
          shortLabel: 'Máy làm socola',
          icon: <Cookie style={{ width: 18, height: 18, color: '#b45309' }} />,
          bg: '#fef3c7',
          border: '#fde68a',
          accent: '#b45309',
        };
      case 'KITCHEN_HOT':
        return {
          shortLabel: 'Bếp & Lò nướng',
          icon: <Flame style={{ width: 18, height: 18, color: '#ea580c' }} />,
          bg: '#fff7ed',
          border: '#ffedd5',
          accent: '#ea580c',
        };
      case 'KITCHEN_COLD':
        return {
          shortLabel: 'Thiết bị lạnh',
          icon: <Snowflake style={{ width: 18, height: 18, color: '#0284c7' }} />,
          bg: '#f0f9ff',
          border: '#e0f2fe',
          accent: '#0284c7',
        };
      case 'BEVERAGE_BAR':
        return {
          shortLabel: 'Thiết bị pha chế',
          icon: <Coffee style={{ width: 18, height: 18, color: '#9333ea' }} />,
          bg: '#faf5ff',
          border: '#f3e8ff',
          accent: '#9333ea',
        };
      default:
        return {
          shortLabel: 'Thiết bị khác',
          icon: <Utensils style={{ width: 18, height: 18, color: 'var(--primary)' }} />,
          bg: 'var(--surface-subtle, #f8fafc)',
          border: 'var(--border)',
          accent: 'var(--primary)',
        };
    }
  };

  const getCategoryIcon = (catKey: string) => getCategoryMeta(catKey).icon;
  const getCategoryShortLabel = (catKey: string) => getCategoryMeta(catKey).shortLabel;

  const OWNERSHIP_SHORT_LABELS: Record<string, string> = {
    SOLD: 'Đã bán',
    RENTAL: 'Cho thuê',
    CONSIGNMENT: 'Ký gửi',
  };

  const STATUS_SHORT_LABELS: Record<string, string> = {
    OPERATING: 'Hoạt động',
    BREAKDOWN: 'Báo sự cố',
    UNDER_MAINTENANCE: 'Bảo trì',
    IN_STOCK: 'Lưu kho',
    LIQUIDATED: 'Thanh lý',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Nhúng trong tab thì khoảng cách thưa làm nội dung tụt xa thanh tab
        gap: embedded ? 12 : 20,
        paddingBottom: embedded ? 0 : 40,
      }}
    >
      {/* 1. Header & Actions — nhúng trong tab thì tiêu đề và nút đã nằm ở màn cha */}
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Thiết bị & Máy móc
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-muted)' }}>
              Quản lý máy làm kem, máy socola, thiết bị bếp, điểm lắp đặt và lịch bảo dưỡng
            </p>
          </div>

          {canManage && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                onClick={() => (machineCatalog.length > 0 ? setDocChooserOpen(true) : setNeedCatalogOpen(true))}
                title="Nhập kho, xuất kho hoặc điều chuyển máy nguyên chiếc"
              >
                <FilePlus2 style={{ width: 16, height: 16, marginRight: 6 }} /> Tạo chứng từ
              </Button>
              <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                <Plus style={{ width: 16, height: 16, marginRight: 6 }} /> Thêm thiết bị mới
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Số liệu theo trạng thái kiêm luôn bộ lọc: năm thẻ chỉ để đọc, còn ô
          chọn trạng thái ở dưới lặp lại đúng năm con số đó — gộp làm một */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          { key: '', label: 'Tất cả', count: metrics.total, color: 'var(--primary, #0284c7)' },
          { key: 'OPERATING', label: 'Hoạt động', count: metrics.operating, color: '#16a34a' },
          { key: 'BREAKDOWN', label: 'Báo hỏng', count: metrics.breakdown, color: '#dc2626' },
          { key: 'UNDER_MAINTENANCE', label: 'Bảo dưỡng', count: metrics.underMaintenance, color: '#d97706' },
          { key: 'IN_STOCK', label: 'Trong kho', count: metrics.inStock, color: '#0284c7' },
        ] as const).map((chip) => {
          const active = status === chip.key;
          return (
            <button
              key={chip.key || 'all'}
              type="button"
              onClick={() => {
                setStatus(chip.key);
                handleFilterChange({ status: chip.key });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: active ? chip.color : 'var(--border-base)',
                background: active ? `color-mix(in srgb, ${chip.color} 12%, transparent)` : 'var(--surface-card)',
                color: active ? chip.color : 'var(--text-muted)',
              }}
            >
              {chip.label}
              <span style={{ fontWeight: 700, color: chip.count > 0 ? chip.color : 'var(--text-faint)' }}>
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Filter Bar — bỏ khung thẻ, xếp một hàng cho gọn */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.6fr) repeat(3, minmax(150px, 1fr))', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Input
              placeholder="Tìm theo tên máy, mã, S/N, hãng..."
              value={search}
              onChange={(e) => handleFilterChange({ search: e.target.value })}
            />
          </div>

          <SearchableSelect
            value={category}
            onChange={(val) => {
              setCategory(val);
              handleFilterChange({ category: val });
            }}
            options={[
              { value: '', label: '-- Tất cả phân loại --' },
              ...Object.entries(EQUIPMENT_CATEGORIES).map(([catKey, catVal]) => ({
                value: catKey,
                label: getCategoryShortLabel(catKey),
                subLabel: catVal.label,
                icon: getCategoryIcon(catKey),
              })),
            ]}
            placeholder="-- Tất cả phân loại --"
            searchPlaceholder="Tìm phân loại..."
          />

          <SearchableSelect
            value={ownershipType}
            onChange={(val) => {
              setOwnershipType(val);
              handleFilterChange({ ownershipType: val });
            }}
            options={[
              { value: '', label: '-- Tất cả hình thức --' },
              ...Object.entries(OWNERSHIP_TYPES).map(([ownKey, ownVal]) => ({
                value: ownKey,
                label: ownVal.label,
              })),
            ]}
            placeholder="-- Tất cả hình thức --"
            searchPlaceholder="Tìm hình thức..."
          />

          <SearchableSelect
            value={customerId}
            onChange={(val) => {
              setCustomerId(val);
              handleFilterChange({ customerId: val });
            }}
            options={[
              { value: '', label: '-- Tất cả khách hàng --' },
              ...customers.map((c) => ({
                value: String(c.id),
                label: c.name,
                subLabel: c.code,
              })),
            ]}
            placeholder="-- Tất cả khách hàng --"
            searchPlaceholder="Tìm tên hoặc mã khách hàng..."
            allowClear
          />
        </div>
      </div>

      {/* 4. Equipment List / Table */}
      {/* Subheader: Count & View Mode Toggle (Card vs List) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
          Hiển thị <strong style={{ color: 'var(--text)' }}>{filteredList.length}</strong> thiết bị & máy móc
        </div>

        <div style={{ display: 'inline-flex', padding: 3, background: 'var(--surface-subtle, #f1f5f9)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 12.5,
              fontWeight: viewMode === 'card' ? 600 : 500,
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'card' ? 'var(--surface, #ffffff)' : 'transparent',
              color: viewMode === 'card' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: viewMode === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid style={{ width: 14, height: 14 }} />
            <span>Dạng thẻ (Card)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 12.5,
              fontWeight: viewMode === 'list' ? 600 : 500,
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'list' ? 'var(--surface, #ffffff)' : 'transparent',
              color: viewMode === 'list' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <List style={{ width: 14, height: 14 }} />
            <span>Dạng bảng (List)</span>
          </button>
        </div>
      </div>

      {filteredList.length === 0 ? (
        <Card style={{ padding: 40 }}>
          <EmptyState
            icon={<Utensils style={{ width: 40, height: 40 }} />}
            title="Chưa có thiết bị nào"
            description="Bấm 'Thêm thiết bị mới' để tạo hồ sơ máy làm kem, máy socola hoặc thiết bị bếp"
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                  <Plus style={{ width: 14, height: 14, marginRight: 6 }} /> Thêm thiết bị mới
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : viewMode === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {paged.pageRows.map((item: any) => {
            const ownInfo = OWNERSHIP_TYPES[item.ownershipType] || { label: item.ownershipType, badgeTone: 'neutral' };
            const statusInfo = EQUIPMENT_STATUSES[item.status] || { label: item.status, badgeTone: 'neutral' };
            const specs = item.specs || {};

            return (
              <Card key={item.id} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Header: Icon + Name + Code */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'var(--surface-subtle, #f8fafc)',
                      border: '1px solid var(--border)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getCategoryIcon(item.category)}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>
                        {item.machineCode}
                      </span>
                      <Badge tone={statusInfo.badgeTone}>{statusInfo.label}</Badge>
                    </div>

                    <Link
                      href={`/equipment/${item.id}`}
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--text)',
                        textDecoration: 'none',
                        display: 'block',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </Link>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      S/N: <strong style={{ fontFamily: 'monospace' }}>{item.serialNumber}</strong>
                      {item.brand && ` • ${item.brand}`} {item.model && `(${item.model})`}
                    </div>
                  </div>
                </div>

                {/* Key Specs Preview Pill */}
                <div
                  style={{
                    background: 'var(--surface-subtle, #f8fafc)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '4px 10px',
                    lineHeight: 1.4,
                  }}
                >
                  {item.category === 'ICE_CREAM_MACHINE' && (
                    <>
                      {specs.iceCream?.flavorCount && (
                        <div style={{ color: 'var(--text-strong)' }}>
                          🍦 <strong>{specs.iceCream.flavorCount}</strong>
                        </div>
                      )}
                      {specs.iceCream?.capacityPerHour && (
                        <div style={{ color: 'var(--text-strong)' }}>
                          ⚡ <strong>{specs.iceCream.capacityPerHour}</strong>
                        </div>
                      )}
                      {specs.iceCream?.preCooling && (
                        <div style={{ color: '#059669', fontSize: 11.5 }}>
                          ✓ Làm lạnh qua đêm
                        </div>
                      )}
                      {specs.iceCream?.airPump && (
                        <div style={{ color: '#059669', fontSize: 11.5 }}>
                          ✓ Bơm tăng xốp
                        </div>
                      )}
                    </>
                  )}

                  {item.category === 'CHOCOLATE_MACHINE' && (
                    <>
                      {specs.chocolate?.tankCapacityKg && (
                        <div style={{ color: 'var(--text-strong)' }}>
                          🍫 Bồn: <strong>{specs.chocolate.tankCapacityKg}</strong>
                        </div>
                      )}
                      {specs.chocolate?.outputPerHourKg && (
                        <div style={{ color: 'var(--text-strong)' }}>
                          ⚡ <strong>{specs.chocolate.outputPerHourKg}</strong>
                        </div>
                      )}
                      {specs.chocolate?.hasFootPedal && (
                        <div style={{ color: '#059669', fontSize: 11.5, gridColumn: '1 / -1' }}>
                          ✓ Bàn đạp ngắt rót
                        </div>
                      )}
                    </>
                  )}

                  {item.category !== 'ICE_CREAM_MACHINE' && item.category !== 'CHOCOLATE_MACHINE' && (
                    <>
                      {specs.kitchen?.equipmentType && (
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            fontWeight: 600,
                            color: 'var(--text-strong)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={specs.kitchen.equipmentType}
                        >
                          {specs.kitchen.equipmentType}
                        </div>
                      )}
                      {specs.kitchen?.powerKw && (
                        <div style={{ color: 'var(--text-strong)' }}>
                          ⚡ <strong>{specs.kitchen.powerKw}</strong>
                        </div>
                      )}
                      {specs.dimensions && (
                        <div
                          style={{
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={specs.dimensions}
                        >
                          📐 {specs.dimensions}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Customer & Location */}
                <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                    <Building2 style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                    <span style={{ fontWeight: 600 }}>{item.customer?.name || 'Chưa gán khách hàng (Lưu kho)'}</span>
                  </div>

                  {item.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                      <MapPin style={{ width: 14, height: 14, color: '#10b981' }} />
                      <span>{item.location.name}</span>
                    </div>
                  )}
                </div>

                {/* Footer: Ownership & Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border)',
                    paddingTop: 10,
                    marginTop: 'auto',
                  }}
                >
                  <Badge tone={ownInfo.badgeTone}>{ownInfo.label}</Badge>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Link
                      href={`/equipment/${item.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 8px',
                        borderRadius: 6,
                        color: 'var(--text-muted)',
                        textDecoration: 'none',
                      }}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Xem chi tiết"
                    >
                      <ExternalLink style={{ width: 14, height: 14 }} />
                    </Link>

                    <ActionMenu
                      title={item.machineCode || item.serialNumber || item.name}
                      items={[
                        {
                          key: 'detail',
                          label: 'Xem chi tiết thiết bị',
                          icon: <ExternalLink size={15} style={{ color: 'var(--text-muted)' }} />,
                          onClick: () => router.push(`/equipment/${item.id}`),
                        },
                        ...(canManage
                          ? [
                              {
                                key: 'edit',
                                label: 'Chỉnh sửa thiết bị',
                                icon: <Edit size={15} style={{ color: '#059669' }} />,
                                onClick: () => setEditingEquipment(item),
                              },
                              {
                                key: 'pricing',
                                label: 'Tính giá bán & cước phí',
                                icon: <Calculator size={15} style={{ color: '#7c3aed' }} />,
                                onClick: () => {
                                  setCalcTargetMachine(item);
                                  setCalcModalOpen(true);
                                },
                              },
                            ]
                          : []),
                        {
                          key: 'handover',
                          label: 'In phiếu bàn giao',
                          icon: <FileText size={15} style={{ color: '#2563eb' }} />,
                          onClick: () => setHandoverEquipment(item),
                        },
                        {
                          key: 'sticker',
                          label: 'In tem QR dán máy',
                          icon: <Printer size={15} style={{ color: '#4f46e5' }} />,
                          onClick: () => setPrintStickerEquipment(item),
                        },
                        ...(canManage
                          ? [
                              {
                                key: 'delete',
                                label: 'Xóa thiết bị',
                                icon: <Trash2 size={15} />,
                                danger: true,
                                onClick: () => handleDelete(item.id, item.name),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              </Card>
            );
          })}

          <div style={{ gridColumn: '1 / -1' }}>
            <Card style={{ padding: 0 }}>
              <Pagination {...paged} unit="máy" style={{ borderTop: 'none' }} />
            </Card>
          </div>
        </div>
      ) : (
        /* List / Table View */
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--surface, #ffffff)',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--surface-subtle, #f8fafc)',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: 11.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                <th style={{ padding: '14px 10px', width: '50px', minWidth: '50px', textAlign: 'center' }}>STT</th>
                <th style={{ padding: '14px 16px', width: '145px', minWidth: '135px', textAlign: 'left' }}>Mã thiết bị</th>
                <th style={{ padding: '14px 16px', width: '24%', minWidth: '220px' }}>Tên thiết bị</th>
                <th style={{ padding: '14px 16px', width: '15%', minWidth: '150px' }}>Phân loại</th>
                <th style={{ padding: '14px 16px', width: '19%', minWidth: '190px' }}>Khách hàng / Điểm đặt</th>
                <th style={{ padding: '14px 12px', width: '95px', minWidth: '95px', whiteSpace: 'nowrap' }}>Hình thức</th>
                <th style={{ padding: '14px 12px', width: '115px', minWidth: '115px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                <th style={{ padding: '14px 12px', width: '130px', minWidth: '130px', whiteSpace: 'nowrap' }}>Bảo hành / Bảo dưỡng</th>
                {canManage && (
                  <th style={{ padding: '14px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    Giá vốn / Giá bán
                  </th>
                )}
                <th style={{ padding: '14px 18px', width: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((item: any, idx: number) => {
                const ownInfo = OWNERSHIP_TYPES[item.ownershipType] || { label: item.ownershipType, badgeTone: 'neutral' };
                const statusInfo = EQUIPMENT_STATUSES[item.status] || { label: item.status, badgeTone: 'neutral' };
                const catMeta = getCategoryMeta(item.category);
                const ownLabel = OWNERSHIP_SHORT_LABELS[item.ownershipType] || ownInfo.label;
                const statusLabel = STATUS_SHORT_LABELS[item.status] || statusInfo.label;
                const isWarrantyExpired = item.warrantyExpiresAt && new Date(item.warrantyExpiresAt) < new Date();

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx === paged.pageRows.length - 1 ? 'none' : '1px solid var(--border)',
                      transition: 'background-color 0.15s ease',
                    }}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    {/* 1. STT */}
                    <td style={{ padding: '16px 10px', verticalAlign: 'top', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, lineHeight: 1.45 }}>
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </td>

                    {/* 2. Mã thiết bị & S/N */}
                    <td style={{ padding: '16px 16px', verticalAlign: 'top', textAlign: 'left' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                        <Link
                          href={`/equipment/${item.id}`}
                          style={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            fontSize: 13,
                            color: 'var(--primary)',
                            textDecoration: 'none',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.45,
                            display: 'block',
                          }}
                          className="hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Xem chi tiết thiết bị"
                        >
                          {/* Có nhãn "Code:" cho cân với dòng "S/N:" ngay dưới,
                              và để phân biệt rõ mã nội bộ với serial của hãng */}
                          <span style={{ fontFamily: 'inherit', fontWeight: 500, color: 'var(--text-muted)' }}>Code: </span>
                          {item.machineCode}
                        </Link>
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'left', lineHeight: 1.4 }}>
                          S/N: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{item.serialNumber}</span>
                        </div>
                      </div>
                    </td>

                    {/* 3. Tên thiết bị & Hãng/Model */}
                    <td style={{ padding: '16px 16px', verticalAlign: 'top' }}>
                      <div>
                        <Link
                          href={`/equipment/${item.id}`}
                          style={{
                            fontWeight: 600,
                            fontSize: 13.5,
                            color: 'var(--text)',
                            textDecoration: 'none',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.45,
                          }}
                          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          {item.name}
                        </Link>

                        {/* Hãng và model để ở thẻ và trang chi tiết; ở lưới chúng làm
                            dòng cao gấp đôi và xuống hàng lộn xộn. Vẫn tìm kiếm được. */}
                      </div>
                    </td>

                    {/* 4. Phân loại */}
                    <td style={{ padding: '16px 16px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: catMeta.bg,
                            border: `1px solid ${catMeta.border}`,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          {catMeta.icon}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                          {catMeta.shortLabel}
                        </div>
                      </div>
                    </td>

                    {/* 5. Khách hàng / Điểm lắp đặt */}
                    <td style={{ padding: '16px 16px', verticalAlign: 'top' }}>
                      {item.customer ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                            {item.customer.name}
                          </div>
                          {item.location && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 11.5,
                                color: 'var(--text-muted)',
                                marginTop: 4,
                              }}
                            >
                              <MapPin style={{ width: 12, height: 12, color: '#10b981', flexShrink: 0 }} />
                              <span
                                style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: 200,
                                }}
                                title={item.location.name}
                              >
                                {item.location.name}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--surface-subtle, #f1f5f9)',
                            color: 'var(--text-muted)',
                            fontSize: 11.5,
                            fontWeight: 500,
                            border: '1px dashed var(--border)',
                          }}
                        >
                          <PackageCheck style={{ width: 12, height: 12 }} />
                          Lưu kho nội bộ
                        </span>
                      )}
                    </td>

                    {/* 6. Hình thức */}
                    <td style={{ padding: '16px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <Badge tone={ownInfo.badgeTone}>{ownLabel}</Badge>
                    </td>

                    {/* 7. Trạng thái */}
                    <td style={{ padding: '16px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <Badge tone={statusInfo.badgeTone} dot>{statusLabel}</Badge>
                    </td>

                    {/* 8. Bảo hành / Bảo dưỡng — xếp dọc: hai mốc ngày khác nhau về ý nghĩa,
                        để chung một dòng dễ đọc nhầm mốc này thành mốc kia */}
                    <td style={{ padding: '16px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      {item.warrantyExpiresAt ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11.5,
                            color: isWarrantyExpired ? '#ef4444' : 'var(--text)',
                            fontWeight: isWarrantyExpired ? 600 : 400,
                            lineHeight: 1.45,
                          }}
                        >
                          {isWarrantyExpired && (
                            <AlertTriangle style={{ width: 12, height: 12, color: '#ef4444' }} />
                          )}
                          <span>BH: <strong>{fmtDate(item.warrantyExpiresAt)}</strong></span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11.5, lineHeight: 1.45 }}>BH: —</span>
                      )}

                      {item.nextPmDate && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                            color: 'var(--primary)',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          <Wrench style={{ width: 10, height: 10 }} />
                          <span>BD: {fmtDate(item.nextPmDate)}</span>
                        </div>
                      )}
                      </div>
                    </td>

                    {/* 9. Giá vốn / Giá bán — chỉ người quản lý mới thấy số nội bộ */}
                    {canManage && (
                      <td style={{ padding: '16px 12px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {item.unitCost || item.soldPrice ? (
                          <>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                              Vốn: {item.unitCost ? money(Number(item.unitCost)) : '—'}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                              Bán: {item.soldPrice ? money(Number(item.soldPrice)) : '—'}
                            </div>
                            {item.unitCost && item.soldPrice && (
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color:
                                    Number(item.soldPrice) - Number(item.unitCost) >= 0 ? '#16a34a' : '#dc2626',
                                }}
                              >
                                {money(Number(item.soldPrice) - Number(item.unitCost))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span
                            style={{ fontSize: 11.5, color: 'var(--text-faint)' }}
                            title="Máy khai tay trước khi hệ thống quản lý máy qua kho nên chưa có giá vốn"
                          >
                            Chưa qua kho
                          </span>
                        )}
                      </td>
                    )}

                    {/* 10. Thao tác */}
                    <td style={{ padding: '14px 18px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <Link
                          href={`/equipment/${item.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '5px 7px',
                            borderRadius: 6,
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            transition: 'all 0.15s ease',
                          }}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                          title="Xem chi tiết thiết bị"
                        >
                          <ExternalLink style={{ width: 14, height: 14 }} />
                        </Link>

                        <ActionMenu
                          title={item.machineCode || item.serialNumber || item.name}
                          items={[
                            {
                              key: 'detail',
                              label: 'Xem chi tiết thiết bị',
                              icon: <ExternalLink size={15} style={{ color: 'var(--text-muted)' }} />,
                              onClick: () => router.push(`/equipment/${item.id}`),
                            },
                            ...(canManage
                              ? [
                                  {
                                    key: 'edit',
                                    label: 'Chỉnh sửa thiết bị',
                                    icon: <Edit size={15} style={{ color: '#059669' }} />,
                                    onClick: () => setEditingEquipment(item),
                                  },
                                  {
                                    key: 'pricing',
                                    label: 'Tính giá bán & cước phí',
                                    icon: <Calculator size={15} style={{ color: '#7c3aed' }} />,
                                    onClick: () => {
                                      setCalcTargetMachine(item);
                                      setCalcModalOpen(true);
                                    },
                                  },
                                ]
                              : []),
                            {
                              key: 'handover',
                              label: 'In phiếu bàn giao',
                              icon: <FileText size={15} style={{ color: '#2563eb' }} />,
                              onClick: () => setHandoverEquipment(item),
                            },
                            {
                              key: 'sticker',
                              label: 'In tem QR dán máy',
                              icon: <Printer size={15} style={{ color: '#4f46e5' }} />,
                              onClick: () => setPrintStickerEquipment(item),
                            },
                            ...(canManage
                              ? [
                                  {
                                    key: 'delete',
                                    label: 'Xóa thiết bị',
                                    icon: <Trash2 size={15} />,
                                    danger: true,
                                    onClick: () => handleDelete(item.id, item.name),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Cộng theo tập đang lọc, và chỉ gồm máy đã có giá — nói rõ bao nhiêu
                máy được tính để không ai tưởng đây là tổng của cả danh sách */}
            {canManage && machineTotals.priced > 0 && (
              <tfoot>
                <tr
                  style={{
                    background: 'var(--surface-sunken)',
                    borderTop: '2px solid var(--border-base)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                  }}
                >
                  <td colSpan={7} style={{ padding: '12px 14px', fontSize: 12.5 }}>
                    Tổng {machineTotals.priced}/{filteredList.length} máy có giá vốn
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)' }}>
                      Vốn {money(machineTotals.cost)} · Bán {money(machineTotals.price)}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: machineTotals.price - machineTotals.cost >= 0 ? '#16a34a' : '#dc2626',
                      }}
                    >
                      Lãi {money(machineTotals.price - machineTotals.cost)} ₫
                    </div>
                  </td>
                  <td style={{ padding: '12px 18px' }} />
                </tr>
              </tfoot>
            )}
          </table>

          <Pagination {...paged} unit="máy" />
        </div>
      )}

      {/* Create / Edit Modal */}
      {(createModalOpen || editingEquipment) && (
        <EquipmentModal
          open={createModalOpen || Boolean(editingEquipment)}
          equipment={editingEquipment}
          customers={customers}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingEquipment(null);
          }}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* Chưa khai máy nào vào danh mục kho thì chỉ đường, đừng mở ra một
          danh sách chọn rỗng rồi để người dùng tự đoán */}
      {needCatalogOpen && (
        <Modal
          open={needCatalogOpen}
          onClose={() => setNeedCatalogOpen(false)}
          title="Chưa có máy nào trong danh mục kho"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setNeedCatalogOpen(false)}>
                Đóng
              </Button>
              <Link href="/spare-parts" className="btn btn-primary">
                Mở tab Danh mục
              </Link>
            </>
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)' }}>
            Máy nhập về kho được quản lý cùng chỗ với phụ tùng. Trước khi lập phiếu, hãy khai máy
            vào danh mục:
            <ol style={{ margin: '10px 0 0 18px', padding: 0, color: 'var(--text-muted)' }}>
              <li>Sang tab <strong>Phụ tùng</strong> → bấm <strong>Thêm vào danh mục</strong></li>
              <li>Chọn phân loại <strong>Máy nguyên chiếc</strong>, chọn loại máy F&amp;B</li>
              <li>Quay lại đây để lập phiếu nhập kho cho máy đó</li>
            </ol>
          </div>
        </Modal>
      )}

      {docChooserOpen && (
        <StockDocumentChooser
          open={docChooserOpen}
          onClose={() => setDocChooserOpen(false)}
          kinds={['IN', 'OUT', 'TRANSFER']}
          onPick={(kind) => {
            setDocChooserOpen(false);
            setStockDocKind(kind as 'IN' | 'OUT' | 'TRANSFER');
          }}
        />
      )}

      {stockDocKind && (
        <StockTransactionModal
          open={Boolean(stockDocKind)}
          defaultType={stockDocKind}
          warehouses={warehouses}
          spareParts={machineCatalog}
          onClose={() => setStockDocKind(null)}
          onSuccess={() => {
            setStockDocKind(null);
            router.refresh();
          }}
        />
      )}

      {/* Print Sticker Modal */}
      {printStickerEquipment && (
        <EquipmentPrintStickerModal
          company={company}
          open={Boolean(printStickerEquipment)}
          equipment={printStickerEquipment}
          onClose={() => setPrintStickerEquipment(null)}
        />
      )}

      {/* Equipment Handover & Delivery Note Modal */}
      {handoverEquipment && (
        <EquipmentHandoverModal
          open={Boolean(handoverEquipment)}
          equipment={handoverEquipment}
          onClose={() => setHandoverEquipment(null)}
        />
      )}

      {deleteConfirmEquipment && (
        <ConfirmDialog
          open={Boolean(deleteConfirmEquipment)}
          onClose={() => setDeleteConfirmEquipment(null)}
          onConfirm={confirmDelete}
          title="Xác nhận xóa thiết bị"
          message={`Bạn có chắc chắn muốn xóa thiết bị "${deleteConfirmEquipment.name}"? Hành động này không thể hoàn tác.`}
          confirmText="Xóa vĩnh viễn"
          danger
          loading={deletingId !== null}
        />
      )}

      {calcModalOpen && calcTargetMachine && (
        <ItemPriceCalculatorModal
          open={calcModalOpen}
          onClose={() => {
            setCalcModalOpen(false);
            setCalcTargetMachine(null);
          }}
          itemName={calcTargetMachine.name}
          itemCode={calcTargetMachine.machineCode || calcTargetMachine.serialNumber}
          category="EQUIPMENT"
          costPrice={calcTargetMachine.unitCost ? Number(calcTargetMachine.unitCost) : undefined}
          currentSellingPrice={calcTargetMachine.soldPrice ? Number(calcTargetMachine.soldPrice) : undefined}
          pricingConfig={pricingConfig}
        />
      )}
    </div>
  );
}
