'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Button, Textarea, PriceInput, ImageUpload } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  PART_CATEGORIES,
  WAREHOUSE_TYPES,
  TRANSACTION_TYPES,
  type SaveSparePartInput,
  type SaveWarehouseInput,
  type SaveStockTransactionInput,
  type SparePartPricingConfig,
  calculateSellingPriceFromMargin,
  reasonCodesFor,
  isEquipmentCategory,
  calculateLandedCostAllocation,
} from '@/server/modules/spare-parts/types';
import { EQUIPMENT_CATEGORIES } from '@/server/modules/equipment/types';
import {
  saveSparePartAction,
  saveWarehouseAction,
  saveStockTransactionAction,
  updateSparePartOrderStatusAction,
} from '@/server/modules/spare-parts/actions';
import { Plus, Trash2, ArrowRight, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, PackagePlus, X, SlidersHorizontal, ChevronDown, ChevronUp, Calculator, Info } from 'lucide-react';
import { ItemPriceCalculatorModal } from './item-price-calculator-modal';
export { ItemPriceCalculatorModal };

/* ─────────────────────────────────────────────────────────
 * 1. MODAL THÊM / SỬA PHỤ TÙNG & MÁY MÓC (SparePartModal)
 * ───────────────────────────────────────────────────────── */

/** Đọc cước vận chuyển và phí khác được lưu kèm trong phần mô tả (nếu có) */
export function parseFeesFromDescription(desc?: string | null): { shippingFee?: number; otherFee?: number; cleanDesc: string } {
  if (!desc) return { cleanDesc: '' };
  const match = desc.match(/<!--fees:({.*?})-->/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      return {
        shippingFee: typeof data.shippingFee === 'number' ? data.shippingFee : undefined,
        otherFee: typeof data.otherFee === 'number' ? data.otherFee : (typeof data.customsFee === 'number' ? data.customsFee : undefined),
        cleanDesc: desc.replace(/<!--fees:{.*?}-->/, '').trim(),
      };
    } catch {}
  }
  return { cleanDesc: desc };
}

