'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Input, Field, Textarea } from '@/components/ui';
import { Printer, FileText, Wrench } from 'lucide-react';
import { readVndInWords } from '@/lib/number-to-words';
import { PrintWatermark } from './print-watermark';
import { useCurrentUser } from '@/components/layout/current-user';
import { getEquipmentSpecRows } from '@/lib/equipment-specs';
import { EquipmentSpecGrid } from '@/components/domain/equipment-spec-grid';

const ITEM_TYPES: Record<string, string> = {
  EQUIPMENT: 'Máy & Thiết bị',
  SPARE_PART: 'Phụ tùng',
  SERVICE: 'Dịch vụ',
};

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

export interface CustomerOrderPrintModalProps {
  open: boolean;
  onClose: () => void;
  order: any;
  customer?: any;
  location?: any;
  companyInfo?: any;
  machines?: any[];
}

export function CustomerOrderPrintModal({
  open,
  onClose,
  order,
  customer,
  location,
  companyInfo,
  machines,
}: CustomerOrderPrintModalProps) {
  const me = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  // Thông tin công ty bán (Bên bán)
  const [sellerName, setSellerName] = useState(
    companyInfo?.name || 'Công ty TNHH Kỹ Thuật Sunny'
  );
  const [sellerAddress, setSellerAddress] = useState(
    companyInfo?.address || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM'
  );
  const [sellerPhone, setSellerPhone] = useState(
    companyInfo?.phone || '0903 000 000'
  );
  const [sellerTaxCode, setSellerTaxCode] = useState(
    companyInfo?.taxCode || ''
  );
  const [signerName, setSignerName] = useState(me?.fullName || '');
  const [signerTitle, setSignerTitle] = useState(me?.positionName || 'Đại diện bán hàng');

  // Thông tin khách hàng (Bên mua)
  const [customerName, setCustomerName] = useState(
    customer?.name || order?.customer?.name || 'Quý Khách Hàng'
  );
  const [contactPerson, setContactPerson] = useState(
    customer?.contactName || order?.customer?.contactName || ''
  );
  const [customerPhone, setCustomerPhone] = useState(
    customer?.phone || order?.customer?.phone || ''
  );
  const [customerAddress, setCustomerAddress] = useState(
    customer?.address || order?.customer?.address || ''
  );
  const [deliveryPoint, setDeliveryPoint] = useState(
    location?.name || order?.location?.name || ''
  );

  // Điều khoản & ghi chú
  const [notes, setNotes] = useState(order?.notes || '');
  const [invoiceNo, setInvoiceNo] = useState(order?.invoiceNo || '');
  const [invoiceSerial, setInvoiceSerial] = useState(order?.invoiceSerial || '');
  const [invoiceDate, setInvoiceDate] = useState(
    order?.invoiceDate ? new Date(order.invoiceDate).toISOString().slice(0, 10) : ''
  );

  if (!order) return null;

  const items: any[] = order.items || [];
  const rawSubtotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const itemsTotal = items.reduce(
    (sum, it) => sum + (Number(it.totalPrice) || (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
    0
  );
  const discountAmount = Math.max(0, rawSubtotal - itemsTotal);
  const goodsAmount = Number(order.goodsAmount || itemsTotal || rawSubtotal);
  const vatRate = Number(order.vatRate || 0);
  const vatAmount = Number(
    order.vatAmount !== undefined && order.vatAmount !== null
      ? order.vatAmount
      : Math.round((goodsAmount * vatRate) / 100)
  );
  const returnedAmount = Number(order.returned || order.returnedAmount || 0);
  const totalAmount = Number(
    order.total !== undefined
      ? order.total
      : order.totalAmount !== undefined
        ? order.totalAmount
        : goodsAmount + vatAmount - returnedAmount
  );
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const orderDateObj = order.orderDate ? new Date(order.orderDate) : new Date();
  const day = orderDateObj.getDate();
  const month = orderDateObj.getMonth() + 1;
  const year = orderDateObj.getFullYear();
  const orderCode = order.orderCode || `ORD-${year}-DỰ THẢO`;

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      setTimeout(() => {
        window.print();
      }, 150);
      return;
    }
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={600}
      overlayClassName="print-preview-modal-overlay"
      title={`Hóa Đơn / Phiếu Đơn Bán (${orderCode})`}
      description="Xem trước và in đơn đặt hàng / hóa đơn bán hàng tiêu chuẩn A4 gửi khách hàng"
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
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
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handlePrint}
              style={{ background: '#7c3aed', color: '#fff' }}
            >
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In hóa đơn (A4 / PDF)
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
            margin: 0 !important;
            padding: 0 !important;
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

          #customer-order-print-container {
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

          #customer-order-print-container table {
            page-break-inside: auto;
            width: 100% !important;
          }
          #customer-order-print-container tr,
          #customer-order-print-container li {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .order-signature-block {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {activeTab === 'edit' ? (
        /* Edit Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '68vh', overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>
            🏢 Thông tin đơn vị bán hàng (Bên A)
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Người lập biểu / Đại diện bên bán">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </Field>
            <Field label="Chức danh">
              <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            👤 Thông tin khách hàng (Bên B)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên khách hàng / Doanh nghiệp">
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
            <Field label="Địa chỉ khách hàng">
              <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </Field>
          </div>
          <Field label="Điểm giao hàng / Chi nhánh nhận">
            <Input value={deliveryPoint} onChange={(e) => setDeliveryPoint(e.target.value)} />
          </Field>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            📄 Thông tin hóa đơn & Ghi chú
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: 12 }}>
            <Field label="Số hóa đơn VAT">
              <Input placeholder="VD: 00001234" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
            <Field label="Ký hiệu hóa đơn">
              <Input placeholder="VD: 1C26TAA" value={invoiceSerial} onChange={(e) => setInvoiceSerial(e.target.value)} />
            </Field>
            <Field label="Ngày hóa đơn">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Ghi chú đơn hàng">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
            id="customer-order-print-container"
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '800px',
              minHeight: 'auto',
              background: '#ffffff',
              color: '#111827',
              padding: '28px 38px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13px',
              lineHeight: 1.45,
            }}
          >
            <PrintWatermark
              logoUrl={companyInfo?.watermarkUrl || companyInfo?.logoUrl}
              companyName={sellerName}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* 1. Header công ty & Quốc hiệu */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 8 }}>
                <div style={{ maxWidth: '54%' }}>
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
                  {(invoiceNo || invoiceSerial) && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: '11px',
                        color: '#1e3a8a',
                        textAlign: 'center',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 4,
                        padding: '3px 8px',
                        display: 'inline-block',
                      }}
                    >
                      <span>HĐ GTGT: {invoiceSerial ? `Ký hiệu ${invoiceSerial} • ` : ''}</span>
                      <span>Số: <strong>{invoiceNo}</strong></span>
                      {invoiceDate ? <span> • Ngày {new Date(invoiceDate).toLocaleDateString('vi-VN')}</span> : null}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Tiêu đề văn bản */}
              <div style={{ textAlign: 'center', margin: '12px 0 10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a' }}>
                  HÓA ĐƠN BÁN HÀNG & BÀN GIAO
                </div>
                <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 3, color: '#334155' }}>
                  Mã đơn hàng: <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{orderCode}</strong>
                  {order.quotation?.quoteCode ? ` • Theo báo giá: ${order.quotation.quoteCode}` : ''}
                </div>
                <div style={{ fontSize: '11.5px', fontStyle: 'italic', marginTop: 1, color: '#475569' }}>
                  Ngày {day} tháng {month} năm {year}
                </div>
              </div>

              {/* 3. Thông tin khách hàng */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: 5, padding: '7px 12px', background: '#f8fafc', marginBottom: 10, fontSize: '12.5px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '4px 16px' }}>
                  <div>Khách hàng: <strong>{customerName}</strong></div>
                  <div>Người liên hệ: <strong>{contactPerson || '—'}</strong></div>
                  <div>Điện thoại: <strong>{customerPhone || '—'}</strong></div>
                  <div>Địa chỉ: <strong>{customerAddress || '—'}</strong></div>
                  {deliveryPoint && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      Điểm giao nhận: <strong>{deliveryPoint}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Bảng chi tiết mặt hàng */}
              <div style={{ marginBottom: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(241, 245, 249, 0.7)' }}>
                      <th style={{ border: '1px solid #000', padding: '6px 6px', width: '35px', textAlign: 'center' }}>STT</th>
                      <th style={{ border: '1px solid #000', padding: '6px 8px' }}>Tên mặt hàng & Mô tả</th>
                      <th style={{ border: '1px solid #000', padding: '6px 6px', width: '50px', textAlign: 'center' }}>ĐVT</th>
                      <th style={{ border: '1px solid #000', padding: '6px 6px', width: '45px', textAlign: 'center' }}>SL</th>
                      <th style={{ border: '1px solid #000', padding: '6px 6px', width: '85px', textAlign: 'right', whiteSpace: 'nowrap' }}>Đơn giá</th>
                      <th style={{ border: '1px solid #000', padding: '6px 6px', width: '95px', textAlign: 'right', whiteSpace: 'nowrap' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any, idx: number) => {
                      const qty = Number(it.quantity) || 0;
                      const price = Number(it.unitPrice) || 0;
                      const lineTotal = Number(it.totalPrice) || qty * price;
                      const allMachines = [
                        ...(machines || []),
                        ...(order?.customer?.machines || []),
                        ...(order?.machines || []),
                        ...(customer?.machines || []),
                      ];
                      const eq =
                        it.equipment ||
                        (it.equipmentId ? allMachines.find((m: any) => m.id === it.equipmentId) : null) ||
                        allMachines.find(
                          (m: any) =>
                            (m.name && it.name && m.name.toLowerCase() === it.name.toLowerCase()) ||
                            (m.machineCode && it.itemCode && m.machineCode === it.itemCode) ||
                            (m.model && it.name && it.name.toLowerCase().includes(m.model.toLowerCase())) ||
                            (m.name && it.name && it.name.toLowerCase().includes(m.name.toLowerCase()))
                        );
                      const specRows = eq ? getEquipmentSpecRows(eq) : [];
                      return (
                        <tr key={it.id || idx} style={{ verticalAlign: 'top' }}>
                          <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 650, color: '#0f172a' }}>{it.name}</div>
                            {specRows.length > 0 && <EquipmentSpecGrid rows={specRows} />}
                            {it.notes && (
                              <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', marginTop: specRows.length > 0 ? 2 : 0, paddingLeft: 8 }}>
                                {it.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                            {it.unit || 'cái'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'center', fontWeight: 700, verticalAlign: 'top' }}>
                            {qty}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {fmt(price)}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 6px', textAlign: 'right', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {fmt(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Dòng 1: Tổng tiền hàng */}
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                      <td colSpan={3} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'left' }}>
                        Tổng cộng ({items.length} mặt hàng):
                      </td>
                      <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'center' }}>
                        {totalQty} cái
                      </td>
                      <td style={{ border: '1px solid #000', padding: '5px 6px' }}></td>
                      <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmt(rawSubtotal)}
                      </td>
                    </tr>

                    {/* Dòng 2: Chiết khấu (nếu có) */}
                    {discountAmount > 0 && (
                      <tr>
                        <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'right', color: '#b91c1c' }}>
                          Chiết khấu:
                        </td>
                        <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', fontWeight: 600, color: '#b91c1c', whiteSpace: 'nowrap' }}>
                          -{fmt(discountAmount)}
                        </td>
                      </tr>
                    )}

                    {/* Dòng 3: Thuế VAT */}
                    <tr>
                      <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>
                        Thuế VAT ({vatRate}%):
                      </td>
                      <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {vatAmount > 0 ? fmt(vatAmount) : '0'}
                      </td>
                    </tr>

                    {/* Dòng 4: Hàng khách trả lại (nếu có) */}
                    {returnedAmount > 0 && (
                      <tr style={{ background: '#fffbeb', color: '#b45309' }}>
                        <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>
                          Hàng khách trả lại:
                        </td>
                        <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          -{fmt(returnedAmount)}
                        </td>
                      </tr>
                    )}

                    {/* Dòng 5: Tổng cộng thanh toán */}
                    <tr style={{ background: '#f1f5f9', fontWeight: 800, fontSize: '13px' }}>
                      <td colSpan={5} style={{ border: '1px solid #000', padding: '7px 8px', textAlign: 'right', textTransform: 'uppercase' }}>
                        TỔNG CỘNG THANH TOÁN{vatRate > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                      </td>
                      <td style={{ border: '1px solid #000', padding: '7px 6px', textAlign: 'right', color: '#7c3aed', fontSize: '13.5px', whiteSpace: 'nowrap' }}>
                        {fmt(totalAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Số tiền bằng chữ */}
              <div style={{ fontSize: '12.5px', fontStyle: 'italic', marginBottom: 12, textAlign: 'right' }}>
                Số tiền viết bằng chữ: <strong>{readVndInWords(totalAmount)}</strong>
              </div>

              {/* Ghi chú & Điều khoản */}
              {(notes || order.dueDate) && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 10px', background: '#fafafa', marginBottom: 14, fontSize: '12px' }}>
                  {order.dueDate && (
                    <div>Hạn thanh toán: <strong>{new Date(order.dueDate).toLocaleDateString('vi-VN')}</strong></div>
                  )}
                  {notes && (
                    <div style={{ marginTop: 2 }}>Ghi chú: {notes}</div>
                  )}
                </div>
              )}

              {/* Khối chữ ký */}
              <div className="order-signature-block" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', textAlign: 'center', fontSize: '12.5px' }}>
                <div style={{ minWidth: '220px' }}>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>ĐẠI DIỆN BÊN MUA</div>
                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>(Ký, ghi rõ họ tên)</div>
                  <div style={{ height: '70px' }} />
                  <div style={{ fontWeight: 600 }}>{contactPerson || customerName}</div>
                </div>

                <div style={{ minWidth: '220px' }}>
                  <div style={{ fontSize: '11.5px', fontStyle: 'italic', color: '#475569', marginBottom: 2 }}>
                    Ngày {day} tháng {month} năm {year}
                  </div>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>ĐẠI DIỆN BÊN BÁN</div>
                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>(Ký, đóng dấu, ghi rõ họ tên)</div>
                  <div style={{ height: '70px' }} />
                  <div style={{ fontWeight: 600 }}>{signerName || 'Đại diện kinh doanh'}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{signerTitle}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
