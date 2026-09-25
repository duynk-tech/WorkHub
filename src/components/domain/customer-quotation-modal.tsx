'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Select, SearchableSelect, Button, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { Printer, FileText, Wrench } from 'lucide-react';
import { readVndInWords } from '@/lib/number-to-words';
import { useCurrentUser } from '@/components/layout/current-user';
import { PrintWatermark } from './print-watermark';
import { LineItemsEditor, useLineItems, lineTotal } from '@/components/domain/line-items-editor';
import {
  calculateQuotedUnitPrice,
  estimateImportFreight,
  VOLUME_DISCOUNT_TIERS,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import { QUOTATION_STATUSES, type SaveCustomerQuotationInput } from '@/server/modules/customer/types';
import { saveCustomerQuotationAction } from '@/server/modules/customer/actions';
import { getEquipmentSpecRows } from '@/lib/equipment-specs';
import { EquipmentSpecGrid } from '@/components/domain/equipment-spec-grid';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

const DEFAULT_PAYMENT_TERMS =
  'Tạm ứng 50% khi xác nhận đơn hàng, thanh toán 50% còn lại trước khi bàn giao.';
const DEFAULT_DELIVERY_TIME = '15 - 25 ngày làm việc kể từ ngày xác nhận đơn hàng';
const DEFAULT_WARRANTY_TERMS =
  'Bảo hành chính hãng 12 tháng. Hỗ trợ kỹ thuật tận nơi trong vòng 24 giờ kể từ khi tiếp nhận yêu cầu.';

/** Ngày mặc định hết hiệu lực báo giá: theo cấu hình hoặc 15 ngày kể từ hôm nay. */
function defaultValidUntil(days = 15): string {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 15));
  return d.toISOString().slice(0, 10);
}

