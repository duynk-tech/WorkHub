'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input, PriceInput } from '@/components/ui';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { Plus, Trash2, AlertTriangle, Package, Info } from 'lucide-react';
import {
  calculateQuotedUnitPrice,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import { getEquipmentSpecRows, getEquipmentQuickPills } from '@/lib/equipment-specs';
import { EquipmentSpecGrid } from '@/components/domain/equipment-spec-grid';

/**
 * Bảng chọn hàng dùng chung cho Đơn hàng và Báo giá khách hàng.
 * Một ô tìm kiếm duy nhất gộp máy trong kho, máy đang thuê/ký gửi, linh kiện và mục tự nhập.
 */

export interface LineItem {
  itemType: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Chiết khấu theo dòng — chỉ còn để đọc dữ liệu cũ, báo giá mới dùng chiết khấu trên tổng đơn. */
  discountVnd?: number;
  equipmentId?: number;
  /** Linh kiện trong danh mục kho — căn cứ để xuất kho và đặt hàng nhà cung cấp. */
  inventoryItemId?: number;
  /** Giá lấy từ danh mục hay do hệ thống suy ra từ giá vốn. */
  priceSource?: 'LIST' | 'ESTIMATED' | 'NONE';
  notes?: string;
  /** Giá vốn ngoại tệ EUR (nếu là hàng nhập khẩu Châu Âu) */
  unitPriceEur?: number;
  /** Giá vốn đơn vị quy đổi VNĐ */
  unitCostVnd?: number;
  /** Cước vận chuyển phân bổ cho dòng (VNĐ) */
  shippingFee?: number;
  /** Phí khác / hải quan phân bổ cho dòng (VNĐ) */
  customsFee?: number;
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  EQUIPMENT: 'Thiết bị',
  SPARE_PART: 'Linh kiện / Phụ tùng',
  SERVICE: 'Dịch vụ',
};

export function emptyLineItem(): LineItem {
  return {
    itemType: 'EQUIPMENT',
    name: '',
    quantity: 1,
    unitPrice: 0,
    discountVnd: 0,
    unitPriceEur: 0,
    unitCostVnd: 0,
    shippingFee: 0,
    customsFee: 0,
    notes: '',
  };
}

/** Tiền một dòng sau chiết khấu, không bao giờ âm. */
export function lineTotal(item: LineItem): number {
  const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  return Math.max(0, gross - (Number(item.discountVnd) || 0));
}

export function buildCatalogOptions({
  machines = [],
  stockMachines = [],
  spareParts = [],
  pricingConfig,
  strictSellingPrice = false,
}: {
  machines?: any[];
  stockMachines?: any[];
  spareParts?: any[];
  pricingConfig?: Partial<SparePartPricingConfig>;
  strictSellingPrice?: boolean;
}): SearchableSelectOption[] {
  const opts: SearchableSelectOption[] = [];

  // Chỉ máy còn trong kho: máy đã bán cho khách thì không thể lên đơn lần nữa
  for (const m of stockMachines) {
    const price = Number(m.soldPrice || 0);
    const priceLabel = strictSellingPrice
      ? price > 0
        ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫`
        : '⚠️ Chưa có giá bán'
      : price > 0
        ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫`
        : undefined;

    opts.push({
      value: `EQ:${m.id}`,
      group: 'Máy trong kho',
      label: m.name,
      subLabel: [m.brand, m.machineCode, 'Tồn: 1 máy', priceLabel].filter(Boolean).join(' · '),
      keywords: [m.machineCode, m.brand, m.model, m.serialNumber, priceLabel].filter(Boolean).join(' '),
      itemCode: m.machineCode,
      unit: 'máy',
      stockQty: 1,
      type: 'EQUIPMENT',
      equipment: m,
    });
  }

  // Máy đang cho thuê, cho mượn hoặc ký gửi tại khách → vẫn có thể chốt bán đứt hoặc gia hạn.
  for (const m of machines.filter((x: any) => x.ownershipType && x.ownershipType !== 'SOLD')) {
    const price = Number(m.soldPrice || 0);
    const priceLabel = strictSellingPrice
      ? price > 0
        ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫`
        : '⚠️ Chưa có giá bán'
      : undefined;

    opts.push({
      value: `EQ:${m.id}`,
      group: 'Máy đang thuê / cho mượn / ký gửi tại khách',
      label: m.name,
      subLabel: [m.ownershipType === 'RENTAL' ? 'Cho thuê' : m.ownershipType === 'LOAN' ? 'Cho mượn' : 'Ký gửi', m.machineCode, priceLabel]
        .filter(Boolean)
        .join(' · '),
      keywords: [m.machineCode, m.brand, m.model, m.serialNumber, priceLabel].filter(Boolean).join(' '),
      itemCode: m.machineCode,
      unit: 'máy',
      stockQty: 0,
      type: 'RENTAL',
      equipment: m,
    });
  }

  for (const p of spareParts) {
    let priceLabel = '';
    if (strictSellingPrice) {
      const sellingPrice = Number(p.sellingPrice || 0);
      const autoPrice = Number(p.autoPrice || 0);
      if (sellingPrice > 0) {
        priceLabel = `${new Intl.NumberFormat('vi-VN').format(sellingPrice)} ₫`;
      } else if (autoPrice > 0) {
        priceLabel = `${new Intl.NumberFormat('vi-VN').format(autoPrice)} ₫ (tính sẵn)`;
      } else {
        priceLabel = '⚠️ Chưa có giá bán';
      }
    } else {
      const quoted = calculateQuotedUnitPrice(
        {
          sellingPrice: p.sellingPrice,
          costPrice: p.costPrice,
          priceEur: p.priceEur,
          avgCost: p.avgCost,
          autoPrice: p.autoPrice,
        },
        pricingConfig,
      );
      priceLabel =
        quoted.source === 'LIST'
          ? `${new Intl.NumberFormat('vi-VN').format(quoted.price)} ₫`
          : quoted.source === 'ESTIMATED'
            ? `~${new Intl.NumberFormat('vi-VN').format(quoted.price)} ₫ (tạm tính)`
            : 'chưa có giá';
    }

    const totalStock =
      p.totalStock !== undefined
        ? Number(p.totalStock) || 0
        : Array.isArray(p.stocks)
        ? p.stocks.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0)
        : Number(p.stockQty ?? 0);

    opts.push({
      value: `SP:${p.id}`,
      group: 'Linh kiện / Phụ tùng',
      label: p.name,
      subLabel: [p.itemCode, `Tồn: ${totalStock} ${p.unit || 'cái'}`, priceLabel].filter(Boolean).join(' · '),
      keywords: [p.itemCode, p.brand, p.unit, priceLabel].filter(Boolean).join(' '),
      itemCode: p.itemCode,
      unit: p.unit || 'cái',
      stockQty: totalStock,
      type: 'SPARE_PART',
    });
  }

  opts.push({
    value: 'CUSTOM',
    group: 'Mục khác',
    label: 'Nhập thủ công (dịch vụ hoặc hàng ngoài danh mục)',
    unit: 'lần',
    type: 'CUSTOM',
  });

  return opts;
}

/** Quản lý danh sách dòng hàng + lựa chọn trong danh mục của từng dòng. */
export function useLineItems({
  initialItems,
  machines = [],
  stockMachines = [],
  spareParts = [],
  pricingConfig,
  strictSellingPrice = false,
  useConfiguredFeesWhenCostBreakdownIsZero = false,
  exchangeRate = 27800,
  onWarning,
}: {
  initialItems?: LineItem[];
  machines?: any[];
  stockMachines?: any[];
  spareParts?: any[];
  /** Cấu hình giá để suy ra đơn giá khi linh kiện chưa khai giá bán. */
  pricingConfig?: Partial<SparePartPricingConfig>;
  /** Khi bật: chỉ lấy giá bán niêm yết/tính sẵn trong danh mục, không tính lại động từ giá vốn */
  strictSellingPrice?: boolean;
  /** Use current fee defaults as an estimate in a new quotation when inventory has no fee breakdown. */
  useConfiguredFeesWhenCostBreakdownIsZero?: boolean;
  exchangeRate?: number;
  /** Callback phát cảnh báo khi chọn sản phẩm chưa có giá bán */
  onWarning?: (msg: string) => void;
}) {
  const [items, setItems] = useState<LineItem[]>(
    initialItems?.length ? initialItems : [emptyLineItem()],
  );
  const [catalogRefs, setCatalogRefs] = useState<string[]>(
    initialItems?.length
      ? initialItems.map((i) =>
          i.inventoryItemId ? `SP:${i.inventoryItemId}` : i.equipmentId ? `EQ:${i.equipmentId}` : 'CUSTOM',
        )
      : [''],
  );

  const catalogOptions = useMemo(
    () => buildCatalogOptions({ machines, stockMachines, spareParts, pricingConfig, strictSellingPrice }),
    [machines, stockMachines, spareParts, pricingConfig, strictSellingPrice],
  );

  const addItem = () => {
    setItems([...items, emptyLineItem()]);
    setCatalogRefs([...catalogRefs, '']);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return false;
    setItems(items.filter((_, i) => i !== index));
    setCatalogRefs(catalogRefs.filter((_, i) => i !== index));
    return true;
  };

  const changeItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...items];
    const current = { ...updated[index], [field]: value };
    const rateNum = Number(exchangeRate) || 27800;

    if (field === 'quantity') {
      const prevQty = Math.max(1, Number(items[index].quantity) || 1);
      const qty = Math.max(1, Number(value) || 1);
      current.quantity = qty;
      current.shippingFee = items[index].shippingFee !== undefined
        ? Math.round(items[index].shippingFee / prevQty) * qty
        : undefined;
      current.customsFee = items[index].customsFee !== undefined
        ? Math.round(items[index].customsFee / prevQty) * qty
        : undefined;
    } else if (field === 'unitPriceEur') {
      const eur = Math.max(0, Number(value) || 0);
      current.unitPriceEur = eur;
      current.unitCostVnd = Math.round(eur * rateNum);
    } else if (field === 'unitCostVnd') {
      const costVnd = Math.max(0, Number(value) || 0);
      current.unitCostVnd = costVnd;
      current.unitPriceEur = rateNum > 0 ? Number((costVnd / rateNum).toFixed(2)) : 0;
    }

    updated[index] = current;
    setItems(updated);
  };

  /**
   * Chọn 1 mục từ danh sách gộp — tự suy ra loại hàng, tên và đơn giá.
   */
  const selectCatalog = (index: number, ref: string) => {
    const refs = [...catalogRefs];
    refs[index] = ref;
    setCatalogRefs(refs);

    const updated = [...items];
    const rateNum = Number(exchangeRate) || 27800;
    const currentQty = Math.max(1, Number(updated[index].quantity) || 1);

    if (!ref) {
      updated[index] = {
        ...updated[index],
        name: '',
        equipmentId: undefined,
        inventoryItemId: undefined,
        unitPrice: 0,
        unitPriceEur: 0,
        unitCostVnd: 0,
        shippingFee: 0,
        customsFee: 0,
      };
      setItems(updated);
      return;
    }

    if (ref === 'CUSTOM') {
      updated[index] = {
        ...updated[index],
        itemType: 'SERVICE',
        equipmentId: undefined,
        inventoryItemId: undefined,
      };
      setItems(updated);
      return;
    }

    const [kind, rawId] = ref.split(':');

    if (kind === 'EQ') {
      const m =
        stockMachines.find((x: any) => String(x.id) === rawId) ||
        machines.find((x: any) => String(x.id) === rawId);
      if (m) {
        const price = Number(m.soldPrice || 0);
        const cost = Number(m.costPrice || m.importPrice || 0);
        const eur = rateNum > 0 && cost > 0 ? Number((cost / rateNum).toFixed(2)) : 0;
        updated[index] = {
          ...updated[index],
          itemType: 'EQUIPMENT',
          name: `${m.machineCode ? `[${m.machineCode}] ` : ''}${m.name}${m.brand ? ` (${m.brand})` : ''}`,
          equipmentId: m.id,
          inventoryItemId: undefined,
          unitPrice: price,
          priceSource: price > 0 ? 'LIST' : 'NONE',
          unitPriceEur: eur,
          unitCostVnd: cost,
          shippingFee: 0,
          customsFee: 0,
        };
        if (strictSellingPrice && price <= 0) {
          onWarning?.(`Máy "${m.name}" chưa có giá bán niêm yết. Vui lòng nhập giá bán thủ công!`);
        }
      }
    } else if (kind === 'SP') {
      const p = spareParts.find((x: any) => String(x.id) === rawId);
      if (p) {
        let price = 0;
        let source: 'LIST' | 'ESTIMATED' | 'NONE' = 'NONE';

        if (strictSellingPrice) {
          const sellingPrice = Number(p.sellingPrice || 0);
          const autoPrice = Number(p.autoPrice || 0);
          if (sellingPrice > 0) {
            price = sellingPrice;
            source = 'LIST';
          } else if (autoPrice > 0) {
            price = autoPrice;
            source = 'ESTIMATED';
          } else {
            price = 0;
            source = 'NONE';
            onWarning?.(`Linh kiện "${p.name}" chưa được thiết lập giá bán. Vui lòng nhập đơn giá thủ công!`);
          }
        } else {
          const quoted = calculateQuotedUnitPrice(
            {
              sellingPrice: p.sellingPrice,
              costPrice: p.costPrice,
              priceEur: p.priceEur,
              avgCost: p.avgCost,
              autoPrice: p.autoPrice,
            },
            pricingConfig,
          );
          price = quoted.price;
          source = quoted.source;
        }

        const eur = Number(p.priceEur || 0);
        // Giá vốn và các khoản phí bán phải lấy từ bình quân tồn kho đã vốn hóa,
        // không lấy cước mặc định cấu hình lần nữa (tránh cộng cước hai lần).
        // Nếu kho chưa có đủ breakdown thì để trống đến lúc xuất kho chốt snapshot.
        const hasCostBreakdown =
          p.avgBaseCost != null && p.avgShippingCost != null && p.avgOtherCost != null;
        const costVnd = hasCostBreakdown ? Number(p.avgBaseCost) : undefined;
        const unitEur = eur > 0 ? eur : rateNum > 0 && Number(costVnd) > 0 ? Number((Number(costVnd) / rateNum).toFixed(2)) : 0;
        const hasRecordedFees = hasCostBreakdown && (Number(p.avgShippingCost) > 0 || Number(p.avgOtherCost) > 0);
        const useConfiguredFees = useConfiguredFeesWhenCostBreakdownIsZero && !hasRecordedFees;

        updated[index] = {
          ...updated[index],
          itemType: 'SPARE_PART',
          name: `${p.itemCode ? `[${p.itemCode}] ` : ''}${p.name}`,
          equipmentId: undefined,
          inventoryItemId: p.id,
          unitPrice: price,
          priceSource: source,
          unitPriceEur: unitEur,
          unitCostVnd: costVnd,
          shippingFee: hasRecordedFees
            ? Number(p.avgShippingCost) * currentQty
            : useConfiguredFees
              ? Math.max(0, Number(pricingConfig?.defaultShippingFee ?? 3500000)) * currentQty
              : hasCostBreakdown
                ? 0
                : undefined,
          customsFee: hasRecordedFees
            ? Number(p.avgOtherCost) * currentQty
            : useConfiguredFees
              ? Math.max(0, Number(pricingConfig?.defaultCustomsFee ?? 0)) * currentQty
              : hasCostBreakdown
                ? 0
                : undefined,
        };
      }
    }

    setItems(updated);
  };

  /** Nạp lại toàn bộ dòng hàng, dùng khi import từ báo giá. */
  const replaceItems = (rows: LineItem[]) => {
    const next = rows.length ? rows : [emptyLineItem()];
    setItems(next);
    setCatalogRefs(
      next.map((i) =>
        i.inventoryItemId ? `SP:${i.inventoryItemId}` : i.equipmentId ? `EQ:${i.equipmentId}` : 'CUSTOM',
      ),
    );
  };

  /** Các dòng có tên — dùng khi lưu xuống database. */
  const validItems = () => items.filter((it) => it.name.trim());

  return {
    items,
    catalogRefs,
    catalogOptions,
    addItem,
    removeItem,
    changeItem,
    selectCatalog,
    replaceItems,
    validItems,
  };
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const fmtEur = (n: number) =>
  new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export function LineItemsEditor({
  title = 'Danh sách máy / sản phẩm trong đơn',
  items,
  catalogRefs,
  catalogOptions,
  catalogDetailsMap,
  costOf,
  onAdd,
  onAddNewPart,
  onRemove,
  onChange,
  onSelectCatalog,
  warnMissingPrice = false,
  footerRows,
}: {
  title?: string;
  items: LineItem[];
  catalogRefs: string[];
  catalogOptions: SearchableSelectOption[];
  catalogDetailsMap?: Map<string, { itemCode?: string; unit?: string; stockQty?: number; type?: string; name: string }>;
  /** Fallback tính giá vốn nếu item chưa có unitCostVnd */
  costOf?: (item: LineItem) => number;
  onAdd: () => void;
  onAddNewPart?: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof LineItem, value: any) => void;
  onSelectCatalog: (index: number, ref: string) => void;
  warnMissingPrice?: boolean;
  footerRows?: React.ReactNode;
}) {
  const [expandedSpecIndices, setExpandedSpecIndices] = useState<Record<number, boolean>>({});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={14} color="#7c3aed" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
            {title} ({items.length} mặt hàng)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onAddNewPart && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onAddNewPart}
              style={{ borderColor: '#ddd6fe', color: '#7c3aed', background: '#faf5ff', fontSize: 11.5, height: 28, padding: '0 8px' }}
            >
              <Plus size={12} /> Thêm phụ tùng mới
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onAdd}
            style={{ fontSize: 11.5, height: 28, padding: '0 8px' }}
          >
            <Plus size={12} /> Thêm dòng hàng
          </Button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 8, overflowX: 'auto', background: '#ffffff' }}>
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-sunken, #f8fafc)', borderBottom: '1px solid var(--border-base, #e2e8f0)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '7px 4px', textAlign: 'center', width: 34 }}>STT</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', minWidth: 200 }}>Mặt hàng / Dịch vụ</th>
              <th style={{ padding: '7px 2px', textAlign: 'center', width: 50 }} title="Số lượng">SL</th>
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 112 }} title="Giá vốn đơn vị (EUR & VND)">
                Giá vốn (EUR · VND)
              </th>
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 96 }} title="Cước vận chuyển phân bổ">
                Cước VC (đ)
              </th>
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 96 }} title="Phí khác / hải quan">
                Phí khác (đ)
              </th>
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 116 }} title="Đơn giá bán cho khách">
                Đơn giá bán (đ)
              </th>
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 135, minWidth: 135, whiteSpace: 'nowrap' }} title="Thành tiền: Số lượng × Đơn giá bán">
                Thành tiền (đ)
              </th>
              <th style={{ padding: '7px 2px', width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const ref = catalogRefs[idx] || '';
              const picked = catalogOptions.find((o) => o.value === ref) as any;
              const detail = catalogDetailsMap?.get(ref) || picked;
              const showNameInput =
                ref === 'CUSTOM' || (ref !== '' && !picked) || (ref === '' && Boolean(item.name));

              const unitCost =
                item.unitCostVnd !== undefined && item.unitCostVnd > 0
                  ? item.unitCostVnd
                  : costOf
                  ? costOf(item)
                  : 0;
              const unitPrice = Number(item.unitPrice) || 0;
              const qty = Math.max(1, Number(item.quantity) || 1);
              const ship = Number(item.shippingFee) || 0;
              const other = Number(item.customsFee) || 0;
              const total = lineTotal(item);
              const profit = total - (unitCost * qty + ship + other);
              const isMissingPrice = warnMissingPrice && Boolean(item.name.trim()) && unitPrice <= 0;
              const eq = detail?.equipment;
              const specRows = eq ? getEquipmentSpecRows(eq) : [];
              const quickPills = eq ? getEquipmentQuickPills(eq) : [];
              const isSpecsExpanded = Boolean(expandedSpecIndices[idx]);

              return (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid var(--border-base, #e2e8f0)',
                    background: idx % 2 === 1 ? '#fbfcfe' : '#ffffff',
                  }}
                >
                  {/* 1. STT */}
                  <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                    <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {idx + 1}
                    </div>
                  </td>

                  {/* 2. Mặt hàng / Dịch vụ */}
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {showNameInput ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchableSelect
                              sizeSm
                              triggerStyle={{ height: 26, minHeight: 26, fontSize: 12, padding: '0 8px' }}
                              value={ref}
                              onChange={(val) => onSelectCatalog(idx, val)}
                              options={catalogOptions}
                              placeholder="-- Chọn máy, linh kiện hoặc dịch vụ --"
                              searchPlaceholder="Nhập tên hoặc mã để tìm…"
                              popoverMinWidth={340}
                              allowClear
                            />
                          </div>
                          <div style={{ width: 170, flexShrink: 0 }}>
                            <Input
                              placeholder="Tên dịch vụ / hàng hóa"
                              value={item.name}
                              onChange={(e) => onChange(idx, 'name', e.target.value)}
                              sizeSm
                              style={{ height: 26, fontSize: 11.5 }}
                              autoFocus={ref === 'CUSTOM'}
                            />
                          </div>
                        </div>
                      ) : (
                        <SearchableSelect
                          sizeSm
                          triggerStyle={{ height: 26, minHeight: 26, fontSize: 12, padding: '0 8px' }}
                          value={ref}
                          onChange={(val) => onSelectCatalog(idx, val)}
                          options={catalogOptions}
                          placeholder="-- Chọn máy, linh kiện hoặc dịch vụ --"
                          searchPlaceholder="Nhập tên hoặc mã để tìm…"
                          popoverMinWidth={340}
                          allowClear
                        />
                      )}

                      {/* Dòng 2: Badge Mã + Tồn kho + Thông số máy */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          minHeight: 26,
                          fontSize: 10.5,
                          color: 'var(--text-muted)',
                          flexWrap: 'wrap',
                          marginTop: 1,
                        }}
                      >
                        {detail ? (
                          <>
                            {detail.itemCode && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  background: 'var(--surface-sunken, #f1f5f9)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid var(--border-subtle, #e2e8f0)',
                                  lineHeight: 1.2,
                                }}
                              >
                                Mã: <strong style={{ color: 'var(--text-strong, #0f172a)' }}>{detail.itemCode}</strong>
                              </span>
                            )}
                            {detail.stockQty !== undefined && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  background: detail.stockQty > 0 ? '#f0fdf4' : '#fef2f2',
                                  color: detail.stockQty > 0 ? '#15803d' : '#b91c1c',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: `1px solid ${detail.stockQty > 0 ? '#bbf7d0' : '#fecaca'}`,
                                  lineHeight: 1.2,
                                }}
                              >
                                Tồn: <strong>{detail.stockQty}</strong> {detail.unit || 'cái'}
                              </span>
                            )}
                            {detail.type === 'RENTAL' && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid #fde68a',
                                  lineHeight: 1.2,
                                }}
                              >
                                {detail.equipment?.ownershipType === 'RENTAL'
                                  ? 'Máy cho thuê'
                                  : detail.equipment?.ownershipType === 'LOAN'
                                    ? 'Máy cho mượn'
                                    : 'Máy ký gửi'}
                              </span>
                            )}
                            {quickPills.map((pill: string, pIdx: number) => (
                              <span
                                key={pIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid #bfdbfe',
                                  lineHeight: 1.2,
                                  fontWeight: 500,
                                }}
                              >
                                {pill}
                              </span>
                            ))}
                            {specRows.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSpecIndices((prev) => ({
                                    ...prev,
                                    [idx]: !prev[idx],
                                  }))
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  background: isSpecsExpanded ? '#ede9fe' : '#f8fafc',
                                  color: isSpecsExpanded ? '#7c3aed' : 'var(--text-muted)',
                                  border: `1px solid ${isSpecsExpanded ? '#c4b5fd' : 'var(--border-subtle, #e2e8f0)'}`,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Xem / Ẩn bảng thông số kỹ thuật 2 cột"
                              >
                                📋 {isSpecsExpanded ? 'Thu gọn thông số' : 'Thông số kỹ thuật'}
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>

                      {/* Bảng thông số kỹ thuật 2 cột (khi bấm mở rộng) */}
                      {isSpecsExpanded && specRows.length > 0 && (
                        <div style={{ marginTop: 3 }}>
                          <EquipmentSpecGrid rows={specRows} compact />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 3. SL */}
                  <td style={{ padding: '6px 2px', textAlign: 'center', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => onChange(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                        style={{ width: 44, textAlign: 'center', height: 26, padding: '0 2px', margin: '0 auto', fontSize: 12 }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {detail?.unit || 'cái'}
                      </div>
                    </div>
                  </td>

                  {/* 4. Giá vốn EUR & VND */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <PriceInput
                        sizeSm
                        currency="EUR"
                        suffix="€"
                        allowDecimals
                        placeholder="0"
                        value={item.unitPriceEur}
                        onChange={(val) => onChange(idx, 'unitPriceEur', val ?? 0)}
                        containerStyle={{ width: 104 }}
                        style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                        title="Giá vốn gốc EUR (€)"
                      />
                      <PriceInput
                        sizeSm
                        currency="VND"
                        suffix="₫"
                        placeholder="0"
                        value={item.unitCostVnd}
                        onChange={(val) => onChange(idx, 'unitCostVnd', val ?? 0)}
                        containerStyle={{ width: 104 }}
                        style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                        title="Giá vốn quy đổi VNĐ"
                      />
                    </div>
                  </td>

                  {/* 5. Cước VC */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <PriceInput
                        sizeSm
                        currency="VND"
                        suffix=""
                        value={item.shippingFee}
                        onChange={(val) => onChange(idx, 'shippingFee', val ?? 0)}
                        placeholder="0"
                        containerStyle={{ width: 90, marginLeft: 'auto' }}
                        style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {qty > 1 && ship > 0 ? `≈ ${fmt(ship / qty)} ₫/cái` : null}
                      </div>
                    </div>
                  </td>

                  {/* 6. Phí khác */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <PriceInput
                        sizeSm
                        currency="VND"
                        suffix=""
                        value={item.customsFee}
                        onChange={(val) => onChange(idx, 'customsFee', val ?? 0)}
                        placeholder="0"
                        containerStyle={{ width: 90, marginLeft: 'auto' }}
                        style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {qty > 1 && other > 0 ? `≈ ${fmt(other / qty)} ₫/cái` : null}
                      </div>
                    </div>
                  </td>

                  {/* 7. Đơn giá bán */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <PriceInput
                        placeholder="0"
                        value={item.unitPrice}
                        onChange={(val) => onChange(idx, 'unitPrice', val || 0)}
                        sizeSm
                        containerStyle={{ width: 110, marginLeft: 'auto' }}
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          height: 26,
                          fontSize: 11.5,
                          color: isMissingPrice ? '#dc2626' : '#0f9960',
                        }}
                        invalid={isMissingPrice}
                      />
                      <div style={{ fontSize: 10, lineHeight: 1.3, whiteSpace: 'nowrap', textAlign: 'right', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {isMissingPrice && (
                          <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
                            <AlertTriangle size={10} /> Chưa có giá
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 8. Thành tiền */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top', width: 135, minWidth: 135, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-strong, #0f172a)', fontSize: 12, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        {fmt(total)}&nbsp;₫
                      </div>
                      <div style={{ fontSize: 10, color: profit >= 0 ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {profit >= 0 ? `+${fmt(profit)} ₫` : `${fmt(profit)} ₫`}
                      </div>
                    </div>
                  </td>

                  {/* 9. Xóa dòng */}
                  <td style={{ padding: '6px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: '6px 2px', display: 'inline-flex' }}
                        title="Xóa dòng"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Dòng bấm nhanh để thêm mặt hàng mới ngay dưới row cuối */}
            <tr>
              <td colSpan={9} style={{ padding: '6px 8px', background: '#faf5ff', borderTop: '1px dashed #ddd6fe' }}>
                <button
                  type="button"
                  onClick={onAdd}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#7c3aed',
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '4px 6px',
                    borderRadius: 4,
                  }}
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Thêm dòng hàng</span>
                </button>
              </td>
            </tr>
          </tbody>
          {footerRows && (
            <tfoot>
              {footerRows}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/**
 * Component chân bảng Footer chuẩn 5 dòng cho Đơn bán khách và Báo giá khách:
 * 1. Tổng cộng (X mặt hàng): SL, Vốn EUR/VND, Cước VC, Phí khác, Thành tiền
 * 2. Chiết khấu (X%): quick buttons + input % + tiền trừ
 * 3. Tiền hàng sau chiết khấu (khi có chiết khấu)
 * 4. Thuế VAT: quick buttons [0%] [8%] [10%] + input % + tiền thuế
 * 5. TỔNG CỘNG THANH TOÁN (VND) (ĐÃ GỒM VAT)
 */
export function LineItemsSummaryFooter({
  items,
  discountRate = 0,
  onDiscountRateChange,
  vatRate = 0,
  onVatRateChange,
  volumeDiscountTiers,
}: {
  items: LineItem[];
  discountRate: number;
  onDiscountRateChange: (rate: number) => void;
  vatRate: number;
  onVatRateChange: (rate: number) => void;
  volumeDiscountTiers?: Array<{ min: number; max: number; rate: number; label?: string }>;
}) {
  const [showDiscountTooltip, setShowDiscountTooltip] = useState(false);

  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const subtotalEur = items.reduce(
    (sum, it) => sum + (Number(it.unitPriceEur) || 0) * (Number(it.quantity) || 0),
    0,
  );
  const subtotalVnd = items.reduce(
    (sum, it) => sum + (Number(it.unitCostVnd) || 0) * (Number(it.quantity) || 0),
    0,
  );
  const totalShippingFee = items.reduce((sum, it) => sum + (Number(it.shippingFee) || 0), 0);
  const totalOtherFee = items.reduce((sum, it) => sum + (Number(it.customsFee) || 0), 0);
  const grossSellingTotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );

  const rateNum = Number(discountRate) || 0;
  const discountAmount = Math.round((grossSellingTotal * rateNum) / 100);
  const afterDiscountTotal = Math.max(0, grossSellingTotal - discountAmount);

  const vatNum = Number(vatRate) || 0;
  const vatAmount = Math.round((afterDiscountTotal * vatNum) / 100);
  const finalTotalWithVat = afterDiscountTotal + vatAmount;

  const defaultDiscountTiers = [0, 1, 2, 3, 5, 8];

  return (
    <>
      {/* 1. Hàng tổng cộng các cột */}
      <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-base, #cbd5e1)', fontWeight: 600 }}>
        <td colSpan={2} style={{ padding: '8px 8px', color: 'var(--text-strong)' }}>
          Tổng cộng ({items.length} mặt hàng):
        </td>
        <td style={{ padding: '8px 2px', textAlign: 'center', fontWeight: 700, color: 'var(--text-strong)', fontSize: 11.5 }}>
          {totalQty} cái
        </td>
        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
          <div style={{ color: '#64748b' }}>{fmtEur(subtotalEur)}&nbsp;€</div>
          <div style={{ color: '#334155' }}>{fmt(subtotalVnd)}&nbsp;₫</div>
        </td>
        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#0284c7', fontSize: 11.5, whiteSpace: 'nowrap' }}>
          {fmt(totalShippingFee)}&nbsp;₫
        </td>
        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#d97706', fontSize: 11.5, whiteSpace: 'nowrap' }}>
          {fmt(totalOtherFee)}&nbsp;₫
        </td>
        <td></td>
        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
          {fmt(grossSellingTotal)}&nbsp;₫
        </td>
        <td></td>
      </tr>

      {/* 2. Dòng chiết khấu */}
      <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)', position: 'relative', zIndex: 100 }}>
        <td
          colSpan={7}
          style={{
            padding: '7px 10px',
            textAlign: 'right',
            color: rateNum > 0 ? '#b91c1c' : 'var(--text-muted)',
            fontWeight: 600,
            position: 'relative',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                position: 'relative',
                cursor: volumeDiscountTiers?.length ? 'help' : 'default',
              }}
              onMouseEnter={() => volumeDiscountTiers?.length && setShowDiscountTooltip(true)}
              onMouseLeave={() => setShowDiscountTooltip(false)}
            >
              <span
                style={{
                  borderBottom: volumeDiscountTiers?.length ? '1px dashed currentColor' : 'none',
                  paddingBottom: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Chiết khấu ({rateNum}%):
                {volumeDiscountTiers?.length ? <Info size={13} style={{ opacity: 0.8 }} /> : null}
              </span>

              {showDiscountTooltip && volumeDiscountTiers && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 10px)',
                    right: 0,
                    zIndex: 99999,
                    background: 'var(--surface-card, #ffffff)',
                    color: 'var(--text-base, #1e293b)',
                    border: '1px solid var(--border-base, #94a3b8)',
                    borderRadius: 8,
                    boxShadow: '0 20px 40px -4px rgba(0, 0, 0, 0.28), 0 10px 18px -4px rgba(0, 0, 0, 0.16)',
                    padding: '10px 14px',
                    width: 250,
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: 'var(--text-strong, #0f172a)',
                      marginBottom: 6,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
                      paddingBottom: 4,
                    }}
                  >
                    <Info size={13} color="#2563eb" /> Chiết khấu theo số lượng:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {volumeDiscountTiers.map((tier, idx) => {
                      const tierPct = Math.round((tier.rate || 0) * 100 * 10) / 10;
                      const isMatch = totalQty >= tier.min && totalQty <= tier.max;
                      const tierLabel =
                        tier.min === tier.max
                          ? `${tier.min} cái`
                          : tier.max >= 99999
                          ? `≥ ${tier.min} cái`
                          : `${tier.min} – ${tier.max} cái`;

                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isMatch ? '#f0fdf4' : 'transparent',
                            color: isMatch ? '#15803d' : 'var(--text-muted, #64748b)',
                            fontWeight: isMatch ? 700 : 400,
                          }}
                        >
                          <span>• {tierLabel}:</span>
                          <span>
                            {tierPct}% {isMatch && '✓'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick buttons */}
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {(volumeDiscountTiers && volumeDiscountTiers.length > 0
                ? volumeDiscountTiers.map((t) => Math.round((t.rate || 0) * 100 * 10) / 10)
                : defaultDiscountTiers
              ).map((pct) => {
                const isSelected = rateNum === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => onDiscountRateChange(pct)}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-base, #cbd5e1)',
                      background: isSelected ? '#f5f3ff' : '#fff',
                      color: isSelected ? '#7c3aed' : 'var(--text-base, #475569)',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>

            {/* Input % */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={discountRate}
                onChange={(e) => onDiscountRateChange(Number(e.target.value) || 0)}
                style={{
                  width: 44,
                  padding: '2px 4px',
                  fontSize: 11,
                  textAlign: 'center',
                  border: '1px solid var(--border-base, #cbd5e1)',
                  borderRadius: 4,
                  background: 'var(--surface-card, #fff)',
                  color: 'var(--text-strong, #0f172a)',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>
        </td>
        <td
          style={{
            padding: '7px 10px',
            textAlign: 'right',
            fontWeight: 700,
            color: rateNum > 0 ? '#b91c1c' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {rateNum > 0 ? `-${fmt(discountAmount)}\u00A0₫` : '0\u00A0₫'}
        </td>
        <td></td>
      </tr>

      {/* 3. Tiền hàng sau chiết khấu (khi có chiết khấu > 0) */}
      {rateNum > 0 && (
        <tr style={{ background: '#f8fafc', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
          <td
            colSpan={7}
            style={{
              padding: '7px 10px',
              textAlign: 'right',
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            Tiền hàng sau chiết khấu:
          </td>
          <td
            style={{
              padding: '7px 10px',
              textAlign: 'right',
              fontWeight: 700,
              color: 'var(--text-strong)',
              whiteSpace: 'nowrap',
            }}
          >
            {fmt(afterDiscountTotal)}&nbsp;₫
          </td>
          <td></td>
        </tr>
      )}

      {/* 4. Thuế VAT */}
      <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
        <td
          colSpan={7}
          style={{
            padding: '6px 10px',
            textAlign: 'right',
            fontWeight: 600,
            color: 'var(--text-strong)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <span>Thuế VAT:</span>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {[0, 8, 10].map((rate) => {
                const isSelected = vatNum === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onVatRateChange(rate)}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-base, #cbd5e1)',
                      background: isSelected ? '#f5f3ff' : '#fff',
                      color: isSelected ? '#7c3aed' : 'var(--text-base, #475569)',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {rate}%
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={vatRate}
                onChange={(e) => onVatRateChange(Number(e.target.value) || 0)}
                style={{
                  width: 44,
                  padding: '2px 4px',
                  fontSize: 11,
                  textAlign: 'center',
                  border: '1px solid var(--border-base, #cbd5e1)',
                  borderRadius: 4,
                  background: 'var(--surface-card, #fff)',
                  color: 'var(--text-strong, #0f172a)',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>
        </td>
        <td
          style={{
            padding: '6px 10px',
            textAlign: 'right',
            fontWeight: 700,
            color: vatAmount > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {vatAmount > 0 ? `+${fmt(vatAmount)}\u00A0₫` : '0\u00A0₫'}
        </td>
        <td></td>
      </tr>

      {/* 5. Tổng cộng thanh toán */}
      <tr style={{ background: '#f1f5f9', borderTop: '1px solid #94a3b8', fontWeight: 800 }}>
        <td
          colSpan={7}
          style={{
            padding: '10px',
            textAlign: 'right',
            textTransform: 'uppercase',
            color: 'var(--text-strong)',
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}
        >
          TỔNG CỘNG{vatNum > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#7c3aed', fontSize: 14, whiteSpace: 'nowrap' }}>
          {fmt(finalTotalWithVat)}&nbsp;₫
        </td>
        <td></td>
      </tr>
    </>
  );
}
