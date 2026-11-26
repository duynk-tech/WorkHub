import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { lightboxMat } from '../materials';
import { M, box, cyl, lathe, plane, type ShelfSlot } from './kit';
import { labelTex } from './textures';

/** Đồ quán cà phê: quầy bar, máy espresso, tủ bánh, bảng menu, đèn thả. */

export function buildBarCounter(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  // Thân quầy ốp gỗ nan dọc
  g.add(box(w, h - 0.05, d, M.wood(o.color ?? '#6b4226'), 0, (h - 0.05) / 2, 0, 0.02));
  const slats = Math.floor(w / 0.06);
  for (let i = 0; i < slats; i++) {
    g.add(box(0.035, h - 0.2, 0.02, M.wood(o.color ?? '#6b4226'), -w / 2 + 0.04 + i * 0.06, (h - 0.2) / 2 + 0.08, d / 2 + 0.008, 0.006));
  }
  g.add(box(w - 0.05, 0.08, 0.03, M.paint('#111111'), 0, 0.04, d / 2 - 0.02)); // chân lõm
  const topMat = o.variant === 'wood' ? M.woodGloss('#3b2a1e') : M.marble();
  g.add(box(w + 0.08, 0.05, d + 0.12, topMat, 0, h - 0.025, 0.03, 0.012));
  // Gác chân kim loại phía khách
  const rail = cyl(0.014, 0.014, w - 0.1, M.metal('#b08d57', 0.25), 0, 0.25, d / 2 + 0.12, 16);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  // Dải LED hắt dưới mặt quầy
  g.add(box(w - 0.1, 0.01, 0.02, M.glow('#ffcf8a', 0.6, 2), 0, h - 0.07, d / 2 + 0.07));
  // Dụng cụ trên quầy: ly, bình sữa, hộp ống hút
  const cupMat = M.ceramic('#ffffff');
  for (let i = 0; i < 4; i++) g.add(lathe([[0, 0], [0.035, 0], [0.042, 0.09], [0.04, 0.09], [0.032, 0.005], [0, 0.005]], cupMat, 16)).position.set(-w * 0.35 + i * 0.1, h, -d * 0.2);
  g.add(cyl(0.04, 0.045, 0.12, M.chrome(), w * 0.3, h + 0.06, -d * 0.15, 16));
  return g;
}

export function buildEspresso(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const body = M.metal(o.color ?? '#d1d5db', 0.22);
  g.add(box(w, h * 0.75, d, body, 0, h * 0.4, 0, 0.03));
  g.add(box(w * 0.98, 0.04, d * 0.98, M.chrome(), 0, h * 0.8, 0, 0.01)); // khay hâm ly
  // Mặt trước: 2 group pha + tay cầm, đồng hồ áp suất, khay hứng
  for (const sx of [-0.22, 0.22]) {
    g.add(cyl(0.035, 0.04, 0.06, M.chrome(), sx * w, h * 0.42, d / 2 + 0.03, 16));
    const handle = box(0.02, 0.02, 0.14, M.black(), sx * w, h * 0.38, d / 2 + 0.1, 0.008);
    handle.rotation.x = -0.15;
    g.add(handle);
  }
  for (const sx of [-0.12, 0.12]) {
    const gauge = cyl(0.03, 0.03, 0.012, M.paint('#fafafa'), sx * w, h * 0.65, d / 2 + 0.006, 20);
    gauge.rotation.x = Math.PI / 2;
    g.add(gauge);
  }
  g.add(box(w * 0.85, 0.025, 0.14, M.chrome(), 0, h * 0.06, d / 2 + 0.05, 0.006));
  // Vòi đánh sữa
  g.add(cyl(0.006, 0.006, 0.18, M.chrome(), w * 0.42, h * 0.45, d / 2 + 0.05, 8));
  // Máy xay bên cạnh
  const grinder = new THREE.Group();
  grinder.add(box(0.18, 0.28, 0.24, M.black(), 0, 0.14, 0, 0.02));
  grinder.add(lathe([[0.0, 0.0], [0.07, 0.0], [0.1, 0.2], [0.0, 0.2]], M.glass(), 20)).position.y = 0.28;
  grinder.position.set(w / 2 + 0.16, 0, 0);
  g.add(grinder);
  return g;
}

