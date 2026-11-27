import * as THREE from 'three';
import { sharedMat } from '../materials';
import { box, cyl, lathe, M, sphere } from './kit';
import type { CafeMenuItem, DrinkOrderView } from '@/lib/space-3d-cafe-menu';

/** Ly đồ uống 3D đặt trên bàn (gốc = tâm đáy, y = 0 là mặt bàn). */

const liquidMat = (color: string) =>
  sharedMat(`p:liquid:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
const foamMat = () => sharedMat('p:foam', () => new THREE.MeshStandardMaterial({ color: '#f3e7d3', roughness: 0.85 }));
const iceMat = () =>
  sharedMat('p:ice', () => new THREE.MeshPhysicalMaterial({ color: '#eef8ff', transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, depthWrite: false }));
const plasticMat = () =>
  sharedMat('p:cupPlastic', () => new THREE.MeshPhysicalMaterial({ color: '#f8fafc', transparent: true, opacity: 0.35, roughness: 0.15, depthWrite: false }));

function handle(r: number, y: number, x: number, mat: THREE.Material) {
  const h = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 8, 16, Math.PI * 1.15), mat);
  h.rotation.z = -Math.PI * 0.57;
  h.position.set(x, y, 0);
  return h;
}

function straw(len: number, color: string, x: number, y: number, z: number, tilt = 0.18) {
  const s = cyl(0.0035, 0.0035, len, M.gloss(color), x, y, z, 8);
  s.rotation.z = tilt;
  return s;
}

export function buildDrink(item: Pick<CafeMenuItem, 'cupKind' | 'liquid' | 'foam'>): THREE.Group {
  const g = new THREE.Group();
  const white = M.ceramic('#fbfaf7');
  switch (item.cupKind) {
    case 'espresso': {
      g.add(cyl(0.062, 0.058, 0.007, white, 0, 0.0035, 0, 28));
      g.add(lathe([[0, 0.007], [0.022, 0.007], [0.03, 0.02], [0.033, 0.055], [0.0305, 0.055], [0.028, 0.022], [0, 0.02]], white, 28));
      g.add(cyl(0.029, 0.029, 0.002, item.foam ? liquidMat('#b07a4a') : liquidMat(item.liquid), 0, 0.05, 0, 24));
      g.add(handle(0.011, 0.035, 0.038, white));
      break;
    }
    case 'mug':
    case 'tea': {
      const glassy = item.cupKind === 'tea';
      const body = glassy ? M.glass() : white;
      g.add(cyl(0.075, 0.07, 0.008, white, 0, 0.004, 0, 28));
      g.add(lathe([[0, 0.008], [0.03, 0.008], [0.042, 0.03], [0.047, 0.085], [0.0445, 0.085], [0.04, 0.032], [0, 0.03]], body, 32));
      if (glassy) g.add(cyl(0.041, 0.034, 0.05, liquidMat(item.liquid), 0, 0.055, 0, 24));
      g.add(cyl(0.043, 0.043, 0.003, item.foam ? foamMat() : liquidMat(item.liquid), 0, 0.078, 0, 28));
      if (item.foam) {
        // Latte art: trái tim nhỏ
        const heart = sphere(0.012, liquidMat('#a8743f'), 0, 0.0795, 0.004);
        heart.scale.set(1.2, 0.12, 1);
        g.add(heart);
      }
      g.add(handle(0.017, 0.052, 0.053, body));
      break;
    }
    case 'iced': {
      g.add(lathe([[0, 0], [0.036, 0], [0.045, 0.15], [0.043, 0.15], [0.034, 0.004], [0, 0.004]], M.glass(), 32));
      g.add(cyl(0.041, 0.033, 0.11, liquidMat(item.liquid), 0, 0.06, 0, 24));
      for (let i = 0; i < 4; i++) {
        const ice = box(0.022, 0.022, 0.022, iceMat(), Math.cos(i * 1.7) * 0.016, 0.105 + (i % 2) * 0.016, Math.sin(i * 1.7) * 0.016, 0.004);
        ice.rotation.set(i * 0.6, i * 0.9, 0.3);
        g.add(ice);
      }
      g.add(straw(0.2, '#16a34a', 0.012, 0.12, 0.004));
      break;
    }
    case 'takeaway': {
      g.add(lathe([[0, 0], [0.036, 0], [0.046, 0.14], [0.044, 0.14], [0.034, 0.004], [0, 0.004]], plasticMat(), 32));
      g.add(cyl(0.043, 0.033, 0.12, liquidMat(item.liquid), 0, 0.064, 0, 24));
      const pearl = liquidMat('#1c1210');
      for (let i = 0; i < 9; i++) g.add(sphere(0.0065, pearl, Math.cos(i * 2.4) * 0.022, 0.012 + (i % 3) * 0.008, Math.sin(i * 2.4) * 0.022));
      const lid = lathe([[0, 0.14], [0.047, 0.14], [0.044, 0.155], [0.025, 0.172], [0, 0.175]], plasticMat(), 28);
      g.add(lid);
      const s = cyl(0.0055, 0.0055, 0.22, M.gloss('#111827'), 0.008, 0.15, 0, 10);
      s.rotation.z = 0.12;
      g.add(s);
      break;
    }
    case 'bottle': {
      g.add(lathe([[0, 0], [0.032, 0], [0.033, 0.15], [0.028, 0.18], [0.013, 0.2], [0.013, 0.21], [0, 0.21]], M.glass(), 28));
      g.add(cyl(0.03, 0.03, 0.14, liquidMat('#e0f2fe'), 0, 0.075, 0, 20));
      g.add(cyl(0.0335, 0.0335, 0.05, M.paint('#2563eb'), 0, 0.09, 0, 24));
      g.add(cyl(0.014, 0.014, 0.018, M.paint('#1d4ed8'), 0, 0.219, 0, 16));
      break;
    }
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  return g;
}

/** Các ly của 1 đơn đã phục vụ: xếp hàng ngang quanh điểm đặt, xoay theo hướng khách. */
export function buildOrderDrinks(order: DrinkOrderView, menu: CafeMenuItem[]): THREE.Group | null {
  if (!order.spot) return null;
  const byCode = new Map(menu.map((m) => [m.code, m]));
  const cups: CafeMenuItem[] = [];
  for (const l of order.lines) {
    const it = byCode.get(l.code);
    if (it) for (let i = 0; i < l.qty; i++) cups.push(it);
  }
  if (!cups.length) return null;
  const g = new THREE.Group();
  // Nhấc 1.2cm khỏi mặt bàn (mặt bàn gỗ nguyên tấm có vát cạnh ~1cm) → không lún ly khi nhìn sát ở góc thứ nhất
  g.position.set(order.spot.x, order.spot.y + 0.012, order.spot.z);
  // Quay mặt (tay cầm) về phía khách
  g.rotation.y = Math.atan2(order.posX - order.spot.x, order.posZ - order.spot.z) + Math.PI / 2;
  const gap = 0.12;
  cups.slice(0, 5).forEach((it, i) => {
    const cup = buildDrink(it);
    cup.position.z = (i - (Math.min(cups.length, 5) - 1) / 2) * gap;
    cup.rotation.y = (i % 2 ? 0.4 : -0.3);
    g.add(cup);
  });
  g.userData.orderId = order.id;
  return g;
}
