import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, hashId, lathe, seeded, sphere } from './kit';

/**
 * Trang trí lễ hội & sự kiện: Giáng sinh (cây thông, quà, người tuyết), Tết (mai, đào, quất, đèn lồng,
 * câu đối, mâm ngũ quả), sự kiện (backdrop, cổng bong bóng, kệ hoa khai trương, thảm đỏ).
 */

const SERIF = '"Times New Roman", "Noto Serif", serif';
const texCache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}
const glow = (color: string, day = 1, night = 3.5) => M.glow(color, day, night);
const physical = (key: string, color: string, rough = 0.25) =>
  sharedMat(`f:${key}:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.15 }));

/** Gom nhiều quả cầu nhỏ cùng vật liệu thành 1 InstancedMesh (hoa, quả, bóng trang trí) */
function dots(points: THREE.Vector3[], r: number, mat: THREE.Material, scale?: (i: number) => number): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length));
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    const s = scale ? scale(i) : 1;
    m.makeScale(s, s, s).setPosition(p);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = points.length;
  mesh.castShadow = true;
  mesh.userData.noMerge = true;
  return mesh;
}

// ───────────── Giáng sinh ─────────────
export function buildChristmasTree(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const H = o.heightM;
  const R = Math.min(o.widthM, o.depthM) / 2;
  const pine = sharedMat('f:pine', () => new THREE.MeshStandardMaterial({ color: '#1f5c32', roughness: 0.85, flatShading: true }));
  // Chậu + thân
  g.add(cyl(R * 0.32, R * 0.26, 0.35, M.paint('#7f1d1d', 0.5), 0, 0.175, 0, 20));
  g.add(cyl(0.06, 0.08, 0.4, M.wood('#5b3a22'), 0, 0.5, 0, 8));
  // 5 tầng tán hình nón có mép răng cưa
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const rr = R * (1 - t * 0.78);
    const hh = (H - 0.6) * 0.34;
    const y = 0.55 + (H - 0.75) * t * 0.92;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 14, 2), pine);
    const p = cone.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < -hh / 2 + 0.01) p.setY(k, p.getY(k) - (k % 2) * 0.06); // mép rủ so le
    cone.geometry.computeVertexNormals();
    cone.position.y = y + hh / 2;
    cone.castShadow = true;
    g.add(cone);
  }
  // Bóng trang trí nhiều màu + dây đèn xoắn ốc phát sáng
  const colors = ['#dc2626', '#facc15', '#2563eb', '#e5e7eb'];
  for (const [ci, col] of colors.entries()) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 14; k++) {
      const t = 0.08 + r() * 0.8;
      const a = r() * Math.PI * 2;
      const rr = R * (1 - t * 0.8) * 0.9;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, 0.6 + (H - 0.8) * t, Math.sin(a) * rr));
    }
    g.add(dots(pts, 0.05, physical(`ball${ci}`, col, 0.15)));
  }
  const bulbs: THREE.Vector3[] = [];
  for (let k = 0; k < 90; k++) {
    const t = k / 90;
    const a = t * Math.PI * 2 * 6;
    const rr = R * (1 - t * 0.85) * 0.95;
    bulbs.push(new THREE.Vector3(Math.cos(a) * rr, 0.6 + (H - 0.8) * t, Math.sin(a) * rr));
  }
  g.add(dots(bulbs, 0.022, glow('#ffe08a', 1.2, 4)));
  // Ngôi sao trên đỉnh
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = k % 2 ? 0.07 : 0.16;
    if (k === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const starMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: false }), glow('#fde047', 1.5, 4.5));
  starMesh.position.set(0, H - 0.05, -0.02);
  g.add(starMesh);
  // Vài hộp quà dưới gốc
  const giftCols = ['#dc2626', '#2563eb', '#16a34a', '#facc15'];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const s = 0.22 + r() * 0.12;
    g.add(gift(giftCols[k], s, Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75, a));
  }
  return g;
}

function gift(color: string, s: number, x: number, z: number, rotY = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(box(s, s * 0.8, s, physical('gift', color, 0.35), 0, s * 0.4, 0));
  const ribbon = M.gloss(color === '#facc15' ? '#dc2626' : '#facc15');
  g.add(box(s + 0.01, s * 0.8 + 0.01, s * 0.14, ribbon, 0, s * 0.4, 0), box(s * 0.14, s * 0.8 + 0.01, s + 0.01, ribbon, 0, s * 0.4, 0));
  const bow = new THREE.Mesh(new THREE.TorusGeometry(s * 0.14, s * 0.04, 6, 12), ribbon);
  bow.position.y = s * 0.82;
  g.add(bow);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function buildGiftBoxes(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const cols = ['#dc2626', '#2563eb', '#16a34a', '#facc15', '#db2777'];
  for (let k = 0; k < 5; k++) {
    const s = 0.2 + r() * 0.2;
    g.add(gift(cols[k], s, (r() - 0.5) * o.widthM * 0.7, (r() - 0.5) * o.depthM * 0.7, r() * 3));
  }
  return g;
}

export function buildSnowman(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const H = o.heightM;
  const snow = sharedMat('f:snow', () => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9 }));
  const r1 = H * 0.22;
  const r2 = H * 0.16;
  const r3 = H * 0.11;
  g.add(sphere(r1, snow, 0, r1 * 0.95, 0), sphere(r2, snow, 0, r1 * 1.8 + r2 * 0.7, 0), sphere(r3, snow, 0, r1 * 1.8 + r2 * 1.6 + r3 * 0.7, 0));
  const headY = r1 * 1.8 + r2 * 1.6 + r3 * 0.7;
  const coal = M.black();
  for (const s of [-1, 1]) g.add(sphere(r3 * 0.1, coal, s * r3 * 0.35, headY + r3 * 0.2, r3 * 0.9));
  const nose = cyl(0.001, r3 * 0.14, r3 * 0.7, M.paint('#f97316', 0.5), 0, headY, r3 * 1.2, 10);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  g.add(cyl(r3 * 0.85, r3 * 0.9, r3 * 0.2, M.paint('#111827', 0.5), 0, headY + r3 * 0.85, 0, 18));
  g.add(cyl(r3 * 0.6, r3 * 0.6, r3 * 0.8, M.paint('#111827', 0.5), 0, headY + r3 * 1.3, 0, 18));
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(r2 * 0.75, r2 * 0.14, 8, 20), M.paint('#dc2626', 0.7));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = r1 * 1.8 + r2 * 1.35;
  g.add(scarf);
  for (const s of [-1, 1]) {
    const arm = cyl(0.012, 0.008, r2 * 2.2, M.wood('#5b3a22'), s * (r2 + r2 * 0.6), r1 * 1.8 + r2 * 0.9, 0, 6);
    arm.rotation.z = s * 1.0;
    g.add(arm);
  }
  return g;
}

// ───────────── Tết: mai, đào, quất ─────────────
function blossomTree(o: SpaceObject, flower: string, center: string, envelopes: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const H = o.heightM;
  const R = Math.min(o.widthM, o.depthM) / 2;
  // Chậu sứ men lam (hoa văn trắng xanh)
  const potMat = sharedMat('f:porcelain', () =>
    new THREE.MeshPhysicalMaterial({
      map: tex('porcelain', 256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 3;
        for (let x = 0; x < w; x += 32) {
          ctx.beginPath();
          ctx.arc(x + 16, h / 2, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, h * 0.15);
          ctx.lineTo(x + 32, h * 0.15);
          ctx.moveTo(x, h * 0.85);
          ctx.lineTo(x + 32, h * 0.85);
          ctx.stroke();
        }
      }),
      roughness: 0.25,
      clearcoat: 1,
    }),
  );
  const potH = Math.min(0.55, H * 0.2);
  g.add(lathe([[0, 0], [R * 0.4, 0], [R * 0.55, potH * 0.6], [R * 0.5, potH], [0, potH]], potMat, 28));
  // Thân & cành uốn lượn
  const bark = sharedMat('f:bark', () => new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.95 }));
  const tips: THREE.Vector3[] = [];
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const mid = from.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3((r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15));
    const end = from.clone().addScaledVector(dir, len);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, mid, end]), 6, rad, 5, false), bark));
    if (depth === 0 || rad < 0.008) {
      tips.push(end);
      return;
    }
    const n = 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.3, 0.25 + r() * 0.4, (r() - 0.5) * 1.3)).normalize();
      branch(end, nd, len * (0.62 + r() * 0.2), rad * 0.62, depth - 1);
    }
    tips.push(mid);
  };
  branch(new THREE.Vector3(0, potH, 0), new THREE.Vector3(0.1, 1, 0.05).normalize(), (H - potH) * 0.42, 0.05, 3);
  // Hoa nở dày quanh các đầu cành + nhụy
  const flowers: THREE.Vector3[] = [];
  for (const t of tips) for (let k = 0; k < 9; k++) flowers.push(t.clone().add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.22, (r() - 0.5) * 0.3)));
  g.add(dots(flowers, 0.028, physical(`petal`, flower, 0.4), () => 0.8 + r() * 0.6));
  g.add(dots(flowers.filter((_, i) => i % 2 === 0).map((p) => p.clone().add(new THREE.Vector3(0, 0.012, 0))), 0.01, M.paint(center, 0.6)));
  // Bao lì xì đỏ treo
  if (envelopes) {
    const lixi = sharedMat('f:lixi', () =>
      new THREE.MeshStandardMaterial({
        map: tex('lixi', 64, 128, (ctx, w, h) => {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#facc15';
          ctx.font = `800 40px ${SERIF}`;
          ctx.textAlign = 'center';
          ctx.fillText('福', w / 2, h / 2 + 14);
        }),
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    for (let k = 0; k < Math.min(10, tips.length); k++) {
      const t = tips[(k * 7) % tips.length];
      const env = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.13), lixi);
      env.position.set(t.x, t.y - 0.12, t.z);
      env.rotation.y = r() * Math.PI;
      env.userData.noMerge = true;
      g.add(env);
    }
  }
  return g;
}
export const buildMaiTree = (o: SpaceObject) => blossomTree(o, '#facc15', '#b45309', true);
export const buildDaoTree = (o: SpaceObject) => blossomTree(o, '#f9a8d4', '#be185d', true);

export function buildKumquat(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const H = o.heightM;
  const R = Math.min(o.widthM, o.depthM) / 2;
  g.add(lathe([[0, 0], [R * 0.45, 0], [R * 0.6, 0.35], [0, 0.35]], M.ceramic('#b45309'), 24));
  g.add(cyl(0.03, 0.04, H * 0.35, M.wood('#4a3424'), 0, 0.35 + H * 0.17, 0, 8));
  const leaf = sharedMat('f:kumLeaf', () => new THREE.MeshStandardMaterial({ color: '#2f6b2f', roughness: 0.6, flatShading: true }));
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.9, 2), leaf);
  const p = bush.geometry.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + r() * 0.2), p.getY(k) * (0.95 + r() * 0.15), p.getZ(k) * (0.9 + r() * 0.2));
  bush.geometry.computeVertexNormals();
  bush.position.y = 0.35 + H * 0.35 + R * 0.6;
  bush.castShadow = true;
  g.add(bush);
  const fruits: THREE.Vector3[] = [];
  for (let k = 0; k < 70; k++) {
    const u = r() * Math.PI * 2;
    const v = Math.acos(2 * r() - 1);
    const rr = R * 0.92;
    fruits.push(new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, bush.position.y + Math.cos(v) * rr * 0.95, Math.sin(v) * Math.sin(u) * rr));
  }
  g.add(dots(fruits, 0.028, physical('kumquat', '#f97316', 0.3)));
  return g;
}

// ───────────── Tết: đèn lồng, câu đối, mâm ngũ quả ─────────────
function redLantern(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const red = sharedMat('f:redLantern', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6, emissive: '#ff4b2b', emissiveIntensity: 0.2 });
    registerEmissive({ mat: m, day: 0.2, night: 1.3, mode: 'emissive' });
    return m;
  });
  const gold = M.metal('#d4a017', 0.3);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 16, 12), red);
  body.scale.y = 0.82;
  g.add(body);
  g.add(cyl(0.07 * scale, 0.07 * scale, 0.03 * scale, gold, 0, 0.14 * scale, 0, 12), cyl(0.07 * scale, 0.07 * scale, 0.03 * scale, gold, 0, -0.14 * scale, 0, 12));
  g.add(cyl(0.012 * scale, 0.005 * scale, 0.2 * scale, M.paint('#facc15', 0.6), 0, -0.26 * scale, 0, 6));
  return g;
}
export function buildLanternString(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const pole = M.metal('#3f3f46', 0.4);
  for (const s of [-1, 1]) g.add(cyl(0.035, 0.04, h, pole, s * (w / 2), h / 2, 0, 8));
  const a = new THREE.Vector3(-w / 2, h - 0.1, 0);
  const b = new THREE.Vector3(w / 2, h - 0.1, 0);
  const mid = new THREE.Vector3(0, h - 0.6, 0);
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 4, false), M.black()));
  const n = Math.max(3, Math.round(w / 0.8));
  for (let k = 1; k < n; k++) {
    const p = curve.getPoint(k / n);
    const l = redLantern(0.9);
    l.position.set(p.x, p.y - 0.25, p.z);
    g.add(l);
  }
  return g;
}

function coupletTex(text: string) {
  return tex(`couplet:${text}`, 128, 640, (ctx, w, h) => {
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = text.split(/\s+/).filter(Boolean).slice(0, 7);
    const step = (h - 60) / Math.max(1, words.length);
    ctx.font = `700 ${Math.min(44, step * 0.7)}px ${SERIF}`;
    words.forEach((wd, i) => ctx.fillText(wd, w / 2, 30 + step * (i + 0.5)));
  });
}
/** Câu đối đỏ 2 bên (label = vế trái, subLabel = vế phải) + hoành phi ngang */
export function buildCouplets(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const left = o.label && o.label !== 'Câu đối Tết' ? o.label : 'Xuân an khang thịnh vượng';
  const right = o.subLabel || 'Tết phát tài như ý';
  const wood = M.wood('#5b3a22');
  for (const [s, text] of [[-1, left], [1, right]] as [number, string][]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, h - 0.2), sharedMat(`f:couplet:${text}`, () => new THREE.MeshStandardMaterial({ map: coupletTex(text), roughness: 0.6, side: THREE.DoubleSide })));
    panel.position.set(s * (w / 2 - 0.25), h / 2 + 0.05, 0);
    panel.userData.noMerge = true;
    g.add(panel);
    g.add(box(0.48, 0.04, 0.04, wood, s * (w / 2 - 0.25), h - 0.03, 0), box(0.48, 0.04, 0.04, wood, s * (w / 2 - 0.25), 0.13, 0));
    g.add(cyl(0.02, 0.025, h, M.metal('#3f3f46', 0.4), s * (w / 2 - 0.25), h / 2, -0.05, 8));
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 1.2, 0.45),
    sharedMat('f:chucTet', () =>
      new THREE.MeshStandardMaterial({
        map: tex('chucTet', 1024, 180, (ctx, cw, ch) => {
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 8;
          ctx.strokeRect(10, 10, cw - 20, ch - 20);
          ctx.fillStyle = '#facc15';
          ctx.font = `800 96px ${SERIF}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('CHÚC MỪNG NĂM MỚI', cw / 2, ch / 2 + 4);
        }),
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
    ),
  );
  banner.position.set(0, h - 0.2, 0);
  banner.userData.noMerge = true;
  g.add(banner);
  return g;
}

