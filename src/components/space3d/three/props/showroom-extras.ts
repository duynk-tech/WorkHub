import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, hashId, seeded, sphere } from './kit';
import { buildEspresso, buildGrinder } from './espresso';
import { labelTex } from './textures';
import { normalizeSpaceObject } from '@/lib/space-3d-types';

/**
 * Showroom thiết bị F&B: quầy pha thử máy (khách ngồi xem pha), tủ kem gelato kính cong, tủ mát đứng cửa kính.
 * Gốc = tâm đáy, mặt trước +Z (phía khách).
 */

function lightSign(text: string, w: number, h: number, color = '#ffffff', bg = '#111827') {
  const t = labelTex([{ text: text.toUpperCase().slice(0, 28), size: 120, color, weight: 800, y: 150 }], bg, 1400, 300);
  const m = sharedMat(`sx:sign:${text}:${color}:${bg}`, () => {
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.4 });
    registerEmissive({ mat, day: 0.55, night: 1.2, mode: 'emissive' });
    return mat;
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Quầy pha thử máy: thân gỗ + mặt đá, máy espresso & máy xay thật trên quầy (bấm xem thông tin), bồn rửa, ca đánh sữa, ly mẫu */
export function buildDemoBar(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h - 0.04, d, M.woodGloss(o.color ?? '#6b4226'), 0, (h - 0.04) / 2, 0, 0.02));
  g.add(box(w + 0.08, 0.05, d + 0.1, M.marble(), 0, h - 0.02, 0.02, 0.01));
  // Dải LED chân quầy + biển tên phát sáng mặt trước
  g.add(box(w - 0.1, 0.02, 0.02, M.glow('#fbbf24', 1.2, 3), 0, 0.08, d / 2 + 0.01));
  const sign = lightSign(o.label || 'Quầy pha thử máy', Math.min(w * 0.7, 2.6), 0.26, '#fde68a', '#1c1917');
  sign.position.set(0, h * 0.55, d / 2 + 0.006);
  sign.userData.noMerge = true;
  g.add(sign);
  // Máy pha espresso 2 group + máy xay (dùng mô hình chi tiết) — gắn merchItemId mẫu để khách bấm xem
  const esp = normalizeSpaceObject({ id: `${o.id}-esp`, kind: 'ESPRESSO_MACHINE', color: '#d1d5db', widthM: 0.78, depthM: 0.56, heightM: 0.5 });
  if (esp) {
    const m = buildEspresso(esp);
    m.position.set(-w * 0.18, h, -d * 0.12);
    m.traverse((c) => (c.userData.merchItemId = -1));
    m.userData.noMerge = true;
    g.add(m);
  }
  const gr = buildGrinder();
  gr.position.set(w * 0.08, h, -d * 0.16);
  gr.traverse((c) => (c.userData.merchItemId = -4));
  gr.userData.noMerge = true;
  g.add(gr);
  // Bồn rửa + vòi, ca đánh sữa, khay ly mẫu
  g.add(box(0.4, 0.015, 0.3, M.chrome(), w * 0.36, h + 0.002, -d * 0.05));
  g.add(cyl(0.01, 0.01, 0.26, M.chrome(), w * 0.36, h + 0.13, -d * 0.22, 8));
  g.add(cyl(0.04, 0.035, 0.11, M.chrome(), w * 0.2, h + 0.055, d * 0.15, 14));
  for (let i = 0; i < 4; i++) g.add(cyl(0.035, 0.03, 0.06, M.ceramic('#ffffff'), -w * 0.42 + i * 0.1, h + 0.03, d * 0.25, 14));
  g.add(box(0.16, 0.1, 0.12, M.paint('#1f2328', 0.4), w * 0.24, h + 0.05, -d * 0.2, 0.01)); // hộp gõ bã
  return g;
}

