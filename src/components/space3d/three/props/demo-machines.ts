import * as THREE from 'three';
import type { DemoKind } from '@/lib/space-3d-demo-products';
import { normalizeSpaceObject } from '@/lib/space-3d-types';
import { registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, hashId, lathe, sphere } from './kit';
import { buildEspresso, buildGrinder } from './espresso';

/**
 * Máy mẫu trưng bày theo loại quầy: máy làm kem tươi, máy xay sinh tố, máy pha tự động, lò nướng đối lưu
 * (+ máy pha espresso & máy xay có sẵn). Gốc = tâm đáy, mặt trước +Z.
 */

const steel = () => M.metal('#c9ced6', 0.28);
const black = () => M.paint('#1f2328', 0.45);
const screen = () =>
  sharedMat('dm:screen', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#38bdf8', emissiveIntensity: 0.6, roughness: 0.2 });
    registerEmissive({ mat: m, day: 0.6, night: 1.2, mode: 'emissive' });
    return m;
  });

/** Máy làm kem tươi 2 vòi + vòi trộn: thân inox, 2 phễu nắp trên, cụm vòi tay gạt, khay hứng */
export function buildSoftServe(): THREE.Group {
  const g = new THREE.Group();
  const w = 0.52;
  const d = 0.62;
  const h = 0.78;
  g.add(box(w, h * 0.78, d, steel(), 0, (h * 0.78) / 2, 0, 0.02));
  // Phễu chứa (2 nắp tròn) trên đỉnh
  for (const s of [-1, 1]) {
    g.add(cyl(0.11, 0.1, 0.08, M.metal('#e5e7eb', 0.2), s * 0.12, h * 0.78 + 0.04, -0.05, 20));
    g.add(sphere(0.02, black(), s * 0.12, h * 0.78 + 0.09, -0.05));
  }
  // Mặt trước: cụm 3 vòi + 3 tay gạt đen + logo đèn
  g.add(box(w * 0.86, 0.16, 0.08, M.metal('#e5e7eb', 0.2), 0, h * 0.5, d / 2 + 0.03, 0.02));
  for (let i = -1; i <= 1; i++) {
    g.add(cyl(0.018, 0.014, 0.07, steel(), i * 0.13, h * 0.42, d / 2 + 0.07, 10));
    const lever = box(0.03, 0.12, 0.02, black(), i * 0.13, h * 0.58, d / 2 + 0.1, 0.006);
    lever.rotation.x = -0.4;
    g.add(lever);
  }
  g.add(box(w * 0.7, 0.05, 0.012, screen(), 0, h * 0.68, d / 2 + 0.002));
  // Khay hứng nhỏ giọt + ốc quế mẫu
  g.add(box(w * 0.8, 0.02, 0.12, steel(), 0, h * 0.2, d / 2 + 0.06));
  const cone = cyl(0.025, 0.004, 0.1, M.paint('#d4a056', 0.7), 0.13, h * 0.2 + 0.07, d / 2 + 0.06, 10);
  cone.rotation.x = Math.PI;
  g.add(cone, sphere(0.03, M.paint('#fdf2e9', 0.6), 0.13, h * 0.2 + 0.13, d / 2 + 0.06));
  return g;
}

/** Máy xay sinh tố công nghiệp: đế đen + bảng phím, cối nhựa trong có hộp giảm ồn */
export function buildBlender(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.22, 0.2, 0.24, black(), 0, 0.1, 0, 0.03));
  g.add(box(0.16, 0.05, 0.01, screen(), 0, 0.12, 0.122));
  const jar = sharedMat('dm:jar', () => new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  g.add(lathe([[0, 0], [0.06, 0], [0.09, 0.26], [0.085, 0.28], [0, 0.28]], jar, 20)).children.at(-1)!.position.set(0, 0.2, 0);
  g.add(cyl(0.075, 0.06, 0.12, M.paint('#f472b6', 0.5), 0, 0.27, 0, 18)); // sinh tố dâu trong cối
  g.add(cyl(0.09, 0.09, 0.03, black(), 0, 0.5, 0, 18));
  // Hộp giảm ồn trong suốt
  const hood = sharedMat('dm:hood', () => new THREE.MeshPhysicalMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }));
  g.add(box(0.26, 0.36, 0.28, hood, 0, 0.38, 0, 0.03));
  return g;
}

