'use client';

import React, { useMemo, useState } from 'react';
import { Input, PriceInput } from '@/components/ui';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
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
      subLabel: [m.brand, m.machineCode, priceLabel].filter(Boolean).join(' · '),
      keywords: [m.machineCode, m.brand, m.model, m.serialNumber, priceLabel].filter(Boolean).join(' '),
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

    opts.push({
      value: `SP:${p.id}`,
      group: 'Linh kiện / Phụ tùng',
      label: p.name,
      subLabel: [p.itemCode, priceLabel].filter(Boolean).join(' · '),
      keywords: [p.itemCode, p.brand, p.unit, priceLabel].filter(Boolean).join(' '),
    });
  }

  opts.push({
    value: 'CUSTOM',
    group: 'Mục khác',
    label: 'Nhập thủ công (dịch vụ hoặc hàng ngoài danh mục)',
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
  const grid = showCost
    ? '30px minmax(170px, 1.05fr) minmax(150px, 1fr) 52px 108px 112px 58px 100px 26px'
    : '34px minmax(200px, 1.1fr) minmax(190px, 1fr) 60px 120px 104px 28px';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{title}</span>
        <button
          type="button"
          onClick={onAdd}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--brand)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          <Plus size={14} /> Thêm dòng
        </button>
      </div>

      {/* Tiêu đề cột – các dòng bên dưới dùng chung grid nên thẳng hàng như bảng */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 8,
          padding: '0 32px 6px 10px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ textAlign: 'center' }}>STT</span>
        <span style={{ gridColumn: 'span 2' }}>Máy / Linh kiện / Dịch vụ</span>
        <span style={{ textAlign: 'center' }}>SL</span>
        {showCost && <span>Giá vốn</span>}
        <span>{showCost ? 'Giá bán' : 'Đơn giá'}</span>
        {showCost && <span style={{ textAlign: 'center' }}>Lãi</span>}
        <span style={{ textAlign: 'right' }}>Thành tiền</span>
        <span />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, idx) => {
          const ref = catalogRefs[idx] || '';
          const picked = catalogOptions.find((o) => o.value === ref);
          /* Ô tên chỉ hiện khi nhập thủ công, hoặc khi mục đã lưu không còn trong danh mục
             (VD: đơn cũ trỏ tới máy nay đã bán) — để dòng đó vẫn đọc & sửa được. */
          const showNameInput =
            ref === 'CUSTOM' || (ref !== '' && !picked) || (ref === '' && Boolean(item.name));

          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: grid,
                gap: 8,
                alignItems: 'center',
                background: 'var(--surface-sunken)',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-base)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', color: 'var(--text-muted)' }}>
                {idx + 1}
              </span>

              <SearchableSelect
                value={ref}
                onChange={(val) => onSelectCatalog(idx, val)}
                options={catalogOptions}
                placeholder="Chọn máy, linh kiện hoặc dịch vụ"
                searchPlaceholder="Nhập tên hoặc mã để tìm"
                allowClear
                sizeSm
                style={showNameInput ? undefined : { gridColumn: 'span 2' }}
                emptyText="Không tìm thấy trong danh mục. Chọn “Nhập thủ công” để tự nhập tên."
              />

              {showNameInput && (
                <Input
                  placeholder="Nhập tên dịch vụ hoặc hàng hóa"
                  value={item.name}
                  onChange={(e) => onChange(idx, 'name', e.target.value)}
                  sizeSm
                  title={ITEM_TYPE_LABELS[item.itemType] || 'Hàng hóa'}
                  autoFocus={ref === 'CUSTOM'}
                />
              )}

              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => onChange(idx, 'quantity', Number(e.target.value))}
                sizeSm
                style={{ textAlign: 'center' }}
              />

              {showCost && (
                <div
                  style={{
                    fontSize: 12,
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Giá vốn bình quân tại thời điểm hiện tại"
                >
                  {costOf!(item) > 0 ? fmt(costOf!(item)) : '—'}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <PriceInput
                  placeholder={showCost ? 'Giá bán (₫)' : 'Đơn giá (₫)'}
                  value={item.unitPrice}
                  onChange={(val) => onChange(idx, 'unitPrice', val || 0)}
                  sizeSm
                  invalid={warnMissingPrice && Boolean(item.name.trim()) && (!item.unitPrice || Number(item.unitPrice) <= 0)}
                />
                {warnMissingPrice && Boolean(item.name.trim()) && (!item.unitPrice || Number(item.unitPrice) <= 0) && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: '#dc2626',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                    }}
                    title="Mặt hàng này chưa được thiết lập giá bán"
                  >
                    <AlertTriangle size={11} style={{ flexShrink: 0 }} /> Chưa có giá bán
                  </span>
                )}
              </div>

              {showCost && (() => {
                const cost = costOf!(item);
                const price = Number(item.unitPrice) || 0;
                const margin = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
                return (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      color:
                        margin === null ? 'var(--text-muted)' : margin < 0 ? '#dc2626' : margin < 10 ? '#d97706' : '#16a34a',
                    }}
                    title="Tỷ suất lãi gộp của dòng này"
                  >
                    {margin === null ? '—' : `${margin.toFixed(0)}%`}
                  </div>
                );
              })()}

              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  textAlign: 'right',
                  color: 'var(--text-strong)',
                  whiteSpace: 'nowrap',
                }}
              >
                {fmt(lineTotal(item))} ₫
              </div>

              <button
                type="button"
                onClick={() => onRemove(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2,
                }}
                title="Xóa dòng"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
