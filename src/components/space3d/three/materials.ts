import * as THREE from 'three';

/**
 * Cache vật liệu dùng chung + registry vật liệu phát sáng (để rig Ngày/Đêm tăng sáng LED, đèn high-bay, lightbox).
 * Vật liệu trong cache được đánh dấu `userData.shared = true` → không bị dispose khi dựng lại gian hàng.
 */

const cache = new Map<string, THREE.Material>();

export function sharedMat<T extends THREE.Material>(key: string, factory: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = factory();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

export interface EmissiveEntry {
  mat: THREE.Material;
  /** Cường độ phát sáng ban ngày / ban đêm */
  day: number;
  night: number;
  /** 'emissive' → emissiveIntensity; 'color' → nhân màu MeshBasic (bloom); 'opacity' → độ mờ (vũng sáng) */
  mode: 'emissive' | 'color' | 'opacity';
  baseColor?: THREE.Color;
}

const emissiveRegistry = new Set<EmissiveEntry>();
let currentDayFactor = 1;
const registered = new WeakSet<THREE.Material>();

export function registerEmissive(entry: EmissiveEntry): void {
  if (registered.has(entry.mat)) return;
  registered.add(entry.mat);
  if (entry.mode === 'color') entry.baseColor = (entry.mat as THREE.MeshBasicMaterial).color.clone();
  emissiveRegistry.add(entry);
  // Vật liệu bị dispose (dựng lại gian hàng) → gỡ khỏi registry, tránh rò rỉ
  entry.mat.addEventListener('dispose', () => emissiveRegistry.delete(entry));
  applyOne(entry, currentDayFactor);
}

function applyOne(e: EmissiveEntry, dayFactor: number) {
  const v = e.night + (e.day - e.night) * dayFactor;
  if (e.mode === 'emissive') (e.mat as THREE.MeshStandardMaterial).emissiveIntensity = v;
  else if (e.mode === 'opacity') (e.mat as THREE.MeshBasicMaterial).opacity = v;
  else if (e.baseColor) (e.mat as THREE.MeshBasicMaterial).color.copy(e.baseColor).multiplyScalar(v);
}

export function applyEmissiveFactor(dayFactor: number): void {
  currentDayFactor = dayFactor;
  for (const e of emissiveRegistry) {
    const v = e.night + (e.day - e.night) * dayFactor;
    if (e.mode === 'emissive') (e.mat as THREE.MeshStandardMaterial).emissiveIntensity = v;
    else if (e.mode === 'opacity') (e.mat as THREE.MeshBasicMaterial).opacity = v;
    else if (e.baseColor) (e.mat as THREE.MeshBasicMaterial).color.copy(e.baseColor).multiplyScalar(v);
  }
}

/** Dải LED màu thương hiệu (bloom mạnh hơn ban đêm). */
export function ledMat(color: string, day = 1.2, night = 2.4): THREE.MeshStandardMaterial {
  return sharedMat(`led:${color}:${day}:${night}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: day, roughness: 0.4 });
    registerEmissive({ mat: m, day, night, mode: 'emissive' });
    return m;
  });
}

/** Lightbox in hình (MeshBasic) — sáng hơn ban đêm để có bloom nhẹ. */
export function lightboxMat(map: THREE.Texture): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, toneMapped: true });
  registerEmissive({ mat: m, day: 1.0, night: 1.1, mode: 'color' });
  return m;
}

// ───────────── Texture procedural (canvas) ─────────────

function noiseCanvas(size: number, base: string, speckles: string[], density: number, alpha = 0.08) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const n = Math.floor(size * size * density);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    ctx.fillStyle = speckles[i % speckles.length];
    const r = Math.random() * 1.6 + 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  ctx.globalAlpha = 1;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, repeat: number, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sàn epoxy: nền mịn có hạt li ti + mạch tấm 2m rất mảnh (không lộ hoa văn lặp). */
export function createEpoxyTextures(isWarehouse: boolean, repeat: number) {
  const size = 512;
  const { c, ctx } = noiseCanvas(size, isWarehouse ? '#d9dde3' : '#eef1f5', ['#cbd5e1', '#ffffff', '#94a3b8'], 0.05, 0.12);
  ctx.strokeStyle = isWarehouse ? 'rgba(100,116,139,0.28)' : 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  const map = toTexture(c, repeat);

  const r = noiseCanvas(256, '#5a5a5a', ['#3a3a3a', '#808080'], 0.25, 0.35);
  const roughnessMap = toTexture(r.c, repeat * 2, false);
  return { map, roughnessMap };
}

/**
 * Sàn kho bê tông mài: 1 ô texture = 1 tấm 6×6m (khe cắt co giãn ở mép), loang màu xi măng tự nhiên,
 * vệt bánh xe nâng mờ, đốm dầu nhỏ. Vẽ lặp quanh mép (±size) để ô liền mạch khi lặp.
 */
export function createConcreteTextures(widthM: number, depthM: number) {
  const PANEL = 6;
  const size = 1024;
  const { c, ctx } = noiseCanvas(size, '#c9ccd0', ['#b4b8bd', '#dadde1', '#a7abb1', '#e4e6e9'], 0.06, 0.1);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const wrapDraw = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
      draw(x + ox, y + oy);
    }
  };
  // Loang màu xi măng (mảng lớn sáng/tối rất nhẹ)
  for (let i = 0; i < 46; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 80 + rnd() * 260;
    const dark = rnd() < 0.55;
    const a = 0.035 + rnd() * 0.06;
    wrapDraw(x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, dark ? `rgba(120,124,130,${a})` : `rgba(240,242,244,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  // Vệt bánh xe nâng: các cung dài mờ theo phương dọc làn
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x0 = rnd() * size;
    const bend = (rnd() - 0.5) * 160;
    ctx.strokeStyle = `rgba(70,72,78,${0.02 + rnd() * 0.03})`;
    ctx.lineWidth = 10 + rnd() * 10;
    for (const ox of [-size, 0, size]) {
      for (const gap of [0, 34]) {
        ctx.beginPath();
        ctx.moveTo(x0 + ox + gap, 0);
        ctx.bezierCurveTo(x0 + ox + gap + bend, size * 0.35, x0 + ox + gap - bend, size * 0.65, x0 + ox + gap, size);
        ctx.stroke();
      }
    }
  }
  // Đốm dầu / vết bẩn nhỏ
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 6 + rnd() * 22;
    wrapDraw(x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(60,58,55,${0.08 + rnd() * 0.1})`);
      g.addColorStop(1, 'rgba(60,58,55,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Khe cắt co giãn (mép tấm): rãnh tối mảnh + mép sáng
  ctx.fillStyle = 'rgba(70,74,80,0.55)';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 3, size, 1);
  ctx.fillRect(3, 0, 1, size);
  const map = toTexture(c, 1);
  map.repeat.set(widthM / PANEL, depthM / PANEL);

  // Độ nhám: bê tông mài bóng không đều (vùng bóng / vùng mờ), khe cắt nhám
  const r = noiseCanvas(256, '#6a6a6a', ['#4a4a4a', '#8a8a8a'], 0.2, 0.3);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const rad = 30 + rnd() * 70;
    const g = r.ctx.createRadialGradient(x, y, 0, x, y, rad);
    const v = rnd() < 0.5 ? '40,40,40' : '150,150,150';
    g.addColorStop(0, `rgba(${v},0.35)`);
    g.addColorStop(1, `rgba(${v},0)`);
    r.ctx.fillStyle = g;
    r.ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  r.ctx.fillStyle = '#d0d0d0';
  r.ctx.fillRect(0, 0, 256, 1);
  r.ctx.fillRect(0, 0, 1, 256);
  const roughnessMap = toTexture(r.c, 1, false);
  roughnessMap.repeat.copy(map.repeat);
  return { map, roughnessMap };
}

export function createGrassTexture(): THREE.CanvasTexture {
  const { c } = noiseCanvas(256, '#5aa468', ['#478f56', '#77bf7f', '#3e8a4f', '#8fcf8a'], 0.6, 0.35);
  return toTexture(c, 110);
}

export function createCarpetTexture(length: number): THREE.CanvasTexture {
  const { c } = noiseCanvas(128, '#2a4cb0', ['#1e3a8a', '#3b62cc', '#24459f'], 0.9, 0.25);
  const tex = toTexture(c, 1);
  tex.repeat.set(3, Math.max(4, length / 1.6));
  return tex;
}

export function createWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c69c6d';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = `rgba(${110 + Math.random() * 40},${70 + Math.random() * 30},${40},${0.18 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 18, 170, y + (Math.random() - 0.5) * 18, 256, y);
    ctx.stroke();
  }
  return toTexture(c, 1);
}

/** Vũng sáng giả dưới đèn high-bay (gradient tròn, blend additive). */
export function createLightPoolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.45, 'rgba(255,236,190,0.45)');
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────── Shader patch nhẹ ─────────────

/** Viền sáng rim (fresnel) giúp nhân vật nổi khỏi nền — dùng chung 1 program. */
export function applyRimLight(mat: THREE.Material): void {
  if (!(mat instanceof THREE.MeshStandardMaterial) || mat.userData.rim) return;
  mat.userData.rim = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += vec3(0.62, 0.74, 1.0) * rimF * 0.32;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'space3d-rim';
}

/** Uniform thời gian dùng chung cho hiệu ứng đung đưa của tán cây. */
export const windUniform = { value: 0 };

export function applyWindSway(mat: THREE.Material): void {
  if (mat.userData.wind) return;
  mat.userData.wind = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wpos = modelMatrix * vec4(transformed, 1.0);
          float h = clamp(wpos.y - 1.8, 0.0, 3.0);
          float ph = wpos.x * 0.35 + wpos.z * 0.27;
          transformed.x += sin(uWindTime * 1.3 + ph) * 0.045 * h;
          transformed.z += cos(uWindTime * 1.1 + ph) * 0.03 * h;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'space3d-wind';
}
