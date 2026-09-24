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
        lineHeight: 1.45,
        maxWidth: 620,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      } as React.CSSProperties}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          columnGap: 14,
          rowGap: 2.5,
        }}
      >
        {rows.map((r, idx) => {
          const isWide = r.label.includes('Tính năng') || r.value.length > 55;
          return (
            <div
              key={idx}
              style={{
                gridColumn: isWide ? '1 / -1' : 'auto',
                display: 'flex',
                alignItems: 'baseline',
                gap: 5,
                color: '#475569',
              }}
            >
              <span style={{ color: '#94a3b8', fontSize: '8px', lineHeight: 1 }}>▪</span>
              <span
                style={{
                  fontWeight: 600,
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
                  wordBreak: 'break-word',
                }}
              >
                {r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
