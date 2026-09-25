'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui';
import { Printer, FileText, Wrench } from 'lucide-react';
import { PrintWatermark } from './print-watermark';

/**
 * Khung dùng chung cho mọi văn bản in A4 (biên bản bàn giao thiết bị, biên bản
 * bàn giao / thu hồi tài sản, báo giá...).
 *
 * Xử lý sẵn 3 thứ hay sai khi in từ trong modal:
 *  - Modal dùng position fixed + backdrop-filter nên bản in bị lệch gốc tọa độ.
 *  - Khung cuộn của modal cắt mất phần nội dung phía dưới.
 *  - Tờ giấy bị flex kéo giãn, nội dung tràn ra ngoài nền trắng.
 */

export const PRINT_SHEET_CLASS = 'print-doc-sheet';
export const PRINT_SIGNATURE_CLASS = 'print-doc-signature';

export function PrintDocumentModal({
  open,
  onClose,
  title,
  description,
  printLabel = 'In biên bản (A4 / PDF)',
  editForm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  printLabel?: string;
  /** Nội dung tab "Tùy chỉnh thông tin". Bỏ trống thì ẩn luôn tab này. */
  editForm?: React.ReactNode;
  /** Nội dung tờ A4. */
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      // Bản in chỉ được render ở tab xem trước → chuyển tab rồi mới gọi print
      setActiveTab('preview');
      setTimeout(() => window.print(), 120);
      return;
    }
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="xl"
      overlayClassName="print-preview-modal-overlay"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {editForm && (
              <>
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
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Button variant="primary" onClick={handlePrint}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> {printLabel}
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

          /* Chỉ giữ lại lớp modal đang mở, ẩn toàn bộ giao diện ứng dụng phía sau */
          body > *:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          .modal-overlay:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          /* Gỡ mọi ràng buộc layout của modal (fixed / backdrop-filter / overflow)
             vì chúng làm bản in bị lệch và cắt mất nội dung */
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

          .print-doc-scroll {
            display: block !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            background: #ffffff !important;
            border-radius: 0 !important;
          }

          .${PRINT_SHEET_CLASS} {
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

          .${PRINT_SHEET_CLASS} table { page-break-inside: auto; }
          .${PRINT_SHEET_CLASS} tr,
          .${PRINT_SHEET_CLASS} li {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .${PRINT_SIGNATURE_CLASS} {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {activeTab === 'edit' && editForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '68vh', overflowY: 'auto', padding: '4px 8px' }}>
          {editForm}
        </div>
      ) : (
        <div
          className="print-doc-scroll"
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--surface-subtle, #f1f5f9)',
            padding: 20,
            display: 'flex',
            justifyContent: 'center',
            // Không để flex kéo giãn tờ giấy bằng chiều cao khung cuộn –
            // nếu stretch, nội dung dài hơn sẽ tràn ra ngoài nền trắng và vỡ khi in
            alignItems: 'flex-start',
            borderRadius: 8,
          }}
        >
          <div
            className={PRINT_SHEET_CLASS}
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
            <PrintWatermark />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Quốc hiệu - tiêu ngữ đặt cạnh tiêu đề đơn vị, dùng chung cho các biên bản. */
export function DocumentLetterhead({
  companyName,
  addressLine,
  contactLine,
}: {
  companyName: string;
  addressLine?: string;
  contactLine?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid #000',
        paddingBottom: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ maxWidth: '52%' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            color: '#0f172a',
          }}
        >
          {companyName}
        </div>
        {addressLine && <div style={{ fontSize: '11px', color: '#475569', marginTop: 2 }}>{addressLine}</div>}
        {contactLine && <div style={{ fontSize: '11px', color: '#475569' }}>{contactLine}</div>}
      </div>

      <div style={{ textAlign: 'center', minWidth: '40%' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
        </div>
        <div style={{ fontSize: '12.5px', fontWeight: 700, marginTop: 1 }}>Độc lập - Tự do - Hạnh phúc</div>
        <div style={{ fontSize: '11px', letterSpacing: '1px', marginTop: 1 }}>- - - - - - - - - o 0 o - - - - - - - - -</div>
      </div>
    </div>
  );
}

/** Hai ô thông tin bên giao / bên nhận, luôn cao bằng nhau nhờ dùng ô bảng. */
export function DocumentPartyBoxes({
  leftTitle,
  left,
  rightTitle,
  right,
}: {
  leftTitle: string;
  left: React.ReactNode;
  rightTitle: string;
  right: React.ReactNode;
}) {
  const box: React.CSSProperties = {
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    padding: '10px 14px',
    background: 'transparent',
    boxSizing: 'border-box',
    height: '100%',
  };
  const heading: React.CSSProperties = {
    fontSize: '12.5px',
    fontWeight: 800,
    textTransform: 'uppercase',
    borderBottom: '1px solid #cbd5e1',
    paddingBottom: 4,
    marginBottom: 6,
  };
  const body: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontSize: '12.5px',
  };

  return (
    <table
      style={{
        width: '100%',
        tableLayout: 'fixed',
        borderCollapse: 'collapse',
        marginBottom: 12,
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      <tbody>
        <tr>
          <td style={{ width: '50%', verticalAlign: 'top', padding: 0, paddingRight: 6 }}>
            <div style={box}>
              <div style={heading}>{leftTitle}</div>
              <div style={body}>{left}</div>
            </div>
          </td>
          <td style={{ width: '50%', verticalAlign: 'top', padding: 0, paddingLeft: 6 }}>
            <div style={box}>
              <div style={heading}>{rightTitle}</div>
              <div style={body}>{right}</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Hàng chữ ký cuối biên bản — tiêu đề và họ tên luôn thẳng cột, không vỡ trang. */
export function DocumentSignatures({
  columns,
  signSpace = 40,
}: {
  columns: { title: string; hint: string; name?: string }[];
  signSpace?: number;
}) {
  const width = `${(100 / columns.length).toFixed(2)}%`;

  return (
    <div className={PRINT_SIGNATURE_CLASS} style={{ marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
        <tbody>
          <tr>
            {columns.map((col) => (
              <td key={col.title} style={{ width, verticalAlign: 'top', padding: `0 6px ${signSpace}px` }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase' }}>{col.title}</div>
                <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#64748b' }}>{col.hint}</div>
              </td>
            ))}
          </tr>
          <tr>
            {columns.map((col, i) => (
              <td
                key={i}
                style={{ padding: '0 6px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px' }}
              >
                {col.name || ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
