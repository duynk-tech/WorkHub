'use client';

import React from 'react';
import type { EquipmentSpecRow } from '@/lib/equipment-specs';

export function EquipmentSpecGrid({
  rows,
  compact = false,
  bordered = true,
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
        marginTop: 5,
        marginBottom: 3,
        border: bordered ? '1px solid #cbd5e1' : 'none',
        borderRadius: 4,
        overflow: 'hidden',
        background: '#f8fafc',
        fontSize: compact ? '10px' : '11px',
        lineHeight: 1.4,
        maxWidth: 580,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      } as React.CSSProperties}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={idx}
              style={{
                borderBottom: idx < rows.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}
            >
              <td
                style={{
                  padding: compact ? '3px 6px' : '4px 8px',
                  width: '32%',
                  color: '#475569',
                  fontWeight: 600,
                  background: '#f1f5f9',
                  borderRight: '1px solid #e2e8f0',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}
              >
                {r.label}
              </td>
              <td
                style={{
                  padding: compact ? '3px 6px' : '4px 8px',
                  color: '#0f172a',
                  fontWeight: 500,
                  verticalAlign: 'top',
                }}
              >
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
