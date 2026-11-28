import type * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityPref = 'auto' | QualityLevel;

export interface QualitySettings {
  level: QualityLevel;
  composer: boolean;
  ao: boolean;
  msaa: number;
  fxaa: boolean;
  shadowMapSize: number;
  maxPixelRatio: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: { level: 'low', composer: false, ao: false, msaa: 0, fxaa: false, shadowMapSize: 1024, maxPixelRatio: 1 },
  medium: { level: 'medium', composer: true, ao: false, msaa: 0, fxaa: true, shadowMapSize: 2048, maxPixelRatio: 1.25 },
  // Cao: render đúng mật độ điểm ảnh màn hình retina (tối đa 2×) cho nét sắc; MSAA 2× là đủ ở 2× pixel
  high: { level: 'high', composer: true, ao: true, msaa: 2, fxaa: false, shadowMapSize: 4096, maxPixelRatio: 2 },
};

export const QUALITY_LABEL: Record<QualityPref, string> = {
  auto: 'Tự động',
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
};

const STORAGE_KEY = 'space3d.quality';

export function readQualityPref(): QualityPref {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'auto') return v;
  } catch {
    // localStorage bị chặn → dùng mặc định
  }
  return 'auto';
}

export function writeQualityPref(pref: QualityPref): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // bỏ qua
  }
}

/** Đoán bậc GPU đơn giản từ tên renderer + thiết bị di động. */
export function detectQuality(renderer: THREE.WebGLRenderer): QualityLevel {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  if (isMobile) return 'low';
  let name = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  } catch {
    name = '';
  }
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(name)) return 'low';
  // Máy văn phòng cấu hình yếu: ít nhân CPU / ít RAM → bắt đầu ở mức Thấp (30 FPS, không hậu kỳ)
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || mem <= 4) return 'low';
  // GPU tích hợp Intel đời cũ (HD/UHD 5xx–6xx) → Thấp; Iris Xe / Arc → Vừa
  if (/intel/.test(name) && !/iris xe|arc/.test(name)) return /uhd graphics 7|iris/.test(name) ? 'medium' : 'low';
  if (/nvidia|geforce|rtx|radeon rx|apple m[2-9]|apple m1 (pro|max|ultra)/.test(name)) return 'high';
  return 'medium';
}

export function lowerQuality(level: QualityLevel): QualityLevel {
  return level === 'high' ? 'medium' : 'low';
}

/**
 * Đo FPS thực tế: bỏ 2s đầu (khởi tạo, bake shadow), đo 3s; dưới ngưỡng → báo hạ cấp.
 * Trả về hàm `tick(dt)` gọi mỗi frame.
 */
export function createFpsGovernor(onDowngrade: () => void, threshold = 48) {
  let elapsed = 0;
  let frames = 0;
  let windowTime = 0;
  let cooldown = 2;
  return {
    reset() {
      elapsed = 0;
      frames = 0;
      windowTime = 0;
      cooldown = 2;
    },
    tick(dt: number) {
      // Tab/pane bị ẩn hoặc trình duyệt bóp rAF → bỏ cửa sổ đo này, không hạ cấp oan
      if (dt > 0.25 || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
        frames = 0;
        windowTime = 0;
        return;
      }
      elapsed += dt;
      if (elapsed < cooldown) return;
      frames += 1;
      windowTime += dt;
      if (windowTime >= 3) {
        const fps = frames / windowTime;
        frames = 0;
        windowTime = 0;
        if (fps < threshold) {
          cooldown = elapsed + 2;
          onDowngrade();
        }
      }
    },
  };
}