export function buildFruitTray(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const h = o.heightM;
  // Bàn thờ / kỷ gỗ đỏ nhỏ + mâm ngũ quả
  g.add(box(o.widthM, h - 0.05, o.depthM, M.woodGloss('#7f1d1d'), 0, (h - 0.05) / 2, 0, 0.01));
  g.add(cyl(0.26, 0.22, 0.05, M.metal('#d4a017', 0.25), 0, h + 0.02, 0, 24));
  g.add(sphere(0.12, physical('pomelo', '#84cc16', 0.5), 0, h + 0.16, 0));
  const ring: [string, number][] = [['#facc15', 0.07], ['#dc2626', 0.06], ['#f97316', 0.065], ['#16a34a', 0.06], ['#a855f7', 0.05]];
  ring.forEach(([c, rr], i) => {
    const a = (i / ring.length) * Math.PI * 2;
    g.add(sphere(rr, physical(`fruit${i}`, c, 0.35), Math.cos(a) * 0.17, h + 0.08, Math.sin(a) * 0.17));
  });
  for (const s of [-1, 1]) g.add(cyl(0.01, 0.01, 0.25, M.paint('#dc2626', 0.5), s * (o.widthM / 2 - 0.1), h + 0.12, -o.depthM / 2 + 0.1, 6));
  return g;
}

