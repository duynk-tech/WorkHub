'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input, PriceInput } from '@/components/ui';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { Plus, Trash2, AlertTriangle, Package } from 'lucide-react';
import {
  calculateQuotedUnitPrice,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';

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
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  EQUIPMENT: 'Máy móc F&B',
  SPARE_PART: 'Linh kiện / Phụ tùng',
  SERVICE: 'Dịch vụ',
};

export function emptyLineItem(): LineItem {
  return { itemType: 'EQUIPMENT', name: '', quantity: 1, unitPrice: 0, discountVnd: 0, notes: '' };
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
    });
  }

  // Máy đang cho thuê / ký gửi tại khách → vẫn có thể chốt bán đứt hoặc gia hạn.
  for (const m of machines.filter((x: any) => x.ownershipType && x.ownershipType !== 'SOLD')) {
    const price = Number(m.soldPrice || 0);
    const priceLabel = strictSellingPrice
      ? price > 0
        ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫`
        : '⚠️ Chưa có giá bán'
      : undefined;

    opts.push({
      value: `EQ:${m.id}`,
      group: 'Máy đang thuê / ký gửi tại khách',
      label: m.name,
      subLabel: [m.ownershipType === 'RENTAL' ? 'Cho thuê' : 'Ký gửi', m.machineCode, priceLabel]
        .filter(Boolean)
        .join(' · '),
      keywords: [m.machineCode, m.brand, m.model, m.serialNumber, priceLabel].filter(Boolean).join(' '),
      itemCode: m.machineCode,
      unit: 'máy',
      stockQty: 0,
      type: 'RENTAL',
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
    updated[index] = { ...updated[index], [field]: value };
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

    if (!ref) {
      updated[index] = {
        ...updated[index],
        name: '',
        equipmentId: undefined,
        inventoryItemId: undefined,
        unitPrice: 0,
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
        updated[index] = {
          ...updated[index],
          itemType: 'EQUIPMENT',
          name: `${m.name}${m.brand ? ` (${m.brand})` : ''}${m.machineCode ? ` [${m.machineCode}]` : ''}`,
          equipmentId: m.id,
          inventoryItemId: undefined,
          unitPrice: price,
          priceSource: price > 0 ? 'LIST' : 'NONE',
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

        updated[index] = {
          ...updated[index],
          itemType: 'SPARE_PART',
          name: `${p.name}${p.itemCode ? ` [${p.itemCode}]` : ''}`,
          equipmentId: undefined,
          inventoryItemId: p.id,
          unitPrice: price,
          priceSource: source,
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

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

export function LineItemsEditor({
  title = 'Danh sách máy / sản phẩm trong đơn',
  items,
  catalogRefs,
  catalogOptions,
  catalogDetailsMap,
  costOf,
  onAdd,
  onRemove,
  onChange,
  onSelectCatalog,
  warnMissingPrice = false,
}: {
  title?: string;
  items: LineItem[];
  catalogRefs: string[];
  catalogOptions: SearchableSelectOption[];
  catalogDetailsMap?: Map<string, { itemCode?: string; unit?: string; stockQty?: number; type?: string; name: string }>;
  /** Giá vốn một đơn vị của dòng hàng. Có hàm này thì hiện cột giá vốn và tỷ suất
   *  — thông tin nội bộ, không bao giờ xuất hiện trên bản in gửi khách. */
  costOf?: (item: LineItem) => number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof LineItem, value: any) => void;
  onSelectCatalog: (index: number, ref: string) => void;
  warnMissingPrice?: boolean;
}) {
  const showCost = Boolean(costOf);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={14} color="#7c3aed" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong, #0f172a)' }}>
            {title} ({items.length} mặt hàng)
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onAdd}
          style={{ fontSize: 11.5, height: 28, padding: '0 8px' }}
        >
          <Plus size={12} /> Thêm dòng
        </Button>
      </div>

      <div style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 8, overflowX: 'auto', background: '#ffffff' }}>
        <table style={{ width: '100%', minWidth: showCost ? 820 : 660, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-sunken, #f8fafc)', borderBottom: '1px solid var(--border-base, #e2e8f0)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '7px 4px', textAlign: 'center', width: 34 }}>STT</th>
              <th style={{ padding: '7px 8px', textAlign: 'left' }}>Máy / Linh kiện / Dịch vụ</th>
              <th style={{ padding: '7px 2px', textAlign: 'center', width: 50 }} title="Số lượng">SL</th>
              {showCost && (
                <th style={{ padding: '7px 6px', textAlign: 'right', width: 104 }} title="Giá vốn đơn vị (Nội bộ)">
                  Giá vốn (₫)
                </th>
              )}
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 116 }} title="Đơn giá bán cho khách">
                Đơn giá bán (₫)
              </th>
              {showCost && (
                <th style={{ padding: '7px 4px', textAlign: 'center', width: 72 }} title="Tỷ suất lãi gộp dự kiến">
                  Lãi / Tỷ suất
                </th>
              )}
              <th style={{ padding: '7px 6px', textAlign: 'right', width: 112 }} title="Thành tiền: Số lượng × Đơn giá bán">
                Thành tiền (₫)
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
              const cost = costOf ? costOf(item) : 0;
              const unitPrice = Number(item.unitPrice) || 0;
              const qty = Math.max(1, Number(item.quantity) || 1);
              const total = lineTotal(item);
              const profitPerUnit = unitPrice - cost;
              const totalProfit = total - (cost * qty);
              const margin = unitPrice > 0 && cost > 0 ? ((unitPrice - cost) / unitPrice) * 100 : null;
              const isMissingPrice = warnMissingPrice && Boolean(item.name.trim()) && unitPrice <= 0;

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

                      {/* Dòng 2: Badge Mã + Tồn kho */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 26,
                          fontSize: 10.5,
                          color: 'var(--text-muted)',
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
                                Máy thuê/ký gửi
                              </span>
                            )}
                          </>
                        ) : (
                          <span>-- Chưa chọn mặt hàng --</span>
                        )}
                      </div>
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

                  {/* 4. Giá vốn */}
                  {showCost && (
                    <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                          {cost > 0 ? `${fmt(cost)} ₫` : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                          {cost > 0 && qty > 1 ? `Tổng: ${fmt(cost * qty)} ₫` : null}
                        </div>
                      </div>
                    </td>
                  )}

                  {/* 5. Giá bán */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <PriceInput
                        placeholder="0"
                        value={item.unitPrice}
                        onChange={(val) => onChange(idx, 'unitPrice', val || 0)}
                        sizeSm
                        containerStyle={{ width: 106, marginLeft: 'auto' }}
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
                        {isMissingPrice ? (
                          <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
                            <AlertTriangle size={10} /> Chưa có giá
                          </span>
                        ) : margin !== null ? (
                          <span style={{ color: 'var(--text-muted)' }}>
                            Lãi {margin.toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* 6. Lãi */}
                  {showCost && (
                    <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: margin === null ? 'var(--text-muted)' : margin < 0 ? '#dc2626' : margin < 10 ? '#d97706' : '#16a34a',
                          }}
                        >
                          {margin === null ? '—' : `${margin.toFixed(0)}%`}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: profitPerUnit >= 0 ? '#16a34a' : '#dc2626',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cost > 0 && profitPerUnit !== 0 ? `${profitPerUnit > 0 ? '+' : ''}${fmt(profitPerUnit)}` : null}
                        </span>
                      </div>
                    </td>
                  )}

                  {/* 7. Thành tiền */}
                  <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-strong, #0f172a)', fontSize: 12, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        {fmt(total)} ₫
                      </div>
                      <div style={{ fontSize: 10, color: totalProfit >= 0 ? '#16a34a' : '#dc2626', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                        {cost > 0 ? `${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)} ₫` : null}
                      </div>
                    </div>
                  </td>

                  {/* 8. Xóa dòng */}
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
