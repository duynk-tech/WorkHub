'use client';

import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button, Field, Input, PriceInput, SearchableSelect, type SearchableSelectOption } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  ORDER_STATUSES,
  VOLUME_DISCOUNT_TIERS,
  calculateSellingPriceFromMargin,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import {
  createSparePartOrderAction,
  updateSparePartOrderAction,
  updateSparePartOrderStatusAction,
} from '@/server/modules/spare-parts/actions';
import {
  Package,
  Plus,
  Trash2,
  Calculator,
  ShoppingCart,
  Truck,
  CheckCircle2,
  Calendar,
  X,
  Building,
  Info,
  ShieldCheck,
  ArrowRight,
  FileDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  RefreshCw,
  RotateCcw,
  Printer,
} from 'lucide-react';
import { SparePartQuotationModal } from './spare-part-quotation-modal';
import { SparePartModal } from './spare-parts-modals';
import type { CompanyInfo } from '@/server/modules/settings/branding';

interface SparePartOrderModalProps {
  open: boolean;
  onClose: () => void;
  spareParts: any[];
  warehouses: any[];
  customers?: any[];
  equipments?: any[];
  pricingConfig?: SparePartPricingConfig;
  companyInfo?: CompanyInfo;
  initialOrder?: any;
  onSuccess?: () => void;
}

function getPartPriceInfo(
  part: any,
  exchangeRate: number,
  defaultShippingFee: number,
  defaultCustomsFee: number
) {
  if (!part) {
    return {
      unitPriceEur: 0,
      unitCost: 0,
      unitShip: defaultShippingFee,
      unitOther: defaultCustomsFee,
    };
  }

  const rateNum = Number(exchangeRate) || 32500;
  const eur = part.priceEur && Number(part.priceEur) > 0 ? Number(part.priceEur) : 0;
  const costVnd = part.costPrice && Number(part.costPrice) > 0
    ? Number(part.costPrice)
    : part.avgCost && Number(part.avgCost) > 0
      ? Number(part.avgCost)
      : 0;

  const unitCost = eur > 0 ? Math.round(eur * rateNum) : costVnd;
  const unitPriceEur = eur > 0 ? eur : (unitCost > 0 ? Math.round((unitCost / rateNum) * 100) / 100 : 0);

  let unitShip = defaultShippingFee;
  let unitOther = defaultCustomsFee;
  if (part.description) {
    const match = String(part.description).match(/<!--fees:({.*?})-->/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.shippingFee !== undefined && Number(parsed.shippingFee) >= 0) unitShip = Number(parsed.shippingFee);
        if (parsed.otherFee !== undefined && Number(parsed.otherFee) >= 0) unitOther = Number(parsed.otherFee);
      } catch {}
    }
  }

  return {
    unitPriceEur,
    unitCost,
    unitShip,
    unitOther,
  };
}

function getPartStockQty(part: any, warehouseId?: number | ''): { totalStock: number; whStock?: number } {
  if (!part) return { totalStock: 0 };
  const totalStock =
    part.totalStock !== undefined
      ? Number(part.totalStock) || 0
      : Array.isArray(part.stocks)
      ? part.stocks.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0)
      : Number(part.stockQty ?? part.quantity ?? 0);

  if (warehouseId && Array.isArray(part.stocks)) {
    const wh = part.stocks.find((s: any) => s.warehouseId === Number(warehouseId));
    return {
      totalStock,
      whStock: wh ? Number(wh.quantity) || 0 : 0,
    };
  }

  return { totalStock };
}

