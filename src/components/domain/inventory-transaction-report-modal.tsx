'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Input, Field } from '@/components/ui';
import { Printer, FileText, Wrench } from 'lucide-react';
import type { CompanyInfo } from '@/server/modules/settings/branding';
import { PrintWatermark } from './print-watermark';
import { parseStockCostMetrics, getCleanStockNote } from '@/server/modules/spare-parts/types';

interface InventoryTransactionReportModalProps {
  open: boolean;
  onClose: () => void;
  transaction: any;
  companyInfo?: CompanyInfo;
}

export function InventoryTransactionReportModal({
  open,
  onClose,
  transaction,
  companyInfo,
}: InventoryTransactionReportModalProps) {
  if (!transaction) return null;

  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  // Công ty & Thông tin liên hệ
  const [companyName, setCompanyName] = useState(
    companyInfo?.name || 'Công ty Sunny'
  );
  const [companyAddress, setCompanyAddress] = useState(
    companyInfo?.address || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM'
  );
  const [companyPhone, setCompanyPhone] = useState(
    companyInfo?.phone || ''
  );

  // Người ký
  const [creatorName, setCreatorName] = useState('Nguyễn Văn Kỹ Thuật');
  const [creatorTitle, setCreatorTitle] = useState('Người lập phiếu');
  const [warehouseKeeper, setWarehouseKeeper] = useState('Thủ kho');
  const [partnerPerson, setPartnerPerson] = useState(
    transaction.type === 'IN'
      ? 'Đại diện bên giao hàng'
      : transaction.type === 'OUT'
      ? 'Đại diện bên nhận'
      : 'Thủ kho nhận'
  );

  const [customNote, setCustomNote] = useState(getCleanStockNote(transaction.note));

  const costMetrics = parseStockCostMetrics(transaction.note);

  const handlePrint = () => {
    window.print();
  };

  const createdDate = new Date(transaction.createdAt || new Date());
  const day = createdDate.getDate();
  const month = createdDate.getMonth() + 1;
  const year = createdDate.getFullYear();

  const isTransfer = transaction.type === 'TRANSFER';
  const isOut = transaction.type === 'OUT';

  const docTitle = isTransfer
    ? 'PHIẾU ĐIỀU CHUYỂN KHO NỘI BỘ'
    : isOut
    ? 'PHIẾU XUẤT KHO VẬT TƯ / PHỤ TÙNG'
    : 'PHIẾU NHẬP KHO VẬT TƯ / PHỤ TÙNG';

  const items = transaction.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  const hasPrices = items.some((it: any) => Number(it.unitPrice) > 0);
  const totalAmount = items.reduce(
    (sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`In ${docTitle} (${transaction.transCode})`}
      description="Biên bản lưu kho chuẩn chỉnh dành cho kế toán, thủ kho và kỹ thuật viên"
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
            <Button variant="primary" onClick={handlePrint}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In phiếu (A4 / PDF)
            </Button>
          </div>
        </div>
      }
    >
      {/* Print CSS Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #inventory-transaction-print-container,
          #inventory-transaction-print-container * {
            visibility: visible !important;
          }
          #inventory-transaction-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16mm 14mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 13pt !important;
            line-height: 1.4 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {activeTab === 'edit' ? (
        /* Edit Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '68vh', overflowY: 'auto', padding: '4px 8px' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>
            🏢 Thông tin đơn vị lập phiếu
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tên công ty / Đơn vị">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>
            <Field label="Hotline / Số điện thoại">
              <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="Địa chỉ đơn vị">
            <Input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
          </Field>

          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', marginTop: 8 }}>
            ✍️ Thông tin người ký nhận
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Người lập phiếu">
              <Input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} />
            </Field>
            <Field label="Thủ kho ký">
              <Input value={warehouseKeeper} onChange={(e) => setWarehouseKeeper(e.target.value)} />
            </Field>
            <Field label="Người nhận / Giao / Điều chuyển">
              <Input value={partnerPerson} onChange={(e) => setPartnerPerson(e.target.value)} />
            </Field>
          </div>

          <Field label="Ghi chú bổ sung trên phiếu">
            <Input
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="VD: Kiểm tra nguyên đai nguyên kiện trước khi nhập/xuất kho..."
            />
          </Field>
        </div>
      ) : (
        /* Preview Tab */
        <div
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--surface-subtle, #f1f5f9)',
            padding: 20,
            display: 'flex',
            justifyContent: 'center',
            borderRadius: 8,
          }}
        >
          <div
            id="inventory-transaction-print-container"
            style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '800px',
              minHeight: '1050px',
              background: '#ffffff',
              color: '#111827',
              padding: '36px 44px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13.5px',
              lineHeight: 1.45,
            }}
          >
            <PrintWatermark
              logoUrl={companyInfo?.watermarkUrl || companyInfo?.logoUrl}
              companyName={companyName}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000', paddingBottom: 10, marginBottom: 14 }}>
              <div style={{ maxWidth: '52%' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#0f172a' }}>
                  {companyName}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>
                  {companyAddress}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  Điện thoại: <strong>{companyPhone}</strong> • Phần mềm quản trị WorkHub
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

            {/* Tiêu đề văn bản */}
            <div style={{ textAlign: 'center', margin: '16px 0 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {docTitle}
              </div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: 4, color: '#334155' }}>
                Mã phiếu: <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{transaction.transCode}</strong>
              </div>
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: 2, color: '#475569' }}>
                Ngày {day} tháng {month} năm {year}
              </div>
            </div>

            {/* Thông tin tuyến kho & lý do */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 14px', background: '#f8fafc', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: '12.5px' }}>
                {transaction.type === 'IN' && (
                  <>
                    <div>Kho tiếp nhận: <strong>{transaction.targetWarehouse?.name || '—'}</strong> ({transaction.targetWarehouse?.code || '—'})</div>
                    <div>Hình thức: <strong>Nhập kho mới / Nhập bù tồn</strong></div>
                  </>
                )}

                {transaction.type === 'OUT' && (
                  <>
                    <div>Kho xuất: <strong>{transaction.sourceWarehouse?.name || '—'}</strong> ({transaction.sourceWarehouse?.code || '—'})</div>
                    <div>Hình thức: <strong>Xuất kho sử dụng / Bảo dưỡng</strong></div>
                  </>
                )}

                {transaction.type === 'TRANSFER' && (
                  <>
                    <div>Kho xuất hàng (Nguồn): <strong>{transaction.sourceWarehouse?.name || '—'}</strong></div>
                    <div>Kho tiếp nhận (Đích): <strong>{transaction.targetWarehouse?.name || '—'}</strong></div>
                  </>
                )}

                <div style={{ gridColumn: '1 / -1' }}>
                  Lý do: <strong>{transaction.reason || '—'}</strong>
                </div>

                {(customNote || getCleanStockNote(transaction.note)) && (
                  <div style={{ gridColumn: '1 / -1', color: '#475569', fontStyle: 'italic' }}>
                    Ghi chú: {customNote || getCleanStockNote(transaction.note)}
                  </div>
                )}
              </div>
            </div>

            {/* Bảng danh mục phụ tùng / vật tư */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                Danh mục linh kiện, phụ tùng chi tiết:
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#cbd5e1' }}>
                    <th style={{ border: '1px solid #000', padding: '6px 8px', width: '35px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>STT</th>
                    <th style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 700, color: '#0f172a' }}>Tên linh kiện / Vật tư</th>
                    <th style={{ border: '1px solid #000', padding: '6px 8px', width: '55px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>ĐVT</th>
                    <th style={{ border: '1px solid #000', padding: '6px 8px', width: '55px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>SL</th>
                    {hasPrices && (
                      <>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', width: '110px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>Đơn giá</th>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', width: '120px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>Thành tiền</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, idx: number) => {
                    const price = Number(it.unitPrice) || 0;
                    const subtotal = price * Number(it.quantity);

                    return (
                      <tr key={it.id || idx}>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{it.item?.name || 'Linh kiện'}</div>
                          {it.ticket && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              Dành cho phiếu sửa chữa: {it.ticket.ticketCode}
                            </div>
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>
                          {it.item?.unit || 'cái'}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                          {it.quantity}
                        </td>
                        {hasPrices && (
                          <>
                            <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right' }}>
                              {price > 0 ? new Intl.NumberFormat('vi-VN').format(price) : '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                              {subtotal > 0 ? new Intl.NumberFormat('vi-VN').format(subtotal) : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* Dòng tổng */}
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={3} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right' }}>
                      CỘNG TOÀN PHIẾU:
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', color: '#15803d' }}>
                      {totalQty}
                    </td>
                    {hasPrices && (
                      <>
                        <td style={{ border: '1px solid #000', padding: '6px 8px' }}></td>
                        <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', color: '#0f172a' }}>
                          {new Intl.NumberFormat('vi-VN').format(totalAmount)}
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bóc tách chi phí lô nhập kho (nếu có cước / phí khác) */}
            {costMetrics && transaction.type === 'IN' && (
              <div style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Chi tiết cấu thành giá vốn lô hàng:
                </div>
                <table style={{ width: '60%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px 10px' }}>Tiền mua hàng (FOB)</td>
                      <td style={{ border: '1px solid #000', padding: '5px 10px', textAlign: 'right', fontWeight: 600 }}>
                        {new Intl.NumberFormat('vi-VN').format(costMetrics.merchandiseTotal)}
                      </td>
                    </tr>
                    {costMetrics.shippingFee > 0 && (
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '5px 10px' }}>Cước vận chuyển</td>
                        <td style={{ border: '1px solid #000', padding: '5px 10px', textAlign: 'right', fontWeight: 600 }}>
                          {new Intl.NumberFormat('vi-VN').format(costMetrics.shippingFee)}
                        </td>
                      </tr>
                    )}
                    {costMetrics.otherFee > 0 && (
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '5px 10px' }}>Chi phí khác (thuế NK, customs…)</td>
                        <td style={{ border: '1px solid #000', padding: '5px 10px', textAlign: 'right', fontWeight: 600 }}>
                          {new Intl.NumberFormat('vi-VN').format(costMetrics.otherFee)}
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: 'rgba(241, 245, 249, 0.6)' }}>
                      <td style={{ border: '1px solid #000', padding: '5px 10px', fontWeight: 800 }}>
                        TỔNG GIÁ VỐN NHẬP KHO (Landed Cost)
                      </td>
                      <td style={{ border: '1px solid #000', padding: '5px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {new Intl.NumberFormat('vi-VN').format(costMetrics.totalLandedCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: 4 }}>
                  Phân bổ theo phương thức: {costMetrics.allocationMethod === 'VALUE' ? 'Tỷ lệ giá trị hàng' : 'Số lượng (chia đều)'}
                </div>
              </div>
            )}

            {/* Cam kết & Chữ ký */}
            <div style={{ marginTop: 24, pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '12px', fontStyle: 'italic', marginBottom: 16 }}>
                Phiếu được lập thành 03 bản: 01 bản lưu phòng kế toán, 01 bản lưu thủ kho, 01 bản giao người nhận/vận chuyển.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                    {creatorTitle}
                  </div>
                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>(Ký & ghi rõ họ tên)</div>
                  <div style={{ height: '70px' }}></div>
                  <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{creatorName}</div>
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                    THỦ KHO
                  </div>
                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>(Ký & ghi rõ họ tên)</div>
                  <div style={{ height: '70px' }}></div>
                  <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{warehouseKeeper}</div>
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                    {transaction.type === 'IN'
                      ? 'NGƯỜI GIAO HÀNG'
                      : transaction.type === 'OUT'
                      ? 'NGƯỜI NHẬN HÀNG'
                      : 'THỦ KHO NHẬN'}
                  </div>
                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>(Ký & ghi rõ họ tên)</div>
                  <div style={{ height: '70px' }}></div>
                  <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{partnerPerson}</div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
