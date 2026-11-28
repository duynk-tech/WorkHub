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

// ───────────── Món ăn miền Tây trên đĩa lót lá chuối ─────────────
const leafMat = () =>
  sharedMat('food:leaf', () => new THREE.MeshPhysicalMaterial({ color: '#4f7d2c', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
const leafDark = () => sharedMat('food:leafDark', () => new THREE.MeshStandardMaterial({ color: '#3d5a1f', roughness: 0.7 }));
const flatMat = (key: string, color: string, rough = 0.6) => sharedMat(`food:${key}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough }));
const disc = (r: number, mat: THREE.Material, y: number, seg = 24) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
};

/** Đĩa sứ + lá chuối lót (ellipse) */
function leafPlate(g: THREE.Group, rx: number, rz: number) {
  g.add(cyl(rx * 0.92, rx * 0.86, 0.008, M.ceramic('#fbfaf7'), 0, 0.004, 0, 32));
  const leaf = disc(1, leafMat(), 0.0095, 28);
  leaf.scale.set(rx, rz, 1);
  g.add(leaf);
}

/** Bánh tét lá cẩm: 3 khoanh cắt (vỏ lá – nếp tím – nhân đậu xanh vàng – lõi chuối cam) + 1 đòn bánh bó lạt */
function buildBanhTet(): THREE.Group {
  const g = new THREE.Group();
  leafPlate(g, 0.12, 0.1);
  const purple = flatMat('tetPurple', '#5b2370', 0.75);
  const yellow = flatMat('tetYellow', '#e9b949', 0.7);
  const core = flatMat('tetCore', '#d9772b', 0.6);
  const slices: [number, number, number][] = [
    [-0.035, 0.035, 0.25],
    [0.03, 0.04, -0.4],
    [0, -0.03, 0.9],
  ];
  slices.forEach(([x, z, rot], i) => {
    const sl = new THREE.Group();
    sl.add(cyl(0.034, 0.034, 0.016, leafDark(), 0, 0.018, 0, 22));
    sl.add(disc(0.031, purple, 0.0265), disc(0.017, yellow, 0.0268), disc(0.0075, core, 0.027, 14));
    sl.position.set(x, 0, z);
    sl.rotation.y = rot;
    sl.userData.bite = i;
    g.add(sl);
  });
  // Đòn bánh chưa cắt nằm phía sau, 3 sợi lạt tre buộc ngang
  const roll = new THREE.Group();
  const body = cyl(0.036, 0.036, 0.12, leafDark(), 0, 0, 0, 20);
  body.rotation.z = Math.PI / 2;
  roll.add(body);
  const tie = sharedMat('food:lat', () => new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.8 }));
  for (const x of [-0.04, 0, 0.04]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0368, 0.0025, 5, 20), tie);
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
    roll.add(band);
  }
  roll.position.set(0.005, 0.046, -0.075);
  g.add(roll);
  return g;
}

let banhItGeo: THREE.BufferGeometry | null = null;
/** Bánh ít trần: hình chuông có gờ khía (lathe + biến dạng xếp nếp) */
function banhItGeometry(): THREE.BufferGeometry {
  if (banhItGeo) return banhItGeo;
  const pts = [[0, 0], [0.028, 0], [0.03, 0.006], [0.027, 0.02], [0.019, 0.03], [0.008, 0.035], [0, 0.036]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 36);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    // Gờ khuôn: 14 nếp dọc, đậm ở thân dưới, mờ dần lên đỉnh
    const k = 1 + 0.07 * Math.cos(a * 14) * Math.max(0, 1 - y / 0.03);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  banhItGeo = geo;
  return geo;
}
function buildBanhIt(): THREE.Group {
  const g = new THREE.Group();
  leafPlate(g, 0.12, 0.095);
  const dough = sharedMat('food:banhIt', () => new THREE.MeshPhysicalMaterial({ color: '#ece0a6', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3 }));
  const dot = sharedMat('food:banhItDot', () => new THREE.MeshPhysicalMaterial({ color: '#5f8f1f', roughness: 0.35, clearcoat: 0.6 }));
  const spots: [number, number][] = [
    [-0.04, 0.025],
    [0.035, 0.028],
    [0, -0.035],
  ];
  spots.forEach(([x, z], i) => {
    const it = new THREE.Group();
    it.add(new THREE.Mesh(banhItGeometry(), dough));
    const d = sphere(0.0065, dot, 0, 0.035, 0);
    d.scale.y = 0.45;
    it.add(d);
    it.position.set(x, 0.0095, z);
    it.userData.bite = i;
    g.add(it);
  });
  return g;
}

/** Ẩn bớt miếng đã ăn (theo thứ tự userData.bite) */
export function setFoodEaten(group: THREE.Object3D, eaten: number): void {
  group.traverse((o) => {
    if (typeof o.userData.bite === 'number') o.visible = o.userData.bite >= eaten;
  });
}

export function buildDrink(item: Pick<CafeMenuItem, 'cupKind' | 'liquid' | 'foam'>): THREE.Group {
  const g = new THREE.Group();
  if (item.cupKind === 'banh_tet' || item.cupKind === 'banh_it') {
    const food = item.cupKind === 'banh_tet' ? buildBanhTet() : buildBanhIt();
    food.userData.food = true;
    food.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
    });
    return food;
  }
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
  // Ly xếp 1 hàng; đĩa bánh xếp hàng phía trong bàn (xa mép phía khách: khách ở phía −X cục bộ)
  const drinks = cups.filter((c) => c.cupKind !== 'banh_tet' && c.cupKind !== 'banh_it').slice(0, 5);
  const foods = cups.filter((c) => c.cupKind === 'banh_tet' || c.cupKind === 'banh_it').slice(0, 3);
  const gap = 0.12;
  drinks.forEach((it, i) => {
    const cup = buildDrink(it);
    cup.position.set(foods.length ? -0.03 : 0, 0, (i - (drinks.length - 1) / 2) * gap);
    cup.rotation.y = (i % 2 ? 0.4 : -0.3);
    g.add(cup);
  });
  foods.forEach((it, i) => {
    const plate = buildDrink(it);
    plate.position.set(0.13, 0, (i - (foods.length - 1) / 2) * 0.25);
    plate.rotation.y = i * 0.7;
    g.add(plate);
  });
  g.userData.hasFood = foods.length > 0;
  g.userData.servedAt = order.servedAt ? Date.parse(order.servedAt) : Date.now();
  g.userData.orderId = order.id;
  return g;
}
