import React from 'react';

export default function AppLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }} className="animate-pulse">
      {/* Header Skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ width: 220, height: 26, borderRadius: 'var(--radius-sm, 6px)', background: 'var(--surface-sunken, #eef0f6)' }} />
          <div style={{ width: 340, height: 16, borderRadius: 'var(--radius-xs, 4px)', background: 'var(--surface-sunken, #eef0f6)' }} />
        </div>
        <div style={{ width: 140, height: 38, borderRadius: 'var(--radius-md, 9px)', background: 'var(--surface-sunken, #eef0f6)' }} />
      </div>

      {/* Metric Cards Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              padding: 14,
              borderRadius: 'var(--radius-lg, 13px)',
              background: 'var(--surface-card, #ffffff)',
              border: '1px solid var(--border-base, #dcdfea)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 72,
            }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-sunken, #eef0f6)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ width: 50, height: 20, borderRadius: 'var(--radius-xs, 4px)', background: 'var(--surface-sunken, #eef0f6)' }} />
              <div style={{ width: '80%', height: 12, borderRadius: 'var(--radius-xs, 4px)', background: 'var(--surface-sunken, #eef0f6)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content / Table Skeleton */}
      <div
        style={{
          borderRadius: 'var(--radius-lg, 13px)',
          background: 'var(--surface-card, #ffffff)',
          border: '1px solid var(--border-base, #dcdfea)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Filter bar placeholder */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, height: 38, borderRadius: 'var(--radius-md, 9px)', background: 'var(--surface-sunken, #eef0f6)' }} />
          <div style={{ width: 180, height: 38, borderRadius: 'var(--radius-md, 9px)', background: 'var(--surface-sunken, #eef0f6)' }} />
          <div style={{ width: 180, height: 38, borderRadius: 'var(--radius-md, 9px)', background: 'var(--surface-sunken, #eef0f6)' }} />
        </div>

        {/* Rows placeholder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              style={{
                height: 48,
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--surface-sunken, #eef0f6)',
                opacity: 0.8 - row * 0.1,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
