import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { registerEmissive, sharedMat } from '../materials';
import { fabricTex, marbleTex, woodTex } from './textures';

/** Bộ công cụ dựng nội thất: vật liệu PBR dùng chung theo màu + hình khối bo tròn. */

export interface BuildContext {
  companyName: string;
  logoUrl: string;
}

export interface ShelfSlot {
  /** Toạ độ cục bộ của mặt kệ (tâm) */
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Chiều cao trống phía trên mặt kệ */
  clearance: number;
  /** Hướng mặt trước hàng hoá (rad, quanh trục Y cục bộ) */
  facing: number;
  /** Chỉ trưng bày 1 sản phẩm ở giữa (bục) */
  single?: boolean;
  /** Khi kho chưa có máy: bày máy mẫu (máy pha espresso, máy xay) để quầy không trống */
  demoMachines?: boolean;
}

export const M = {
  wood: (color: string) =>
    sharedMat(`p:wood:${color}`, () => new THREE.MeshStandardMaterial({ map: woodTex(), color, roughness: 0.55 })),
  woodGloss: (color: string) =>
    sharedMat(`p:woodGloss:${color}`, () => new THREE.MeshPhysicalMaterial({ map: woodTex(), color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 })),
  marble: () =>
    sharedMat('p:marble', () => new THREE.MeshPhysicalMaterial({ map: marbleTex(), roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.08 })),
  fabric: (color: string) =>
    sharedMat(`p:fabric:${color}`, () =>
      new THREE.MeshPhysicalMaterial({
        map: fabricTex(),
        color,
        roughness: 0.92,
        sheen: 1,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4),
      }),
    ),
  leather: (color: string) =>
    sharedMat(`p:leather:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45 })),
  metal: (color: string, rough = 0.32) =>
    sharedMat(`p:metal:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: rough })),
  paint: (color: string, rough = 0.55) =>
    sharedMat(`p:paint:${color}:${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough })),
  gloss: (color: string) =>
    sharedMat(`p:gloss:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.15 })),
  ceramic: (color: string) =>
    sharedMat(`p:ceramic:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 })),
  glass: () =>
    sharedMat('p:glass', () =>
      new THREE.MeshPhysicalMaterial({ color: '#dbeefc', transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, envMapIntensity: 1.5, depthWrite: false }),
    ),
  soil: () => sharedMat('p:soil', () => new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 })),
  black: () => sharedMat('p:black', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.5 })),
  chrome: () => sharedMat('p:chrome', () => new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 1, roughness: 0.12 })),
  /** Bóng đèn / dải LED (sáng hơn ban đêm) */
  glow: (color: string, day = 1.2, night = 3) =>
    sharedMat(`p:glow:${color}:${day}:${night}`, () => {
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: day });
      registerEmissive({ mat: m, day, night, mode: 'emissive' });
      return m;
    }),
  screen: () =>
    sharedMat('p:screen', () => {
      const m = new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#1e3a8a', emissiveIntensity: 0.35, roughness: 0.2 });
      registerEmissive({ mat: m, day: 0.35, night: 0.9, mode: 'emissive' });
      return m;
    }),
};

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, radius = 0): THREE.Mesh {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Ống uốn theo đường (khung ghế, chân đèn) */
export function tubePath(points: [number, number, number][], r: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), r, 8, false), mat);
  m.castShadow = true;
  return m;
}

/** Lathe theo profile [bán kính, cao] (chậu cây, chân bàn, đèn). */
export function lathe(profile: [number, number][], mat: THREE.Material, seg = 32): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Mặt phẳng hiển thị texture (biển, màn hình, tranh). */
export function plane(w: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  return m;
}

export const seeded = (seed: number) => () => {
  seed = (seed * 16807 + 11) % 2147483647;
  return (seed - 1) / 2147483646;
};

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.abs(h) || 1;
}
