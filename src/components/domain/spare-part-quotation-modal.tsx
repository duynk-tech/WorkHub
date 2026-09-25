'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Input, Field, Textarea } from '@/components/ui';
import { Printer, FileText, Wrench, FileDown } from 'lucide-react';
import type { CompanyInfo } from '@/server/modules/settings/branding';
import { readVndInWords } from '@/lib/number-to-words';
import {
  calculateSellingPriceFromMargin,
  type SparePartPricingConfig,
} from '@/server/modules/spare-parts/types';
import { PrintWatermark } from './print-watermark';

interface SparePartQuotationModalProps {
  open: boolean;
  onClose: () => void;
  order: any;
  companyInfo?: CompanyInfo;
  pricingConfig?: SparePartPricingConfig;
}

export function SparePartQuotationModal({
  open,
  onClose,
  order,
  companyInfo,
  pricingConfig,
}: SparePartQuotationModalProps) {
  if (!order) return null;

  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  // Thông tin công ty bán (Bên A)
  const [sellerName, setSellerName] = useState(
    companyInfo?.name || 'Công ty Sunny'
  );
  const [sellerAddress, setSellerAddress] = useState(
    companyInfo?.address || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM'
  );
  const [sellerPhone, setSellerPhone] = useState(
    companyInfo?.phone || ''
  );
  const [sellerTaxCode, setSellerTaxCode] = useState(companyInfo?.taxCode || '');
  const [signerName, setSignerName] = useState('Phụ trách Kinh doanh / Kỹ thuật');

  // Thông tin khách hàng (Bên B)
  const [customerName, setCustomerName] = useState(
    order.customer?.name || 'Quý Khách Hàng / Đối Tác F&B'
  );
  const [contactPerson, setContactPerson] = useState(
    order.customer?.contactName || 'Đại diện bộ phận mua hàng'
  );
  const [customerPhone, setCustomerPhone] = useState(order.customer?.phone || '');
  const [customerAddress, setCustomerAddress] = useState(order.customer?.address || '');

  // Điều khoản thương mại
  const [validDays, setValidDays] = useState(String(pricingConfig?.defaultValidDays ?? 15));
  const [deliveryTime, setDeliveryTime] = useState(
    pricingConfig?.defaultDeliveryTime ?? '15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)'
  );
  const [paymentTerms, setPaymentTerms] = useState(
    pricingConfig?.defaultPaymentTerms ??
      'Tạm ứng 50% khi xác nhận đơn hàng, 50% còn lại trước khi bàn giao linh kiện'
  );
  const [warrantyTerms, setWarrantyTerms] = useState(
    pricingConfig?.defaultWarrantyTerms ??
      'Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử; hỗ trợ kỹ thuật lắp đặt tận nơi.'
  );
  const rawNotes = order.notes || '';
  const parsedVatFromNotes = rawNotes.match(/\[VAT:\s*(\d+)%\]/i)?.[1];
  const cleanNotes = rawNotes.replace(/\[VAT:\s*\d+%\]/gi, '').trim();

  const [notes, setNotes] = useState(
    cleanNotes ||
      pricingConfig?.defaultQuotationNotes ||
      'Linh kiện chính hãng nhập khẩu nguyên chiếc từ nhà sản xuất.'
  );

  const initialVatRate = order.vatRate !== undefined && order.vatRate !== null
    ? Number(order.vatRate)
    : parsedVatFromNotes !== undefined
      ? Number(parsedVatFromNotes)
      : (pricingConfig?.defaultVatRate ?? 8);
  const [vatPercent, setVatPercent] = useState<string>(String(initialVatRate));

  const handlePrint = () => {
    setActiveTab('preview');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const rawCode = (order.orderCode || `NHAP-${year}`)
    .replace('DỰ THẢO', 'NHAP')
    .replace('ORD-', 'NHAP-');
  const quoteCode = rawCode.startsWith('BG-') ? rawCode : `BG-${rawCode}`;

  // Dữ liệu tính giá
  const items = order.items || [];
  const shippingPerLine = items.length > 0 ? Number(order.shippingFee || 0) / items.length : 0;
  const otherPerLine = items.length > 0 ? Number(order.customsFee || 0) / items.length : 0;
  const marginPercent = pricingConfig?.defaultMarginPercent ?? 30;
  const pricingMethod = pricingConfig?.pricingMethod ?? 'MARGIN';

  const initialDiscountRate = Number(order.discountRate || 0) > 0
    ? (Number(order.discountRate) <= 1 ? Math.round(Number(order.discountRate) * 100) : Number(order.discountRate))
    : Number(order.discountVnd || 0) > 0 && Number(order.subtotalVnd || 0) > 0
      ? Math.round((Number(order.discountVnd) / Number(order.subtotalVnd)) * 100)
      : 0;
  const [discountPercent, setDiscountPercent] = useState<string>(String(initialDiscountRate));

  const quotationItems: Array<{
    item: any;
    quantity: number;
    unitPriceVnd: number;
    subtotal: number;
  }> = items.map((item: any) => {
    const quantity = Number(item.quantity) || 0;
    const savedSellingPrice = Number(item.sellingPriceVnd || item.item?.sellingPrice || 0);
    const exchangeRate = Number(order.exchangeRate || pricingConfig?.defaultExchangeRateEur || 32500);
    const baseCost = Number(item.unitPriceVnd || 0) > 0
      ? Number(item.unitPriceVnd)
      : Number(item.unitPriceEur || 0) > 0
        ? Math.round(Number(item.unitPriceEur) * exchangeRate)
        : Number(item.item?.avgCost || item.item?.costPrice || 0);
    const lineShipping = item.shippingFee !== undefined ? Number(item.shippingFee) : shippingPerLine;
    const lineOther = item.customsFee !== undefined ? Number(item.customsFee) : otherPerLine;
    const freightPerUnit = quantity > 0 ? Math.round(lineShipping / quantity) : 0;
    const otherFeePerUnit = quantity > 0 ? Math.round(lineOther / quantity) : 0;
    const formulaPrice = baseCost > 0
      ? calculateSellingPriceFromMargin(baseCost, marginPercent, pricingMethod) + freightPerUnit + otherFeePerUnit
      : 0;
    const unitPriceVnd = savedSellingPrice || formulaPrice;

    return { item, quantity, unitPriceVnd, subtotal: unitPriceVnd * quantity };
  });

  const grossVnd = quotationItems.reduce((sum, it) => sum + it.subtotal, 0);
  const discountRateNum = Math.max(0, Number(discountPercent) || 0);
  const discountAmount = Math.round((grossVnd * discountRateNum) / 100);
  const goodsTotalVnd = grossVnd - discountAmount;
  const vatRateNum = Math.max(0, Number(vatPercent) || 0);
  const vatAmount = Math.round((goodsTotalVnd * vatRateNum) / 100);
  const totalVnd = goodsTotalVnd + vatAmount;
  const totalQty = quotationItems.reduce((sum, it) => sum + it.quantity, 0);
  const amountInWords = readVndInWords(totalVnd);

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={600}
      title={`Xuất Báo Giá Khách Hàng (${quoteCode})`}
      description="Phiếu báo giá linh kiện chuyên nghiệp gửi khách hàng theo tiêu chuẩn A4"
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
                  onClick={() => setVatPercent(String(rateVal))}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: vatRateNum === rateVal ? 700 : 500,
                    border: '1px solid var(--border-base)',
                    background: vatRateNum === rateVal ? 'var(--brand)' : 'var(--surface-card)',
                    color: vatRateNum === rateVal ? '#fff' : 'var(--text-strong)',
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
            <Button variant="primary" onClick={handlePrint} style={{ background: '#7c3aed', color: '#fff' }}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In báo giá (A4 / PDF)
            </Button>
          </div>
        </div>
      }
    >
      {/* Print CSS Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }

          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > *:not(.modal-overlay) {
            display: none !important;
          }

          .modal-overlay {
            position: static !important;
            display: block !important;
            inset: auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            animation: none !important;
            z-index: auto !important;
          }
          .modal-overlay .modal {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            animation: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .modal-overlay .modal-header,
          .modal-overlay .modal-footer,
          .no-print {
            display: none !important;
          }
          .modal-overlay .modal-body {
            padding: 0 !important;
            overflow: visible !important;
            max-height: none !important;
            margin: 0 !important;
          }

          .print-doc-scroll {
            display: block !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            border-radius: 0 !important;
          }

          #spare-part-quotation-print-container {
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

          #spare-part-quotation-print-container table {
            page-break-inside: auto;
            width: 100% !important;
          }
          #spare-part-quotation-print-container tr,
          #spare-part-quotation-print-container li {
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
        /* Edit Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '68vh', overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>
            🏢 Thông tin đơn vị báo giá (Bên bán)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên công ty / Đơn vị bán">
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
            </Field>
            <Field label="Hotline / Điện thoại">
              <Input value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Địa chỉ văn phòng">
              <Input value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} />
            </Field>
            <Field label="Mã số thuế">
              <Input value={sellerTaxCode} onChange={(e) => setSellerTaxCode(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            👤 Thông tin khách hàng nhận báo giá (Bên mua)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên khách hàng / Công ty">
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label="Người liên hệ">
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Số điện thoại khách">
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </Field>
            <Field label="Địa chỉ giao hàng">
              <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            📋 Điều khoản thương mại & Bàn giao
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Field label="Hiệu lực báo giá (ngày)">
              <Input value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </Field>
            <Field label="Thời gian giao hàng">
              <Input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12 }}>
            <Field label="Chiết khấu cho khách (%)">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </Field>
            <Field label="Thuế VAT (%)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(e.target.value)}
                  style={{ width: 75 }}
                />
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  {[0, 8, 10].map((rateVal) => (
                    <button
                      key={rateVal}
                      type="button"
                      onClick={() => setVatPercent(String(rateVal))}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: vatRateNum === rateVal ? 700 : 500,
                        border: '1px solid var(--border-base)',
                        background: vatRateNum === rateVal ? 'var(--brand)' : 'var(--surface-card)',
                        color: vatRateNum === rateVal ? '#fff' : 'var(--text-strong)',
                        cursor: 'pointer',
                      }}
                    >
                      {rateVal}%
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Họ tên người ký báo giá">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </Field>
          </div>
          <Field label="Điều khoản thanh toán">
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </Field>
          <Field label="Chính sách bảo hành">
            <Input value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} />
          </Field>
          <Field label="Ghi chú thêm">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      ) : (
        /* Preview Tab */
        <div
          className="print-doc-scroll"
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
            id="spare-part-quotation-print-container"
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '800px',
              minHeight: 'auto',
              background: '#ffffff',
              color: '#111827',
              padding: '24px 36px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13px',
              lineHeight: 1.4,
            }}
          >
            <PrintWatermark
              logoUrl={companyInfo?.watermarkUrl || companyInfo?.logoUrl}
              companyName={sellerName}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* 1. Header công ty & Quốc hiệu */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 8 }}>
              <div style={{ maxWidth: '52%' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#0f172a' }}>
                  {sellerName}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>
                  {sellerAddress}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  Hotline: <strong>{sellerPhone}</strong> {sellerTaxCode ? `• MST: ${sellerTaxCode}` : ''}
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '40%' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, marginTop: 1 }}>
                  Độc lập - Tự do - Hạnh phúc
                </div>
                <div style={{ fontSize: '11px', letterSpacing: '1px', marginTop: 1 }}>
                  - - - - - - - - - o 0 o - - - - - - - - -
                </div>
              </div>
            </div>

            {/* 2. Tiêu đề văn bản */}
            <div style={{ textAlign: 'center', margin: '10px 0 8px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a' }}>
                BẢNG BÁO GIÁ LINH KIỆN & PHỤ TÙNG CHÍNH HÃNG
              </div>
              <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 3, color: '#334155' }}>
                Số báo giá: <strong style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{quoteCode}</strong>
                {order.orderCode ? ` • Căn cứ Đơn order: ${order.orderCode.replace('DỰ THẢO', 'NHAP')}` : ''}
              </div>
              <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 1, color: '#475569' }}>
                Ngày {day} tháng {month} năm {year} (Có hiệu lực trong vòng {validDays} ngày)
              </div>
            </div>

            {/* 3. Thông tin khách hàng */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 5, padding: '6px 12px', background: '#f8fafc', marginBottom: 8, fontSize: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '4px 16px' }}>
                <div>Kính gửi: <strong>{customerName}</strong></div>
                <div>Người liên hệ: <strong>{contactPerson}</strong></div>
                <div>Điện thoại: <strong>{customerPhone || '—'}</strong></div>
                <div>Địa chỉ giao: <strong>{customerAddress || 'Tại kho / Điểm bán của khách hàng'}</strong></div>
                {order.equipment && (
                  <div style={{ gridColumn: '1 / -1', color: '#1d4ed8' }}>
                    Áp dụng cho máy: <strong>{order.equipment.name}</strong> ({order.equipment.machineCode})
                  </div>
                )}
                {order.supplier && (
                  <div style={{ gridColumn: '1 / -1', color: '#475569' }}>
                    Nhà sản xuất / Hãng xuất xứ: <strong>{order.supplier}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Lời mở đầu */}
            <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginBottom: 8, color: '#334155' }}>
              {sellerName} xin trân trọng gửi tới Quý Khách hàng báo giá chi tiết linh kiện phụ tùng thay thế chính hãng theo yêu cầu như sau:
            </div>

            {/* 5. Bảng chi tiết báo giá (Quy đổi VND, không hiện giá EUR gốc) */}
            <div style={{ marginBottom: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(241, 245, 249, 0.6)' }}>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', width: '35px', textAlign: 'center' }}>STT</th>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'center' }}>Tên linh kiện / Mô tả chi tiết</th>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', width: '45px', textAlign: 'center' }}>ĐVT</th>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', width: '45px', textAlign: 'center' }}>SL</th>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', width: '110px', textAlign: 'center' }}>Đơn giá</th>
                    <th style={{ border: '1px solid #000', padding: '5px 6px', width: '120px', textAlign: 'center' }}>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationItems.map(({ item: it, quantity, unitPriceVnd, subtotal }, idx: number) => {
                    return (
                      <tr key={it.id || idx}>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                          {idx + 1}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
                          <div style={{ fontWeight: 600 }}>{it.item?.name || 'Linh kiện'}</div>
                          {it.item?.category && (
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                              Phân loại: {it.item.category}
                            </div>
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>
                          {it.item?.unit || 'cái'}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>
                          {quantity}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>
                          {new Intl.NumberFormat('vi-VN').format(unitPriceVnd)}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                          {new Intl.NumberFormat('vi-VN').format(subtotal)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Chi tiết chi phí */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                      Tổng tiền hàng linh kiện:
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>
                      {totalQty}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                      {new Intl.NumberFormat('vi-VN').format(grossVnd)}
                    </td>
                  </tr>

                  {discountAmount > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', color: '#b91c1c' }}>
                          Chiết khấu{discountRateNum > 0 ? ` (${discountRateNum}%)` : ''}:
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>
                          -{new Intl.NumberFormat('vi-VN').format(discountAmount)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={5} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                          Tiền hàng sau chiết khấu:
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>
                          {new Intl.NumberFormat('vi-VN').format(goodsTotalVnd)}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* Thuế VAT */}
                  <tr>
                    <td colSpan={5} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', color: vatRateNum > 0 ? '#0f172a' : '#64748b' }}>
                      Thuế VAT {vatRateNum > 0 ? `(${vatRateNum}%)` : '(0%)'}:
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: vatRateNum > 0 ? 600 : 400, color: vatRateNum > 0 ? '#0f172a' : '#64748b' }}>
                      {vatAmount > 0 ? new Intl.NumberFormat('vi-VN').format(vatAmount) : '0'}
                    </td>
                  </tr>

                  {/* Tổng cộng thanh toán */}
                  <tr style={{ background: 'rgba(241, 245, 249, 0.6)', fontWeight: 800, fontSize: '12.5px' }}>
                    <td colSpan={5} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', textTransform: 'uppercase' }}>
                      TỔNG CỘNG THANH TOÁN{vatRateNum > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', color: '#000000', fontSize: '13.5px' }}>
                      {new Intl.NumberFormat('vi-VN').format(totalVnd)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Số tiền bằng chữ */}
            {amountInWords && (
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginBottom: 8 }}>
                Số tiền viết bằng chữ: <strong>{amountInWords}</strong>
              </div>
            )}

            {/* 6. Điều khoản thương mại */}
            <div style={{ border: '1px solid #000', borderRadius: 4, padding: '6px 10px', fontSize: '11.5px', background: '#fafafa', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', color: '#0f172a' }}>
                ĐIỀU KHOẢN THƯƠNG MẠI & BÀN GIAO:
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <li>
                  <strong>Thuế VAT:</strong>{' '}
                  {vatRateNum > 0
                    ? `Đơn giá trên chưa bao gồm thuế VAT; Thuế VAT (${vatRateNum}%) đã được tính riêng trong bảng tổng cộng trên.`
                    : 'Đơn giá trên chưa bao gồm thuế GTGT (VAT).'}
                </li>
                <li><strong>Hiệu lực báo giá:</strong> Trong vòng <strong>{validDays} ngày</strong> kể từ ngày phát hành.</li>
                <li><strong>Thời gian giao hàng:</strong> {deliveryTime}.</li>
                <li><strong>Phương thức thanh toán:</strong> {paymentTerms}.</li>
                <li><strong>Bảo hành:</strong> {warrantyTerms}</li>
                <li><strong>Phí giao hàng:</strong> Báo giá chưa bao gồm phí giao hàng, sẽ báo riêng theo thực tế giao hàng.</li>
                {notes && <li><strong>Ghi chú:</strong> {notes}</li>}
              </ul>
            </div>

            {/* 7. Chữ ký xác nhận */}
            <div className="quotation-signature-block" style={{ marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '50%', verticalAlign: 'top', padding: '0 8px 42px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                        ĐẠI DIỆN KHÁCH HÀNG
                      </div>
                      <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b', marginTop: 2 }}>
                        (Ký xác nhận, đóng dấu & gửi lại)
                      </div>
                    </td>
                    <td style={{ width: '50%', verticalAlign: 'top', padding: '0 8px 42px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                        ĐẠI DIỆN {sellerName.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b', marginTop: 2 }}>
                        (Ký & ghi rõ họ tên)
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0 8px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }}>
                      {contactPerson}
                    </td>
                    <td style={{ padding: '0 8px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px', whiteSpace: 'nowrap' }}>
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