export function SparePartOrderModal({
  open,
  onClose,
  spareParts,
  warehouses,
  pricingConfig,
  initialOrder,
  onSuccess,
}: SparePartOrderModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portals need a browser document. Waiting until hydration also keeps the
  // server and client's initial markup aligned.
  useEffect(() => {
    setMounted(true);
  }, []);

  const [supplier, setSupplier] = useState(initialOrder?.supplier || 'Selmi (Ý)');
  const [currency, setCurrency] = useState(initialOrder?.currency || 'EUR');
  const [exchangeRate, setExchangeRate] = useState<number>(
    initialOrder?.exchangeRate
      ? Number(initialOrder.exchangeRate)
      : (pricingConfig?.defaultExchangeRateEur ?? 32500)
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | ''>(
    initialOrder?.targetWarehouseId ? Number(initialOrder.targetWarehouseId) : ''
  );

  const [trackingNumber, setTrackingNumber] = useState(initialOrder?.trackingNumber || '');
  const [etaDate, setEtaDate] = useState(
    initialOrder?.etaDate ? new Date(initialOrder.etaDate).toISOString().slice(0, 10) : ''
  );

  const rawNotes = initialOrder?.notes || '';
  const cleanNotes = rawNotes.replace(/\[VAT:\s*\d+%\]/gi, '').trim();
  const [notes, setNotes] = useState(cleanNotes);

  const defaultShippingFee = pricingConfig?.defaultShippingFee ?? 3500000;
  const defaultCustomsFee = pricingConfig?.defaultCustomsFee ?? 1000000;

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newPartModalOpen, setNewPartModalOpen] = useState(false);
  const [targetRowForNewPart, setTargetRowForNewPart] = useState<number | null>(null);
  const [batchGuideOpen, setBatchGuideOpen] = useState(false);
  const [extraParts, setExtraParts] = useState<any[]>([]);

  const allSpareParts = useMemo(
    () => [...extraParts, ...spareParts],
    [spareParts, extraParts]
  );

  const machineItems = useMemo(
    () => allSpareParts.filter((p) => p.category === 'EQUIPMENT' || p.category === 'MACHINE'),
    [allSpareParts],
  );
  const partItems = useMemo(
    () => allSpareParts.filter((p) => p.category !== 'EQUIPMENT' && p.category !== 'MACHINE'),
    [allSpareParts],
  );

  // Danh sách options mặt hàng hỗ trợ tìm kiếm theo mã, tên, danh mục, hãng
  const itemOptions: SearchableSelectOption[] = useMemo(() => {
    const list: SearchableSelectOption[] = [
      {
        value: '__NEW_PART__',
        label: '+ Tạo mã phụ tùng mới vào danh mục...',
        keywords: 'tao moi them phu tung new part linh kien',
        group: '⚡ Thao tác nhanh',
      },
    ];

    const targetWhCode = targetWarehouseId ? warehouses.find((w: any) => w.id === Number(targetWarehouseId))?.code : null;

    if (machineItems.length > 0) {
      for (const p of machineItems) {
        const { totalStock, whStock } = getPartStockQty(p, targetWarehouseId);
        const stockText = targetWarehouseId && whStock !== undefined
          ? (whStock === totalStock
              ? `Tồn [${targetWhCode || 'Kho'}]: ${whStock}`
              : `Tồn [${targetWhCode || 'Kho'}]: ${whStock} · Toàn hệ thống: ${totalStock}`)
          : `Tồn toàn hệ thống: ${totalStock}`;
        list.push({
          value: String(p.id),
          label: `[MÁY] ${p.name}`,
          subLabel: `Mã: ${p.itemCode} · ${stockText} ${p.unit || 'cái'} · Vốn: ${p.priceEur ? `${p.priceEur} €` : (p.costPrice ? `${Number(p.costPrice).toLocaleString('vi-VN')} ₫` : '0 ₫')}`,
          keywords: `${p.itemCode} ${p.name} ${p.manufacturer || ''} ${p.compatibleWith || ''} may moc equipment`,
          group: '🏭 Máy móc nguyên chiếc & Cụm máy',
        });
      }
    }

    for (const p of partItems) {
      const { totalStock, whStock } = getPartStockQty(p, targetWarehouseId);
      const stockText = targetWarehouseId && whStock !== undefined
        ? (whStock === totalStock
            ? `Tồn [${targetWhCode || 'Kho'}]: ${whStock}`
            : `Tồn [${targetWhCode || 'Kho'}]: ${whStock} · Toàn hệ thống: ${totalStock}`)
        : `Tồn toàn hệ thống: ${totalStock}`;
      list.push({
        value: String(p.id),
        label: p.name,
        subLabel: `Mã: ${p.itemCode} · ${stockText} ${p.unit || 'cái'} · Vốn: ${p.priceEur ? `${p.priceEur} €` : (p.costPrice ? `${Number(p.costPrice).toLocaleString('vi-VN')} ₫` : '0 ₫')}`,
        keywords: `${p.itemCode} ${p.name} ${p.manufacturer || ''} ${p.compatibleWith || ''} phu tung linh kien`,
        group: '🔧 Linh kiện & Phụ tùng thay thế',
      });
    }

    return list;
  }, [machineItems, partItems, targetWarehouseId, warehouses]);

  const [items, setItems] = useState<
    Array<{
      itemId: number | '';
      quantity: number;
      unitPriceEur: number;
      unitCostVnd?: number;
      shippingFee?: number;
      otherFee?: number;
    }>
  >(() => {
    if (initialOrder?.items && initialOrder.items.length > 0) {
      const orderShippingFee = initialOrder.shippingFee !== undefined && initialOrder.shippingFee !== null ? Number(initialOrder.shippingFee) : undefined;
      const orderCustomsFee = initialOrder.customsFee !== undefined && initialOrder.customsFee !== null ? Number(initialOrder.customsFee) : undefined;
      const totalQty = initialOrder.items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);

      let allocatedShippingSum = 0;
      let allocatedOtherSum = 0;

      return initialOrder.items.map((it: any, idx: number) => {
        const qty = Number(it.quantity) || 1;
        const isLast = idx === initialOrder.items.length - 1;

        let lineShipping = it.shippingFee !== undefined && it.shippingFee !== null ? Number(it.shippingFee) : undefined;
        if (lineShipping === undefined && orderShippingFee !== undefined) {
          lineShipping = isLast ? Math.max(0, orderShippingFee - allocatedShippingSum) : Math.round((orderShippingFee * qty) / (totalQty || 1));
          allocatedShippingSum += lineShipping;
        }

        let lineOther = it.otherFee !== undefined && it.otherFee !== null
          ? Number(it.otherFee)
          : it.customsFee !== undefined && it.customsFee !== null
            ? Number(it.customsFee)
            : undefined;
        if (lineOther === undefined && orderCustomsFee !== undefined) {
          lineOther = isLast ? Math.max(0, orderCustomsFee - allocatedOtherSum) : Math.round((orderCustomsFee * qty) / (totalQty || 1));
          allocatedOtherSum += lineOther;
        }

        return {
          itemId: it.itemId || it.item?.id || '',
          quantity: qty,
          unitPriceEur: Number(it.unitPriceEur || 0),
          unitCostVnd: Number(it.unitPriceVnd || 0),
          shippingFee: lineShipping,
          otherFee: lineOther,
        };
      });
    }
    return [
      {
        itemId: '',
        quantity: 1,
        unitPriceEur: 0,
        unitCostVnd: 0,
        shippingFee: undefined,
        otherFee: undefined,
      },
    ];
  });

  useEffect(() => {
    if (pricingConfig && !initialOrder) {
      setItems((prev) =>
        prev.map((it) => {
          if (!it.itemId) return it;
          const qty = Number(it.quantity) || 1;
          return {
            ...it,
            shippingFee: it.shippingFee !== undefined ? it.shippingFee : (pricingConfig.defaultShippingFee ?? 3500000) * qty,
            otherFee: it.otherFee !== undefined ? it.otherFee : (pricingConfig.defaultCustomsFee ?? 1000000) * qty,
          };
        })
      );
    }
  }, [pricingConfig?.defaultShippingFee, pricingConfig?.defaultCustomsFee, initialOrder]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        itemId: '',
        quantity: 1,
        unitPriceEur: 0,
        unitCostVnd: 0,
        shippingFee: undefined,
        otherFee: undefined,
      },
    ]);
  };

  const handlePartCreated = (newPart: any) => {
    if (!newPart) return;
    setExtraParts((prev) => [newPart, ...prev]);
    const prices = getPartPriceInfo(
      newPart,
      exchangeRate,
      defaultShippingFee,
      defaultCustomsFee
    );
    setItems((prev) => {
      if (targetRowForNewPart !== null && targetRowForNewPart < prev.length) {
        const next = [...prev];
        const qty = Math.max(1, Number(next[targetRowForNewPart].quantity) || 1);
        next[targetRowForNewPart] = {
          ...next[targetRowForNewPart],
          itemId: newPart.id,
          unitPriceEur: prices.unitPriceEur,
          unitCostVnd: prices.unitCost,
          shippingFee: prices.unitShip * qty,
          otherFee: prices.unitOther * qty,
        };
        return next;
      }
      const lastIndex = prev.length - 1;
      if (lastIndex >= 0 && !prev[lastIndex].itemId) {
        const next = [...prev];
        next[lastIndex] = {
          itemId: newPart.id,
          quantity: 1,
          unitPriceEur: prices.unitPriceEur,
          unitCostVnd: prices.unitCost,
          shippingFee: prices.unitShip,
          otherFee: prices.unitOther,
        };
        return next;
      }
      return [
        ...prev,
        {
          itemId: newPart.id,
          quantity: 1,
          unitPriceEur: prices.unitPriceEur,
          unitCostVnd: prices.unitCost,
          shippingFee: prices.unitShip,
          otherFee: prices.unitOther,
        },
      ];
    });
    setTargetRowForNewPart(null);
    toast.success(`Đã thêm "${newPart.name}" vào danh sách đặt hàng`);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, val: any) => {
    if (field === 'itemId' && val === '__NEW_PART__') {
      setTargetRowForNewPart(index);
      setNewPartModalOpen(true);
      return;
    }

    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index], [field]: val };
      const rateNum = Number(exchangeRate) || 32500;

      if (field === 'itemId') {
        const found = allSpareParts.find((p) => p.id === Number(val) || String(p.id) === String(val));
        if (found) {
          const prices = getPartPriceInfo(
            found,
            exchangeRate,
            defaultShippingFee,
            defaultCustomsFee
          );
          current.itemId = found.id;
          current.unitPriceEur = prices.unitPriceEur;
          current.unitCostVnd = prices.unitCost;
          const qty = Math.max(1, Number(current.quantity) || 1);
          current.shippingFee = prices.unitShip * qty;
          current.otherFee = prices.unitOther * qty;
        } else {
          current.itemId = '';
          current.unitPriceEur = 0;
          current.unitCostVnd = 0;
        }
      }

      if (field === 'quantity') {
        const prevQty = Math.max(1, Number(next[index].quantity) || 1);
        const qty = Math.max(1, Number(val) || 1);
        current.quantity = qty;

        const unitShip = current.shippingFee !== undefined && prevQty > 0
          ? Math.round(current.shippingFee / prevQty)
          : defaultShippingFee;
        const unitOther = current.otherFee !== undefined && prevQty > 0
          ? Math.round(current.otherFee / prevQty)
          : defaultCustomsFee;

        current.shippingFee = unitShip * qty;
        current.otherFee = unitOther * qty;
      }

      if (field === 'unitPriceEur') {
        const eur = Math.max(0, Number(val) || 0);
        const costVnd = Math.round(eur * rateNum);
        current.unitPriceEur = eur;
        current.unitCostVnd = costVnd;
      }

      if (field === 'unitCostVnd') {
        const costVnd = Math.max(0, Number(val) || 0);
        const eur = rateNum > 0 ? Number((costVnd / rateNum).toFixed(2)) : 0;
        current.unitCostVnd = costVnd;
        current.unitPriceEur = eur;
      }

      if (field === 'shippingFee' || field === 'otherFee') {
        current[field] = Math.max(0, Number(val) || 0);
      }

      next[index] = current;
      return next;
    });
  };

  // Live calculation: thuần túy giá vốn mua và cước phí về kho
  const calculation = useMemo(() => {
    const validItemsForQty = items.filter((it) => Boolean(it.itemId));
    const totalQty = validItemsForQty.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    const calculatedItems = items.map((it) => {
      if (!it.itemId) {
        return {
          ...it,
          eur: 0,
          priceVnd: 0,
          subtotalVnd: 0,
          shippingFee: 0,
          otherFee: 0,
          lineTotalVnd: 0,
        };
      }

      const part = allSpareParts.find((p) => p.id === Number(it.itemId) || String(p.id) === String(it.itemId));
      const qty = Number(it.quantity) || 0;
      const rateNum = Number(exchangeRate) || 32500;
      const eur = it.unitPriceEur !== undefined && Number(it.unitPriceEur) > 0
        ? Number(it.unitPriceEur)
        : Number(part?.priceEur || 0);
      const unitCost = it.unitCostVnd !== undefined && Number(it.unitCostVnd) > 0
        ? Number(it.unitCostVnd)
        : (eur > 0 ? Math.round(eur * rateNum) : Number(part?.costPrice || part?.avgCost || 0));
      const priceVnd = unitCost;
      const subtotalVnd = priceVnd * qty;

      const lineShipping = it.shippingFee !== undefined
        ? Math.max(0, Number(it.shippingFee) || 0)
        : (pricingConfig?.defaultShippingFee ?? 3500000) * qty;
      const lineOther = it.otherFee !== undefined
        ? Math.max(0, Number(it.otherFee) || 0)
        : (pricingConfig?.defaultCustomsFee ?? 1000000) * qty;

      const lineTotalVnd = subtotalVnd + lineShipping + lineOther;

      return {
        ...it,
        eur,
        priceVnd,
        subtotalVnd,
        shippingFee: lineShipping,
        otherFee: lineOther,
        lineTotalVnd,
      };
    });

    const subtotalEur = items.reduce(
      (sum, it) => sum + (it.itemId ? (Number(it.unitPriceEur) || 0) * (Number(it.quantity) || 1) : 0),
      0
    );
    const subtotalVnd = calculatedItems.reduce((sum, it) => sum + it.subtotalVnd, 0);
    const totalShippingFee = calculatedItems.reduce((sum, it) => sum + it.shippingFee, 0);
    const totalOtherFee = calculatedItems.reduce((sum, it) => sum + it.otherFee, 0);
    const totalVnd = subtotalVnd + totalShippingFee + totalOtherFee;

    return {
      totalQty,
      subtotalEur,
      subtotalVnd,
      totalShippingFee,
      totalOtherFee,
      totalVnd,
      calculatedItems,
    };
  }, [items, exchangeRate, pricingConfig, allSpareParts]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetWarehouseId) {
      toast.error('Vui lòng chọn kho nhập dự kiến');
      return;
    }

    const validItems = items.filter((it) => it.itemId && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      toast.error('Vui lòng chọn ít nhất một linh kiện hoặc máy móc hợp lệ');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        supplier: supplier.trim() || 'Selmi (Ý)',
        currency,
        exchangeRate: Number(exchangeRate),
        shippingFee: calculation.totalShippingFee,
        customsFee: calculation.totalOtherFee,
        targetWarehouseId: targetWarehouseId ? Number(targetWarehouseId) : null,
        customerId: null,
        equipmentId: null,
        trackingNumber: trackingNumber.trim() || null,
        etaDate: etaDate || null,
        notes: notes.trim() || null,
        items: validItems.map((it) => ({
          itemId: Number(it.itemId),
          quantity: Number(it.quantity),
          unitPriceEur: Number(it.unitPriceEur),
        })),
      };

      const res = initialOrder?.id
        ? await updateSparePartOrderAction(initialOrder.id, payload)
        : await createSparePartOrderAction(payload);

      if (res.ok) {
        toast.success(res.message);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || (initialOrder?.id ? 'Lỗi khi cập nhật phiếu mua hàng' : 'Lỗi khi lập phiếu mua hàng'));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  /**
   * Vẽ qua portal ra thẳng body như Modal dùng chung.
   *
   * Đặt trong cây nội dung thì position:fixed bám vào thẻ cha có stacking context
   * chứ không bám viewport: popup bị lọt xuống dưới thanh tiêu đề và canh lệch.
   * Ra body thì phủ kín cả header lẫn sidebar và canh giữa đều trên dưới.
   */
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          background: 'var(--surface-card)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 'min(1100px, 95vw)',
          maxHeight: '94vh',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-base, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-base, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-sunken, #f8fafc)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Truck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                  {initialOrder?.id ? `Chỉnh sửa Phiếu Mua Hàng: ${initialOrder.orderCode}` : 'Tạo Phiếu Mua Hàng Nhà Cung Cấp (PO)'}
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  PO Nhập Kho NCC
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Quản lý đặt hàng quốc tế / trong nước từ NCC — Tự động tính giá vốn về kho, cước vận chuyển và công nợ NCC
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          style={{
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Thông tin nhà cung cấp & tỉ giá */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 8,
              alignItems: 'start',
              padding: '8px 12px',
              background: 'var(--surface-sunken, #f8fafc)',
              borderRadius: 8,
              border: '1px solid var(--border-base, #e2e8f0)',
            }}
            className="po-header-grid"
          >
            <Field label="Nhà cung cấp" required>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="VD: Selmi (Ý), Taylor..."
                required
              />
            </Field>

            <Field label="Kho nhập dự kiến" required>
              <SearchableSelect
                value={String(targetWarehouseId ?? '')}
                onChange={(val) => setTargetWarehouseId(val ? Number(val) : '')}
                options={warehouses.map((w) => ({
                  value: String(w.id),
                  label: `[${w.code}] ${w.name}`,
                  subLabel: w.type === 'CENTRAL' ? 'Kho trung tâm' : 'Chi nhánh',
                  keywords: `${w.code} ${w.name}`,
                }))}
                placeholder="-- Chọn kho nhập --"
                searchPlaceholder="Tìm kho…"
              />
            </Field>

            <Field label="Tỉ giá EUR / VND" required>
              <PriceInput
                currency="VND"
                suffix="₫/€"
                value={exchangeRate}
                onChange={(val) => setExchangeRate(val || 32500)}
                placeholder="32,500"
                required
              />
            </Field>

            <Field label="Ngày về kho (ETA)">
              <Input
                type="date"
                value={etaDate}
                onChange={(e) => setEtaDate(e.target.value)}
              />
            </Field>
          </div>

          {/* Hướng dẫn quy trình Lô hàng khi bấm click */}
          {batchGuideOpen && (
            <div
              style={{
                padding: '9px 12px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: 8,
                fontSize: 12,
                color: '#166534',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Info size={15} style={{ flexShrink: 0, color: '#16a34a', marginTop: 1 }} />
                <div>
                  <strong>Quy trình Quản lý Lô Hàng:</strong> Đơn hàng này đại diện cho 1 lô hàng nhập mới từ nhà cung cấp. Khi lô hàng về kho và chuyển trạng thái sang <strong>&quot;Đã nhập kho&quot; (STOCKED)</strong>:
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 3, fontSize: 11.5 }}>
                    <span>• Hệ thống tự động ghi nhận phiếu nhập kho</span>
                    <span>• Tăng tồn kho thực tế của phụ tùng</span>
                    <span>• Tính giá vốn bình quân gia quyền</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBatchGuideOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#166534',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Đóng"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Bảng danh sách mặt hàng đặt mua */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={15} color="#2563eb" /> Danh sách mặt hàng đặt mua ({items.length} mặt hàng)
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewPartModalOpen(true)}
                  style={{ borderColor: '#bfdbfe', color: '#1d4ed8', background: '#eff6ff', fontSize: 11.5, height: 28, padding: '0 8px' }}
                >
                  <Plus size={12} /> Thêm phụ tùng mới
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAddItem}
                  style={{ fontSize: 11.5, height: 28, padding: '0 8px' }}
                >
                  <Plus size={12} /> Thêm dòng hàng
                </Button>
                <button
                  type="button"
                  onClick={() => setBatchGuideOpen((prev) => !prev)}
                  title="Bấm để xem quy trình Quản lý Lô Hàng"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#15803d',
                    background: batchGuideOpen ? '#bbf7d0' : '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '50%',
                    width: 26,
                    height: 26,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Info size={13} />
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 8, overflowX: 'auto', background: '#ffffff' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken, #f8fafc)', borderBottom: '1px solid var(--border-base, #e2e8f0)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>
                      Mặt hàng
                    </th>
                    <th style={{ padding: '8px 4px', textAlign: 'center', width: 60 }} title="Số lượng">
                      SL
                    </th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: 130 }} title={`Giá vốn: Nhập EUR (€), tự động quy đổi VNĐ theo tỉ giá ${exchangeRate.toLocaleString('vi-VN')} ₫/€`}>
                      <div>Giá mua NCC</div>
                      <div style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--text-muted)' }}>EUR (€) · VNĐ (₫)</div>
                    </th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', width: 110 }} title="Cước vận chuyển quốc tế phân bổ cho dòng">
                      Cước VC (₫)
                    </th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', width: 110 }} title="Phí khác / hải quan phân bổ cho dòng">
                      Phí khác (₫)
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', width: 140 }} title="Thành tiền vốn về kho = (Giá mua VNĐ x SL) + Cước VC + Phí khác">
                      Thành tiền vốn (₫)
                    </th>
                    <th style={{ padding: '8px 4px', width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const calc = calculation.calculatedItems[idx];
                    const selectedPart = allSpareParts.find((p) => p.id === Number(it.itemId));
                    const stockInfo = getPartStockQty(selectedPart, targetWarehouseId);
                    const selectedWh = warehouses.find((w: any) => w.id === Number(targetWarehouseId));
                    const whCode = selectedWh?.code;
                    const isStockPositive = (targetWarehouseId && stockInfo.whStock !== undefined ? stockInfo.whStock : stockInfo.totalStock) > 0 || stockInfo.totalStock > 0;

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border-base, #e2e8f0)',
                          background: idx % 2 === 1 ? '#fbfcfe' : '#ffffff',
                        }}
                      >
                        {/* 1. Mặt hàng */}
                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <SearchableSelect
                              sizeSm
                              triggerStyle={{ height: 26, minHeight: 26, fontSize: 12, padding: '0 8px' }}
                              value={String(it.itemId || '')}
                              onChange={(val) => handleItemChange(idx, 'itemId', val)}
                              options={itemOptions}
                              placeholder="-- Chọn mặt hàng --"
                              searchPlaceholder="Tìm theo mã hoặc tên mặt hàng…"
                              popoverMinWidth={340}
                              emptyText="Không tìm thấy mặt hàng phù hợp"
                            />
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                height: 24,
                                fontSize: 10.5,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {selectedPart ? (
                                <>
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
                                    Mã: <strong style={{ color: 'var(--text-strong, #0f172a)' }}>{selectedPart.itemCode}</strong>
                                  </span>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      background: isStockPositive ? '#f0fdf4' : '#fef2f2',
                                      color: isStockPositive ? '#15803d' : '#b91c1c',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      border: `1px solid ${isStockPositive ? '#bbf7d0' : '#fecaca'}`,
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {targetWarehouseId && stockInfo.whStock !== undefined ? (
                                      stockInfo.whStock === stockInfo.totalStock ? (
                                        <>
                                          Tồn [{whCode || 'Kho'}]: <strong>{stockInfo.whStock}</strong> {selectedPart.unit || 'cái'}
                                        </>
                                      ) : (
                                        <>
                                          Tồn [{whCode || 'Kho'}]: <strong>{stockInfo.whStock}</strong> · Toàn hệ thống: <strong>{stockInfo.totalStock}</strong> {selectedPart.unit || 'cái'}
                                        </>
                                      )
                                    ) : (
                                      <>
                                        Tồn toàn hệ thống: <strong>{stockInfo.totalStock}</strong> {selectedPart.unit || 'cái'}
                                      </>
                                    )}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        {/* 2. Số lượng */}
                        <td style={{ padding: '6px 2px', textAlign: 'center', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <Input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                              style={{ width: 50, textAlign: 'center', height: 26, padding: '0 2px', margin: '0 auto', fontSize: 12 }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {selectedPart?.unit || 'cái'}
                            </div>
                          </div>
                        </td>

                        {/* 3. Giá mua NCC: EURO (€) và VNĐ (₫) */}
                        <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                            <PriceInput
                              sizeSm
                              currency="EUR"
                              suffix="€"
                              allowDecimals
                              placeholder="0"
                              value={it.unitPriceEur}
                              onChange={(val) => handleItemChange(idx, 'unitPriceEur', val ?? 0)}
                              containerStyle={{ width: 116 }}
                              style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                              title={`Giá mua gốc EUR (€). Tỉ giá: ${exchangeRate.toLocaleString('vi-VN')} ₫/€`}
                            />
                            <PriceInput
                              sizeSm
                              currency="VND"
                              suffix="₫"
                              placeholder="0"
                              value={it.unitCostVnd}
                              onChange={(val) => handleItemChange(idx, 'unitCostVnd', val ?? 0)}
                              containerStyle={{ width: 116 }}
                              style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                              title="Giá mua quy đổi VNĐ"
                            />
                          </div>
                        </td>

                        {/* 4. Cước VC */}
                        <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                            <PriceInput
                              sizeSm
                              currency="VND"
                              suffix=""
                              value={it.shippingFee !== undefined ? it.shippingFee : defaultShippingFee * it.quantity}
                              onChange={(val) => handleItemChange(idx, 'shippingFee', val ?? 0)}
                              placeholder="0"
                              containerStyle={{ width: 100, marginLeft: 'auto' }}
                              style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {it.quantity > 1 ? `≈ ${Math.round((it.shippingFee || 0) / it.quantity).toLocaleString('vi-VN')} ₫/cái` : null}
                            </div>
                          </div>
                        </td>

                        {/* 5. Phí khác */}
                        <td style={{ padding: '6px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3, alignItems: 'flex-end' }}>
                            <PriceInput
                              sizeSm
                              currency="VND"
                              suffix=""
                              value={it.otherFee !== undefined ? it.otherFee : defaultCustomsFee * it.quantity}
                              onChange={(val) => handleItemChange(idx, 'otherFee', val ?? 0)}
                              placeholder="0"
                              containerStyle={{ width: 100, marginLeft: 'auto' }}
                              style={{ textAlign: 'right', fontWeight: 600, height: 26, fontSize: 11.5 }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {it.quantity > 1 ? `≈ ${Math.round((it.otherFee || 0) / it.quantity).toLocaleString('vi-VN')} ₫/cái` : null}
                            </div>
                          </div>
                        </td>

                        {/* 6. Thành tiền vốn */}
                        <td style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 3 }}>
                            <div style={{ fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap', fontSize: 12.5, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {calc ? calc.lineTotalVnd.toLocaleString('vi-VN') : 0} ₫
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'right', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              Tiền hàng: {(calc ? calc.subtotalVnd : 0).toLocaleString('vi-VN')} ₫
                            </div>
                          </div>
                        </td>

                        {/* 7. Xóa dòng */}
                        <td style={{ padding: '6px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
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
                    <td colSpan={7} style={{ padding: '6px 8px', background: '#eff6ff', borderTop: '1px dashed #bfdbfe' }}>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#2563eb',
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

                <tfoot>
                  {/* Hàng tổng cộng các cột */}
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-base, #cbd5e1)', fontWeight: 600 }}>
                    <td style={{ padding: '8px 8px', color: 'var(--text-strong)' }}>
                      Tổng cộng ({items.length} mặt hàng):
                    </td>
                    <td style={{ padding: '8px 2px', textAlign: 'center', fontWeight: 700, color: 'var(--text-strong)', fontSize: 11.5 }}>
                      {calculation.totalQty} cái
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, fontSize: 11 }}>
                      <div style={{ color: '#2563eb' }}>{calculation.subtotalEur.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                      <div style={{ color: '#334155' }}>{calculation.subtotalVnd.toLocaleString('vi-VN')} ₫</div>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#0284c7', fontSize: 11.5 }}>
                      {calculation.totalShippingFee.toLocaleString('vi-VN')} ₫
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#d97706', fontSize: 11.5 }}>
                      {calculation.totalOtherFee.toLocaleString('vi-VN')} ₫
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                      {calculation.totalVnd.toLocaleString('vi-VN')} ₫
                    </td>
                    <td></td>
                  </tr>

                  {/* Banner TỔNG GIÁ VỐN VỀ KHO (EUR & VND) */}
                  <tr style={{ background: '#eff6ff', borderTop: '2px solid #93c5fd', fontWeight: 800 }}>
                    <td
                      colSpan={5}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        textTransform: 'uppercase',
                        color: '#1e40af',
                        fontSize: 13,
                      }}
                    >
                      <div>TỔNG GIÁ VỐN VỀ KHO (EUR & VND):</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#3b82f6', textTransform: 'none', marginTop: 2 }}>
                        Tiền hàng mua NCC: {calculation.subtotalEur.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency === 'USD' ? '$' : currency === 'VND' ? '₫' : '€'} ({calculation.subtotalVnd.toLocaleString('vi-VN')} ₫)
                        {(calculation.totalShippingFee > 0 || calculation.totalOtherFee > 0) && (
                          <> · Cước VC & Phí: {(calculation.totalShippingFee + calculation.totalOtherFee).toLocaleString('vi-VN')} ₫</>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#1d4ed8' }}>
                      <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>
                        {calculation.subtotalEur.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency === 'USD' ? '$' : currency === 'VND' ? '₫' : '€'}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8' }}>
                        {calculation.totalVnd.toLocaleString('vi-VN')} ₫
                      </div>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Ghi chú & Mã vận đơn tracking */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Mã vận đơn quốc tế (nếu có)
              </label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="VD: DHL-94827104"
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Ghi chú đơn hàng
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Đặt hàng theo đợt bảo dưỡng Q3, phụ tùng máy Selmi..."
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} style={{ background: '#2563eb', color: '#fff' }}>
              {initialOrder?.id ? 'Cập nhật phiếu mua hàng' : 'Lập phiếu mua hàng (PO)'}
            </Button>
          </div>
        </form>
      </div>

      {newPartModalOpen && (
        <SparePartModal
          open={newPartModalOpen}
          pricingConfig={pricingConfig}
          onClose={() => setNewPartModalOpen(false)}
          onSuccess={handlePartCreated}
        />
      )}
    </div>,
    document.body
  );
}

interface OrderStatusModalProps {
  open: boolean;
  onClose: () => void;
  order: any;
  onSuccess?: () => void;
}

export function OrderStatusModal({
  open,
  onClose,
  order,
  onSuccess,
}: OrderStatusModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(order?.status || 'REQUESTED');
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber || '');
  const [etaDate, setEtaDate] = useState(
    order?.etaDate ? new Date(order.etaDate).toISOString().split('T')[0] : ''
  );
  const [notes, setNotes] = useState(order?.notes || '');
  const [inspectionNote, setInspectionNote] = useState(order?.inspectionNote || '');

  if (!open || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await updateSparePartOrderStatusAction(order.id, {
        status,
        trackingNumber: trackingNumber.trim() || null,
        etaDate: etaDate || null,
        notes: notes.trim() || null,
        inspectionNote: inspectionNote.trim() || null,
      });

      if (res.ok) {
        toast.success(res.message);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || 'Lỗi khi cập nhật trạng thái');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface-card)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-base, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-base, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-sunken, #f8fafc)',
          }}
        >
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
              Cập nhật Tiến trình Đơn hàng {order.orderCode}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Nhà cung cấp: {order.supplier} • {order.items?.length || 0} mặt hàng
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              Trạng thái Quá trình Nhập khẩu
            </label>
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: '100%', fontSize: 13, fontWeight: 600 }}
            >
              {Object.entries(ORDER_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>

            {status === 'ARRIVED_WAREHOUSE' && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  color: '#15803d',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <CheckCircle2 size={15} />
                <span>
                  Hàng đã về nhưng <strong>chưa vào tồn kho</strong>. Chuyển tiếp sang{' '}
                  <strong>Đang kiểm hàng</strong> rồi <strong>Đã nhập kho</strong> để ghi tồn.
                </span>
              </div>
            )}

            {status === 'STOCKED' && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  borderRadius: 8,
                  color: '#0f766e',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <CheckCircle2 size={15} />
                  <span>
                    Xác nhận kiểm hàng xong — hệ thống sẽ <strong>sinh phiếu nhập kho</strong> và tăng tồn kho.
                  </span>
                </div>
                <Input
                  placeholder="Kết quả kiểm hàng (VD: Đủ số lượng, không móp méo)"
                  value={inspectionNote}
                  onChange={(e) => setInspectionNote(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Mã vận đơn quốc tế (Airway / Tracking)
            </label>
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="VD: DHL-39482910"
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Ngày dự kiến về kho (ETA)
            </label>
            <Input
              type="date"
              value={etaDate}
              onChange={(e) => setEtaDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Ghi chú cập nhật
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Đang qua hải quan Nội Bài..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Đóng
            </Button>
            <Button type="submit" loading={loading} style={{ background: '#7c3aed', color: '#fff' }}>
              Cập nhật trạng thái
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
