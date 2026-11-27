import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, lathe, sphere } from './kit';

/** Văn phòng: màn hình làm việc sáng khi có người ngồi, TV phòng họp, pantry (quầy bếp, bình nước, tủ lạnh). */

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
const FONT = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** Giao diện WorkHub giả trên màn hình làm việc: thanh bên, tiêu đề, thẻ số liệu, biểu đồ, bảng. */
export function workScreenTex(variant = 0): THREE.CanvasTexture {
  return tex(`workScreen:${variant % 3}`, 512, 300, (ctx, w, h) => {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 92, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText('WorkHub', 12, 28);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i === variant % 3 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(8, 48 + i * 30, 76, 20);
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(['Tổng quan', 'Thiết bị & bảo trì', 'Kho phụ tùng'][variant % 3], 108, 28);
    const colors = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(108 + i * 100, 42, 92, 52);
      ctx.fillStyle = colors[i];
      ctx.fillRect(108 + i * 100, 42, 4, 52);
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 18px ${FONT}`;
      ctx.fillText(String(12 + i * 37 + variant * 5), 118 + i * 100, 78);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(108, 104, 230, 182);
    for (let i = 0; i < 9; i++) {
      const bh = 30 + ((i * 53 + variant * 31) % 110);
      ctx.fillStyle = i % 3 === 0 ? '#93c5fd' : '#2563eb';
      ctx.fillRect(122 + i * 23, 272 - bh, 14, bh);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(346, 104, 154, 182);
    for (let r = 0; r < 8; r++) {
      ctx.fillStyle = r === 0 ? '#e2e8f0' : r % 2 ? '#f8fafc' : '#ffffff';
      ctx.fillRect(350, 108 + r * 22, 146, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(356, 116 + r * 22, 50 + ((r * 17) % 40), 4);
    }
  });
}

/** Vật liệu màn hình riêng cho từng bàn (bật/tắt theo người ngồi) */
export function makeDeskScreenMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#05070d', emissive: '#0b1220', emissiveIntensity: 0.4, roughness: 0.25 });
}
export function setDeskScreenOn(mat: THREE.MeshStandardMaterial, on: boolean, variant: number) {
  if (on) {
    const t = workScreenTex(variant);
    mat.map = t;
    mat.emissiveMap = t;
    mat.color.set('#ffffff');
    mat.emissive.set('#ffffff');
    mat.emissiveIntensity = 0.85;
  } else {
    mat.map = null;
    mat.emissiveMap = null;
    mat.color.set('#05070d');
    mat.emissive.set('#0b1220');
    mat.emissiveIntensity = 0.4;
  }
  mat.needsUpdate = true;
}

/** Slide trình chiếu phòng họp: tiêu đề + biểu đồ doanh số + tên công ty */
function slideTex(title: string) {
  return tex(`slide:${title}`, 1024, 576, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0f2a6b');
    g.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(title.toUpperCase().slice(0, 28), 60, 100);
    ctx.font = `500 28px ${FONT}`;
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('Báo cáo kinh doanh quý · Kế hoạch tháng tới', 60, 148);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(60, 190, 560, 330);
    for (let i = 0; i < 8; i++) {
      const bh = 60 + ((i * 47) % 200) + i * 8;
      ctx.fillStyle = i === 7 ? '#facc15' : '#93c5fd';
      ctx.fillRect(90 + i * 64, 500 - bh, 40, bh);
    }
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const y = 430 - i * 28 - (i % 2) * 12;
      if (i === 0) ctx.moveTo(110 + i * 64, y);
      else ctx.lineTo(110 + i * 64, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText('+28%', 680, 280);
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('Tăng trưởng doanh thu', 680, 316);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText('1.240', 680, 410);
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('Thiết bị đang bảo trì', 680, 446);
  });
}

export function buildMeetingTv(o: SpaceObject, companyName: string): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const sh = w * 0.5625;
  const black = M.black();
  // Chân đứng di động + màn hình 16:9
  g.add(box(w * 0.55, 0.04, 0.6, M.metal('#2b2b2b', 0.4), 0, 0.02, 0));
  g.add(box(0.08, h - sh / 2, 0.06, M.metal('#2b2b2b', 0.4), 0, (h - sh / 2) / 2, -0.04));
  g.add(box(w + 0.04, sh + 0.04, 0.06, black, 0, h - sh / 2, 0, 0.01));
  const screenMat = sharedMat(`o:slide:${companyName}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: slideTex(companyName || 'TIM Corp'), emissive: '#ffffff', emissiveMap: slideTex(companyName || 'TIM Corp'), emissiveIntensity: 0.75, roughness: 0.3 });
    registerEmissive({ mat: m, day: 0.75, night: 1.1, mode: 'emissive' });
    return m;
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, sh), screenMat);
  screen.position.set(0, h - sh / 2, 0.032);
  g.add(screen);
  return g;
}