// ───────────── Sự kiện ─────────────
function backdropTex(title: string, sub: string) {
  return tex(`backdrop:${title}|${sub}`, 1600, 900, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(0.6, '#1d4ed8');
    g.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 130;
    ctx.font = `800 ${size}px ${SERIF}`;
    while (ctx.measureText(title.toUpperCase()).width > w * 0.85 && size > 50) {
      size -= 6;
      ctx.font = `800 ${size}px ${SERIF}`;
    }
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.42);
    ctx.font = `600 54px ${SERIF}`;
    ctx.fillStyle = '#facc15';
    ctx.fillText(sub, w / 2, h * 0.62);
  });
}
/** Backdrop sự kiện (label = tên sự kiện, subLabel = ngày / khẩu hiệu) + bục + 2 lẵng hoa */
export function buildEventBackdrop(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const truss = M.metal('#d1d5db', 0.3);
  for (const s of [-1, 1]) g.add(box(0.12, h, 0.12, truss, s * (w / 2), h / 2, 0));
  g.add(box(w + 0.12, 0.12, 0.12, truss, 0, h, 0));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.1, h - 0.3),
    sharedMat(`f:backdrop:${o.label}|${o.subLabel}`, () => {
      const t = backdropTex(o.label || 'Sự kiện', o.subLabel || 'Chào mừng quý khách');
      const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5 });
      registerEmissive({ mat: m, day: 0.35, night: 0.9, mode: 'emissive' });
      return m;
    }),
  );
  screen.position.set(0, (h - 0.3) / 2 + 0.2, 0.07);
  screen.userData.noMerge = true;
  g.add(screen);
  g.add(box(w * 0.6, 0.2, 1.2, M.paint('#111827', 0.6), 0, 0.1, 0.8));
  for (const s of [-1, 1]) {
    const stand = flowerStand(1.6, s < 0 ? '#ef4444' : '#f472b6', '');
    stand.position.set(s * (w / 2 - 0.4), 0, 0.6);
    g.add(stand);
  }
  return g;
}

