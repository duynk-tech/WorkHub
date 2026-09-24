'use client';

import React from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui';
import { Printer } from 'lucide-react';
import { readVndInWords } from '@/lib/number-to-words';
import type { CompanyInfo } from '@/server/modules/settings/branding';
import { PrintWatermark } from './print-watermark';

/**
 * Phiếu thu / phiếu chi bản in A4.
 *
 * Dùng chung một mẫu cho cả hai chiều tiền vì bố cục giống hệt nhau, chỉ khác
 * tiêu đề và cách gọi bên đối ứng (người nộp / người nhận). Tách hai file sẽ
 * khiến hai phiếu trôi dần khác nhau mỗi lần sửa.
 */

export type VoucherDirection = 'IN' | 'OUT';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const fmtDate = (iso?: string | Date | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

const METHOD_LABELS: Record<string, string> = {
  TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  CARD: 'Quẹt thẻ',
  OFFSET: 'Cấn trừ công nợ',
};

export function PaymentVoucherModal({
  open,
  onClose,
  direction,
  payment,
  partnerName,
  partnerAddress,
  company,
}: {
  open: boolean;
  onClose: () => void;
  direction: VoucherDirection;
  /** Bản ghi phiếu thu hoặc phiếu chi. */
  payment: any;
  /** Khách hàng (phiếu thu) hoặc nhà cung cấp (phiếu chi). */
  partnerName: string;
  partnerAddress?: string | null;
  company?: CompanyInfo;
}) {
  if (!payment) return null;

  const isIn = direction === 'IN';
  const amount = Number(payment.amount || 0);
  const relatedCode = payment.order?.orderCode || null;

  const title = isIn ? 'PHIẾU THU' : 'PHIẾU CHI';
  const partnerLabel = isIn ? 'Họ tên người nộp tiền' : 'Họ tên người nhận tiền';
  const reasonLabel = isIn ? 'Lý do nộp' : 'Lý do chi';
  const defaultReason = isIn
    ? `Thu tiền hàng${relatedCode ? ` theo đơn ${relatedCode}` : ''}`
    : `Chi trả tiền hàng${relatedCode ? ` theo phiếu đặt hàng ${relatedCode}` : ''}`;

  const line: React.CSSProperties = { display: 'flex', gap: 6, marginBottom: 7, fontSize: '13px' };
  const label: React.CSSProperties = { whiteSpace: 'nowrap' };
  const dotted: React.CSSProperties = {
    flex: 1,
    borderBottom: '1px dotted #555',
    paddingLeft: 4,
    fontWeight: 600,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${isIn ? 'Phiếu thu' : 'Phiếu chi'}: ${payment.paymentCode}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="no-print">
            Đóng
          </Button>
          <Button variant="primary" onClick={() => window.print()} className="no-print">
            <Printer size={15} style={{ marginRight: 6 }} /> In phiếu
          </Button>
        </>
      }
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payment-voucher-print, #payment-voucher-print * { visibility: visible !important; }
          #payment-voucher-print {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 14mm 16mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 13pt !important;
          }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div
        id="payment-voucher-print"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#fff',
          color: '#000',
          padding: 24,
          fontFamily: "'Times New Roman', serif",
        }}
      >
        <PrintWatermark
          logoUrl={company?.watermarkUrl || company?.logoUrl}
          companyName={company?.name}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Đầu phiếu: đơn vị phát hành */}
        <div style={{ marginBottom: 14, fontSize: '13px', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>
            {company?.name || 'Công ty'}
          </div>
          {company?.address && <div>{company.address}</div>}
          {company?.taxCode && <div>MST: {company.taxCode}</div>}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: 1 }}>{title}</div>
          <div style={{ fontSize: '13px', fontStyle: 'italic', marginTop: 4 }}>
            Ngày {fmtDate(payment.paidAt)}
          </div>
          <div style={{ fontSize: '13px', marginTop: 2 }}>
            Số: <strong>{payment.paymentCode}</strong>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={line}>
            <span style={label}>{partnerLabel}:</span>
            <span style={dotted}>{partnerName}</span>
          </div>
          {partnerAddress && (
            <div style={line}>
              <span style={label}>Địa chỉ:</span>
              <span style={dotted}>{partnerAddress}</span>
            </div>
          )}
          <div style={line}>
            <span style={label}>{reasonLabel}:</span>
            <span style={dotted}>{payment.note?.trim() || defaultReason}</span>
          </div>
          <div style={line}>
            <span style={label}>Số tiền:</span>
            <span style={{ ...dotted, fontSize: '15px' }}>{fmt(amount)}</span>
          </div>
          <div style={{ ...line, fontStyle: 'italic' }}>
            <span style={label}>Bằng chữ:</span>
            <span style={dotted}>{readVndInWords(amount)}</span>
          </div>
          <div style={line}>
            <span style={label}>Hình thức:</span>
            <span style={dotted}>{METHOD_LABELS[payment.method] || payment.method || '—'}</span>
          </div>
          <div style={line}>
            <span style={label}>Kèm theo chứng từ gốc:</span>
            <span style={dotted}>
              {[relatedCode, payment.reference].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        </div>

        {/* Năm chữ ký theo mẫu chứng từ kế toán Việt Nam */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            marginTop: 26,
            textAlign: 'center',
            fontSize: '12px',
          }}
        >
          {['Giám đốc', 'Kế toán trưởng', 'Người lập phiếu', isIn ? 'Người nộp tiền' : 'Người nhận tiền', 'Thủ quỹ'].map(
            (role) => (
              <div key={role}>
                <div style={{ fontWeight: 700 }}>{role}</div>
                <div style={{ fontStyle: 'italic', fontSize: '11px' }}>(Ký, họ tên)</div>
                <div style={{ height: 56 }} />
              </div>
            ),
          )}
        </div>
        </div>
      </div>
    </Modal>
  );
}
