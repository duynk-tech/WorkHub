'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  Calculator,
  RotateCcw,
  CheckCircle2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  type SparePartPricingConfig,
  calculateSellingPriceFromMargin,
  PART_CATEGORIES,
} from '@/server/modules/spare-parts/types';

export interface ItemPriceCalculatorModalProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemCode?: string;
  category?: string;
  priceEur?: number | null;
  costPrice?: number | null;
  currentSellingPrice?: number | null;
  pricingConfig?: SparePartPricingConfig;
  initialShippingFee?: number;
  initialOtherFee?: number;
  /** Khi gọi từ form (ví dụ SparePartModal), áp dụng giá và cước phí vào state form */
  onApply?: (price: number, shippingFee: number, otherFee: number) => void;
  /** Khi gọi trực tiếp từ bảng ngoài (Save trực tiếp vào server) */
  onSaveDirectly?: (price: number, shippingFee: number, otherFee: number) => Promise<boolean>;
}

export function ItemPriceCalculatorModal({
  open,
  onClose,
  itemName,
  itemCode,
  category = 'SPARE_PART',
  priceEur = 0,
  costPrice = 0,
  currentSellingPrice = 0,
  pricingConfig,
  initialShippingFee,
  initialOtherFee,
  onApply,
  onSaveDirectly,
}: ItemPriceCalculatorModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const eurExchangeRate = pricingConfig?.defaultExchangeRateEur ?? 32500;
  const marginPercent = pricingConfig?.defaultMarginPercent ?? 30;
  const pricingMethod = pricingConfig?.pricingMethod ?? 'MARGIN';
  const defaultShippingFee = Number(pricingConfig?.defaultShippingFee ?? 3500000);
  const defaultCustomsFee = Number(pricingConfig?.defaultCustomsFee ?? 0);

  const isMachine = category === 'EQUIPMENT' || category === 'MACHINE';
  const catInfo = PART_CATEGORIES[category] || {
    label: isMachine ? 'Thiết bị' : 'Phụ tùng',
    color: '#2563eb',
    bg: '#eff6ff',
  };

  // State
  const [curCostPrice, setCurCostPrice] = useState<number>(costPrice || 0);
  const [curPriceEur, setCurPriceEur] = useState<number>(priceEur || 0);
  const [shippingFee, setShippingFee] = useState<number>(
    initialShippingFee !== undefined ? initialShippingFee : defaultShippingFee
  );
  const [otherFee, setOtherFee] = useState<number>(
    initialOtherFee !== undefined ? initialOtherFee : defaultCustomsFee
  );
  const [selectedPrice, setSelectedPrice] = useState<number>(currentSellingPrice || 0);

  useEffect(() => {
    if (open) {
      const initCost =
        costPrice && costPrice > 0
          ? costPrice
          : priceEur && priceEur > 0
          ? Math.round(priceEur * eurExchangeRate)
          : 0;
      setCurCostPrice(initCost);
      setCurPriceEur(priceEur || 0);
      const ship = initialShippingFee !== undefined ? initialShippingFee : defaultShippingFee;
      const oth = initialOtherFee !== undefined ? initialOtherFee : defaultCustomsFee;
      setShippingFee(ship);
      setOtherFee(oth);

      // Tính giá ban đầu
      const retail = initCost > 0 ? calculateSellingPriceFromMargin(initCost, marginPercent, pricingMethod) : 0;
      const totalImport = retail > 0 && ship + oth > 0 ? retail + ship + oth : retail;
      setSelectedPrice(currentSellingPrice && currentSellingPrice > 0 ? currentSellingPrice : totalImport || retail);
    }
  }, [open, costPrice, priceEur, eurExchangeRate, marginPercent, pricingMethod, initialShippingFee, initialOtherFee, defaultShippingFee, defaultCustomsFee, currentSellingPrice]);

  // Effective cost: from costPrice or estimated from EUR
  const effectiveCost =
    curCostPrice && curCostPrice > 0
      ? curCostPrice
      : curPriceEur && curPriceEur > 0
      ? Math.round(curPriceEur * eurExchangeRate)
      : 0;

  // 1. Giá bán lẻ Margin thuần
  const suggestedRetailPrice =
    effectiveCost > 0 ? calculateSellingPriceFromMargin(effectiveCost, marginPercent, pricingMethod) : 0;

  // 2. Giá trọn gói gồm cước VC và phí khác
  const totalFees = Math.max(0, Number(shippingFee) || 0) + Math.max(0, Number(otherFee) || 0);
  const suggestedImportPrice =
    suggestedRetailPrice > 0 && totalFees > 0 ? suggestedRetailPrice + totalFees : suggestedRetailPrice;

  const handleApply = async () => {
    const finalPrice = selectedPrice > 0 ? selectedPrice : suggestedImportPrice || suggestedRetailPrice;
    if (onSaveDirectly) {
      setLoading(true);
      try {
        const ok = await onSaveDirectly(finalPrice, shippingFee, otherFee);
        if (ok) {
          toast.success('Đã cập nhật giá bán & cước phí thành công!');
          onClose();
        }
      } catch (err: any) {
        toast.error(err.message || 'Lỗi khi lưu giá bán');
      } finally {
        setLoading(false);
      }
    } else if (onApply) {
      onApply(finalPrice, shippingFee, otherFee);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#f5f3ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Calculator size={16} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
              Tính Giá
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
              ({isMachine ? 'Thiết bị' : 'Phụ tùng'})
            </span>
          </div>
        </div>
      }
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Banner thông tin sản phẩm thu gọn 1 hàng */}
        <div
          style={{
            padding: '6px 10px',
            background: 'var(--surface-sunken)',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
            {itemCode && (
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--brand)', flexShrink: 0 }}>
                {itemCode}
              </span>
            )}
            <span
              style={{
                fontSize: 10.5,
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 600,
                background: catInfo.bg,
                color: catInfo.color,
                flexShrink: 0,
              }}
            >
              {catInfo.label}
            </span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text-strong)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {itemName || 'Chưa đặt tên'}
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {curPriceEur > 0 && <span style={{ marginRight: 6 }}>€{curPriceEur} ·</span>}
            Vốn: <strong style={{ color: 'var(--text-strong)' }}>{effectiveCost > 0 ? `${effectiveCost.toLocaleString('vi-VN')}₫` : '—'}</strong>
          </div>
        </div>

        {/* Khối tham số đầu vào: 3 CỘT trên 1 hàng (Giá vốn VND, Cước VC, Phí khác) */}
        <div
          style={{
            padding: '9px 11px',
            background: 'var(--surface-raised, #ffffff)',
            borderRadius: 8,
            border: '1px solid var(--border-base, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--text-strong)' }}>
              <SlidersHorizontal size={13} color="#7c3aed" />
              <span>Giá vốn & Chi phí bổ sung</span>
            </div>
            {(shippingFee !== defaultShippingFee || otherFee !== defaultCustomsFee) && (
              <button
                type="button"
                onClick={() => {
                  setShippingFee(defaultShippingFee);
                  setOtherFee(defaultCustomsFee);
                }}
                style={{
                  fontSize: 11,
                  color: '#2563eb',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                <RotateCcw size={10} /> Đặt lại mặc định
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                Giá vốn VND <span style={{ color: '#7c3aed', fontWeight: 700 }}>({marginPercent}%)</span>
              </label>
              <PriceInput
                sizeSm
                currency="VND"
                value={curCostPrice}
                onChange={(val) => setCurCostPrice(val ?? 0)}
                placeholder="Giá vốn"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                🚚 Cước VC (₫)
              </label>
              <PriceInput
                sizeSm
                currency="VND"
                value={shippingFee}
                onChange={(val) => setShippingFee(val ?? 0)}
                placeholder="Cước VC"
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                Mặc định: {defaultShippingFee.toLocaleString('vi-VN')}₫
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                Phí khác (₫)
              </label>
              <PriceInput
                sizeSm
                currency="VND"
                value={otherFee}
                onChange={(val) => setOtherFee(val ?? 0)}
                placeholder="Phí khác"
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                Mặc định: {defaultCustomsFee.toLocaleString('vi-VN')}₫
              </div>
            </div>
          </div>
        </div>

        {/* Khối Lựa chọn Mức giá đề xuất (Thu gọn) */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} color="#f59e0b" />
            <span>Phương án giá bán đề xuất:</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Card 1: Thuần Margin */}
            <div
              onClick={() => setSelectedPrice(suggestedRetailPrice)}
              style={{
                border: selectedPrice === suggestedRetailPrice ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: selectedPrice === suggestedRetailPrice ? '#eff6ff' : '#ffffff',
                borderRadius: 6,
                padding: '7px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb' }}>
                  BÁN LẺ TIÊU CHUẨN
                </span>
                {selectedPrice === suggestedRetailPrice && (
                  <CheckCircle2 size={13} color="#2563eb" />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                {suggestedRetailPrice > 0 ? `${suggestedRetailPrice.toLocaleString('vi-VN')} ₫` : '0 ₫'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Thuần {marginPercent}% Margin trên vốn ({effectiveCost.toLocaleString('vi-VN')}₫)
              </div>
            </div>

            {/* Card 2: Gồm cước & phí khác */}
            <div
              onClick={() => setSelectedPrice(suggestedImportPrice)}
              style={{
                border: selectedPrice === suggestedImportPrice ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                background: selectedPrice === suggestedImportPrice ? '#f5f3ff' : '#ffffff',
                borderRadius: 6,
                padding: '7px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>GỒM CƯỚC & PHÍ</span>
                  <span style={{ fontSize: 9, padding: '0px 4px', borderRadius: 2, background: '#ede9fe', color: '#6d28d9' }}>Khuyên dùng</span>
                </span>
                {selectedPrice === suggestedImportPrice && (
                  <CheckCircle2 size={13} color="#7c3aed" />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#7c3aed' }}>
                {suggestedImportPrice > 0 ? `${suggestedImportPrice.toLocaleString('vi-VN')} ₫` : '0 ₫'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Margin + Cước VC ({(shippingFee || 0).toLocaleString('vi-VN')}₫) + Phí khác ({(otherFee || 0).toLocaleString('vi-VN')}₫)
              </div>
            </div>
          </div>
        </div>

        {/* Hàng chốt giá áp dụng & Nút hành động */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 12,
            alignItems: 'flex-end',
            paddingTop: 4,
            borderTop: '1px solid var(--border-subtle, #f1f5f9)',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>
              Giá bán chốt áp dụng (VNĐ)
            </label>
            <PriceInput
              sizeSm
              currency="VND"
              value={selectedPrice}
              onChange={(val) => setSelectedPrice(val ?? 0)}
              placeholder="Giá bán chốt"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Đóng
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApply}
              loading={loading}
              disabled={loading}
              style={{ minWidth: 120 }}
            >
              {onSaveDirectly ? 'Lưu & Cập nhật' : 'Áp dụng giá'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