// ── Modal lập / chỉnh sửa báo giá ────────────────────────────────
export function CustomerQuotationModal({
  open,
  onClose,
  customerId,
  customerName,
  locations = [],
  machines = [],
  stockMachines = [],
  spareParts = [],
  pricingConfig,
  quotation,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  locations?: any[];
  machines?: any[];
  stockMachines?: any[];
  spareParts?: any[];
  /** Cấu hình giá (tỷ giá, lợi nhuận, cước nhập) để tính đơn giá tạm tính. */
  pricingConfig?: Partial<SparePartPricingConfig>;
  quotation?: any;
  onSuccess?: (q: any) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState(quotation?.status || 'DRAFT');
  const [locationId, setLocationId] = useState<number | ''>(quotation?.locationId || '');
  const [quoteDate, setQuoteDate] = useState(
    quotation?.quoteDate
      ? new Date(quotation.quoteDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [validUntil, setValidUntil] = useState(
    quotation?.validUntil
      ? new Date(quotation.validUntil).toISOString().slice(0, 10)
      : defaultValidUntil(pricingConfig?.defaultValidDays ?? 15),
  );
  const defaultVat = pricingConfig?.defaultVatRate ?? 8;
  const [vatRate, setVatRate] = useState(
    quotation?.vatRate !== undefined && quotation?.vatRate !== null
      ? String(quotation.vatRate)
      : String(defaultVat),
  );
  const [shippingFee, setShippingFee] = useState<number>(Number(quotation?.shippingFee ?? 0));
  const [manualDiscountRate, setManualDiscountRate] = useState<string | null>(
    quotation?.discountRate !== undefined && quotation?.discountRate !== null
      ? String(quotation.discountRate)
      : null,
  );
  const [paymentTerms, setPaymentTerms] = useState(
    quotation?.paymentTerms || pricingConfig?.defaultPaymentTerms || DEFAULT_PAYMENT_TERMS
  );
  const [deliveryTime, setDeliveryTime] = useState(
    quotation?.deliveryTime || pricingConfig?.defaultDeliveryTime || DEFAULT_DELIVERY_TIME
  );
  const [warrantyTerms, setWarrantyTerms] = useState(
    quotation?.warrantyTerms || pricingConfig?.defaultWarrantyTerms || DEFAULT_WARRANTY_TERMS
  );
  const [notes, setNotes] = useState(
    quotation?.notes || pricingConfig?.defaultQuotationNotes || ''
  );

  const {
    items,
    catalogRefs,
    catalogOptions,
    addItem,
    removeItem,
    changeItem,
    selectCatalog,
    validItems,
  } = useLineItems({
    initialItems: quotation?.items?.map((i: any) => ({
      itemType: i.itemType,
      name: i.name,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      discountVnd: Number(i.discountVnd || 0),
      equipmentId: i.equipmentId || undefined,
      inventoryItemId: i.inventoryItemId || undefined,
      priceSource: i.inventoryItemId ? 'LIST' : undefined,
      notes: i.notes || '',
    })),
    machines,
    stockMachines,
    spareParts,
    pricingConfig,
  });

  /** Giá vốn một đơn vị — chỉ dùng nội bộ để soi lãi, không in cho khách. */
  const costOf = (it: any) => {
    if (!it.inventoryItemId) return 0;
    const p = spareParts.find((x: any) => x.id === it.inventoryItemId);
    return Number(p?.avgCost || p?.costPrice || 0);
  };

  /** Tỷ lệ chiết khấu gợi ý theo tổng sản lượng, lấy đúng bậc thang của cấu hình giá. */
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const tiers = pricingConfig?.volumeDiscountTiers || VOLUME_DISCOUNT_TIERS;
  const suggestedRate =
    (tiers.find((t: any) => totalQty >= t.min && totalQty <= t.max)?.rate || 0) * 100;
  const effectiveDiscountRate = manualDiscountRate !== null ? (Number(manualDiscountRate) || 0) : suggestedRate;
  const discountRateInput = manualDiscountRate !== null ? manualDiscountRate : String(suggestedRate);

  const totalCost = items.reduce((sum, it) => sum + costOf(it) * (Number(it.quantity) || 0), 0);
  const gross = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const lineNet = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const rate = Math.max(0, effectiveDiscountRate);
  const discountAmount = Math.min(gross, gross - lineNet + Math.round((lineNet * rate) / 100));
  const goodsTotal = gross - discountAmount;
  const freight = Math.max(0, Number(shippingFee) || 0);
  const subtotal = goodsTotal + freight;
  const vatAmount = Math.round((subtotal * (Number(vatRate) || 0)) / 100);
  const totalAmount = subtotal + vatAmount;

  const handleRemoveItem = (index: number) => {
    if (!removeItem(index)) toast.error('Báo giá phải có ít nhất 1 dòng hàng');
  };

  /** Các dòng đang dùng giá tạm tính (linh kiện chưa khai giá bán trong danh mục). */
  const estimatedLines = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.priceSource === 'ESTIMATED' && it.inventoryItemId);

  /**
   * Tính cước vận chuyển cho lô hàng phải nhập, theo đúng quy tắc của phiếu đặt hàng
   * (cước gốc + phụ trội mỗi mặt hàng thêm + phí hải quan). Cước ghi thành một dòng
   * riêng trên báo giá — khách nhìn thấy giá bán và cước tách bạch, không lộ giá vốn.
   */
  const handleEstimateFreight = () => {
    const importedLines = items.filter((it) => it.itemType !== 'SERVICE' && it.name.trim()).length;
    if (importedLines === 0) {
      toast.error('Chưa có hàng hóa nào để tính cước');
      return;
    }
    const freightEstimate = estimateImportFreight(importedLines, pricingConfig);
    setShippingFee(freightEstimate);
    toast.success(`Cước vận chuyển cho ${importedLines} mặt hàng: ${fmt(freightEstimate)} ₫`);
  };

  const handleSave = async () => {
    const rows = validItems();
    if (rows.length === 0) {
      toast.error('Vui lòng nhập tên ít nhất một hàng hóa hoặc dịch vụ');
      return;
    }

    setLoading(true);
    const payload: SaveCustomerQuotationInput = {
      customerId,
      locationId: locationId ? Number(locationId) : undefined,
      status,
      quoteDate,
      validUntil: validUntil || undefined,
      vatRate: Number(vatRate) || 0,
      shippingFee: freight,
      discountRate: rate,
      paymentTerms: paymentTerms.trim() || undefined,
      deliveryTime: deliveryTime.trim() || undefined,
      warrantyTerms: warrantyTerms.trim() || undefined,
      notes: notes.trim() || undefined,
      items: rows,
    };

    const res = await saveCustomerQuotationAction(quotation ? quotation.id : null, payload);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      if (onSuccess) onSuccess(res.quotation);
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={quotation ? `Chỉnh sửa báo giá: ${quotation.quoteCode}` : `Lập báo giá cho: ${customerName}`}
      description="Báo giá gửi khách trước khi chốt đơn. Khi khách duyệt có thể chuyển thẳng thành đơn hàng."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            {quotation ? 'Lưu báo giá' : 'Tạo báo giá'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Trạng thái báo giá">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(QUOTATION_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Ngày báo giá">
            <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
          </Field>

          <Field label="Hiệu lực đến ngày">
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>

        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Điểm đặt / Chi nhánh nhận hàng">
            <SearchableSelect
              value={String(locationId ?? '')}
              onChange={(val) => setLocationId(val ? Number(val) : '')}
              options={[
                { value: '', label: '-- Trụ sở chính / Chưa gán chi nhánh --' },
                ...locations.map((loc: any) => ({
                  value: String(loc.id),
                  label: loc.name,
                  subLabel: loc.address || undefined,
                })),
              ]}
              placeholder="-- Trụ sở chính / Chưa gán chi nhánh --"
              searchPlaceholder="Tìm chi nhánh…"
            />
          </Field>

          <Field label="Thời gian giao hàng dự kiến">
            <Input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Điều khoản thanh toán">
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </Field>

          <Field label="Điều khoản bảo hành">
            <Input value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} />
          </Field>
        </div>

        <Field label="Ghi chú báo giá">
          <Input
            placeholder="VD: Giá đã bao gồm chi phí lắp đặt và vận chuyển nội thành"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <LineItemsEditor
          title="Danh sách hàng hóa / dịch vụ báo giá"
          items={items}
          catalogRefs={catalogRefs}
          catalogOptions={catalogOptions}
          onAdd={addItem}
          onRemove={handleRemoveItem}
          onChange={changeItem}
          onSelectCatalog={selectCatalog}
          costOf={costOf}
        />

        {totalCost > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)',
              border: '1px dashed var(--border-base)',
              fontSize: 12.5,
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ color: 'var(--text-strong)' }}>Chi tiết (Nội bộ):</strong>
            <span>
              Tổng giá vốn <strong style={{ color: 'var(--text-strong)' }}>{fmt(totalCost)} ₫</strong>
            </span>
            <span>
              Lãi gộp dự kiến{' '}
              <strong style={{ color: goodsTotal - totalCost >= 0 ? '#16a34a' : '#dc2626' }}>
                {fmt(goodsTotal - totalCost)} ₫
              </strong>
            </span>
            <span>
              Tỷ suất{' '}
              <strong style={{ color: goodsTotal - totalCost >= 0 ? '#16a34a' : '#dc2626' }}>
                {goodsTotal > 0 ? (((goodsTotal - totalCost) / goodsTotal) * 100).toFixed(1) : '0'}%
              </strong>
            </span>
          </div>
        )}

        {estimatedLines.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              fontSize: 12.5,
              color: '#92400e',
            }}
          >
            <span>
              {estimatedLines.length} dòng đang dùng <strong>giá tạm tính</strong> — linh kiện chưa khai giá bán
              nên hệ thống suy ra từ giá vốn theo tỷ suất lợi nhuận. Nên kiểm lại trước khi gửi khách.
            </span>
          </div>
        )}

        {/* Khối tổng: ô nhập cước và chiết khấu nằm ngay trong cột tổng */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: 10,
            borderTop: '1px dashed var(--border-base)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 200px',
              gap: '7px 14px',
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>Tiền hàng</span>
            <strong style={{ color: 'var(--text-strong)', textAlign: 'right' }}>{fmt(gross)} ₫</strong>

            <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
              Chiết khấu
              {suggestedRate > 0 && effectiveDiscountRate !== suggestedRate && (
                <button
                  type="button"
                  onClick={() => setManualDiscountRate(String(suggestedRate))}
                  style={{
                    marginLeft: 6,
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid var(--border-base)',
                    background: 'var(--surface-card)',
                    color: 'var(--brand)',
                    cursor: 'pointer',
                  }}
                  title={`Bậc chiết khấu theo cấu hình cho ${totalQty} sản phẩm`}
                >
                  {suggestedRate}%
                </button>
              )}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={discountRateInput}
                onChange={(e) => setManualDiscountRate(e.target.value)}
                sizeSm
                style={{ width: 70, flexShrink: 0, textAlign: 'right' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>%</span>
              <span style={{ flex: 1, textAlign: 'right', color: discountAmount > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                {discountAmount > 0 ? `-${fmt(discountAmount)} ₫` : '—'}
              </span>
            </div>

            <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
              Phí giao hàng
              <button
                type="button"
                onClick={handleEstimateFreight}
                style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid var(--border-base)',
                  background: 'var(--surface-card)',
                  color: 'var(--brand)',
                  cursor: 'pointer',
                }}
                title="Tính theo cước nhập khẩu của lô hàng"
              >
                Tính
              </button>
            </span>
            <PriceInput
              placeholder="0 (chưa gồm phí giao hàng)"
              value={shippingFee}
              onChange={(val) => setShippingFee(val || 0)}
              sizeSm
              style={{ textAlign: 'right' }}
            />

            <span style={{ color: 'var(--text-muted)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <span>Thuế VAT</span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[0, 8, 10].map((rateVal) => (
                  <button
                    key={rateVal}
                    type="button"
                    onClick={() => setVatRate(String(rateVal))}
                    style={{
                      padding: '1px 6px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: Number(vatRate) === rateVal ? 700 : 500,
                      border: '1px solid var(--border-base)',
                      background: Number(vatRate) === rateVal ? 'var(--brand)' : 'var(--surface-card)',
                      color: Number(vatRate) === rateVal ? '#fff' : 'var(--text-strong)',
                      cursor: 'pointer',
                    }}
                  >
                    {rateVal}%
                  </button>
                ))}
              </span>
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                sizeSm
                style={{ width: 70, flexShrink: 0, textAlign: 'right' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>%</span>
              <span style={{ flex: 1, textAlign: 'right', color: 'var(--text-strong)', fontWeight: 600 }}>
                {vatAmount > 0 ? `${fmt(vatAmount)} ₫` : '—'}
              </span>
            </div>

            <span style={{ color: 'var(--text-muted)', textAlign: 'right', fontWeight: 600 }}>
              Tổng thanh toán
            </span>
            <strong style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)', textAlign: 'right' }}>
              {fmt(totalAmount)} ₫
            </strong>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Bản in báo giá A4 ────────────────────────────────────────────
export function CustomerQuotationPrintModal({
  open,
  onClose,
  quotation,
  customer,
  companyInfo,
  machines = [],
}: {
  open: boolean;
  onClose: () => void;
  quotation: any;
  customer: any;
  companyInfo?: any;
  machines?: any[];
}) {
  const me = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  const [sellerName, setSellerName] = useState(companyInfo?.name || 'Công ty Sunny');
  const [sellerAddress, setSellerAddress] = useState(companyInfo?.address || '');
  const [sellerPhone, setSellerPhone] = useState(companyInfo?.phone || '');
  const [sellerTaxCode, setSellerTaxCode] = useState(companyInfo?.taxCode || '');
  const [signerName, setSignerName] = useState(me?.fullName || '');
  const [signerTitle, setSignerTitle] = useState(me?.positionName || 'Phụ trách kinh doanh');

  const [vatRate, setVatRate] = useState<number>(
    quotation.vatRate !== undefined && quotation.vatRate !== null ? Number(quotation.vatRate) : 8,
  );
  const [freight, setFreight] = useState<number>(Number(quotation.shippingFee || 0));
  const [deliveryTime, setDeliveryTime] = useState<string>(quotation.deliveryTime || '3-5 ngày');
  const [paymentTerms, setPaymentTerms] = useState<string>(quotation.paymentTerms || '');
  const [warrantyTerms, setWarrantyTerms] = useState<string>(quotation.warrantyTerms || '');
  const [notes, setNotes] = useState<string>(quotation.notes || '');
  const [validUntil, setValidUntil] = useState<string>(
    quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('vi-VN') : '',
  );

  const items = quotation.items || [];
  const gross = items.reduce(
    (sum: number, i: any) => sum + Number(i.quantity) * Number(i.unitPrice),
    0,
  );
  const discountAmount = Number(quotation.discountAmount || 0);
  const discountRate = Number(quotation.discountRate || 0);
  const goodsTotal = gross - discountAmount;
  const subtotal = goodsTotal + freight;
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  const totalAmount = subtotal + vatAmount;

  const quoteDate = new Date(quotation.quoteDate);

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      setTimeout(() => window.print(), 120);
      return;
    }
    window.print();
  };

  const cellBorder = '1px solid #000';
  const hasLineDiscount = items.some((i: any) => Number(i.discountVnd) > 0);
  const colSpan = hasLineDiscount ? 5 : 4;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overlayClassName="print-preview-modal-overlay"
      title="In báo giá gửi khách hàng"
      description={`Báo giá số ${quotation.quoteCode}`}
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant={activeTab === 'preview' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('preview')}
            >
              <FileText style={{ width: 14, height: 14, marginRight: 6 }} /> Xem trước bản in
            </Button>
            <Button
              variant={activeTab === 'edit' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('edit')}
            >
              <Wrench style={{ width: 14, height: 14, marginRight: 6 }} /> Tùy chỉnh thông tin
            </Button>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Thuế VAT:</span>
              {[0, 8, 10].map((rateVal) => (
                <button
                  key={rateVal}
                  type="button"
                  onClick={() => setVatRate(rateVal)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: vatRate === rateVal ? 700 : 500,
                    border: '1px solid var(--border-base)',
                    background: vatRate === rateVal ? 'var(--brand)' : 'var(--surface-card)',
                    color: vatRate === rateVal ? '#fff' : 'var(--text-strong)',
                    cursor: 'pointer',
                  }}
                >
                  {rateVal}%
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Button variant="primary" onClick={handlePrint}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In báo giá (A4 / PDF)
            </Button>
          </div>
        </div>
      }
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }

          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > *:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          .modal-overlay:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          .print-preview-modal-overlay {
            position: static !important;
            display: block !important;
            inset: auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            animation: none !important;
            z-index: auto !important;
          }
          .print-preview-modal-overlay .modal {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            animation: none !important;
          }
          .print-preview-modal-overlay .modal-header,
          .print-preview-modal-overlay .modal-footer,
          .no-print {
            display: none !important;
          }
          .print-preview-modal-overlay .modal-body {
            padding: 0 !important;
            overflow: visible !important;
            max-height: none !important;
          }

          .quotation-preview-scroll {
            display: block !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            background: #ffffff !important;
            border-radius: 0 !important;
          }

          #customer-quotation-print-container {
            position: relative !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Times New Roman', Times, serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #customer-quotation-print-container table { page-break-inside: auto; }
          #customer-quotation-print-container tr,
          #customer-quotation-print-container li {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .quotation-signature-block {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {activeTab === 'edit' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '68vh', overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên đơn vị báo giá">
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
            </Field>
            <Field label="Mã số thuế">
              <Input value={sellerTaxCode} onChange={(e) => setSellerTaxCode(e.target.value)} />
            </Field>
          </div>
          <Field label="Địa chỉ">
            <Input value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Điện thoại liên hệ">
              <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
            </Field>
            <Field label="Người lập báo giá">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </Field>
            <Field label="Chức vụ">
              <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            📋 Thuế VAT, Phí giao hàng & Điều khoản thương mại
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Field label="Thuế VAT">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value) || 0)}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 13 }}>%</span>
                <div style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
                  {[0, 8, 10].map((rateVal) => (
                    <button
                      key={rateVal}
                      type="button"
                      onClick={() => setVatRate(rateVal)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: vatRate === rateVal ? 700 : 500,
                        border: '1px solid var(--border-base)',
                        background: vatRate === rateVal ? 'var(--brand)' : 'var(--surface-card)',
                        color: vatRate === rateVal ? '#fff' : 'var(--text-strong)',
                        cursor: 'pointer',
                      }}
                    >
                      {rateVal}%
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Phí giao hàng (để 0 nếu chưa bao gồm)">
              <PriceInput
                placeholder="0 (chưa gồm phí giao hàng)"
                value={freight}
                onChange={(val) => setFreight(val || 0)}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Thời gian giao hàng">
              <Input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </Field>
            <Field label="Điều khoản thanh toán">
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Chính sách bảo hành">
              <Input value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} />
            </Field>
            <Field label="Ghi chú thêm">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : (
        <div
          className="quotation-preview-scroll"
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--surface-subtle, #f1f5f9)',
            padding: 20,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            borderRadius: 8,
          }}
        >
          <div
            id="customer-quotation-print-container"
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '800px',
              background: '#ffffff',
              color: '#111827',
              padding: '40px 48px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13.5px',
              lineHeight: 1.45,
            }}
          >
            <PrintWatermark
              logoUrl={companyInfo?.watermarkUrl || companyInfo?.logoUrl}
              companyName={sellerName}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Tiêu đề đơn vị */}
            <div style={{ borderBottom: '1px solid #000', paddingBottom: 8, marginBottom: 12 }}>
              <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase' }}>{sellerName}</div>
              {sellerAddress && <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>{sellerAddress}</div>}
              <div style={{ fontSize: '11px', color: '#475569' }}>
                {sellerTaxCode && (
                  <>
                    Mã số thuế: <strong>{sellerTaxCode}</strong>
                  </>
                )}
                {sellerTaxCode && sellerPhone && <> • </>}
                {sellerPhone && (
                  <>
                    Điện thoại: <strong>{sellerPhone}</strong>
                  </>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '19px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Báo giá
              </div>
              <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginTop: 2 }}>
                Số: <strong>{quotation.quoteCode}</strong> — Ngày {quoteDate.getDate()} tháng{' '}
                {quoteDate.getMonth() + 1} năm {quoteDate.getFullYear()}
              </div>
            </div>

            {/* Kính gửi */}
            <div style={{ marginBottom: 12, fontSize: '12.5px' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Kính gửi:</div>
              <div>
                Quý khách hàng: <strong>{customer?.name}</strong>
              </div>
              {customer?.contactName && <div>Người liên hệ: {customer.contactName}</div>}
              {customer?.address && <div>Địa chỉ: {customer.address}</div>}
              {quotation.location?.name && (
                <div>
                  Điểm nhận hàng: <strong>{quotation.location.name}</strong>
                </div>
              )}
            </div>

            <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 8, color: '#334155' }}>
              {sellerName} trân trọng gửi Quý khách hàng bảng báo giá như sau:
            </div>

            {/* Bảng hàng hóa */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: 10 }}>
              <thead>
                <tr style={{ background: '#cbd5e1' }}>
                  <th style={{ border: cellBorder, padding: '5px 7px', width: '35px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>STT</th>
                  <th style={{ border: cellBorder, padding: '5px 7px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>Tên hàng hóa / dịch vụ</th>
                  <th style={{ border: cellBorder, padding: '5px 7px', width: '45px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>SL</th>
                  <th style={{ border: cellBorder, padding: '5px 6px', width: '85px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>Đơn giá</th>
                  {hasLineDiscount && (
                    <th style={{ border: cellBorder, padding: '5px 6px', width: '80px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>
                      Chiết khấu
                    </th>
                  )}
                  <th style={{ border: cellBorder, padding: '5px 6px', width: '95px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>
                    Thành tiền
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const lineGross = Number(item.quantity) * Number(item.unitPrice);
                  const lineFinal = hasLineDiscount ? Number(item.totalPrice) : lineGross;
                  const allMachines = [
                    ...(machines || []),
                    ...(customer?.machines || []),
                    ...(quotation?.machines || []),
                  ];
                  const eq =
                    item.equipment ||
                    (item.equipmentId ? allMachines.find((m: any) => m.id === item.equipmentId) : null) ||
                    allMachines.find(
                      (m: any) =>
                        (m.name && item.name && m.name.toLowerCase() === item.name.toLowerCase()) ||
                        (m.machineCode && item.itemCode && m.machineCode === item.itemCode) ||
                        (m.model && item.name && item.name.toLowerCase().includes(m.model.toLowerCase())) ||
                        (m.name && item.name && item.name.toLowerCase().includes(m.name.toLowerCase()))
                    );
                  const specRows = eq ? getEquipmentSpecRows(eq) : [];
                  const displayName = (() => {
                    const raw = item.name || '';
                    const match = raw.match(/^(.*?)\s*\[([A-Za-z0-9_-]+)\]$/);
                    if (match) {
                      return `[${match[2]}] ${match[1]}`;
                    }
                    return raw;
                  })();
                  return (
                    <tr key={item.id ?? idx} style={{ verticalAlign: 'top' }}>
                      <td style={{ border: cellBorder, padding: '6px 7px', textAlign: 'center', verticalAlign: 'top' }}>
                        {idx + 1}
                      </td>
                      <td style={{ border: cellBorder, padding: '6px 8px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 650, color: '#0f172a' }}>{displayName}</div>
                        {specRows.length > 0 && <EquipmentSpecGrid rows={specRows} />}
                        {item.notes && (
                          <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', marginTop: specRows.length > 0 ? 2 : 0, paddingLeft: 8 }}>
                            {item.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ border: cellBorder, padding: '6px 7px', textAlign: 'center', verticalAlign: 'top' }}>{item.quantity}</td>
                      <td style={{ border: cellBorder, padding: '6px 6px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {fmt(Number(item.unitPrice))}
                      </td>
                      {hasLineDiscount && (
                        <td style={{ border: cellBorder, padding: '6px 6px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {Number(item.discountVnd) > 0 ? fmt(Number(item.discountVnd)) : '—'}
                        </td>
                      )}
                      <td style={{ border: cellBorder, padding: '6px 6px', textAlign: 'right', fontWeight: 700, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {fmt(lineFinal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {discountAmount > 0 && (
                  <>
                    <tr>
                      <td colSpan={colSpan} style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 600 }}>
                        Tổng tiền hàng
                      </td>
                      <td style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 600 }}>
                        {fmt(gross)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={colSpan} style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', color: '#b91c1c' }}>
                        Chiết khấu{discountRate > 0 ? ` (${discountRate}%)` : ''}
                      </td>
                      <td style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>
                        -{fmt(discountAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={colSpan} style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 600 }}>
                        Tiền hàng sau chiết khấu
                      </td>
                      <td style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 700 }}>
                        {fmt(goodsTotal)}
                      </td>
                    </tr>
                  </>
                )}
                {freight > 0 && (
                  <tr>
                    <td colSpan={colSpan} style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right' }}>
                      Phí giao hàng
                    </td>
                    <td style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 700 }}>
                      {fmt(freight)}
                    </td>
                  </tr>
                )}
                {vatRate > 0 && (
                  <tr>
                    <td colSpan={colSpan} style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right' }}>
                      Thuế VAT {vatRate}%
                    </td>
                    <td style={{ border: cellBorder, padding: '5px 7px', textAlign: 'right', fontWeight: 700 }}>
                      {fmt(vatAmount)}
                    </td>
                  </tr>
                )}
                <tr style={{ background: 'rgba(241, 245, 249, 0.6)' }}>
                  <td
                    colSpan={colSpan}
                    style={{ border: cellBorder, padding: '6px 7px', textAlign: 'right', fontWeight: 800, textTransform: 'uppercase' }}
                  >
                    Tổng thanh toán
                  </td>
                  <td style={{ border: cellBorder, padding: '6px 7px', textAlign: 'right', fontWeight: 800, color: '#000000' }}>
                    {fmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 10 }}>
              Bằng chữ: <strong>{readVndInWords(totalAmount)}</strong>
            </div>

            {/* Điều khoản */}
            <div style={{ fontSize: '12.5px', marginBottom: 10 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Điều khoản thương mại:
              </div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {validUntil && (
                  <li>
                    Báo giá có hiệu lực đến hết ngày <strong>{validUntil}</strong>.
                  </li>
                )}
                {deliveryTime && (
                  <li>
                    Thời gian giao hàng: <strong>{deliveryTime}</strong>.
                  </li>
                )}
                {paymentTerms && <li>Thanh toán: {paymentTerms}</li>}
                {warrantyTerms && <li>Bảo hành: {warrantyTerms}</li>}
                <li>
                  Đơn giá trên {vatRate > 0 ? 'chưa bao gồm' : 'không bao gồm'} thuế VAT
                  {vatRate > 0 ? `, VAT ${vatRate}% đã được tính riêng trong bảng trên` : ''}.
                </li>
                <li>
                  {freight > 0
                    ? 'Phí giao hàng được báo thành khoản riêng trong bảng trên.'
                    : 'Báo giá chưa bao gồm phí giao hàng, sẽ báo riêng theo thực tế giao hàng.'}
                </li>
                {notes && <li>{notes}</li>}
              </ul>
            </div>

            <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 6 }}>
              Rất mong nhận được sự hợp tác của Quý khách hàng. Trân trọng cảm ơn.
            </div>

            {/* Chữ ký */}
            <div className="quotation-signature-block" style={{ marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '50%', verticalAlign: 'top', padding: '0 6px 40px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Khách hàng xác nhận
                      </div>
                      <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>
                        (Ký, đóng dấu & ghi rõ họ tên)
                      </div>
                    </td>
                    <td style={{ width: '50%', verticalAlign: 'top', padding: '0 6px 40px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Đại diện đơn vị báo giá
                      </div>
                      <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>{signerTitle}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0 6px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }} />
                    <td style={{ padding: '0 6px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }}>
                      {signerName}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