/** Tủ kem gelato kính cong: thân dưới ốp, kính cong phía trước, 2 hàng khay kem nhiều màu, đèn LED */
export function buildGelatoCase(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const r = seeded(hashId(o.id));
  const baseH = h * 0.62;
  g.add(box(w, baseH, d, M.gloss(o.color ?? '#f8fafc'), 0, baseH / 2, 0, 0.02));
  g.add(box(w - 0.1, 0.03, 0.02, M.glow('#38bdf8', 1, 2.5), 0, baseH - 0.08, d / 2 + 0.01));
  const tray = M.metal('#d1d5db', 0.3);
  const glowTop = M.glow('#fefce8', 1.4, 3);
  g.add(box(w - 0.06, 0.02, d - 0.1, glowTop, 0, h - 0.04, -0.04));
  // Khay kem: 2 hàng
  const colors = ['#fde68a', '#f9a8d4', '#86efac', '#a16207', '#fca5a5', '#e9d5ff', '#fdba74', '#f5f5f4', '#4ade80', '#7c2d12'];
  const per = Math.max(3, Math.floor((w - 0.1) / 0.24));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < per; i++) {
      const x = -w / 2 + 0.12 + i * ((w - 0.24) / Math.max(1, per - 1));
      const z = row === 0 ? d * 0.05 : -d * 0.22;
      g.add(box(0.22, 0.06, 0.24, tray, x, baseH + 0.03, z));
      const c = colors[(i + row * 3 + Math.floor(r() * 3)) % colors.length];
      const mound = sphere(0.1, sharedMat(`sx:gelato:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })), x, baseH + 0.07, z);
      mound.scale.set(1, 0.42, 1.08);
      g.add(mound);
    }
  }
  // Kính cong phía trước (1/4 trụ) + kính phẳng phía sau
  const glass = M.glass();
  const curve = new THREE.Mesh(new THREE.CylinderGeometry(h - baseH, h - baseH, w - 0.02, 24, 1, true, 0, Math.PI / 2), glass);
  curve.rotation.z = Math.PI / 2;
  curve.rotation.y = Math.PI / 2;
  curve.position.set(0, baseH, d / 2 - (h - baseH) - 0.02);
  curve.castShadow = false;
  g.add(curve);
  g.add(box(w, 0.025, d * 0.35, M.paint('#e5e7eb', 0.4), 0, h - 0.0125, -d * 0.32));
  const sign = lightSign(o.label || 'Gelato', Math.min(w * 0.6, 1.2), 0.16, '#be185d', '#fdf2f8');
  sign.position.set(0, baseH * 0.55, d / 2 + 0.005);
  sign.userData.noMerge = true;
  g.add(sign);
  return g;
}

/** Tủ mát đứng cửa kính: khung, 1–2 cánh kính, đèn trong, các tầng chai nước / sữa, hộp đèn tên phía trên */
export function buildDisplayChiller(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const r = seeded(hashId(o.id));
  const frame = M.paint(o.color ?? '#111827', 0.45);
  g.add(box(w, h, 0.05, frame, 0, h / 2, -d / 2 + 0.025));
  for (const s of [-1, 1]) g.add(box(0.05, h, d, frame, s * (w / 2 - 0.025), h / 2, 0));
  g.add(box(w, 0.12, d, frame, 0, 0.06, 0), box(w, 0.32, d, frame, 0, h - 0.16, 0));
  const inner = sharedMat('sx:chillerInner', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#e0f2fe', emissiveIntensity: 0.5, roughness: 0.5 });
    registerEmissive({ mat: m, day: 0.5, night: 1.1, mode: 'emissive' });
    return m;
  });
  g.add(box(w - 0.1, h - 0.46, 0.01, inner, 0, (h - 0.46) / 2 + 0.12, -d / 2 + 0.06));
  // Tầng kệ + chai (nhiều màu nhãn)
  const shelves = 5;
  const bottleCols = ['#16a34a', '#dc2626', '#2563eb', '#f59e0b', '#f8fafc', '#7c3aed'];
  for (let k = 0; k < shelves; k++) {
    const y = 0.16 + k * ((h - 0.5) / shelves);
    g.add(box(w - 0.1, 0.015, d - 0.12, M.glass(), 0, y, 0));
    const n = Math.floor((w - 0.14) / 0.085);
    for (let i = 0; i < n; i++) {
      const c = bottleCols[(k * 2 + i + Math.floor(r() * 2)) % bottleCols.length];
      const x = -w / 2 + 0.1 + i * 0.085;
      g.add(cyl(0.032, 0.034, 0.2, sharedMat(`sx:bottle:${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 0.8 })), x, y + 0.11, d * 0.1, 10));
      g.add(cyl(0.014, 0.014, 0.03, M.paint('#e5e7eb', 0.4), x, y + 0.225, d * 0.1, 8));
    }
  }
  // Cánh kính + tay nắm
  const doors = w > 0.9 ? 2 : 1;
  for (let i = 0; i < doors; i++) {
    const dw = w / doors;
    const x = -w / 2 + dw * (i + 0.5);
    g.add(box(dw - 0.04, h - 0.46, 0.02, M.glass(), x, (h - 0.46) / 2 + 0.12, d / 2 - 0.02));
    g.add(box(0.025, 0.5, 0.03, M.chrome(), x + (i === 0 && doors === 2 ? dw / 2 - 0.08 : -dw / 2 + 0.08), h * 0.5, d / 2 + 0.01));
  }
  const sign = lightSign(o.label || 'Tủ mát', w - 0.1, 0.24, '#ffffff', '#1d4ed8');
  sign.position.set(0, h - 0.16, d / 2 + 0.005);
  sign.userData.noMerge = true;
  g.add(sign);
  return g;
}
