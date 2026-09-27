'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Input, Field } from '@/components/ui';
import { Printer, FileText, Wrench } from 'lucide-react';
import type { CompanyInfo } from '@/server/modules/settings/branding';
import { readVndInWords } from '@/lib/number-to-words';
import type { SparePartPricingConfig } from '@/server/modules/spare-parts/types';
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

  // Thông tin Đơn vị mua hàng (Bên mua - Buyer)
  const [buyerName, setBuyerName] = useState(
    companyInfo?.name || 'Công ty Sunny'
  );
  const [buyerAddress, setBuyerAddress] = useState(
    companyInfo?.address || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM'
  );
  const [buyerPhone, setBuyerPhone] = useState(
    companyInfo?.phone || ''
  );
  const [buyerTaxCode, setBuyerTaxCode] = useState(companyInfo?.taxCode || '');
  const [signerName, setSignerName] = useState('Phụ trách Mua hàng / Kỹ thuật');
  const [deliveryWarehouse, setDeliveryWarehouse] = useState(
    order.targetWarehouse?.name
      ? `${order.targetWarehouse.name}${order.targetWarehouse.address ? ` - ${order.targetWarehouse.address}` : ''}`
      : 'Kho Tổng (TP.HCM)'
  );

  // Thông tin Nhà cung cấp (Bên bán - Supplier)
  const [supplierName, setSupplierName] = useState(
    order.supplier || 'Selmi (Ý)'
  );
  const [supplierContact, setSupplierContact] = useState('Bộ phận Bán hàng / Export Department');
  const [supplierAddress, setSupplierAddress] = useState('Via Mario Cermenati 36, 12060 Santa Vittoria d\'Alba (CN), Italy');

  // Điều khoản & Thông số PO
  const [deliveryTime, setDeliveryTime] = useState(
    order.etaDate || pricingConfig?.defaultDeliveryTime || '15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)'
  );
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '');
  const [paymentTerms, setPaymentTerms] = useState(
    pricingConfig?.defaultPaymentTerms || 'Tạm ứng 50% khi xác nhận PO, 50% còn lại trước khi xuất hàng'
  );

  const rawNotes = order.notes || '';
  const parsedVatFromNotes = rawNotes.match(/\[VAT:\s*(\d+)%\]/i)?.[1];
  const cleanNotes = rawNotes.replace(/\[VAT:\s*\d+%\]/gi, '').trim();

  const [notes, setNotes] = useState(cleanNotes || 'Linh kiện chính hãng nhập khẩu nguyên chiếc theo tiêu chuẩn nhà sản xuất.');

  const initialVatRate = order.vatRate !== undefined && order.vatRate !== null
    ? Number(order.vatRate)
    : parsedVatFromNotes !== undefined
      ? Number(parsedVatFromNotes)
      : (pricingConfig?.defaultVatRate ?? 0);
  const [vatPercent, setVatPercent] = useState<string>(String(initialVatRate));

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      setTimeout(() => {
        window.print();
      }, 120);
      return;
    }
    window.print();
  };

  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  const poCode = (order.orderCode || `PO-${year}`)
    .replace('DỰ THẢO', 'PO')
    .replace('BG-', 'PO-')
    .replace('NHAP-', 'PO-');

  // Tiền tệ & Tỉ giá
  const currency = (order.currency || 'EUR').toUpperCase();
  const exchangeRate = Number(order.exchangeRate || pricingConfig?.defaultExchangeRateEur || 32500);

  // Danh sách mặt hàng đặt mua từ Nhà cung cấp
  const items = order.items || [];
  const poItems = items.map((it: any) => {
    const quantity = Math.max(1, Number(it.quantity) || 1);
    const unitPriceEur = Number(it.unitPriceEur || 0);
    const unitPriceVnd = Number(it.unitPriceVnd || (unitPriceEur > 0 ? Math.round(unitPriceEur * exchangeRate) : 0));
    const subtotalEur = unitPriceEur * quantity;
    const subtotalVnd = unitPriceVnd * quantity;

    return {
      item: it.item || { name: 'Phụ tùng / Linh kiện', itemCode: 'FK' },
      quantity,
      unitPriceEur,
      unitPriceVnd,
      subtotalEur,
      subtotalVnd,
    };
  });

  const totalQty = poItems.reduce((sum: number, it: any) => sum + it.quantity, 0);
  const totalGoodsEur = poItems.reduce((sum: number, it: any) => sum + it.subtotalEur, 0);
  const totalGoodsVnd = poItems.reduce((sum: number, it: any) => sum + it.subtotalVnd, 0);

  const shippingFee = Number(order.shippingFee || 0);
  const customsFee = Number(order.customsFee || 0);

  const totalBeforeVatVnd = totalGoodsVnd + shippingFee + customsFee;
  const vatRateNum = Math.max(0, Number(vatPercent) || 0);
  const vatAmountVnd = Math.round((totalBeforeVatVnd * vatRateNum) / 100);
  const finalTotalVnd = totalBeforeVatVnd + vatAmountVnd;
  const amountInWords = readVndInWords(finalTotalVnd);

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={600}
      overlayClassName="print-preview-modal-overlay"
      title={`In Phiếu Đặt Hàng Nhà Cung Cấp (${poCode})`}
      description="Phiếu đặt mua linh kiện, phụ tùng gửi Nhà cung cấp (Purchase Order) theo chuẩn A4"
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
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In phiếu đặt hàng NCC (A4 / PDF)
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
          }

          .print-preview-modal-overlay .modal-card {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .print-preview-modal-overlay .modal-header,
          .print-preview-modal-overlay .modal-footer {
            display: none !important;
          }
          .print-preview-modal-overlay .modal-body {
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
            🏢 Thông tin đơn vị đặt mua (Bên Mua / Buyer)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên công ty / Đơn vị mua">
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </Field>
            <Field label="Hotline / Điện thoại">
              <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Địa chỉ văn phòng">
              <Input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
            </Field>
            <Field label="Mã số thuế">
              <Input value={buyerTaxCode} onChange={(e) => setBuyerTaxCode(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Kho nhận hàng dự kiến">
              <Input value={deliveryWarehouse} onChange={(e) => setDeliveryWarehouse(e.target.value)} />
            </Field>
            <Field label="Người phụ trách mua hàng / Ký duyệt">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            🏭 Thông tin Nhà cung cấp (Bên Bán / Supplier)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên Nhà cung cấp">
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </Field>
            <Field label="Người liên hệ / Bộ phận">
              <Input value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} />
            </Field>
          </div>
          <Field label="Địa chỉ Nhà cung cấp / Trụ sở">
            <Input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} />
          </Field>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            📋 Kế hoạch giao hàng & Điều khoản thanh toán
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Thời gian dự kiến nhận hàng (ETA)">
              <Input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </Field>
            <Field label="Mã vận đơn quốc tế tracking (nếu có)">
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </Field>
          </div>
          <Field label="Điều khoản thanh toán quốc tế">
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </Field>
          <Field label="Ghi chú đơn đặt hàng">
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
              width: '210mm',
              minHeight: '297mm',
              background: '#ffffff',
              padding: '12mm 15mm',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
              borderRadius: 2,
              position: 'relative',
              boxSizing: 'border-box',
              color: '#000000',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13px',
              lineHeight: 1.4,
            }}
          >
            <PrintWatermark
              logoUrl={companyInfo?.watermarkUrl || companyInfo?.logoUrl}
              companyName={buyerName}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* 1. Header công ty & Tiêu ngữ */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000000', paddingBottom: 6, marginBottom: 8, background: 'transparent' }}>
                <div style={{ maxWidth: '52%' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#000000' }}>
                    {buyerName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#000000', marginTop: 2 }}>
                    {buyerAddress}
                  </div>
                  <div style={{ fontSize: '11px', color: '#000000' }}>
                    Hotline: <strong>{buyerPhone}</strong> {buyerTaxCode ? `• MST: ${buyerTaxCode}` : ''}
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: '40%', color: '#000000' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#000000' }}>
                    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, marginTop: 1, color: '#000000' }}>
                    Độc lập - Tự do - Hạnh phúc
                  </div>
                  <div style={{ fontSize: '11px', letterSpacing: '1px', marginTop: 1, color: '#000000' }}>
                    - - - - - - - - - o 0 o - - - - - - - - -
                  </div>
                </div>
              </div>

              {/* 2. Tiêu đề văn bản */}
              <div style={{ textAlign: 'center', margin: '12px 0 10px', color: '#000000' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#000000' }}>
                  ĐƠN ĐẶT HÀNG NHÀ CUNG CẤP
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px', color: '#000000', marginTop: 2 }}>
                  (PURCHASE ORDER - PO)
                </div>
                <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 4, color: '#000000' }}>
                  Số PO: <strong style={{ fontFamily: 'monospace', fontSize: 13, color: '#000000' }}>{poCode}</strong>
                  {currency === 'EUR' ? ` • Tỉ giá EUR/VND: ${exchangeRate.toLocaleString('vi-VN')} ₫/€` : ''}
                </div>
                <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 1, color: '#000000' }}>
                  Ngày {day} tháng {month} năm {year}
                </div>
              </div>

              {/* 3. Thông tin 2 bên đối tác */}
              <div style={{ border: '1px solid #000000', borderRadius: 5, padding: '8px 12px', background: 'transparent', marginBottom: 10, fontSize: '12px', color: '#000000' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '6px 16px' }}>
                  <div>
                    <span style={{ color: '#000000' }}>Đơn vị đặt mua (Buyer):</span>{' '}
                    <strong style={{ color: '#000000' }}>{buyerName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#000000' }}>Nhà cung cấp (Supplier):</span>{' '}
                    <strong style={{ color: '#000000' }}>{supplierName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#000000' }}>Người lập phiếu:</span>{' '}
                    <strong style={{ color: '#000000' }}>{signerName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#000000' }}>Đại diện NCC:</span>{' '}
                    <strong style={{ color: '#000000' }}>{supplierContact}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#000000' }}>Kho nhận hàng:</span>{' '}
                    <strong style={{ color: '#000000' }}>{deliveryWarehouse}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#000000' }}>Địa chỉ NCC:</span>{' '}
                    <span style={{ color: '#000000' }}>{supplierAddress}</span>
                  </div>
                  {order.equipment && (
                    <div style={{ gridColumn: '1 / -1', color: '#000000' }}>
                      Cung ứng linh kiện cho thiết bị: <strong>{order.equipment.name}</strong> ({order.equipment.machineCode})
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Lời dẫn */}
              <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginBottom: 8, color: '#000000' }}>
                {buyerName} trân trọng gửi Đơn đặt hàng (Purchase Order) các danh mục phụ tùng, linh kiện chi tiết như sau:
              </div>

              {/* 5. Bảng danh sách chi tiết phụ tùng đặt mua */}
              <div style={{ marginBottom: 10, background: 'transparent' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', background: 'transparent', color: '#000000' }}>
                  <thead>
                    <tr style={{ background: 'rgba(203, 213, 225, 0.45)', color: '#000000' }}>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '35px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>STT</th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '105px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>Mã linh kiện</th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>Tên phụ tùng / Mô tả chi tiết</th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '45px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>ĐVT</th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '45px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>SL</th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '105px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>
                        {currency === 'EUR' ? 'Đơn giá (€)' : 'Đơn giá (₫)'}
                      </th>
                      <th style={{ border: '1px solid #000000', padding: '5px 6px', width: '115px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>
                        {currency === 'EUR' ? 'Thành tiền (€)' : 'Thành tiền (₫)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody style={{ background: 'transparent', color: '#000000' }}>
                    {poItems.map((it: any, idx: number) => {
                      const itemCode = it.item?.partNumber || it.item?.itemCode || it.item?.sku || it.item?.code || '-';
                      const unit = it.item?.unit || 'cái';
                      const price = currency === 'EUR' ? it.unitPriceEur : it.unitPriceVnd;
                      const subtotal = currency === 'EUR' ? it.subtotalEur : it.subtotalVnd;

                      return (
                        <tr key={idx} style={{ background: 'transparent', color: '#000000' }}>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', color: '#000000' }}>
                            {idx + 1}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 600, color: '#000000' }}>
                            {itemCode}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', color: '#000000' }}>
                            <div style={{ fontWeight: 600, color: '#000000' }}>{it.item?.name || 'Phụ tùng'}</div>
                            {it.item?.category && (
                              <div style={{ fontSize: '10.5px', color: '#000000' }}>
                                Danh mục: {it.item.category}
                              </div>
                            )}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', color: '#000000' }}>
                            {unit}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>
                            {it.quantity}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', color: '#000000' }}>
                            {currency === 'EUR'
                              ? `${price.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                              : `${price.toLocaleString('vi-VN')} ₫`}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                            {currency === 'EUR'
                              ? `${subtotal.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                              : `${subtotal.toLocaleString('vi-VN')} ₫`}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Hàng tổng số lượng và tiền hàng linh kiện */}
                    <tr style={{ background: 'transparent', fontWeight: 700, color: '#000000' }}>
                      <td colSpan={4} style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'right', color: '#000000' }}>
                        Tổng cộng tiền hàng ({poItems.length} linh kiện):
                      </td>
                      <td style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: '#000000' }}>
                        {totalQty}
                      </td>
                      <td style={{ border: '1px solid #000000', padding: '5px 6px' }}></td>
                      <td style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: '#000000' }}>
                        {currency === 'EUR'
                          ? `${totalGoodsEur.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                          : `${totalGoodsVnd.toLocaleString('vi-VN')} ₫`}
                      </td>
                    </tr>

                    {/* Dòng quy đổi VND nếu đơn là EUR */}
                    {currency === 'EUR' && (
                      <tr style={{ background: 'transparent', color: '#000000' }}>
                        <td colSpan={6} style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', color: '#000000' }}>
                          Quy đổi tiền hàng (tỉ giá {exchangeRate.toLocaleString('vi-VN')} ₫/€):
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                          {totalGoodsVnd.toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    )}

                    {/* Cước vận chuyển nếu có */}
                    {shippingFee !== 0 && (
                      <tr style={{ background: 'transparent', color: '#000000' }}>
                        <td colSpan={6} style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', color: '#000000' }}>
                          Cước vận chuyển quốc tế phân bổ:
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                          {shippingFee.toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    )}

                    {/* Phí khác / Hải quan nếu có */}
                    {customsFee !== 0 && (
                      <tr style={{ background: 'transparent', color: '#000000' }}>
                        <td colSpan={6} style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', color: '#000000' }}>
                          Phí hải quan / thủ tục nhập khẩu:
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                          {customsFee.toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    )}

                    {/* Thuế VAT */}
                    {vatRateNum > 0 && (
                      <tr style={{ background: 'transparent', color: '#000000' }}>
                        <td colSpan={6} style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', color: '#000000' }}>
                          Thuế VAT ({vatRateNum}%):
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: '#000000' }}>
                          {vatAmountVnd.toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    )}

                    {/* Tổng cộng thanh toán */}
                    <tr style={{ background: 'transparent', fontWeight: 800, fontSize: '13px', color: '#000000' }}>
                      <td colSpan={6} style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'right', textTransform: 'uppercase', color: '#000000' }}>
                        TỔNG CỘNG GIÁ TRỊ ĐƠN HÀNG{vatRateNum > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                      </td>
                      <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'right', color: '#000000', fontSize: '13.5px' }}>
                        {finalTotalVnd.toLocaleString('vi-VN')}&nbsp;₫
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Số tiền bằng chữ */}
              {amountInWords && (
                <div style={{ fontSize: '12px', fontStyle: 'italic', marginBottom: 8, color: '#000000' }}>
                  Tổng tiền quy đổi viết bằng chữ: <strong>{amountInWords}</strong>
                </div>
              )}

              {/* 6. Kế hoạch giao nhận & Điều khoản */}
              <div style={{ border: '1px solid #000000', borderRadius: 4, padding: '6px 10px', fontSize: '11.5px', background: 'transparent', marginBottom: 12, color: '#000000' }}>
                <div style={{ fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', color: '#000000' }}>
                  KẾ HOẠCH GIAO HÀNG & ĐIỀU KHOẢN ĐƠN HÀNG:
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2, color: '#000000' }}>
                  <li><strong>Thời gian dự kiến nhận hàng (ETA):</strong> {deliveryTime}</li>
                  <li><strong>Địa điểm nhập kho / Nơi giao hàng:</strong> {deliveryWarehouse}</li>
                  {trackingNumber && (
                    <li><strong>Mã vận đơn quốc tế tracking:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{trackingNumber}</span></li>
                  )}
                  <li><strong>Phương thức thanh toán:</strong> {paymentTerms}</li>
                  <li><strong>Yêu cầu chất lượng & Chứng từ:</strong> Hàng mới 100%, chính hãng từ nhà sản xuất {supplierName}, đính kèm Packing List và hóa đơn thương mại (Commercial Invoice).</li>
                  {notes && <li><strong>Ghi chú:</strong> {notes}</li>}
                </ul>
              </div>

              {/* 7. Chữ ký xác nhận */}
              <div className="quotation-signature-block" style={{ marginTop: 12, color: '#000000' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', color: '#000000', background: 'transparent' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '50%', verticalAlign: 'top', padding: '0 8px 46px', color: '#000000' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase', color: '#000000' }}>
                          ĐẠI DIỆN BÊN MUA (BUYER)
                        </div>
                        <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#000000', marginTop: 2 }}>
                          (Ký duyệt & đóng dấu)
                        </div>
                      </td>
                      <td style={{ width: '50%', verticalAlign: 'top', padding: '0 8px 46px', color: '#000000' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase', color: '#000000' }}>
                          XÁC NHẬN NHÀ CUNG CẤP (SUPPLIER)
                        </div>
                        <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#000000', marginTop: 2 }}>
                          (Ký xác nhận & gửi lại)
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0 8px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px', whiteSpace: 'nowrap', color: '#000000' }}>
                        {signerName}
                      </td>
                      <td style={{ padding: '0 8px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px', color: '#000000' }}>
                        {supplierContact}
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
