'use client';

import React from 'react';
import type { EquipmentSpecRow } from '@/lib/equipment-specs';

export function EquipmentSpecGrid({
  rows,
  compact = false,
}: {
  rows: EquipmentSpecRow[];
  compact?: boolean;
  bordered?: boolean;
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <div
      className="equipment-spec-grid"
      style={{
        marginTop: 3,
        marginBottom: 2,
        padding: compact ? 6 : '0 0 0 8px',
        border: compact ? '1px solid #e2e8f0' : undefined,
        borderRadius: compact ? 6 : undefined,
        background: compact ? '#f8fafc' : undefined,
        fontSize: compact ? '10px' : '10.5px',
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          display: compact ? 'grid' : 'flex',
          gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(145px, 1fr))' : undefined,
          flexDirection: compact ? undefined : 'column',
          gap: compact ? 4 : 1.5,
        }}
      >
        {rows.map((r, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              flexDirection: compact ? 'column' : 'row',
              alignItems: compact ? 'stretch' : 'baseline',
              gap: compact ? 0 : 4,
              minWidth: 0,
              padding: compact ? '3px 5px' : 0,
              borderRadius: compact ? 4 : undefined,
              background: compact ? '#fff' : undefined,
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: compact ? '#64748b' : '#475569',
                whiteSpace: compact ? 'normal' : 'nowrap',
                flexShrink: 0,
                fontSize: compact ? '9px' : undefined,
              }}
            >
              {r.label}:
            </span>
            <span
              style={{
                color: '#1e293b',
                fontWeight: 450,
                wordBreak: 'break-word',
              }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
