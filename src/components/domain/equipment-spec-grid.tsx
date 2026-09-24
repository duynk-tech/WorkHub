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
        fontSize: compact ? '10px' : '10.5px',
        lineHeight: 1.45,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((r, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: '#475569',
                whiteSpace: 'nowrap',
                flexShrink: 0,
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
