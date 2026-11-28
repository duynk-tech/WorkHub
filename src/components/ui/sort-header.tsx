'use client';

import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useUrlParams } from './url-state';

/**
 * Tiêu đề cột bấm để sắp xếp, trạng thái nằm ở `?sort=` trên URL.
 * `field` là kiểu sắp xếp giảm dần (mặc định), `ascField` (nếu có) là chiều tăng;
 * bấm lần nữa sẽ đảo chiều, cột không có ascField thì bấm lại để bỏ sắp xếp.
 */
export function SortHeader({
  label,
  sort,
  field,
  ascField,
  className,
  style,
}: {
  label: string;
  sort: string;
  field: string;
  ascField?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { setParams } = useUrlParams();
  const activeDesc = sort === field;
  const activeAsc = Boolean(ascField) && sort === ascField;
  const active = activeDesc || activeAsc;

  const next = () => {
    if (activeDesc) return ascField ?? null;
    if (activeAsc) return null;
    return field;
  };

  const Icon = activeAsc ? ArrowUp : activeDesc ? ArrowDown : ArrowUpDown;

  return (
    <th
      className={className}
      style={style}
      aria-sort={activeAsc ? 'ascending' : activeDesc ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => setParams({ sort: next() })}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: active ? 'var(--text-strong)' : undefined,
        }}
      >
        {label}
        <Icon size={12} style={{ opacity: active ? 1 : 0.4 }} aria-hidden />
      </button>
    </th>
  );
}