export function buildPastryCase(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h * 0.55, d, M.wood('#3b2a1e'), 0, h * 0.275, 0, 0.015));
  const glass = M.glass();
  const ch = h * 0.45;
  const front = box(w - 0.02, ch, 0.006, glass, 0, h * 0.55 + ch / 2, d / 2 - 0.1);
  front.rotation.x = 0.25;
  g.add(front);
  for (const sx of [-1, 1]) g.add(box(0.006, ch, d - 0.04, glass, sx * (w / 2 - 0.01), h * 0.55 + ch / 2, 0));
  g.add(box(w, 0.02, d, M.metal('#d1d5db'), 0, h - 0.01, 0));
  g.add(box(w - 0.06, 0.008, d - 0.12, M.glow('#fff4d6', 0.8, 2), 0, h - 0.03, 0));
  const shelves: ShelfSlot[] = [
    { x: 0, y: h * 0.55 + 0.005, z: 0, width: w - 0.1, depth: d - 0.2, clearance: ch * 0.45, facing: 0 },
    { x: 0, y: h * 0.55 + ch * 0.5, z: -0.03, width: w - 0.1, depth: d - 0.25, clearance: ch * 0.42, facing: 0 },
  ];
  g.add(box(w - 0.06, 0.008, d - 0.25, glass, 0, h * 0.55 + ch * 0.5 - 0.004, -0.03));
  // Bánh ngọt trưng bày (procedural)
  const cakeMats = ['#f5d0a9', '#8b5a2b', '#f9a8d4', '#fde68a'].map((c) => M.paint(c, 0.7));
  for (const [si, s] of shelves.entries()) {
    const n = Math.max(3, Math.floor(s.width / 0.16));
    for (let i = 0; i < n; i++) {
      const cx = -s.width / 2 + (s.width / n) * (i + 0.5);
      const cake = cyl(0.055, 0.06, 0.05, cakeMats[(i + si) % cakeMats.length], cx, s.y + 0.03, s.z, 18);
      g.add(cake);
      g.add(cyl(0.065, 0.065, 0.006, M.ceramic('#ffffff'), cx, s.y + 0.003, s.z, 20));
    }
  }
  return g;
}

export function buildMenuBoard(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const mountY = 2.0;
  g.add(box(w + 0.06, h + 0.06, d, M.wood('#3b2a1e'), 0, mountY, 0, 0.01));
  const title = o.label && o.label !== 'Bảng menu' ? o.label.toUpperCase() : 'MENU';
  const tex = labelTex(
    [
      { text: title.slice(0, 22), size: 84, color: '#fde68a', weight: 800, y: 80 },
      { text: 'Espresso ............ 35K', size: 46, color: '#f8fafc', weight: 500, y: 190 },
      { text: 'Cappuccino .......... 45K', size: 46, color: '#f8fafc', weight: 500, y: 260 },
      { text: 'Latte đá ............... 49K', size: 46, color: '#f8fafc', weight: 500, y: 330 },
      { text: 'Bạc xỉu ................. 39K', size: 46, color: '#f8fafc', weight: 500, y: 400 },
      { text: 'Trà đào cam sả ...... 45K', size: 46, color: '#f8fafc', weight: 500, y: 470 },
    ],
    '#16181d',
    1200,
    560,
  );
  g.add(plane(w, h, lightboxMat(tex), 0, mountY, d / 2 + 0.003));
  // Giá treo 2 dây
  for (const sx of [-1, 1]) g.add(cyl(0.004, 0.004, 1.2, M.metal('#444'), sx * w * 0.4, mountY + h / 2 + 0.6, 0, 6));
  return g;
}

export function buildPendant(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = Math.min(o.widthM, o.depthM) / 2;
  const hang = 2.55;
  g.add(cyl(0.004, 0.004, 1.6, M.black(), 0, hang + 0.8, 0, 6));
  const shade = lathe([[0.02, 0.0], [r, -o.heightM * 0.85], [r * 1.02, -o.heightM * 0.88], [0.025, 0.02]], M.metal(o.color ?? '#111827', 0.45), 32);
  shade.position.y = hang;
  const mat = shade.material as THREE.MeshStandardMaterial;
  mat.side = THREE.DoubleSide;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), M.glow('#ffd59a', 2.2, 5));
  bulb.position.y = hang - o.heightM * 0.7;
  g.add(bulb);
  g.userData.noShadowCast = true;
  return g;
}
