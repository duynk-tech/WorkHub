'use client';

import React from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ClipboardList } from 'lucide-react';

/**
 * Chọn loại chứng từ kho cần lập.
 * Gom 3 nút nhập / xuất / điều chuyển rải rác trên thanh công cụ về một chỗ,
 * kèm luôn kiểm kê vốn đang bị giấu trong tab lịch sử.
 */

export type StockDocKind = 'IN' | 'OUT' | 'TRANSFER' | 'COUNT';

/** Mục khai báo danh mục thêm vào popup — không phải chứng từ nên để nhóm riêng. */
export interface ExtraChoice {
  key: string;
  label: string;
  desc: string;
  color: string;
  bg: string;
  icon: React.ElementType;
  onPick: () => void;
}

const CHOICES: {
  kind: StockDocKind;
  label: string;
  desc: string;
  color: string;
  bg: string;
  icon: React.ElementType;
}[] = [
  {
    kind: 'IN',
    label: 'Phiếu nhập kho',
    desc: 'Hàng về từ nhà cung cấp, khách trả lại, hoặc nhập tự do',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: ArrowDownToLine,
  },
  {
    kind: 'OUT',
    label: 'Phiếu xuất kho',
    desc: 'Xuất bán, bảo hành, sửa chữa, thanh lý hoặc hủy hàng hỏng',
    color: '#dc2626',
    bg: '#fef2f2',
    icon: ArrowUpFromLine,
  },
  {
    kind: 'TRANSFER',
    label: 'Phiếu điều chuyển',
    desc: 'Chuyển linh kiện giữa các kho hoặc cấp cơ số cho xe kỹ thuật',
    color: '#7c3aed',
    bg: '#f5f3ff',
    icon: ArrowLeftRight,
  },
  {
    kind: 'COUNT',
    label: 'Phiếu kiểm kê',
    desc: 'Đối chiếu tồn sổ sách với số đếm thực tế, chênh lệch qua duyệt',
    color: '#0f766e',
    bg: '#f0fdfa',
    icon: ClipboardList,
  },
];

export function StockDocumentChooser({
  open,
  onClose,
  onPick,
  kinds,
  extraChoices = [],
  title = 'Tạo mới',
  description = 'Chọn việc cần làm',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: StockDocKind) => void;
  /** Giới hạn loại chứng từ được lập; bỏ trống là hiện đủ bốn loại. */
  kinds?: StockDocKind[];
  /** Việc khai báo danh mục, gom chung một cửa thay vì rải nút trên thanh công cụ. */
  extraChoices?: ExtraChoice[];
  title?: string;
  description?: string;
}) {
  const choices = kinds?.length ? CHOICES.filter((c) => kinds.includes(c.kind)) : CHOICES;

  const sectionLabel: React.CSSProperties = {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 2,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-base)',
    background: 'var(--surface-card)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {extraChoices.length > 0 && (
          <>
            <div style={sectionLabel}>Khai báo mới</div>
            {extraChoices.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onPick}
                style={rowStyle}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <span
                  style={{
                    width: 38, height: 38, borderRadius: 10, background: c.bg, color: c.color,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}
                >
                  <c.icon size={19} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                    {c.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{c.desc}</span>
                </span>
              </button>
            ))}
            <div style={{ ...sectionLabel, marginTop: 8 }}>Chứng từ kho</div>
          </>
        )}

        {choices.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => onPick(c.kind)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-base)',
              background: 'var(--surface-card)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: c.bg,
                color: c.color,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <c.icon size={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                {c.label}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{c.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
