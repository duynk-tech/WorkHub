'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Màn hình tải TIM Space có thanh %:
 *  data  (0→40%)  máy chủ đang lấy dữ liệu cảnh (loading.tsx của route)
 *  code  (40→70%) tải bộ dựng 3D (chunk three.js)
 *  scene (70→97%) dựng đồ đạc, biên dịch shader
 *  done  (100%)   khung hình đầu đã vẽ → mờ dần
 * Tiến độ lưu toàn cục nên khi chuyển bước (đổi component) thanh không bị tụt về 0.
 */
export type SpaceLoadStage = 'data' | 'code' | 'scene' | 'done';

const RANGE: Record<SpaceLoadStage, [number, number]> = {
  data: [0, 40],
  code: [40, 70],
  scene: [70, 97],
  done: [100, 100],
};
const LABEL: Record<SpaceLoadStage, string> = {
  data: 'Đang tải dữ liệu không gian…',
  code: 'Đang tải bộ dựng 3D…',
  scene: 'Đang dựng không gian…',
  done: 'Sẵn sàng!',
};

type Track = { shown: number; stage: SpaceLoadStage; since: number };
/** Chunk bộ dựng 3D đã tải xong (đặt cờ toàn cục + phát sự kiện cho màn hình tải) */
export function markSpaceCodeLoaded() {
  (globalThis as unknown as { __timSpaceCode?: boolean }).__timSpaceCode = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('timspace:code'));
}
export const isSpaceCodeLoaded = () => !!(globalThis as unknown as { __timSpaceCode?: boolean }).__timSpaceCode;

const track = (): Track => {
  const w = globalThis as unknown as { __timSpaceLoad?: Track };
  w.__timSpaceLoad ??= { shown: 0, stage: 'data', since: Date.now() };
  return w.__timSpaceLoad;
};

/** Bắt đầu lại từ 0 (vd. đổi cảnh tải lại trang) */
function resetSpaceLoad() {
  (globalThis as unknown as { __timSpaceLoad?: Track }).__timSpaceLoad = { shown: 0, stage: 'data', since: Date.now() };
}

export function SpaceLoader({ stage, onHidden }: { stage: SpaceLoadStage; onHidden?: () => void }) {
  // Khởi tạo 0 giống lúc render trên máy chủ (tránh lệch hydrate); layout effect nạp tiến độ thật trước khi vẽ
  const [pct, setPct] = useState(0);
  const [fade, setFade] = useState(false);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  useLayoutEffect(() => {
    // Lần tải mới (vd. đổi cảnh) sau khi đã xong → bắt đầu lại từ 0
    if (stage === 'data' && track().stage === 'done') resetSpaceLoad();
    const t = track();
    if (t.stage !== stage) {
      t.stage = stage;
      t.since = Date.now();
    }
    const [lo, hi] = RANGE[stage];
    const tick = () => {
      // Tiến chậm dần về mốc trên của bước hiện tại (không bao giờ lùi)
      const k = 1 - Math.exp(-(Date.now() - t.since) / 1400);
      const target = stage === 'done' ? 100 : lo + (hi - lo) * k;
      t.shown = stage === 'done' ? 100 : Math.max(t.shown, lo, Math.min(hi, t.shown + (target - t.shown) * 0.25));
      setPct(t.shown);
    };
    tick();
    const id = window.setInterval(tick, 80);
    let hideId = 0;
    if (stage === 'done') {
      hideId = window.setTimeout(() => {
        setFade(true);
        hideId = window.setTimeout(() => onHiddenRef.current?.(), 500);
      }, 250);
    }
    return () => {
      window.clearInterval(id);
      window.clearTimeout(hideId);
    };
  }, [stage]);

  const shown = Math.round(pct);
  return (
    <div
      role="progressbar"
      aria-label="Đang tải TIM Space"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, #0f172a 0%, #020617 75%)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        opacity: fade ? 0 : 1,
        transition: 'opacity 450ms ease',
        pointerEvents: fade ? 'none' : 'auto',
      }}
    >
      {/* Cùng phong cách màn "Đang chuyển không gian": vòng xoay quanh logo, tiêu đề nhỏ in hoa, tên lớn, mô tả, thanh tiến trình */}
      <style>{`@keyframes timSpaceSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: '#f8fafc', textAlign: 'center', padding: 24 }}>
        <div style={{ position: 'relative', width: 64, height: 64 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 99, border: '3px solid rgba(255,255,255,0.12)', borderTopColor: '#60a5fa', animation: 'timSpaceSpin .8s linear infinite' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-3d.png" alt="TIM Corp" width={36} height={36} style={{ position: 'absolute', inset: 14, width: 36, height: 36, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#93c5fd', fontWeight: 700 }}>ĐANG TẢI KHÔNG GIAN</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>TIM Space</div>
          <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>{LABEL[stage]}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 200, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', transition: 'width 120ms linear' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{shown}%</span>
        </div>
      </div>
    </div>
  );
}