export function buildBalloonArch(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const cols = ['#ef4444', '#f8fafc', '#2563eb', '#facc15', '#ec4899'];
  const per: THREE.Vector3[][] = cols.map(() => []);
  const n = 70;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = Math.PI * t;
    const x = -Math.cos(a) * (w / 2);
    const y = Math.sin(a) * (h - 0.2);
    for (let j = 0; j < 3; j++) {
      const off = new THREE.Vector3(Math.cos(j * 2.1) * 0.12, Math.sin(j * 2.1) * 0.12, Math.sin(j * 1.3 + k) * 0.12);
      per[(k + j) % cols.length].push(new THREE.Vector3(x, Math.max(0.12, y + 0.12), 0).add(off));
    }
  }
  per.forEach((pts, i) => g.add(dots(pts, 0.13, physical(`balloon${i}`, cols[i], 0.2), (k) => 0.85 + ((k * 37) % 10) / 40)));
  return g;
}

function flowerStand(h: number, color: string, ribbon: string): THREE.Group {
  const g = new THREE.Group();
  const leg = M.wood('#a16207');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const l = cyl(0.015, 0.015, h, leg, Math.cos(a) * 0.18, h / 2, Math.sin(a) * 0.18, 6);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(l);
  }
  // Vòng hoa tròn
  const pts: THREE.Vector3[] = [];
  const pts2: THREE.Vector3[] = [];
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 0.38, h + 0.35 + Math.sin(a) * 0.38, 0.05);
    (k % 3 === 0 ? pts2 : pts).push(p);
  }
  g.add(dots(pts, 0.07, physical(`flower:${color}`, color, 0.4)));
  g.add(dots(pts2, 0.06, M.paint('#16a34a', 0.6)));
  g.add(dots([new THREE.Vector3(0, h + 0.35, 0.06)], 0.12, physical('flowerCenter', '#facc15', 0.4)));
  if (ribbon) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.9),
      sharedMat(`f:ribbon:${ribbon}`, () =>
        new THREE.MeshStandardMaterial({
          map: tex(`ribbon:${ribbon}`, 64, 360, (ctx, w, hh) => {
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(0, 0, w, hh);
            ctx.fillStyle = '#facc15';
            ctx.font = `700 26px ${SERIF}`;
            ctx.textAlign = 'center';
            [...ribbon.toUpperCase().slice(0, 12)].forEach((ch, i) => ctx.fillText(ch, w / 2, 30 + i * 28));
          }),
          side: THREE.DoubleSide,
        }),
      ),
    );
    banner.position.set(0, h - 0.15, 0.08);
    banner.userData.noMerge = true;
    g.add(banner);
  }
  return g;
}
/** Kệ hoa khai trương (label = lời chúc trên băng rôn) */
export function buildFlowerStand(o: SpaceObject): THREE.Group {
  return flowerStand(o.heightM - 0.8, o.color ?? '#ef4444', o.label && o.label !== 'Kệ hoa khai trương' ? o.label : 'Hồng phát');
}

