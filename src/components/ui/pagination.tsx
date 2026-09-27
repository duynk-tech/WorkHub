'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Phân trang phía client cho các danh sách đã tải sẵn.
 *
 * Mục đích là chặn số dòng đổ ra DOM: một bảng vài nghìn dòng làm trình duyệt
 * giật khi lọc hay cuộn. Dữ liệu vẫn được tải hết từ server, nên khi bảng nào
 * thực sự lớn thì phải chuyển sang phân trang phía server (xem listStockTransactions
 * và listDocuments đã làm theo cách đó).
 */

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

/**
 * Phần tính toán thuần của phân trang, tách riêng để kiểm thử được.
 * Trang vượt quá số trang hiện có sẽ được kéo về trang cuối thay vì trả mảng rỗng.
 */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const offset = (safePage - 1) * size;

  return {
    page: safePage,
    pageSize: size,
    total,
    totalPages,
    offset,
    rows: rows.slice(offset, offset + size),
  };
}

export function usePaged<T>(rows: T[], initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const result = useMemo(() => paginate(rows, page, pageSize), [rows, page, pageSize]);

  // Lọc làm danh sách ngắn lại thì trang đang đứng có thể vượt quá số trang mới
  useEffect(() => {
    if (page !== result.page) setPage(result.page);
  }, [page, result.page]);

  return {
    page: result.page,
    setPage,
    pageSize: result.pageSize,
    setPageSize,
    pageRows: result.rows,
    total: result.total,
    totalPages: result.totalPages,
    /** Số thứ tự của dòng đầu trang, dùng cho cột STT chạy liên tục giữa các trang. */
    offset: result.offset,
  };
}

export function Pagination({
  page,
  setPage,
  pageSize,
  setPageSize,
  total,
  totalPages,
  offset,
  unit = 'dòng',
  style,
}: {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize?: (n: number) => void;
  total: number;
  totalPages: number;
  offset: number;
  /** Danh từ đếm được hiển thị trong câu tóm tắt: "… trong 145 phiếu". */
  unit?: string;
  style?: React.CSSProperties;
}) {
  // Chỉ có một trang thì thanh phân trang không mang thông tin gì
  if (totalPages <= 1) return null;

  const nav: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-base)',
    background: 'var(--surface-card)',
    cursor: 'pointer',
  };
  const disabled: React.CSSProperties = {
    ...nav,
    opacity: 0.45,
    cursor: 'not-allowed',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--border-base)',
        ...style,
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        Hiện <strong style={{ color: 'var(--text-strong)' }}>{total === 0 ? 0 : offset + 1}</strong>
        {'–'}
        <strong style={{ color: 'var(--text-strong)' }}>{Math.min(offset + pageSize, total)}</strong>
        {' trong '}
        <strong style={{ color: 'var(--text-strong)' }}>{total}</strong> {unit}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {setPageSize && (
          <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Mỗi trang
            <select
              className="select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                width: 'auto',
                minWidth: 64,
                height: 32,
                padding: '0 26px 0 10px',
                fontSize: 12.5,
                backgroundPosition: 'right 7px center',
                backgroundSize: '14px 14px',
                cursor: 'pointer',
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} style={page <= 1 ? disabled : nav}>
          <ChevronLeft size={14} /> Trước
        </button>

        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', minWidth: 78, textAlign: 'center' }}>
          Trang {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          style={page >= totalPages ? disabled : nav}
        >
          Sau <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
