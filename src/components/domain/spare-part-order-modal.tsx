'use client';

import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button, Field, Input, PriceInput, SearchableSelect } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  ORDER_STATUSES,
  VOLUME_DISCOUNT_TIERS,
  calculateSellingPriceFromMargin,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import {
  createSparePartOrderAction,
  updateSparePartOrderStatusAction,
} from '@/server/modules/spare-parts/actions';
import {
  Package,
  Plus,
  Trash2,
  Calculator,
  Plane,
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
  onSuccess?: () => void;
}

function getPartPriceInfo(
  part: any,
  exchangeRate: number,
  defaultShippingFee: number,
  defaultCustomsFee: number,
  marginPercent = 30,
  pricingMethod: 'MARGIN' | 'MARKUP' = 'MARGIN'
) {
  if (!part) {
    return {
      unitPriceEur: 0,
      unitCost: 0,
      sellingPrice: 0,
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

  // Parse custom fees from description if any
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

  const listSelling = part.sellingPrice && Number(part.sellingPrice) > 0 ? Number(part.sellingPrice) : 0;
  const baseSelling = unitCost > 0 ? calculateSellingPriceFromMargin(unitCost, marginPercent, pricingMethod) : 0;
  const formulaSelling = baseSelling > 0 ? baseSelling + unitShip + unitOther : 0;

  // Ưu tiên giá bán niêm yết của mặt hàng nếu đã có, nếu chưa thì dùng giá bán theo công thức Margin + cước
  const sellingPrice = listSelling > 0 ? listSelling : formulaSelling;

  return {
    unitPriceEur,
    unitCost,
    sellingPrice,
    unitShip,
    unitOther,
  };
}

export function SparePartOrderModal({
  open,
  onClose,
  spareParts,
  warehouses,
  customers = [],
  equipments = [],
  pricingConfig,
  companyInfo,
  onSuccess,
}: SparePartOrderModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [showDiscountTooltip, setShowDiscountTooltip] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portals need a browser document. Waiting until hydration also keeps the
  // server and client's initial markup aligned.
  useEffect(() => {
    setMounted(true);
  }, []);

  const [supplier, setSupplier] = useState('Selmi (Ý)');
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState<number>(
    pricingConfig?.defaultExchangeRateEur ?? 32500
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | ''>(
    warehouses[0]?.id || ''
  );
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [equipmentId, setEquipmentId] = useState<number | ''>('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [etaDate, setEtaDate] = useState('');
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState<number>(
    pricingConfig?.defaultVatRate ?? 8
  );

  useEffect(() => {
    if (pricingConfig?.defaultVatRate !== undefined) {
      setVatRate(pricingConfig.defaultVatRate);
    }
  }, [pricingConfig?.defaultVatRate]);

  const marginPercent = pricingConfig?.defaultMarginPercent ?? 30;
  const pricingMethod = pricingConfig?.pricingMethod ?? 'MARGIN';
  const defaultShippingFee = pricingConfig?.defaultShippingFee ?? 3500000;
  const defaultCustomsFee = pricingConfig?.defaultCustomsFee ?? 1000000;

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newPartModalOpen, setNewPartModalOpen] = useState(false);
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

  const initialPart = allSpareParts.find((p) => p.supplyType === 'ON_ORDER') || allSpareParts[0];
  const initialPrices = getPartPriceInfo(
    initialPart,
    exchangeRate,
    defaultShippingFee,
    defaultCustomsFee,
    marginPercent,
    pricingMethod
  );

  const [items, setItems] = useState<
    Array<{
      itemId: number | '';
      quantity: number;
      unitPriceEur: number;
      unitCostVnd?: number;
      sellingPrice?: number;
      shippingFee?: number;
      otherFee?: number;
    }>
  >([
    {
      itemId: initialPart?.id || '',
      quantity: 1,
      unitPriceEur: initialPrices.unitPriceEur,
      unitCostVnd: initialPrices.unitCost,
      sellingPrice: initialPrices.sellingPrice > 0 ? initialPrices.sellingPrice : undefined,
      shippingFee: initialPrices.unitShip,
      otherFee: initialPrices.unitOther,
    },
  ]);

  // Khi danh sách spareParts nạp xong sau khi mở modal: tự động cập nhật mặt hàng đầu tiên nếu chưa có
  useEffect(() => {
    if (allSpareParts.length > 0) {
      setItems((prev) => {
        if (prev.length === 1 && !prev[0].itemId) {
          const firstPart = allSpareParts.find((p) => p.supplyType === 'ON_ORDER') || allSpareParts[0];
          const prices = getPartPriceInfo(
            firstPart,
            exchangeRate,
            defaultShippingFee,
            defaultCustomsFee,
            marginPercent,
            pricingMethod
          );
          return [
            {
              itemId: firstPart?.id || '',
              quantity: 1,
              unitPriceEur: prices.unitPriceEur,
              unitCostVnd: prices.unitCost,
              sellingPrice: prices.sellingPrice > 0 ? prices.sellingPrice : undefined,
              shippingFee: prices.unitShip,
              otherFee: prices.unitOther,
            },
          ];
        }
        return prev;
      });
    }
  }, [allSpareParts, exchangeRate, defaultShippingFee, defaultCustomsFee, marginPercent, pricingMethod]);

  useEffect(() => {
    if (pricingConfig) {
      setItems((prev) =>
        prev.map((it) => {
          const qty = Number(it.quantity) || 1;
          return {
            ...it,
            shippingFee: it.shippingFee !== undefined ? it.shippingFee : (pricingConfig.defaultShippingFee ?? 3500000) * qty,
            otherFee: it.otherFee !== undefined ? it.otherFee : (pricingConfig.defaultCustomsFee ?? 1000000) * qty,
          };
        })
      );
    }
  }, [pricingConfig?.defaultShippingFee, pricingConfig?.defaultCustomsFee]);

  const handleAddItem = () => {
    const firstPart = allSpareParts[0];
    const prices = getPartPriceInfo(
      firstPart,
      exchangeRate,
      defaultShippingFee,
      defaultCustomsFee,
      marginPercent,
      pricingMethod
    );
    setItems((prev) => [
      ...prev,
      {
        itemId: firstPart?.id || '',
        quantity: 1,
        unitPriceEur: prices.unitPriceEur,
        unitCostVnd: prices.unitCost,
        sellingPrice: prices.sellingPrice > 0 ? prices.sellingPrice : undefined,
        shippingFee: prices.unitShip,
        otherFee: prices.unitOther,
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
      defaultCustomsFee,
      marginPercent,
      pricingMethod
    );
    setItems((prev) => [
      ...prev,
      {
        itemId: newPart.id,
        quantity: 1,
        unitPriceEur: prices.unitPriceEur,
        unitCostVnd: prices.unitCost,
        sellingPrice: prices.sellingPrice > 0 ? prices.sellingPrice : undefined,
        shippingFee: prices.unitShip,
        otherFee: prices.unitOther,
      },
    ]);
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
            defaultCustomsFee,
            marginPercent,
            pricingMethod
          );
          current.itemId = found.id;
          current.unitPriceEur = prices.unitPriceEur;
          current.unitCostVnd = prices.unitCost;
          current.sellingPrice = prices.sellingPrice > 0 ? prices.sellingPrice : undefined;
          const qty = Math.max(1, Number(current.quantity) || 1);
          current.shippingFee = prices.unitShip * qty;
          current.otherFee = prices.unitOther * qty;
        } else {
          current.itemId = '';
          current.unitPriceEur = 0;
          current.unitCostVnd = 0;
          delete current.sellingPrice;
        }
      }

      if (field === 'quantity') {
        const prevQty = Math.max(1, Number(next[index].quantity) || 1);
        const qty = Math.max(1, Number(val) || 1);
        current.quantity = qty;

        const part = allSpareParts.find((p) => p.id === Number(current.itemId) || String(p.id) === String(current.itemId));
        const eur = current.unitPriceEur !== undefined && Number(current.unitPriceEur) > 0
          ? Number(current.unitPriceEur)
          : Number(part?.priceEur || 0);
        const unitCost = current.unitCostVnd !== undefined && Number(current.unitCostVnd) > 0
          ? Number(current.unitCostVnd)
          : (eur > 0 ? Math.round(eur * rateNum) : Number(part?.costPrice || part?.avgCost || 0));
        const baseSelling = unitCost > 0
          ? calculateSellingPriceFromMargin(unitCost, marginPercent, pricingMethod)
          : 0;

        // Cước vận chuyển và phí khác tính theo số lượng (cước định mức cấu hình theo đơn vị mỗi cái)
        const unitShip = current.shippingFee !== undefined && prevQty > 0
          ? Math.round(current.shippingFee / prevQty)
          : defaultShippingFee;
        const unitOther = current.otherFee !== undefined && prevQty > 0
          ? Math.round(current.otherFee / prevQty)
          : defaultCustomsFee;

        // Tự động nhân theo số lượng mới: số lượng x2 = cước x2 (ví dụ 2 cái = 7tr)
        current.shippingFee = unitShip * qty;
        current.otherFee = unitOther * qty;

        const freightPerUnit = unitShip;
        const otherFeePerUnit = unitOther;
        const listSelling = part?.sellingPrice && Number(part.sellingPrice) > 0 ? Number(part.sellingPrice) : 0;
        const formulaSelling = baseSelling > 0 ? baseSelling + freightPerUnit + otherFeePerUnit : 0;
        const newSellingPrice = listSelling > 0 ? listSelling : formulaSelling;
        if (newSellingPrice > 0 && (current.sellingPrice === undefined || current.sellingPrice === 0)) {
          current.sellingPrice = newSellingPrice;
        }
      }

      if (field === 'unitPriceEur') {
        const eur = Math.max(0, Number(val) || 0);
        const costVnd = Math.round(eur * rateNum);
        current.unitPriceEur = eur;
        current.unitCostVnd = costVnd;

        const qty = Math.max(1, Number(current.quantity) || 1);
        const baseSelling = costVnd > 0
          ? calculateSellingPriceFromMargin(costVnd, marginPercent, pricingMethod)
          : 0;
        const ship = current.shippingFee !== undefined ? current.shippingFee : defaultShippingFee * qty;
        const other = current.otherFee !== undefined ? current.otherFee : defaultCustomsFee * qty;
        const freightPerUnit = Math.round(ship / qty);
        const otherFeePerUnit = Math.round(other / qty);
        const formulaSelling = baseSelling > 0 ? baseSelling + freightPerUnit + otherFeePerUnit : 0;
        current.sellingPrice = formulaSelling > 0 ? formulaSelling : 0;
      }

      if (field === 'unitCostVnd') {
        const costVnd = Math.max(0, Number(val) || 0);
        const eur = rateNum > 0 ? Number((costVnd / rateNum).toFixed(2)) : 0;
        current.unitCostVnd = costVnd;
        current.unitPriceEur = eur;

        const qty = Math.max(1, Number(current.quantity) || 1);
        const baseSelling = costVnd > 0
          ? calculateSellingPriceFromMargin(costVnd, marginPercent, pricingMethod)
          : 0;
        const ship = current.shippingFee !== undefined ? current.shippingFee : defaultShippingFee * qty;
        const other = current.otherFee !== undefined ? current.otherFee : defaultCustomsFee * qty;
        const freightPerUnit = Math.round(ship / qty);
        const otherFeePerUnit = Math.round(other / qty);
        const formulaSelling = baseSelling > 0 ? baseSelling + freightPerUnit + otherFeePerUnit : 0;
        current.sellingPrice = formulaSelling > 0 ? formulaSelling : 0;
      }

      if (field === 'shippingFee' || field === 'otherFee') {
        const numVal = Math.max(0, Number(val) || 0);
        current[field] = numVal;

        const part = allSpareParts.find((p) => p.id === Number(current.itemId) || String(p.id) === String(current.itemId));
        const qty = Math.max(1, Number(current.quantity) || 1);
        const eur = current.unitPriceEur !== undefined && Number(current.unitPriceEur) > 0
          ? Number(current.unitPriceEur)
          : Number(part?.priceEur || 0);
        const costVnd = current.unitCostVnd !== undefined && Number(current.unitCostVnd) > 0
          ? Number(current.unitCostVnd)
          : (eur > 0 ? Math.round(eur * rateNum) : Number(part?.costPrice || part?.avgCost || 0));

        const baseSelling = costVnd > 0
          ? calculateSellingPriceFromMargin(costVnd, marginPercent, pricingMethod)
          : 0;
        const ship = field === 'shippingFee' ? numVal : (current.shippingFee !== undefined ? current.shippingFee : defaultShippingFee * qty);
        const other = field === 'otherFee' ? numVal : (current.otherFee !== undefined ? current.otherFee : defaultCustomsFee * qty);
        const freightPerUnit = Math.round(ship / qty);
        const otherFeePerUnit = Math.round(other / qty);
        const formulaSelling = baseSelling > 0 ? baseSelling + freightPerUnit + otherFeePerUnit : 0;
        current.sellingPrice = formulaSelling > 0 ? formulaSelling : 0;
      }

      next[index] = current;
      return next;
    });
  };

  // Live calculation based on order pricing formulas
  const calculation = useMemo(() => {
    const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    let discountRate = 0;
    const tiers = pricingConfig?.volumeDiscountTiers ?? VOLUME_DISCOUNT_TIERS;
    for (const tier of tiers) {
      if (totalQty >= tier.min && totalQty <= tier.max) {
        discountRate = tier.rate;
        break;
      }
    }

    const calculatedItems = items.map((it) => {
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
      const subtotal = priceVnd * qty;
      const discount = Math.round(subtotal * discountRate);
      const finalPrice = subtotal - discount;

      const lineShipping = it.shippingFee !== undefined
        ? Math.max(0, Number(it.shippingFee) || 0)
        : (pricingConfig?.defaultShippingFee ?? 3500000) * qty;
      const lineOther = it.otherFee !== undefined
        ? Math.max(0, Number(it.otherFee) || 0)
        : (pricingConfig?.defaultCustomsFee ?? 1000000) * qty;

      const freightPerUnit = qty > 0 ? Math.round(lineShipping / qty) : 0;
      const otherFeePerUnit = qty > 0 ? Math.round(lineOther / qty) : 0;

      /**
       * Giá bán đề xuất theo quy tắc:
       * Margin (từ giá vốn gốc) + Phí vận chuyển + Phí khác.
       */
      const baseSellingPerUnit =
        unitCost > 0
          ? calculateSellingPriceFromMargin(unitCost, marginPercent, pricingMethod)
          : 0;

      const formulaSellingPerUnit =
        baseSellingPerUnit > 0
          ? baseSellingPerUnit + freightPerUnit + otherFeePerUnit
          : 0;

      const listSelling = part?.sellingPrice && Number(part.sellingPrice) > 0 ? Number(part.sellingPrice) : 0;
      const sellingPerUnit =
        it.sellingPrice !== undefined && it.sellingPrice > 0
          ? Number(it.sellingPrice)
          : (listSelling > 0 ? listSelling : formulaSellingPerUnit);

      const sellingSubtotal = qty * sellingPerUnit;

      return {
        ...it,
        eur,
        priceVnd,
        subtotal,
        discount,
        finalPrice,
        unitCost,
        shippingFee: lineShipping,
        otherFee: lineOther,
        freightPerUnit,
        otherFeePerUnit,
        baseSellingPerUnit,
        formulaSellingPerUnit,
        sellingPerUnit,
        sellingSubtotal,
      };
    });

    const subtotalVnd = calculatedItems.reduce((sum, it) => sum + it.subtotal, 0);
    const discountVnd = calculatedItems.reduce((sum, it) => sum + it.discount, 0);

    // Tổng cước VC và phí khác của toàn đơn:
    const totalShippingFee = calculatedItems.reduce((sum, it) => sum + it.shippingFee, 0);
    const totalOtherFee = calculatedItems.reduce((sum, it) => sum + it.otherFee, 0);

    // Tổng tiền hàng bán trước chiết khấu:
    const grossSellingTotalVnd = calculatedItems.reduce(
      (sum, it) => sum + it.sellingSubtotal,
      0
    );

    // Chiết khấu bán hàng theo tỷ lệ discountRate trên tổng tiền hàng:
    const sellingDiscountVnd = Math.round(grossSellingTotalVnd * discountRate);

    // Tiền hàng bán sau chiết khấu (Tổng cộng thanh toán trước VAT):
    const finalSellingTotalVnd = grossSellingTotalVnd - sellingDiscountVnd;

    // Thuế VAT:
    const vatPercentNum = Math.max(0, Number(vatRate) || 0);
    const vatAmountVnd = Math.round((finalSellingTotalVnd * vatPercentNum) / 100);
    const finalSellingTotalWithVatVnd = finalSellingTotalVnd + vatAmountVnd;

    const totalVnd = subtotalVnd - discountVnd + totalShippingFee + totalOtherFee;

    return {
      totalQty,
      discountRate,
      subtotalVnd,
      discountVnd,
      totalShippingFee,
      totalOtherFee,
      totalVnd,
      grossSellingTotalVnd,
      sellingDiscountVnd,
      sellingTotalVnd: finalSellingTotalVnd,
      vatPercentNum,
      vatAmountVnd,
      finalSellingTotalWithVatVnd,
      calculatedItems,
    };
  }, [items, exchangeRate, pricingConfig, vatRate, allSpareParts, marginPercent, pricingMethod]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validItems = items.filter((it) => it.itemId && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      toast.error('Vui lòng chọn ít nhất một linh kiện hợp lệ');
      return;
    }

    const trimmedNotes = notes.trim();
    const vatRateNum = Math.max(0, Number(vatRate) || 0);
    const notesWithVat = vatRateNum > 0
      ? (trimmedNotes ? `${trimmedNotes} [VAT: ${vatRateNum}%]` : `[VAT: ${vatRateNum}%]`)
      : trimmedNotes;

    setLoading(true);
    try {
      const res = await createSparePartOrderAction({
        supplier,
        currency,
        exchangeRate: Number(exchangeRate),
        shippingFee: calculation.totalShippingFee,
        customsFee: calculation.totalOtherFee,
        targetWarehouseId: targetWarehouseId ? Number(targetWarehouseId) : null,
        customerId: customerId ? Number(customerId) : null,
        equipmentId: equipmentId ? Number(equipmentId) : null,
        trackingNumber: trackingNumber.trim() || null,
        etaDate: etaDate || null,
        notes: notesWithVat || null,
        items: validItems.map((it) => ({
          itemId: Number(it.itemId),
          quantity: Number(it.quantity),
          unitPriceEur: Number(it.unitPriceEur),
        })),
      });

      if (res.ok) {
        toast.success(res.message);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message || 'Lỗi khi tạo đơn hàng order');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === Number(customerId));
  const selectedEquipment = equipments.find((e) => e.id === Number(equipmentId));

  const previewOrder = {
    orderCode: `NHAP-${new Date().getFullYear()}`,
    supplier,
    currency,
    exchangeRate,
    shippingFee: calculation.totalShippingFee,
    customsFee: calculation.totalOtherFee,
    discountRate: calculation.discountRate,
    discountVnd: calculation.sellingDiscountVnd,
    subtotalVnd: calculation.grossSellingTotalVnd,
    vatRate: calculation.vatPercentNum,
    vatAmountVnd: calculation.vatAmountVnd,
    totalVnd: calculation.finalSellingTotalWithVatVnd,
    customer: selectedCustomer,
    equipment: selectedEquipment,
    notes,
    items: calculation.calculatedItems.map((cIt) => {
      const found = allSpareParts.find((p) => p.id === Number(cIt.itemId));
      return {
        id: cIt.itemId,
        quantity: cIt.quantity,
        unitPriceEur: cIt.unitPriceEur,
        unitPriceVnd: cIt.priceVnd,
        sellingPriceVnd: cIt.sellingPerUnit,
        subtotalVnd: cIt.sellingSubtotal,
        shippingFee: cIt.shippingFee,
        customsFee: cIt.otherFee,
        item: found || { name: 'Linh kiện', itemCode: 'FK' },
      };
    }),
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
        background: quotationOpen ? 'transparent' : 'rgba(0, 0, 0, 0.55)',
        backdropFilter: quotationOpen ? 'none' : 'blur(3px)',
        pointerEvents: quotationOpen ? 'none' : 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          display: quotationOpen ? 'none' : 'flex',
          background: 'var(--surface-card)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 'min(1260px, 96vw)',
          maxHeight: '93vh',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-base, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-base, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-sunken, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plane size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                  Tạo Đơn Hàng Order / Lô Hàng Mới
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: '#ede9fe',
                    color: '#6d28d9',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  PO Nhập Kho
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Hiển thị và nhập trực tiếp Giá Vốn, Cước VC, Phí khác trên từng dòng hàng — Tự động tính giá bán đề xuất & hạch toán tồn kho khi về
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
              padding: 6,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Thông tin nhà cung cấp & tỉ giá */}
          <div
            style={{
              display: 'grid',
              /* Cố định 4 cột thay vì auto-fit: nhãn dài ngắn khác nhau nhưng các ô
                 vẫn thẳng hàng, không bị đẩy lệch khi một nhãn xuống hai dòng */
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 12,
              alignItems: 'start',
              padding: 14,
              background: 'var(--surface-sunken, #f8fafc)',
              borderRadius: 10,
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
                options={warehouses.map((w) => ({ value: String(w.id), label: w.name, subLabel: w.code }))}
                placeholder="-- Chọn kho --"
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

            {customers.length > 0 && (
              <Field label="Khách nhận báo giá" className="span-2">
                <SearchableSelect
                  value={String(customerId ?? '')}
                  onChange={(val) => setCustomerId(val ? Number(val) : '')}
                  options={[
                    { value: '', label: '-- Không gán khách cụ thể --' },
                    ...customers.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                      subLabel: c.phone || undefined,
                    })),
                  ]}
                  placeholder="-- Không gán khách cụ thể --"
                  searchPlaceholder="Tìm khách hàng…"
                />
              </Field>
            )}

            {equipments.length > 0 && (
              <Field label="Máy móc áp dụng" className="span-2">
                <SearchableSelect
                  value={String(equipmentId ?? '')}
                  onChange={(val) => setEquipmentId(val ? Number(val) : '')}
                  options={[
                    { value: '', label: '-- Không gán máy cụ thể --' },
                    ...equipments.map((eq) => ({
                      value: String(eq.id),
                      label: eq.name,
                      subLabel: eq.machineCode,
                      keywords: eq.machineCode,
                    })),
                  ]}
                  placeholder="-- Không gán máy cụ thể --"
                  searchPlaceholder="Tìm máy…"
                />
              </Field>
            )}
          </div>

          {/* Gợi ý quy trình Lô hàng mới */}
          <div
            style={{
              padding: '9px 12px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              fontSize: 12,
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={15} style={{ flexShrink: 0, color: '#16a34a' }} />
              <span>
                <strong>Quản lý Lô Hàng:</strong> Đơn hàng này đại diện cho 1 lô hàng nhập mới. Khi lô hàng về kho và chuyển trạng thái sang <strong>&quot;Đã nhập kho&quot; (STOCKED)</strong>, hệ thống tự động ghi nhận phiếu nhập kho, tăng tồn kho và tính giá vốn bình quân gia quyền.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setNewPartModalOpen(true)}
              style={{
                fontSize: 11.5,
                height: 28,
                padding: '0 10px',
                borderColor: '#86efac',
                background: '#ffffff',
                color: '#15803d',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Plus size={12} /> Thêm mới phụ tùng vào danh mục
            </Button>
          </div>

          {/* Bảng danh sách mặt hàng cần order (Máy móc & Phụ tùng) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={15} color="#7c3aed" /> Danh sách mặt hàng trong lô ({items.length} mặt hàng)
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewPartModalOpen(true)}
                  style={{ borderColor: '#ddd6fe', color: '#7c3aed', background: '#faf5ff', fontSize: 12 }}
                >
                  <Plus size={13} /> Thêm phụ tùng mới
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={handleAddItem} style={{ fontSize: 12 }}>
                  <Plus size={13} /> Thêm dòng hàng
                </Button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 10, overflowX: 'auto', background: '#ffffff' }}>
              <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken, #f8fafc)', borderBottom: '1px solid var(--border-base, #e2e8f0)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '9px 12px', textAlign: 'left', width: '28%' }}>
                      Mặt hàng
                    </th>
                    <th style={{ padding: '9px 6px', textAlign: 'center', width: '7%' }}>
                      Số lượng
                    </th>
                    <th style={{ padding: '9px 8px', textAlign: 'right', width: '13%' }} title="Đơn giá mua từ nhà cung cấp">
                      Giá vốn {currency === 'EUR' ? '(€)' : '(₫)'}
                    </th>
                    <th style={{ padding: '9px 8px', textAlign: 'right', width: '12%' }} title="Cước vận chuyển phân bổ cho dòng">
                      Cước VC (₫)
                    </th>
                    <th style={{ padding: '9px 8px', textAlign: 'right', width: '12%' }} title="Phí khác / hải quan phân bổ cho dòng">
                      Phí khác (₫)
                    </th>
                    <th style={{ padding: '9px 8px', textAlign: 'right', width: '15%' }} title="Giá bán đề xuất: Vốn + Margin + Cước + Phí">
                      Đơn giá bán (₫)
                    </th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', width: '11%' }} title="Thành tiền bán: Số lượng × Đơn giá bán">
                      Thành tiền (₫)
                    </th>
                    <th style={{ padding: '9px 4px', width: '2%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const calc = calculation.calculatedItems[idx];
                    const selectedPart = allSpareParts.find((p) => p.id === Number(it.itemId));
                    const isManualSelling = calc && it.sellingPrice !== undefined && it.sellingPrice !== calc.formulaSellingPerUnit;

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border-base, #e2e8f0)',
                          background: idx % 2 === 1 ? '#fbfcfe' : '#ffffff',
                        }}
                      >
                        {/* 1. Mặt hàng */}
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          <select
                            className="select"
                            value={it.itemId}
                            onChange={(e) => handleItemChange(idx, 'itemId', e.target.value)}
                            style={{ width: '100%', fontSize: 12 }}
                          >
                            <option value="__NEW_PART__" style={{ color: '#7c3aed', fontWeight: 600 }}>
                              ➕ + Tạo mã phụ tùng mới vào danh mục...
                            </option>
                            {machineItems.length > 0 && (
                              <optgroup label="🏭 Máy móc nguyên chiếc & Cụm máy">
                                {machineItems.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    [MÁY] [{p.itemCode}] {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="🔧 Linh kiện & Phụ tùng thay thế">
                              {partItems.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{p.itemCode}] {p.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>

                        {/* 2. Số lượng */}
                        <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <Input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                            style={{ width: 55, textAlign: 'center', margin: '0 auto', padding: '4px 6px' }}
                          />
                        </td>

                        {/* 3. Giá vốn */}
                        <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <div
                            style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
                            title={
                              currency === 'EUR'
                                ? `Quy đổi tương đương: ≈ ${(calc?.unitCost || 0).toLocaleString('vi-VN')} ₫ (Tỉ giá: ${exchangeRate.toLocaleString('vi-VN')} ₫/€)`
                                : undefined
                            }
                          >
                            {currency === 'EUR' ? (
                              <PriceInput
                                sizeSm
                                currency="EUR"
                                allowDecimals
                                placeholder="0"
                                value={it.unitPriceEur}
                                onChange={(val) => handleItemChange(idx, 'unitPriceEur', val ?? 0)}
                                style={{ width: 110, textAlign: 'right', fontWeight: 600 }}
                              />
                            ) : (
                              <PriceInput
                                sizeSm
                                currency="VND"
                                placeholder="0"
                                value={it.unitCostVnd}
                                onChange={(val) => handleItemChange(idx, 'unitCostVnd', val ?? 0)}
                                style={{ width: 110, textAlign: 'right', fontWeight: 600 }}
                              />
                            )}
                          </div>
                        </td>

                        {/* 4. Cước VC */}
                        <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <div
                            style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
                            title={
                              it.quantity > 1
                                ? `Cước VC: ${(it.shippingFee || 0).toLocaleString('vi-VN')} ₫ (≈ ${Math.round((it.shippingFee || 0) / it.quantity).toLocaleString('vi-VN')} ₫/cái cho ${it.quantity} cái)`
                                : undefined
                            }
                          >
                            <PriceInput
                              sizeSm
                              currency="VND"
                              value={it.shippingFee !== undefined ? it.shippingFee : defaultShippingFee * it.quantity}
                              onChange={(val) => handleItemChange(idx, 'shippingFee', val ?? 0)}
                              placeholder="0"
                              style={{ width: 110, textAlign: 'right', fontWeight: 600 }}
                            />
                          </div>
                        </td>

                        {/* 5. Phí khác */}
                        <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <div
                            style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
                            title={
                              it.quantity > 1
                                ? `Phí khác: ${(it.otherFee || 0).toLocaleString('vi-VN')} ₫ (≈ ${Math.round((it.otherFee || 0) / it.quantity).toLocaleString('vi-VN')} ₫/cái cho ${it.quantity} cái)`
                                : undefined
                            }
                          >
                            <PriceInput
                              sizeSm
                              currency="VND"
                              value={it.otherFee !== undefined ? it.otherFee : defaultCustomsFee * it.quantity}
                              onChange={(val) => handleItemChange(idx, 'otherFee', val ?? 0)}
                              placeholder="0"
                              style={{ width: 105, textAlign: 'right', fontWeight: 600 }}
                            />
                          </div>
                        </td>

                        {/* 6. Đơn giá bán */}
                        <td style={{ padding: '8px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            {isManualSelling && (
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'sellingPrice', calc.formulaSellingPerUnit)}
                                title={`Đã chỉnh giá tay (Giá đề xuất gốc: ${calc.formulaSellingPerUnit.toLocaleString('vi-VN')} ₫). Bấm vào đây để khôi phục giá đề xuất.`}
                                style={{
                                  background: '#fef3c7',
                                  border: '1px solid #fde68a',
                                  color: '#b45309',
                                  borderRadius: 4,
                                  padding: '4px 6px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  flexShrink: 0,
                                  lineHeight: 1,
                                }}
                              >
                                <RotateCcw size={11} />
                                <span>Gốc</span>
                              </button>
                            )}
                            <div
                              title={
                                isManualSelling
                                  ? `Đã chỉnh giá tay (Giá đề xuất gốc: ${calc.formulaSellingPerUnit.toLocaleString('vi-VN')} ₫). Bấm nút "Gốc" để khôi phục.`
                                  : 'Giá bán đề xuất: Vốn + Margin + Cước + Phí'
                              }
                            >
                              <PriceInput
                                sizeSm
                                currency="VND"
                                placeholder={calc && calc.formulaSellingPerUnit > 0 ? calc.formulaSellingPerUnit.toLocaleString('vi-VN') : '0'}
                                value={it.sellingPrice !== undefined ? it.sellingPrice : (calc?.sellingPerUnit || 0)}
                                onChange={(val) => handleItemChange(idx, 'sellingPrice', val ?? 0)}
                                style={{
                                  width: isManualSelling ? 100 : 120,
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: isManualSelling ? '#b45309' : '#0f9960',
                                  borderColor: isManualSelling ? '#f59e0b' : undefined,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 7. Thành tiền */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          {calc ? calc.sellingSubtotal.toLocaleString('vi-VN') : 0} ₫
                        </td>

                        {/* 8. Xóa dòng */}
                        <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                              title="Xóa dòng"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  {/* Hàng tổng cộng các cột */}
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-base, #cbd5e1)', fontWeight: 600 }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text-strong)' }}>
                      Tổng cộng ({items.length} mặt hàng):
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-strong)' }}>
                      {calculation.totalQty} cái
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                      {calculation.subtotalVnd.toLocaleString('vi-VN')} ₫
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                      {calculation.totalShippingFee.toLocaleString('vi-VN')} ₫
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>
                      {calculation.totalOtherFee.toLocaleString('vi-VN')} ₫
                    </td>
                    <td></td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)' }}>
                      {calculation.grossSellingTotalVnd.toLocaleString('vi-VN')} ₫
                    </td>
                    <td></td>
                  </tr>

                  {/* 2. Dòng chiết khấu: luôn hiển thị, nếu 0 thì để 0 đ; hover vào hiện tooltip chính sách chiết khấu */}
                  <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)', position: 'relative', zIndex: 100 }}>
                    <td
                      colSpan={6}
                      style={{
                        padding: '7px 10px',
                        textAlign: 'right',
                        color: calculation.discountRate > 0 ? '#b91c1c' : 'var(--text-muted)',
                        fontWeight: 600,
                        position: 'relative',
                        zIndex: 100,
                      }}
                    >
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          position: 'relative',
                          cursor: 'help',
                          zIndex: 1000,
                        }}
                        onMouseEnter={() => setShowDiscountTooltip(true)}
                        onMouseLeave={() => setShowDiscountTooltip(false)}
                        onClick={() => setShowDiscountTooltip((prev) => !prev)}
                      >
                        <span
                          style={{
                            borderBottom: '1px dashed currentColor',
                            paddingBottom: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Chiết khấu ({(calculation.discountRate * 100).toFixed(0)}%):
                          <Info size={13} style={{ opacity: 0.8 }} />
                        </span>

                        {showDiscountTooltip && (
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
                              {(pricingConfig?.volumeDiscountTiers ?? VOLUME_DISCOUNT_TIERS).map((tier, idx) => {
                                const isMatch =
                                  calculation.totalQty >= tier.min && calculation.totalQty <= tier.max;
                                const tierLabel =
                                  tier.min === tier.max
                                    ? `${tier.min} cái`
                                    : tier.max >= 99999
                                    ? `≥ ${tier.min} cái`
                                    : `${tier.min} – ${tier.max} cái`;
                                const rateLabel = `${(tier.rate * 100).toFixed(0)}%`;

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
                                      {rateLabel} {isMatch && '✓'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div
                              style={{
                                marginTop: 6,
                                paddingTop: 4,
                                borderTop: '1px dashed var(--border-base, #e2e8f0)',
                                fontSize: 11,
                                color: 'var(--text-muted, #64748b)',
                              }}
                            >
                              Tổng đơn: <strong>{calculation.totalQty} cái</strong>{' '}
                              {calculation.discountRate > 0
                                ? `(giảm ${(calculation.discountRate * 100).toFixed(0)}%)`
                                : '(chưa áp dụng chiết khấu)'}
                            </div>
                            {/* Arrow pointing down */}
                            <div
                              style={{
                                position: 'absolute',
                                bottom: -6,
                                right: 18,
                                width: 10,
                                height: 10,
                                background: 'inherit',
                                borderRight: '1px solid var(--border-base, #94a3b8)',
                                borderBottom: '1px solid var(--border-base, #94a3b8)',
                                transform: 'rotate(45deg)',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '7px 10px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: calculation.discountRate > 0 ? '#b91c1c' : 'var(--text-muted)',
                      }}
                    >
                      {calculation.discountRate > 0
                        ? `-${calculation.sellingDiscountVnd.toLocaleString('vi-VN')} ₫`
                        : '0 ₫'}
                    </td>
                    <td></td>
                  </tr>

                  {/* 3. Tiền hàng sau chiết khấu (chỉ hiển thị khi có chiết khấu > 0) */}
                  {calculation.discountRate > 0 && (
                    <tr style={{ background: '#f8fafc', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                      <td
                        colSpan={6}
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
                        }}
                      >
                        {calculation.sellingTotalVnd.toLocaleString('vi-VN')} ₫
                      </td>
                      <td></td>
                    </tr>
                  )}

                  {/* 4. Thuế VAT */}
                  <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                    <td
                      colSpan={6}
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
                            const isSelected = Number(vatRate) === rate;
                            return (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => setVatRate(rate)}
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
                                {rate === 0 ? '0% (Không VAT)' : `${rate}%`}
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
                            onChange={(e) => {
                              const val = e.target.value;
                              setVatRate(val === '' ? (0 as any) : Number(val));
                            }}
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
                        color: calculation.vatAmountVnd > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
                      }}
                    >
                      {calculation.vatAmountVnd > 0
                        ? `+${calculation.vatAmountVnd.toLocaleString('vi-VN')} ₫`
                        : '0 ₫'}
                    </td>
                    <td></td>
                  </tr>

                  {/* 5. Tổng cộng thanh toán */}
                  <tr style={{ background: '#f1f5f9', borderTop: '1px solid #94a3b8', fontWeight: 800 }}>
                    <td
                      colSpan={6}
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        textTransform: 'uppercase',
                        color: 'var(--text-strong)',
                        fontSize: 13,
                      }}
                    >
                      TỔNG CỘNG THANH TOÁN (VND){calculation.vatPercentNum > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#7c3aed', fontSize: 14 }}>
                      {calculation.finalSellingTotalWithVatVnd.toLocaleString('vi-VN')} ₫
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuotationOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #ddd6fe', color: '#6d28d9' }}
            >
              <FileDown size={15} /> Xuất Phiếu Báo Giá KH (A4 / PDF)
            </Button>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Hủy
              </Button>
              <Button type="submit" loading={loading} style={{ background: '#7c3aed', color: '#fff' }}>
                <Plane size={14} style={{ marginRight: 6 }} /> Xác nhận
              </Button>
            </div>
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

      {quotationOpen && (
        <SparePartQuotationModal
          open={quotationOpen}
          onClose={() => setQuotationOpen(false)}
          order={previewOrder}
          companyInfo={companyInfo}
          pricingConfig={pricingConfig}
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
