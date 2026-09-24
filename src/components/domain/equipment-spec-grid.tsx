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
        marginTop: 4,
        marginBottom: 3,
        padding: '3px 8px 3px 9px',
        borderLeft: '2px solid #94a3b8',
        background: 'rgba(248, 250, 252, 0.75)',
        borderRadius: '0 3px 3px 0',
        fontSize: compact ? '10px' : '10.5px',
        lineHeight: 1.5,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 5,
              color: '#475569',
            }}
          >
            <span style={{ color: '#94a3b8', fontSize: '8px', lineHeight: 1, flexShrink: 0 }}>▪</span>
            <span
              style={{
                fontWeight: 650,
                color: '#334155',
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