/** Quầy pantry: tủ bếp dưới + mặt đá, máy pha cà phê, ấm siêu tốc, bồn rửa, kệ ly treo tường */
export function buildPantryCounter(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const cab = M.paint(o.color ?? '#e7e5e4', 0.6);
  g.add(box(w, h - 0.04, d, cab, 0, (h - 0.04) / 2, 0, 0.01));
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) {
    g.add(box(0.56, h - 0.2, 0.01, M.paint('#d6d3d1', 0.5), x, (h - 0.04) / 2, d / 2 + 0.005));
    g.add(box(0.12, 0.015, 0.02, M.chrome(), x, h - 0.2, d / 2 + 0.02));
  }
  g.add(box(w + 0.04, 0.04, d + 0.03, M.marble(), 0, h - 0.02, 0.01));
  // Bồn rửa + vòi
  g.add(box(0.45, 0.02, 0.35, M.chrome(), w / 2 - 0.45, h + 0.001, 0));
  g.add(cyl(0.012, 0.012, 0.28, M.chrome(), w / 2 - 0.45, h + 0.14, -0.15, 8));
  // Máy pha cà phê văn phòng
  const machine = M.paint('#1f2937', 0.4);
  g.add(box(0.34, 0.42, 0.38, machine, -w / 2 + 0.4, h + 0.21, -0.02, 0.03));
  g.add(box(0.3, 0.1, 0.02, M.screen(), -w / 2 + 0.4, h + 0.33, 0.175));
  g.add(cyl(0.035, 0.03, 0.08, M.ceramic('#ffffff'), -w / 2 + 0.4, h + 0.05, 0.12, 12));
  // Ấm siêu tốc + hũ đường + ly úp
  g.add(lathe([[0, 0], [0.08, 0], [0.085, 0.16], [0.06, 0.22], [0, 0.22]], M.metal('#d1d5db', 0.25), 16)).children.at(-1)!.position.set(-w / 2 + 0.85, h, 0);
  for (let i = 0; i < 4; i++) g.add(cyl(0.035, 0.03, 0.08, M.ceramic(['#ffffff', '#1e3a8a', '#f59e0b', '#16a34a'][i]), 0.1 + i * 0.1 - w * 0.05, h + 0.04, 0.05, 12));
  // Kệ ly treo tường phía sau
  g.add(box(w * 0.6, 0.03, 0.22, M.wood('#a47148'), -w * 0.1, h + 0.75, -d / 2 + 0.11));
  for (let i = 0; i < 6; i++) g.add(cyl(0.035, 0.03, 0.08, M.ceramic(i % 2 ? '#ffffff' : '#e2e8f0'), -w * 0.35 + i * 0.12, h + 0.805, -d / 2 + 0.11, 10));
  return g;
}

export function buildWaterDispenser(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const body = M.paint(o.color ?? '#f8fafc', 0.4);
  const bodyH = h * 0.68;
  g.add(box(w, bodyH, d, body, 0, bodyH / 2, 0, 0.03));
  g.add(box(w * 0.7, 0.22, 0.02, M.paint('#cbd5e1', 0.5), 0, bodyH * 0.72, d / 2 + 0.005));
  g.add(sphere(0.02, M.paint('#dc2626', 0.4), -0.06, bodyH * 0.78, d / 2 + 0.02));
  g.add(sphere(0.02, M.paint('#2563eb', 0.4), 0.06, bodyH * 0.78, d / 2 + 0.02));
  const bottle = sharedMat('o:waterBottle', () => new THREE.MeshPhysicalMaterial({ color: '#93c5fd', transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  g.add(lathe([[0, 0], [0.04, 0], [0.04, 0.05], [w * 0.42, 0.12], [w * 0.42, h - bodyH - 0.06], [0, h - bodyH]], bottle, 20)).children.at(-1)!.position.set(0, bodyH, 0);
  return g;
}

export function buildFridge(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const steel = M.metal(o.color ?? '#cbd5e1', 0.3);
  g.add(box(w, h, d, steel, 0, h / 2, 0, 0.03));
  g.add(box(w - 0.02, 0.01, 0.01, M.black(), 0, h * 0.62, d / 2 + 0.005));
  for (const y of [h * 0.8, h * 0.35]) g.add(box(0.03, 0.3, 0.04, M.chrome(), w / 2 - 0.08, y, d / 2 + 0.03, 0.01));
  return g;
}

export const PANTRY_KINDS = new Set(['PANTRY_COUNTER', 'WATER_DISPENSER', 'FRIDGE']);