/** Máy pha tự động bean-to-cup: thân đen bóng, màn hình cảm ứng lớn, cụm vòi trung tâm, khay ly */
export function buildAutoMachine(): THREE.Group {
  const g = new THREE.Group();
  const body = M.gloss('#111827');
  g.add(box(0.36, 0.58, 0.48, body, 0, 0.29, 0, 0.04));
  g.add(box(0.2, 0.16, 0.012, screen(), 0, 0.46, 0.241, 0.008));
  g.add(box(0.12, 0.1, 0.08, steel(), 0, 0.27, 0.25, 0.015));
  for (const s of [-1, 1]) g.add(cyl(0.006, 0.006, 0.05, steel(), s * 0.02, 0.21, 0.27, 6));
  g.add(box(0.3, 0.02, 0.14, steel(), 0, 0.05, 0.27));
  g.add(cyl(0.035, 0.03, 0.08, M.ceramic('#ffffff'), 0, 0.1, 0.27, 14));
  g.add(cyl(0.12, 0.1, 0.06, M.paint('#0b0b0b', 0.3), 0.08, 0.61, -0.08, 18)); // phễu hạt
  return g;
}

/** Lò nướng đối lưu 4 khay: thân inox, cửa kính có bánh bên trong sáng đèn, bảng điều khiển bên phải */
export function buildOven(): THREE.Group {
  const g = new THREE.Group();
  const w = 0.82;
  const h = 0.62;
  const d = 0.66;
  g.add(box(w, h, d, steel(), 0, h / 2, 0, 0.02));
  const glass = sharedMat('dm:ovenGlass', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#1f1308', emissive: '#ff8a3c', emissiveIntensity: 0.35, roughness: 0.1 });
    registerEmissive({ mat: m, day: 0.35, night: 0.9, mode: 'emissive' });
    return m;
  });
  g.add(box(w * 0.66, h * 0.7, 0.012, glass, -w * 0.1, h * 0.5, d / 2 + 0.004));
  g.add(box(w * 0.68, 0.03, 0.03, black(), -w * 0.1, h * 0.88, d / 2 + 0.03)); // tay nắm
  // Bánh trên khay (nhìn qua kính)
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) g.add(sphere(0.035, M.paint('#c27c2c', 0.7), -w * 0.33 + i * 0.12, h * (0.32 + r * 0.26), d / 2 - 0.08));
  g.add(box(w * 0.2, h * 0.8, 0.012, black(), w * 0.36, h * 0.5, d / 2 + 0.004));
  g.add(box(w * 0.14, 0.05, 0.006, screen(), w * 0.36, h * 0.75, d / 2 + 0.012));
  for (const y of [0.45, 0.3]) g.add(cyl(0.022, 0.022, 0.02, steel(), w * 0.36, h * y, d / 2 + 0.015, 14).rotateX(Math.PI / 2));
  return g;
}

const DEMO_COLORS = ['#d1d5db', '#111827', '#b91c1c', '#e7e5e4'];
/** Dựng máy mẫu theo loại (espresso / grinder dùng mô hình chi tiết có sẵn) */
export function buildDemoByKind(kind: DemoKind, objectId: string, idx: number): THREE.Group {
  let g: THREE.Group;
  switch (kind) {
    case 'softserve':
      g = buildSoftServe();
      break;
    case 'blender':
      g = buildBlender();
      break;
    case 'auto':
      g = buildAutoMachine();
      break;
    case 'oven':
      g = buildOven();
      break;
    case 'grinder':
      g = buildGrinder();
      break;
    default: {
      const color = DEMO_COLORS[(hashId(objectId) + idx) % DEMO_COLORS.length];
      const o = normalizeSpaceObject({ id: `demo-${objectId}-${idx}`, kind: 'ESPRESSO_MACHINE', color, widthM: 0.7, depthM: 0.52, heightM: 0.5 });
      g = o ? buildEspresso(o) : new THREE.Group();
    }
  }
  g.userData.noMerge = true;
  return g;
}