/** Thảm đỏ + cột chắn mạ vàng dây nhung */
export function buildRedCarpet(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.fabric('#b91c1c'));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = 0.012;
  g.add(carpet);
  const gold = M.metal('#d4a017', 0.2);
  const velvet = M.fabric('#7f1d1d');
  for (const s of [-1, 1]) {
    const xs = s * (w / 2 + 0.25);
    let prev: THREE.Vector3 | null = null;
    for (let z = -d / 2; z <= d / 2 + 0.01; z += Math.max(1.2, d / 6)) {
      g.add(cyl(0.16, 0.18, 0.04, gold, xs, 0.02, z, 16), cyl(0.025, 0.025, 0.95, gold, xs, 0.5, z, 10), sphere(0.045, gold, xs, 0.99, z));
      const top = new THREE.Vector3(xs, 0.9, z);
      if (prev) {
        const mid = prev.clone().lerp(top, 0.5);
        mid.y -= 0.18;
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(prev, mid, top), 12, 0.02, 6, false), velvet));
      }
      prev = top;
    }
  }
  return g;
}

export const FESTIVE_BUILDERS: Record<string, (o: SpaceObject) => THREE.Group> = {
  CHRISTMAS_TREE: buildChristmasTree,
  GIFT_BOXES: buildGiftBoxes,
  SNOWMAN: buildSnowman,
  MAI_TREE: buildMaiTree,
  DAO_TREE: buildDaoTree,
  KUMQUAT_TREE: buildKumquat,
  LANTERN_STRING: buildLanternString,
  TET_COUPLETS: buildCouplets,
  FRUIT_TRAY: buildFruitTray,
  EVENT_BACKDROP: buildEventBackdrop,
  BALLOON_ARCH: buildBalloonArch,
  FLOWER_STAND: buildFlowerStand,
  RED_CARPET: buildRedCarpet,
};