export function SparePartModal({
  open,
  part,
  pricingConfig,
  onClose,
  onSuccess,
  zIndex,
}: {
  open: boolean;
  part?: any;
  pricingConfig?: SparePartPricingConfig;
  onClose: () => void;
  onSuccess?: (item?: any) => void;
  zIndex?: number;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const eurExchangeRate = pricingConfig?.defaultExchangeRateEur ?? 32500;
  const marginPercent = pricingConfig?.defaultMarginPercent ?? 30;
  const pricingMethod = pricingConfig?.pricingMethod ?? 'MARGIN';
  const defaultShippingFee = Number(pricingConfig?.defaultShippingFee ?? 3500000);
  const defaultCustomsFee = Number(pricingConfig?.defaultCustomsFee ?? 1000000);

  const parsedDesc = useMemo(() => parseFeesFromDescription(part?.description), [part?.description]);

  // Cho phép tùy chỉnh Cước vận chuyển & Phí khác riêng cho từng phụ tùng / máy móc
  const [shippingFee, setShippingFee] = useState<number>(
    parsedDesc.shippingFee !== undefined ? parsedDesc.shippingFee : defaultShippingFee
  );
  const [otherFee, setOtherFee] = useState<number>(
    parsedDesc.otherFee !== undefined ? parsedDesc.otherFee : defaultCustomsFee
  );
  const [priceCalcOpen, setPriceCalcOpen] = useState<boolean>(false);

  const [form, setForm] = useState<SaveSparePartInput>({
    itemCode: part?.itemCode || '',
    name: part?.name || '',
    category: part?.category || 'SPARE_PART',
    supplyType: part?.supplyType || 'READY_STOCK',
    unit: part?.unit || 'Chiếc',
    compatibleWith: part?.compatibleWith || '',
    minStockAlert: part?.minStockAlert ?? 5,
    costPrice: part?.costPrice ? Number(part.costPrice) : undefined,
    sellingPrice: part?.sellingPrice ? Number(part.sellingPrice) : undefined,
    priceEur: part?.priceEur ? Number(part.priceEur) : undefined,
    priceUsd: part?.priceUsd ? Number(part.priceUsd) : undefined,
    lifespan: part?.lifespan || '',
    leadTimeDays: part?.leadTimeDays ?? 14,
    manufacturer: part?.manufacturer || '',
    fnbCategory: part?.fnbCategory || 'OTHER',
    description: parsedDesc.cleanDesc || part?.description || '',
    imageUrl: part?.imageUrl || '',
    status: part?.status || 'ACTIVE',
  });

  const isMachine = form.category === 'EQUIPMENT' || form.category === 'MACHINE';

  // Effective cost price: from costPrice or estimated from priceEur
  const effectiveCost =
    form.costPrice && form.costPrice > 0
      ? form.costPrice
      : form.priceEur && form.priceEur > 0
      ? Math.round(form.priceEur * eurExchangeRate)
      : 0;

  // 1. Giá bán lẻ tiêu chuẩn theo Margin
  const suggestedRetailPrice =
    effectiveCost > 0
      ? calculateSellingPriceFromMargin(effectiveCost, marginPercent, pricingMethod)
      : 0;

  // 2. Tổng cước và phí khác (theo cước phí đã nhập cho phụ tùng / máy móc này)
  const totalImportFees = Math.max(0, Number(shippingFee) || 0) + Math.max(0, Number(otherFee) || 0);

  // 3. Giá trọn gói nhập khẩu gồm Cước VC + Phí khác
  const suggestedImportPrice =
    suggestedRetailPrice > 0 && totalImportFees > 0
      ? suggestedRetailPrice + totalImportFees
      : suggestedRetailPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let finalDesc = form.description?.trim() || '';
    if (shippingFee !== defaultShippingFee || otherFee !== defaultCustomsFee) {
      finalDesc = finalDesc
        ? `${finalDesc}\n<!--fees:${JSON.stringify({ shippingFee, otherFee })}-->`
        : `<!--fees:${JSON.stringify({ shippingFee, otherFee })}-->`;
    }

    const res = await saveSparePartAction(part?.id || null, {
      ...form,
      description: finalDesc,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.(res.item);
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  const isMachinePart =
    part?.category === 'EQUIPMENT' ||
    part?.category === 'MACHINE' ||
    form.category === 'EQUIPMENT' ||
    form.category === 'MACHINE';

  const modalTitle = part
    ? `${isMachinePart ? 'Sửa thiết bị' : 'Sửa phụ tùng'}: ${part.itemCode}`
    : isMachinePart
    ? 'Thêm mới Thiết bị'
    : 'Thêm mới Phụ tùng / Linh kiện';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="lg"
      zIndex={zIndex}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!part && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: 11.5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Info size={14} style={{ flexShrink: 0, color: '#2563eb' }} />
            <span>Khai báo danh mục: mã mới tạo với tồn kho = 0. Hàng thực tế ghi tồn khi lập phiếu nhập kho hoặc đơn hàng order.</span>
          </div>
        )}

        {/* Hàng 1: Tên & Phân loại (& Loại máy F&B nếu có) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ gridColumn: isEquipmentCategory(form.category) ? 'span 1' : 'span 2' }}>
            <Field label="Tên phụ tùng / linh kiện" required>
              <Input
                required
                placeholder="VD: Bo nguồn Micron 25, Cảm biến PT100..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Phân loại">
            <select
              className="select"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as any })}
            >
              {Object.entries(PART_CATEGORIES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </Field>

          {isEquipmentCategory(form.category) && (
            <Field label="Loại máy F&B">
              <select
                className="select"
                value={form.fnbCategory || 'OTHER'}
                onChange={(e) => setForm({ ...form, fnbCategory: e.target.value })}
              >
                {Object.entries(EQUIPMENT_CATEGORIES).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Hàng 2: Hãng SX, Dòng máy tương thích, Hình thức cung ứng */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Field label="Hãng sản xuất / Thương hiệu">
            <Input
              placeholder="Selmi, Taylor, Omron, Bando..."
              value={form.manufacturer || ''}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            />
          </Field>

          <Field label="Dòng máy tương thích">
            <Input
              placeholder="VD: Selmi Micron 25, Legend 24..."
              value={form.compatibleWith || ''}
              onChange={(e) => setForm({ ...form, compatibleWith: e.target.value })}
            />
          </Field>

          <Field label="Hình thức cung ứng">
            <select
              className="select"
              value={form.supplyType}
              onChange={(e) => setForm({ ...form, supplyType: e.target.value as any })}
            >
              <option value="READY_STOCK">Hàng có sẵn trong kho</option>
              <option value="ON_ORDER">Hàng order (Nhập khẩu)</option>
            </select>
          </Field>
        </div>

        {/* Hàng 3: Đơn vị tính, Cảnh báo tồn, Vòng đời linh kiện */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Field label="Đơn vị tính" required>
            <Input
              required
              placeholder="Chiếc, Bộ, Cụm, Cái..."
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </Field>

          <Field label="Cảnh báo tồn tối thiểu">
            <Input
              type="number"
              min={0}
              value={form.minStockAlert}
              onChange={(e) => setForm({ ...form, minStockAlert: Number(e.target.value) })}
            />
          </Field>

          <Field label="Vòng đời linh kiện">
            <Input
              placeholder="Trên 12 tháng, 24 tháng..."
              value={form.lifespan || ''}
              onChange={(e) => setForm({ ...form, lifespan: e.target.value })}
            />
          </Field>
        </div>

        {/* Hàng 4: Giá và Ngoại tệ - Chuẩn 3 cột cân đối, không lệch */}
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--surface-sunken)',
            borderRadius: 8,
            border: '1px solid var(--border-base)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <Field label="Giá gốc EUR (€)">
            <PriceInput
              currency="EUR"
              placeholder="VD: 104, 487.5..."
              value={form.priceEur}
              onChange={(eur) => {
                setForm({
                  ...form,
                  priceEur: eur,
                  costPrice:
                    form.costPrice || !eur
                      ? form.costPrice
                      : Math.round((eur || 0) * eurExchangeRate),
                });
              }}
            />
            {Boolean(form.priceEur && Number(form.priceEur) > 0) && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                ≈ {Math.round((form.priceEur || 0) * eurExchangeRate).toLocaleString('vi-VN')} ₫
              </div>
            )}
          </Field>

          <Field label="Giá vốn VND (quy đổi)">
            <PriceInput
              currency="VND"
              placeholder="Giá nhập kho VND"
              showInWords
              value={form.costPrice}
              onChange={(val) =>
                setForm({
                  ...form,
                  costPrice: val,
                })
              }
            />
          </Field>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" style={{ marginBottom: 0, fontSize: 12 }}>Giá bán lẻ (₫)</label>
              <button
                type="button"
                onClick={() => setPriceCalcOpen(true)}
                style={{
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  border: '1px solid #ddd6fe',
                  borderRadius: 4,
                  padding: '1.5px 6px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  lineHeight: 1.2,
                }}
                title="Mở popup tính giá đề xuất theo margin & chi phí"
              >
                <Calculator size={11} />
                Tính giá đề xuất
              </button>
            </div>
            <PriceInput
              currency="VND"
              placeholder="Giá bán lẻ VND"
              showInWords
              value={form.sellingPrice}
              onChange={(val) =>
                setForm({
                  ...form,
                  sellingPrice: val,
                })
              }
            />
          </div>

          {(shippingFee !== defaultShippingFee || otherFee !== defaultCustomsFee) && (
            <div
              style={{
                gridColumn: 'span 3',
                fontSize: 11,
                color: '#7c3aed',
                background: '#faf5ff',
                border: '1px dashed #ddd6fe',
                borderRadius: 4,
                padding: '3px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🚚 Cước VC: <strong>{shippingFee.toLocaleString('vi-VN')}₫</strong> · Phí khác: <strong>{otherFee.toLocaleString('vi-VN')}₫</strong></span>
            </div>
          )}
        </div>

        {/* Hàng 5: Mô tả kỹ thuật & Hình ảnh phụ tùng */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
          <div style={{ gridColumn: 'span 1' }}>
            <Field label="Mô tả kỹ thuật & thông số">
              <Input
                placeholder="Vật liệu, kích thước, chi tiết..."
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <ImageUpload
              label="Hình ảnh phụ tùng / linh kiện"
              placeholder="https://... hoặc tải ảnh trực tiếp từ máy"
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang lưu...' : part ? 'Cập nhật' : 'Thêm mới'}
          </Button>
        </div>
      </form>

      {priceCalcOpen && (
        <ItemPriceCalculatorModal
          open={priceCalcOpen}
          onClose={() => setPriceCalcOpen(false)}
          itemName={form.name}
          itemCode={form.itemCode}
          category={form.category}
          priceEur={form.priceEur}
          costPrice={form.costPrice}
          currentSellingPrice={form.sellingPrice}
          pricingConfig={pricingConfig}
          initialShippingFee={shippingFee}
          initialOtherFee={otherFee}
          onApply={(newPrice, newShip, newOther) => {
            setForm((prev) => ({ ...prev, sellingPrice: newPrice }));
            setShippingFee(newShip);
            setOtherFee(newOther);
          }}
        />
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
 * 2. MODAL GIAO DỊCH KHO: NHẬP / XUẤT / ĐIỀU CHUYỂN (StockTransactionModal)
 * ───────────────────────────────────────────────────────── */

/** Giá trị riêng của dòng "tạo mã mới" trong dropdown chọn linh kiện. */
const NEW_PART_OPTION = '__NEW_PART__';
export function StockTransactionModal({
  open,
  defaultType = 'IN',
  warehouses,
  spareParts,
  initialItemId,
  pendingOrders = [],
  lockType = false,
  onClose,
  onSuccess,
}: {
  open: boolean;
  defaultType?: 'IN' | 'OUT' | 'TRANSFER';
  /** Đã chọn loại phiếu ở bước trước — ẩn hàng chọn loại, vào thẳng phần nhập liệu. */
  lockType?: boolean;
  warehouses: any[];
  spareParts: any[];
  initialItemId?: number;
  /** Phiếu đặt hàng đã về nhưng chưa nhập kho — nhập theo phiếu thay vì gõ tay. */
  pendingOrders?: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<'IN' | 'OUT' | 'TRANSFER'>(defaultType);
  const defaultWarehouse = useMemo(() => {
    if (!warehouses || warehouses.length === 0) return undefined;
    return (
      warehouses.find(
        (w) =>
          (w.type === 'CENTRAL' || w.code === 'WH-HN' || w.code === 'WH-HN-CENTRAL') &&
          (w.status === 'ACTIVE' || !w.status)
      ) ||
      warehouses.find((w) => w.type === 'CENTRAL') ||
      warehouses.find((w) => w.status === 'ACTIVE' || !w.status) ||
      warehouses[0]
    );
  }, [warehouses]);

  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | undefined>(
    () => defaultWarehouse?.id || (warehouses.length > 0 ? warehouses[0].id : undefined)
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | undefined>(() => {
    if (defaultType === 'IN') return defaultWarehouse?.id || warehouses[0]?.id;
    return warehouses.length > 1 ? warehouses[1].id : warehouses[0]?.id;
  });

  useEffect(() => {
    if (warehouses.length > 0 && defaultWarehouse) {
      if (!sourceWarehouseId) {
        setSourceWarehouseId(defaultWarehouse.id);
      }
      if (!targetWarehouseId) {
        if (type === 'IN') {
          setTargetWarehouseId(defaultWarehouse.id);
        } else {
          const other = warehouses.find((w) => w.id !== defaultWarehouse.id) || defaultWarehouse;
          setTargetWarehouseId(other.id);
        }
      }
    }
  }, [warehouses, defaultWarehouse, sourceWarehouseId, targetWarehouseId, type]);
  const [reason, setReason] = useState(
    defaultType === 'IN'
      ? 'Nhập kho lô phụ tùng mới từ nhà sản xuất'
      : defaultType === 'OUT'
      ? 'Xuất linh kiện thay thế sửa chữa máy'
      : 'Điều chuyển cơ số linh kiện giữa các kho phụ tùng'
  );
  const [note, setNote] = useState('');
  const today = new Date();
  const [transDate, setTransDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  );
  const [partnerName, setPartnerName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  /** Nhập kho theo phiếu đặt hàng: khóa số lượng theo phiếu và chốt luôn trạng thái phiếu. */
  const [fromOrderId, setFromOrderId] = useState<number | ''>('');
  const [reasonCode, setReasonCode] = useState(
    defaultType === 'IN' ? 'OTHER_IN' : defaultType === 'OUT' ? 'OTHER_OUT' : 'WAREHOUSE_TRANSFER',
  );
  const [shippingFee, setShippingFee] = useState<number | undefined>(undefined);
  const [otherFee, setOtherFee] = useState<number | undefined>(undefined);
  const [allocationMethod, setAllocationMethod] = useState<'QUANTITY' | 'VALUE'>('QUANTITY');

  const [items, setItems] = useState<
    Array<{ itemId: number; quantity: number; unitPrice?: number; allocatedShipping?: number; allocatedOtherFee?: number }>
  >([
    {
      itemId: initialItemId || (spareParts.length > 0 ? spareParts[0].id : 1),
      quantity: 1,
      unitPrice: initialItemId
        ? Number(spareParts.find((p) => p.id === initialItemId)?.costPrice || 0)
        : undefined,
    },
  ]);

  /**
   * Mã vừa tạo nhanh ngay trong phiếu — chưa có trong danh sách server truyền
   * xuống, nên giữ tại đây để dropdown chọn được mà không phải tải lại màn hình.
   */
  const [newParts, setNewParts] = useState<any[]>([]);
  /** Gộp danh sách, bỏ trùng: sau khi tạo mã thì server cũng làm mới prop spareParts. */
  const allParts = [...newParts, ...spareParts].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );

  /** Dòng đang chờ gán mã mới; null nghĩa là không mở khung tạo nhanh. */
  const [quickRow, setQuickRow] = useState<number | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const emptyQuick = {
    name: '',
    itemCode: '',
    category: 'SPARE_PART',
    unit: 'Chiếc',
    costPrice: undefined as number | undefined,
  };
  const [quick, setQuick] = useState(emptyQuick);

  const openQuickCreate = (rowIndex: number) => {
    setQuick(emptyQuick);
    setQuickRow(rowIndex);
  };

  const handleQuickCreate = async () => {
    if (!quick.name.trim()) {
      toast.error('Vui lòng nhập tên phụ tùng');
      return;
    }

    setQuickSaving(true);
    const res = await saveSparePartAction(null, {
      // Bỏ trống mã thì hệ thống tự sinh SP-YYYY-XXXX
      itemCode: quick.itemCode.trim(),
      name: quick.name.trim(),
      category: quick.category,
      supplyType: 'READY_STOCK',
      unit: quick.unit.trim() || 'Chiếc',
      minStockAlert: 5,
      costPrice: quick.costPrice,
      leadTimeDays: 14,
      status: 'ACTIVE',
    } as SaveSparePartInput);
    setQuickSaving(false);

    if (!res.ok || !res.item) {
      toast.error(res.message || 'Không tạo được mã phụ tùng');
      return;
    }

    const created: any = res.item;
    setNewParts((prev) => [...prev, created]);

    // Gán thẳng mã mới vào đúng dòng đã bấm tạo
    if (quickRow !== null) {
      setItems((prev) =>
        prev.map((row, i) =>
          i === quickRow
            ? { ...row, itemId: created.id, unitPrice: Number(created.costPrice || 0) || undefined }
            : row,
        ),
      );
    }

    setQuickRow(null);
    toast.success(`Đã tạo mã ${created.itemCode} và chọn vào phiếu`);
  };

  const handleSelectOrder = (id: number | '') => {
    setFromOrderId(id);
    if (!id) return;

    const po = pendingOrders.find((o: any) => o.id === Number(id));
    if (!po) return;

    setShippingFee(Number(po.shippingFee || 0) || undefined);
    setOtherFee(Number(po.customsFee || 0) || undefined);

    setItems(
      (po.items || []).map((it: any) => ({
        itemId: it.itemId,
        quantity: it.quantity,
        unitPrice: Number(it.finalPriceVnd) / (it.quantity || 1),
      })),
    );
    if (po.targetWarehouseId) setTargetWarehouseId(po.targetWarehouseId);
    setReason(`Nhập kho từ phiếu đặt hàng ${po.orderCode} (${po.supplier})`);
  };

  const handleAddItem = () => {
    if (spareParts.length === 0) return;
    setItems([
      ...items,
      {
        itemId: spareParts[0].id,
        quantity: 1,
        unitPrice: Number(spareParts[0].costPrice || 0) || undefined,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, val: any) => {
    const updated = [...items];
    if (field === 'itemId') {
      const selected = allParts.find((p) => p.id === Number(val));
      updated[index] = {
        ...updated[index],
        itemId: Number(val),
        unitPrice: Number(selected?.costPrice || 0) || undefined,
      };
    } else {
      updated[index] = { ...updated[index], [field]: val };
    }
    setItems(updated);
  };

  /**
   * Khi cước / phí tổng hoặc phương thức phân bổ thay đổi → tính lại và gán vào
   * từng dòng item. Người dùng vẫn có thể sửa tay sau đó.
   */
  const prevAllocRef = React.useRef('');
  React.useEffect(() => {
    if (type !== 'IN') return;
    const sf = Number(shippingFee || 0);
    const of = Number(otherFee || 0);
    // Chỉ chạy khi tổng cước hoặc phương thức đổi, không chạy khi user sửa item
    const key = `${sf}|${of}|${allocationMethod}|${items.map(i => `${i.itemId}:${i.quantity}:${i.unitPrice ?? 0}`).join(',')}`;
    if (prevAllocRef.current === key) return;
    prevAllocRef.current = key;

    const calc = calculateLandedCostAllocation(
      items.map((it) => ({
        itemId: it.itemId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        baseUnitPrice: it.unitPrice,
      })),
      sf,
      of,
      allocationMethod,
    );
    // Gán giá trị phân bổ mặc định vào từng dòng
    setItems((prev) =>
      prev.map((row, idx) => {
        const m = calc.items[idx];
        if (!m) return row;
        return {
          ...row,
          allocatedShipping: m.allocatedShipping,
          allocatedOtherFee: m.allocatedOtherFee,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, shippingFee, otherFee, allocationMethod, items.length, ...items.map(i => `${i.itemId}|${i.quantity}|${i.unitPrice ?? 0}`)]);

  /** Tính toán tổng hợp chi phí lô hàng từ giá trị PER-ITEM thực tế (có thể đã sửa tay). */
  const liveMetrics = React.useMemo(() => {
    if (type !== 'IN') return null;
    const merchandiseTotal = items.reduce((s, it) => s + (Number(it.unitPrice || 0) * it.quantity), 0);
    const totalShipping = items.reduce((s, it) => s + (Number(it.allocatedShipping || 0) * it.quantity), 0);
    const totalOther = items.reduce((s, it) => s + (Number(it.allocatedOtherFee || 0) * it.quantity), 0);
    const totalLandedCost = merchandiseTotal + totalShipping + totalOther;
    return { merchandiseTotal, totalShipping, totalOther, totalLandedCost };
  }, [type, items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Nhập theo phiếu → đi qua luồng cập nhật trạng thái phiếu để tồn kho
    // chỉ được ghi một lần duy nhất và đơn hàng khách được báo có hàng.
    if (type === 'IN' && fromOrderId) {
      const res = await updateSparePartOrderStatusAction(Number(fromOrderId), {
        status: 'STOCKED',
        inspectionNote: note || null,
        shippingFee: Number(shippingFee || 0),
        customsFee: Number(otherFee || 0),
      } as any);
      setLoading(false);
      if (res.ok) {
        toast.success('Đã nhập kho theo phiếu và cập nhật tồn kho');
        onSuccess();
        onClose();
      } else {
        toast.error(res.message || 'Lỗi khi nhập kho theo phiếu');
      }
      return;
    }

    const payload: SaveStockTransactionInput = {
      type,
      reasonCode,
      sourceWarehouseId: type === 'IN' ? undefined : sourceWarehouseId,
      targetWarehouseId: type === 'OUT' ? undefined : targetWarehouseId,
      reason,
      transDate,
      partnerName: partnerName || undefined,
      refNo: refNo || undefined,
      deliveredBy: deliveredBy || undefined,
      receivedBy: receivedBy || undefined,
      note: note || undefined,
      shippingFee: type === 'IN' ? Number(shippingFee || 0) : undefined,
      otherFee: type === 'IN' ? Number(otherFee || 0) : undefined,
      allocationMethod: type === 'IN' ? allocationMethod : undefined,
      items: items.map((it) => {
        const ship = type === 'IN' ? Number(it.allocatedShipping || 0) : 0;
        const other = type === 'IN' ? Number(it.allocatedOtherFee || 0) : 0;
        const landed = (Number(it.unitPrice || 0)) + ship + other;
        return {
          itemId: it.itemId,
          quantity: it.quantity,
          baseUnitPrice: it.unitPrice,
          unitPrice: it.unitPrice,
          allocatedShipping: type === 'IN' ? ship : undefined,
          allocatedOtherFee: type === 'IN' ? other : undefined,
          landedCost: type === 'IN' ? landed : undefined,
        };
      }),
    };

    const res = await saveStockTransactionAction(payload);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  const typeConfig = TRANSACTION_TYPES[type];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Phiếu Giao dịch Kho:</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 700,
              background: typeConfig.bg,
              color: typeConfig.color,
            }}
          >
            {typeConfig.label}
          </span>
        </div>
      }
      size="xl"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Loại phiếu đã chọn ở bước trước nên không hỏi lại; chỉ cho đổi khi
            modal được mở thẳng, không qua màn chọn loại. */}
        {!lockType && (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['IN', 'OUT', 'TRANSFER'] as const).map((t) => {
            const cfg = TRANSACTION_TYPES[t];
            const isSelected = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  setReason(
                    t === 'IN'
                      ? 'Nhập kho lô phụ tùng mới từ nhà sản xuất'
                      : t === 'OUT'
                      ? 'Xuất linh kiện thay thế sửa chữa máy'
                      : 'Điều chuyển cơ số linh kiện giữa các kho phụ tùng'
                  );
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? `2px solid ${cfg.color}` : '1px solid var(--border-base)',
                  background: isSelected ? cfg.bg : 'var(--surface-sunken)',
                  color: isSelected ? cfg.color : 'var(--text-muted)',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                {t === 'IN' ? (
                  <ArrowDownToLine size={16} />
                ) : t === 'OUT' ? (
                  <ArrowUpFromLine size={16} />
                ) : (
                  <ArrowLeftRight size={16} />
                )}
                {cfg.label}
              </button>
            );
          })}
        </div>
        )}

        {/* Phần đầu chứng từ — ngày, đối tác, số hóa đơn đối chiếu */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-base)',
          }}
        >
          <Field label="Ngày chứng từ" required hint="Ngày hàng thực nhận / thực xuất">
            <Input
              type="date" required sizeSm
              value={transDate}
              onChange={(e) => setTransDate(e.target.value)}
            />
          </Field>

          {type !== 'TRANSFER' && (
            <Field label={type === 'IN' ? 'Đơn vị giao hàng' : 'Đơn vị nhận hàng'}>
              <Input
                sizeSm
                placeholder={type === 'IN' ? 'Nhà cung cấp, khách trả lại…' : 'Khách hàng, đơn vị nhận…'}
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
              />
            </Field>
          )}

          <Field label="Số hóa đơn / phiếu giao" hint="Chứng từ của bên kia, để đối chiếu">
            <Input
              sizeSm placeholder="VD: HD-0012345"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Lý do nhập/xuất kho" required>
          <select
            className="select"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            required
          >
            {reasonCodesFor(type).map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
                {r.needsApproval ? ' (cần duyệt)' : ''}
              </option>
            ))}
          </select>
        </Field>

        {/* Nhập theo phiếu đặt hàng đã về */}
        {type === 'IN' && pendingOrders.length > 0 && (
          <Field label="Nhập kho theo phiếu đặt hàng (tùy chọn)">
            <select
              className="select"
              value={fromOrderId}
              onChange={(e) => handleSelectOrder(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">-- Nhập kho tự do, không theo phiếu --</option>
              {pendingOrders.map((po: any) => (
                <option key={po.id} value={po.id}>
                  {po.orderCode} · {po.supplier} · {po.items?.length || 0} mặt hàng
                  {po.customerOrder ? ` · cho đơn ${po.customerOrder.orderCode}` : ' · nhập kho dự trữ'}
                </option>
              ))}
            </select>
            {fromOrderId ? (
              <div style={{ fontSize: 12, color: '#0f766e', marginTop: 6 }}>
                Số lượng lấy theo phiếu. Khi lưu, phiếu sẽ chuyển sang <strong>Đã nhập kho</strong> và tồn kho
                tăng đúng một lần.
              </div>
            ) : null}
          </Field>
        )}

        {/* Tuyến Kho */}
        <div style={{ display: 'grid', gridTemplateColumns: type === 'TRANSFER' ? '1fr 1fr' : '1fr', gap: 12 }}>
          {(type === 'OUT' || type === 'TRANSFER') && (
            <Field label={type === 'TRANSFER' ? 'Kho nguồn (Xuất đi)' : 'Kho xuất'} required>
              <select
                className="select"
                value={sourceWarehouseId || ''}
                onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                required
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.code}] {w.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(type === 'IN' || type === 'TRANSFER') && (
            <Field label={type === 'TRANSFER' ? 'Kho đích (Nhập đến)' : 'Kho nhập'} required>
              <select
                className="select"
                value={targetWarehouseId || ''}
                onChange={(e) => setTargetWarehouseId(Number(e.target.value))}
                required
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.code}] {w.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Chi phí cước vận chuyển & chi phí khác — chỉ cho phiếu NHẬP */}
        {type === 'IN' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: '#fffbeb',
              border: '1px solid #fde68a',
            }}
          >
            <Field label="Cước vận chuyển (₫)" hint="Vận tải, giao hàng…">
              <PriceInput
                sizeSm
                currency="VND"
                placeholder="0"
                value={shippingFee}
                onChange={(val) => setShippingFee(val)}
              />
            </Field>
            <Field label="Chi phí khác (₫)" hint="Thuế NK, customs, phí lưu…">
              <PriceInput
                sizeSm
                currency="VND"
                placeholder="0"
                value={otherFee}
                onChange={(val) => setOtherFee(val)}
              />
            </Field>
            <Field label="Phương thức phân bổ" hint="Chia cước vào từng dòng">
              <select
                className="select"
                value={allocationMethod}
                onChange={(e) => setAllocationMethod(e.target.value as 'QUANTITY' | 'VALUE')}
              >
                <option value="QUANTITY">Theo số lượng (đều)</option>
                <option value="VALUE">Theo tỷ lệ giá trị</option>
              </select>
            </Field>
          </div>
        )}

        {/* Danh sách linh kiện */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
              Danh sách linh kiện ({items.length})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {type === 'IN' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    handleAddItem();
                    openQuickCreate(items.length);
                  }}
                  title="Hàng về có mã chưa khai báo? Tạo mã ngay tại đây, không cần rời phiếu"
                >
                  <PackagePlus size={13} style={{ marginRight: 4 }} /> Mã mới
                </Button>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={handleAddItem}>
                <Plus size={13} style={{ marginRight: 4 }} /> Thêm dòng
              </Button>
            </div>
          </div>

          {quickRow !== null && (
            <div
              style={{
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                borderRadius: 'var(--radius-md)',
                padding: 12,
                marginBottom: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
              onKeyDown={(e) => {
                // Enter trong khung này là "tạo mã", không phải gửi cả phiếu kho
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!quickSaving) handleQuickCreate();
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>
                  Tạo nhanh mã phụ tùng cho dòng {quickRow + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setQuickRow(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 2 }}
                  title="Đóng khung tạo nhanh"
                >
                  <X size={15} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr', gap: 10 }}>
                <Field label="Tên phụ tùng" required>
                  <Input
                    autoFocus
                    sizeSm
                    placeholder="VD: Gioăng cửa tủ mát Selmi"
                    value={quick.name}
                    onChange={(e) => setQuick({ ...quick, name: e.target.value })}
                  />
                </Field>

                <Field label="Nhóm hàng">
                  <select
                    className="select"
                    value={quick.category}
                    onChange={(e) => setQuick({ ...quick, category: e.target.value })}
                  >
                    {Object.entries(PART_CATEGORIES).map(([key, cfg]) => (
                      <option key={key} value={key}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Đơn vị tính">
                  <Input
                    sizeSm
                    placeholder="Chiếc"
                    value={quick.unit}
                    onChange={(e) => setQuick({ ...quick, unit: e.target.value })}
                  />
                </Field>

                <Field label="Giá vốn (₫)">
                  <PriceInput
                    sizeSm
                    currency="VND"
                    placeholder="Giá nhập"
                    value={quick.costPrice}
                    onChange={(val) => setQuick({ ...quick, costPrice: val })}
                  />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Mã phụ tùng">
                    <Input
                      sizeSm
                      placeholder="Để trống sẽ tự sinh mã SP-…"
                      value={quick.itemCode}
                      onChange={(e) => setQuick({ ...quick, itemCode: e.target.value })}
                    />
                  </Field>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={handleQuickCreate}
                  disabled={quickSaving}
                >
                  {quickSaving ? 'Đang tạo…' : 'Tạo mã & chọn vào phiếu'}
                </Button>
              </div>

              <div style={{ fontSize: 11.5, color: '#1d4ed8', lineHeight: 1.45 }}>
                Mã tạo ra có tồn kho bằng 0; số lượng thực nhập lấy theo dòng của phiếu này. Giá bán
                sẽ được tính theo cấu hình margin, chỉnh lại trong danh mục nếu cần.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Header dòng */}
            {type === 'IN' && (Number(shippingFee || 0) > 0 || Number(otherFee || 0) > 0) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 120px 100px 100px 90px 32px',
                  gap: 6,
                  padding: '0 10px',
                  fontSize: 10.5,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                <span>Linh kiện</span>
                <span>SL</span>
                <span>Đơn giá gốc</span>
                <span>Cước/cái (₫)</span>
                <span>Phí khác/cái</span>
                <span style={{ textAlign: 'right' }}>Landed Cost</span>
                <span />
              </div>
            )}
            {items.map((row, idx) => {
              const hasFees = type === 'IN' && (Number(shippingFee || 0) > 0 || Number(otherFee || 0) > 0);
              const landedPerUnit = hasFees
                ? (Number(row.unitPrice || 0) + Number(row.allocatedShipping || 0) + Number(row.allocatedOtherFee || 0))
                : 0;
              return (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: hasFees
                    ? '1fr 80px 120px 100px 100px 90px 32px'
                    : '1fr 110px 130px 32px',
                  gap: hasFees ? 6 : 8,
                  alignItems: 'center',
                  background: 'var(--surface-sunken)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <select
                  className="select"
                  value={row.itemId}
                  onChange={(e) => {
                    if (e.target.value === NEW_PART_OPTION) {
                      openQuickCreate(idx);
                      return;
                    }
                    handleItemChange(idx, 'itemId', Number(e.target.value));
                  }}
                >
                  {allParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.itemCode}] {p.name} ({p.unit})
                    </option>
                  ))}
                  {type === 'IN' && (
                    <option value={NEW_PART_OPTION}>+ Tạo nhanh mã mới…</option>
                  )}
                </select>

                <Input
                  type="number"
                  min={1}
                  placeholder="SL"
                  value={row.quantity}
                  onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                  required
                />

                <PriceInput
                  sizeSm
                  currency="VND"
                  placeholder="Đơn giá (₫)"
                  value={row.unitPrice}
                  onChange={(val) => handleItemChange(idx, 'unitPrice', val)}
                />

                {hasFees && (
                  <>
                    <PriceInput
                      sizeSm
                      currency="VND"
                      placeholder="Cước"
                      value={row.allocatedShipping}
                      onChange={(val) => handleItemChange(idx, 'allocatedShipping', val)}
                    />
                    <PriceInput
                      sizeSm
                      currency="VND"
                      placeholder="Phí khác"
                      value={row.allocatedOtherFee}
                      onChange={(val) => handleItemChange(idx, 'allocatedOtherFee', val)}
                    />
                    <div
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: 12,
                        color: '#0f766e',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${Number(row.unitPrice || 0).toLocaleString()} + ${Number(row.allocatedShipping || 0).toLocaleString()} cước + ${Number(row.allocatedOtherFee || 0).toLocaleString()} phí`}
                    >
                      {landedPerUnit.toLocaleString()} ₫
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  disabled={items.length <= 1}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: items.length <= 1 ? 'var(--text-muted)' : 'var(--danger)',
                    cursor: items.length <= 1 ? 'not-allowed' : 'pointer',
                    padding: 4,
                  }}
                  title="Xóa dòng"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              );
            })}
          </div>
        </div>

        {/* Tổng kết chi phí lô hàng — tính từ giá trị per-item thực tế */}
        {type === 'IN' && liveMetrics && (liveMetrics.totalShipping > 0 || liveMetrics.totalOther > 0) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 10,
              padding: '10px 12px',
              background: '#dbeafe',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              textAlign: 'center',
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>Tiền hàng</div>
              <div style={{ color: 'var(--text-strong)' }}>{liveMetrics.merchandiseTotal.toLocaleString()} ₫</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>Tổng cước (Σ)</div>
              <div style={{ color: '#b45309' }}>{liveMetrics.totalShipping.toLocaleString()} ₫</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>Tổng phí khác (Σ)</div>
              <div style={{ color: '#7c3aed' }}>{liveMetrics.totalOther.toLocaleString()} ₫</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>Tổng vốn lô hàng</div>
              <div style={{ color: '#0f766e', fontWeight: 800, fontSize: 14 }}>{liveMetrics.totalLandedCost.toLocaleString()} ₫</div>
            </div>
          </div>
        )}

        {/* Lý do & Ghi chú */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Lý do xuất/nhập/điều chuyển" required>
            <Input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Nhập thêm kho, bảo dưỡng định kỳ..."
            />
          </Field>

          <Field label="Ghi chú thêm">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tình trạng hàng, vị trí xếp kho..."
            />
          </Field>
        </div>

        {/* Người giao & người nhận — ký nhận trên phiếu in */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Người giao hàng">
            <Input
              sizeSm placeholder="Họ tên người bàn giao"
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
            />
          </Field>
          <Field label="Người nhận hàng">
            <Input
              sizeSm placeholder="Họ tên người nhận"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang thực hiện...' : 'Xác nhận giao dịch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
 * 3. MODAL THÊM / SỬA KHO PHỤ TÙNG (WarehouseModal)
 * ───────────────────────────────────────────────────────── */
export function WarehouseModal({
  open,
  warehouse,
  onClose,
  onSuccess,
}: {
  open: boolean;
  warehouse?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<SaveWarehouseInput>({
    code: warehouse?.code || '',
    name: warehouse?.name || '',
    type: warehouse?.type || 'CENTRAL',
    address: warehouse?.address || '',
    status: warehouse?.status || 'ACTIVE',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await saveWarehouseAction(warehouse?.id || null, form);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={warehouse ? `Sửa kho: ${warehouse.name}` : 'Thêm mới Kho Phụ Tùng'}
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
          <Field label="Mã kho" required>
            <Input
              required
              placeholder="WH-HN, WH-HCM..."
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>

          <div>
            <Field label="Loại kho">
              <select
                className="select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              >
                {Object.entries(WAREHOUSE_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label="Tên kho phụ tùng" required>
          <Input
            required
            placeholder="VD: Kho Tổng Kỹ Thuật Hà Nội hoặc Kho Chi Nhánh TP.HCM"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <Field label="Địa chỉ kho hàng">
          <Input
            placeholder="Địa chỉ kho hàng thực tế..."
            value={form.address || ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang lưu...' : warehouse ? 'Cập nhật' : 'Thêm mới'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
 * 4. MODAL GHI NHẬN THAY THẾ LINH KIỆN TRỰC TIẾP TRÊN MÁY (QuickReplacePartModal)
 * ───────────────────────────────────────────────────────── */
export function QuickReplacePartModal({
  open,
  equipment,
  spareParts,
  warehouses,
  ticketId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  equipment: any;
  spareParts: any[];
  warehouses: any[];
  /** Gắn linh kiện xuất vào phiếu sự cố, để tính giá vốn ca sửa chữa. */
  ticketId?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [itemId, setItemId] = useState<number | ''>(spareParts[0]?.id || '');
  const [warehouseId, setWarehouseId] = useState<number | ''>(warehouses[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState(
    `Thay thế linh kiện bảo dưỡng / sửa chữa cho máy ${equipment?.machineCode || ''}`
  );
  const [note, setNote] = useState('');

  const [showLowStockConfirm, setShowLowStockConfirm] = useState(false);

  const selectedPart = spareParts.find((p) => p.id === Number(itemId));
  const currentStock =
    selectedPart?.stocks?.find((s: any) => s.warehouseId === Number(warehouseId))?.quantity ?? 0;

  if (!open) return null;

  const executeIssue = async () => {
    setLoading(true);
    try {
      const res = await saveStockTransactionAction({
        type: 'OUT',
        reasonCode: 'REPAIR',
        serviceTicketId: ticketId,
        sourceWarehouseId: Number(warehouseId),
        reason,
        note: note ? `${note} (Máy: ${equipment?.machineCode})` : `Máy: ${equipment?.machineCode} - ${equipment?.name}`,
        items: [
          {
            itemId: Number(itemId),
            quantity: Number(quantity),
            unitPrice: Number(selectedPart?.sellingPrice || selectedPart?.costPrice || 0),
          },
        ],
      });

      if (res.ok) {
        toast.success(`Đã ghi nhận thay linh kiện và xuất kho thành công!`);
        onSuccess();
        onClose();
      } else {
        toast.error(res.message || 'Lỗi khi xuất kho thay thế linh kiện');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || !warehouseId || quantity <= 0) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }

    if (currentStock < quantity) {
      setShowLowStockConfirm(true);
      return;
    }

    await executeIssue();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Ghi nhận thay linh kiện cho máy: ${equipment?.machineCode}`}
        size="md"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 8, fontSize: 13 }}>
            <div><strong>Thiết bị:</strong> {equipment?.name} ({equipment?.machineCode})</div>
            {equipment?.customer && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                Khách hàng: {equipment.customer.name}
              </div>
            )}
          </div>

          <Field label="Chọn linh kiện thay thế" required>
            <select
              className="select"
              value={itemId}
              onChange={(e) => setItemId(Number(e.target.value))}
              style={{ width: '100%' }}
              required
            >
              {spareParts.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.itemCode}] {p.name} ({p.unit}) - Tồn tổng: {p.totalStock ?? 0}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Xuất từ kho" required>
              <select
                className="select"
                value={warehouseId}
                onChange={(e) => setWarehouseId(Number(e.target.value))}
                style={{ width: '100%' }}
                required
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: currentStock > 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
                Tồn tại kho này: <strong>{currentStock}</strong> {selectedPart?.unit || 'chiếc'}
              </div>
            </Field>

            <Field label="Số lượng thay thế" required>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                required
              />
            </Field>
          </div>

          <Field label="Lý do thay thế / Phiếu bảo dưỡng">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Thay định kỳ 12 tháng, hỏng cảm biến..."
            />
          </Field>

          <Field label="Ghi chú thêm">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tình trạng linh kiện cũ sau khi tháo..."
            />
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Xác nhận thay & Trừ kho'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={showLowStockConfirm}
        onClose={() => setShowLowStockConfirm(false)}
        onConfirm={async () => {
          setShowLowStockConfirm(false);
          await executeIssue();
        }}
        title="Cảnh báo tồn kho"
        message={`Kho được chọn chỉ còn ${currentStock} ${selectedPart?.unit || 'chiếc'} (ít hơn số lượng cần xuất: ${quantity} ${selectedPart?.unit || 'chiếc'}). Bạn có chắc chắn muốn xuất vượt tồn?`}
        confirmText="Vẫn xuất kho"
        danger
        loading={loading}
      />
    </>
  );
}
