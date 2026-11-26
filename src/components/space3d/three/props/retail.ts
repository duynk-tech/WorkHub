import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { createExpoBoothMesh } from '../hall';
import { lightboxMat } from '../materials';
import { M, box, cyl, plane, type BuildContext, type ShelfSlot } from './kit';
import { labelTex, pegboardTex } from './textures';
import { sharedMat } from '../materials';

/** Quầy kệ bán lẻ. Các kệ ghi `group.userData.shelves: ShelfSlot[]` để bộ xếp hàng đặt sản phẩm. */

export function buildBooth(o: SpaceObject): THREE.Group {
  const g = createExpoBoothMesh(o);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  return g;
}

/**
 * Quầy trưng bày sản phẩm như showroom thật: thân quầy bóng có ốp, mặt đá thạch anh, dải LED chân & mép,
 * vách bảng tên phát sáng phía sau (đổi tên trong bảng thuộc tính). Mặt quầy bày máy thật / máy mẫu.
 */
export function buildDisplayCounter(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const accent = o.accentColor ?? '#1d4ed8';
  const bodyMat = o.variant === 'dark' ? M.paint('#1f2329', 0.6) : M.gloss('#f8fafc');
  const facing = o.variant === 'wood' ? M.woodGloss('#a47148') : o.variant === 'dark' ? M.metal('#2b2f36', 0.4) : M.gloss('#eef2f7');
  // Thân quầy lùi chân 6cm + ốp mặt trước + mặt đá
  g.add(box(w - 0.08, 0.08, d - 0.1, M.paint('#111111', 0.7), 0, 0.04, 0));
  g.add(box(w, h - 0.12, d, bodyMat, 0, 0.08 + (h - 0.12) / 2, 0, 0.02));
  g.add(box(w - 0.12, h - 0.3, 0.02, facing, 0, 0.12 + (h - 0.3) / 2, d / 2 + 0.006, 0.006));
  g.add(box(w + 0.05, 0.045, d + 0.05, M.marble(), 0, h - 0.02, 0, 0.012));
  g.add(box(w - 0.1, 0.012, 0.012, M.glow(accent, 1.2, 2.8), 0, 0.09, d / 2 + 0.012));
  g.add(box(w - 0.06, 0.01, 0.01, M.glow('#fff4d6', 0.6, 1.8), 0, h - 0.05, d / 2 + 0.03));
  // Vách bảng tên phía sau quầy (tên đổi được)
  const signH = 0.42;
  const postH = 1.95;
  g.add(box(w * 0.92, postH, 0.06, o.variant === 'dark' ? M.paint('#15181d', 0.5) : M.gloss('#ffffff'), 0, postH / 2, -d / 2 - 0.08, 0.01));
  const tex = labelTex(
    [
      { text: (o.label || 'Quầy trưng bày').toUpperCase().slice(0, 30), size: 92, color: '#ffffff', weight: 800, y: 150 },
      ...(o.subLabel ? [{ text: o.subLabel.slice(0, 40), size: 44, color: '#dbeafe', weight: 600, y: 245 }] : []),
    ],
    accent,
    1600,
    o.subLabel ? 300 : 280,
  );
  g.add(plane(w * 0.88, signH, lightboxMat(tex), 0, postH + signH / 2 + 0.02, -d / 2 - 0.045));
  g.add(box(w * 0.9, signH + 0.04, 0.05, M.paint('#111827', 0.5), 0, postH + signH / 2 + 0.02, -d / 2 - 0.075));
  // Mặt quầy là chỗ bày sản phẩm (2–3 máy tuỳ chiều dài)
  g.userData.shelves = [{ x: 0, y: h, z: 0.02, width: w - 0.2, depth: d - 0.12, clearance: 1.05, facing: 0, demoMachines: true }];
  return g;
}

/** Kệ gondola 2 mặt: chân đế, vách đục lỗ ở giữa, các tầng kệ thép nghiêng nhẹ, nẹp giá phía trước. */
export function buildGondola(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const levels = o.levels ?? 4;
  const body = M.gloss(o.color ?? '#f1f5f9');
  const metal = M.metal('#cbd5e1', 0.4);
  // Chân đế lùi vào 1–4cm so với đầu kệ → không trùng mặt (hết nhấp nháy z-fighting)
  g.add(box(w - 0.1, 0.12, d - 0.08, M.paint('#1f2937', 0.6), 0, 0.06, 0, 0.01)); // chân đế
  g.add(box(w, h - 0.12, 0.04, body, 0, 0.12 + (h - 0.12) / 2, 0)); // vách giữa
  // Mặt vách đục lỗ 2 bên (pegboard) — lặp theo kích thước thật, mỗi lỗ cách 2.5cm
  const pegMat = sharedMat(`p:peg:${o.color ?? '#f1f5f9'}:${w}:${h}`, () => {
    const t = pegboardTex(o.color ?? '#eef1f4').clone();
    t.repeat.set(w / 0.4, (h - 0.12) / 0.4);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.1 });
  });
  for (const side of [-1, 1]) {
    const peg = plane(w - 0.08, h - 0.16, pegMat, 0, 0.12 + (h - 0.12) / 2, side * 0.0205);
    if (side < 0) peg.rotation.y = Math.PI;
    g.add(peg);
  }
  for (const sx of [-1, 1]) g.add(box(0.04, h, d, body, sx * (w / 2 - 0.02), h / 2, 0)); // đầu kệ
  const shelves: ShelfSlot[] = [];
  const usable = h - 0.25;
  for (const side of [-1, 1]) {
    for (let i = 0; i < levels; i++) {
      const y = 0.14 + (usable / levels) * i;
      const sd = d / 2 - 0.04;
      g.add(box(w - 0.08, 0.02, sd, metal, 0, y, side * (sd / 2 + 0.02), 0.004));
      // Tay đỡ kệ (bracket) tam giác 2 đầu
      for (const bx of [-1, 1]) {
        const br = box(0.012, 0.06, sd - 0.02, M.metal('#9ca3af', 0.35), bx * (w / 2 - 0.08), y - 0.035, side * (sd / 2 + 0.02));
        br.scale.y = 0.9;
        g.add(br);
      }
      // Nẹp giá trước tầng kệ (màu nhấn)
      g.add(box(w - 0.08, 0.035, 0.008, M.paint(o.accentColor ?? '#2563eb', 0.5), 0, y + 0.005, side * (sd + 0.024)));
      shelves.push({ x: 0, y: y + 0.01, z: side * (sd / 2 + 0.02), width: w - 0.12, depth: sd - 0.02, clearance: usable / levels - 0.04, facing: side > 0 ? 0 : Math.PI });
    }
  }
  // Bảng tên đầu kệ phát sáng 2 mặt: tên ngành hàng
  const title = o.label && o.label !== 'Kệ gondola 2 mặt' ? o.label : 'PHỤ TÙNG & VẬT TƯ';
  const headTex = labelTex([{ text: title.toUpperCase().slice(0, 26), size: 96, color: '#ffffff', weight: 800, y: 128 }], o.accentColor ?? '#2563eb', 1400, 256);
  g.add(box(w * 0.64, 0.24, 0.04, M.paint('#111827', 0.5), 0, h + 0.13, 0, 0.01));
  for (const side of [-1, 1]) {
    const face = plane(w * 0.62, 0.22, lightboxMat(headTex), 0, h + 0.13, side * 0.0215);
    if (side < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  for (const sx of [-1, 1]) g.add(cyl(0.006, 0.006, 0.12, M.metal('#9ca3af', 0.3), sx * w * 0.25, h + 0.01, 0, 8));
  g.userData.shelves = shelves;
  return g;
}

/** Kệ áp tường: lưng kệ + các tầng (gỗ hoặc kim loại) + đèn LED dưới mỗi tầng. */
export function buildWallShelf(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const levels = o.levels ?? 5;
  const isWood = o.variant === 'wood';
  const frame = isWood ? M.wood(o.color ?? '#a47148') : M.gloss(o.color ?? '#f8fafc');
  g.add(box(w - 0.075, h - 0.005, 0.03, frame, 0, h / 2, -d / 2 + 0.017));
  for (const sx of [-1, 1]) g.add(box(0.035, h, d, frame, sx * (w / 2 - 0.0175), h / 2, 0));
  const shelves: ShelfSlot[] = [];
  const usable = h - 0.15;
  for (let i = 0; i < levels; i++) {
    const y = 0.1 + (usable / levels) * i;
    g.add(box(w - 0.07, 0.025, d - 0.03, frame, 0, y, 0.015));
    if (i > 0) g.add(box(w - 0.1, 0.008, 0.015, M.glow('#fff4d6', 0.6, 1.8), 0, y - 0.018, d / 2 - 0.05));
    shelves.push({ x: 0, y: y + 0.0125, z: 0.02, width: w - 0.12, depth: d - 0.06, clearance: usable / levels - 0.04, facing: 0 });
  }
  g.add(box(w, 0.04, d, frame, 0, h - 0.02, 0));
  g.userData.shelves = shelves;
  return g;
}

/** Tủ kính trưng bày: khung nhôm, kính 4 mặt, kệ kính, đèn LED trần tủ. */
export function buildDisplayCabinet(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const levels = o.levels ?? 4;
  const alu = M.metal('#d1d5db', 0.3);
  g.add(box(w - 0.01, 0.18, d - 0.01, M.paint('#1f2937', 0.5), 0, 0.09, 0, 0.01));
  g.add(box(w, 0.06, d, alu, 0, h - 0.03, 0, 0.01));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.025, h - 0.24, 0.025, alu, sx * (w / 2 - 0.0125), 0.18 + (h - 0.24) / 2, sz * (d / 2 - 0.0125)));
  const glass = M.glass();
  g.add(box(w - 0.03, h - 0.24, 0.006, glass, 0, 0.18 + (h - 0.24) / 2, d / 2 - 0.006));
  g.add(box(w - 0.03, h - 0.24, 0.006, glass, 0, 0.18 + (h - 0.24) / 2, -d / 2 + 0.006));
  for (const sx of [-1, 1]) g.add(box(0.006, h - 0.24, d - 0.03, glass, sx * (w / 2 - 0.006), 0.18 + (h - 0.24) / 2, 0));
  g.add(box(w - 0.08, 0.01, d - 0.08, M.glow('#fff7e0', 1, 2.4), 0, h - 0.065, 0));
  const shelves: ShelfSlot[] = [];
  const usable = h - 0.3;
  for (let i = 0; i < levels; i++) {
    const y = 0.19 + (usable / levels) * i;
    if (i > 0) g.add(box(w - 0.06, 0.008, d - 0.06, glass, 0, y, 0));
    shelves.push({ x: 0, y: y + 0.005, z: 0, width: w - 0.1, depth: d - 0.1, clearance: usable / levels - 0.03, facing: 0 });
  }
  g.userData.shelves = shelves;
  return g;
}

export function buildPodium(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h, d, M.gloss(o.color ?? '#ffffff'), 0, h / 2, 0, 0.02));
  g.add(box(w + 0.01, 0.015, d + 0.01, M.glow(o.accentColor ?? '#2563eb', 1, 2.2), 0, h - 0.01, 0, 0.005));
  // Mặt bục là 1 "kệ" cao thoáng → đặt 1 máy thật đúng kích thước
  g.userData.shelves = [{ x: 0, y: h, z: 0, width: w - 0.1, depth: d - 0.1, clearance: 1.6, facing: 0, single: true }];
  return g;
}

/** Quầy thu ngân: thân ốp gỗ, mặt đá, máy POS + ngăn kéo tiền. */
export function buildCheckout(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h - 0.04, d, M.wood(o.color ?? '#a47148'), 0, (h - 0.04) / 2, 0, 0.015));
  g.add(box(w + 0.04, 0.04, d + 0.06, M.marble(), 0, h - 0.02, 0.01, 0.01));
  const pos = new THREE.Group();
  pos.add(box(0.32, 0.22, 0.02, M.black(), 0, 0.2, 0, 0.006));
  pos.add(plane(0.29, 0.19, M.screen(), 0, 0.2, 0.011));
  pos.add(box(0.06, 0.1, 0.06, M.black(), 0, 0.05, -0.02));
  pos.rotation.y = Math.PI;
  pos.position.set(w * 0.2, h, -d * 0.1);
  g.add(pos);
  g.add(box(0.36, 0.08, 0.32, M.black(), w * 0.2, h + 0.04, d * 0.15, 0.01));
  return g;
}

/** Quầy lễ tân chữ L: thân cong ốp gỗ, mặt đá, dải logo phát sáng, ghế & màn hình phía sau. */
export function buildReception(o: SpaceObject, ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const wood = M.woodGloss('#c69c6d');
  const front = box(w, h, 0.5, M.gloss('#f8fafc'), 0, h / 2, d / 2 - 0.25, 0.04);
  const side = box(0.5, h, d - 0.5, M.gloss('#f8fafc'), w / 2 - 0.25, h / 2, -0.25 + 0.0, 0.04);
  g.add(front, side);
  // Ốp gỗ mặt trước + mặt đá + bậc viết cao
  g.add(box(w - 0.1, h - 0.18, 0.02, wood, 0, (h - 0.18) / 2 + 0.06, d / 2 + 0.005, 0.006));
  g.add(box(w + 0.06, 0.04, 0.6, M.marble(), 0, h + 0.02, d / 2 - 0.25, 0.01));
  g.add(box(0.6, 0.04, d - 0.5, M.marble(), w / 2 - 0.25, h + 0.02, -0.25, 0.01));
  g.add(box(w * 0.9, 0.025, 0.28, M.marble(), 0, h + 0.18, d / 2 - 0.12, 0.008));
  // Dải LED chân quầy
  g.add(box(w - 0.05, 0.02, 0.02, M.glow(o.accentColor ?? '#2563eb', 1.4, 3), 0, 0.05, d / 2 + 0.01));
  // Logo & tên công ty phát sáng trên ốp gỗ
  const tex = labelTex(
    [
      { text: (ctx.companyName || o.label || 'LỄ TÂN').toUpperCase().slice(0, 28), size: 96, color: '#ffffff', weight: 800, y: 200 },
      { text: 'QUẦY LỄ TÂN · RECEPTION', size: 44, color: '#bfdbfe', weight: 600, y: 330 },
    ],
    o.accentColor ?? '#2563eb',
    1600,
    480,
  );
  const sign = plane(Math.min(w * 0.75, 2.6), Math.min(w * 0.75, 2.6) * 0.3, lightboxMat(tex), -0.1, h * 0.55, d / 2 + 0.018);
  g.add(sign);
  // Màn hình + bàn phím phía sau quầy
  const mon = new THREE.Group();
  mon.add(box(0.52, 0.32, 0.025, M.black(), 0, 0.26, 0, 0.008));
  mon.add(plane(0.49, 0.29, M.screen(), 0, 0.26, -0.0135));
  mon.children[1].rotation.y = Math.PI;
  mon.add(box(0.05, 0.12, 0.04, M.black(), 0, 0.06, 0.02));
  mon.position.set(-w * 0.15, h - 0.28, d / 2 - 0.38);
  g.add(mon);
  // Ghế lễ tân
  const chair = new THREE.Group();
  chair.add(box(0.48, 0.07, 0.46, M.leather('#1f2937'), 0, 0.5, 0, 0.03));
  chair.add(box(0.44, 0.5, 0.06, M.leather('#1f2937'), 0, 0.82, -0.22, 0.03));
  chair.add(cyl(0.025, 0.025, 0.42, M.chrome(), 0, 0.26, 0, 12));
  chair.add(cyl(0.26, 0.28, 0.03, M.chrome(), 0, 0.02, 0, 24));
  chair.position.set(-w * 0.15, 0, -0.25);
  g.add(chair);
  return g;
}

/** Logo ngang chính thức (lưu trong public/brand) — dùng cho vách thương hiệu */
const WIDE_LOGO_URL = '/brand/timcorp-logo-ngang.png';

/**
 * Vách thương hiệu cuối sảnh: khung xanh navy bóng + viền LED xanh, mặt lightbox TRẮNG phát sáng
 * với logo ngang TIM Corp (xanh navy trên nền trắng đúng nhận diện), dòng giới thiệu sắc nét bên dưới.
 */
export function buildBrandWall(o: SpaceObject, ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h, d, M.gloss('#0b1b3f'), 0, h / 2, 0, 0.03));

  const W = 2400;
  const H = Math.round((W * (h - 0.5)) / (w - 0.4));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c2 = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const tagline = o.label && o.label !== 'Vách thương hiệu LED' ? o.label : 'TRUNG TÂM TRIỂN LÃM & SHOWROOM THIẾT BỊ F&B';
  const draw = (logo?: HTMLImageElement) => {
    // Nền trắng ấm hơi chuyển sắc như lightbox thật
    const bg = c2.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#eef3fb');
    c2.fillStyle = bg;
    c2.fillRect(0, 0, W, H);
    // Dải nhấn xanh thương hiệu phía dưới
    c2.fillStyle = '#1d3f91';
    c2.fillRect(0, H - H * 0.07, W, H * 0.07);
    c2.fillStyle = '#e11d2a';
    c2.fillRect(0, H - H * 0.07 - 10, W * 0.18, 10);
    if (logo) {
      const lw = W * 0.62;
      const lh = (lw * logo.height) / logo.width;
      c2.imageSmoothingEnabled = true;
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(logo, (W - lw) / 2, H * 0.42 - lh / 2, lw, lh);
    } else {
      c2.fillStyle = '#1d3f91';
      c2.font = `800 ${Math.round(H * 0.2)}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.fillText((ctx.companyName || 'TIM CORP').toUpperCase().slice(0, 24), W / 2, H * 0.42);
    }
    c2.fillStyle = '#334155';
    c2.font = `600 ${Math.round(H * 0.065)}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillText(tagline.toUpperCase().slice(0, 48), W / 2, H * 0.74);
    tex.needsUpdate = true;
  };
  draw();
  const img = new Image();
  img.onload = () => draw(img);
  img.src = WIDE_LOGO_URL;

  const panel = plane(w - 0.4, h - 0.5, lightboxMat(tex), 0, h / 2 + 0.05, d / 2 + 0.005);
  g.add(panel);
  // Viền LED xanh quanh mặt lightbox + đèn hắt chân vách
  const led = M.glow('#3b82f6', 1.2, 3);
  g.add(box(w - 0.3, 0.025, 0.025, led, 0, h / 2 + 0.05 + (h - 0.5) / 2 + 0.02, d / 2 + 0.02));
  g.add(box(w - 0.3, 0.025, 0.025, led, 0, h / 2 + 0.05 - (h - 0.5) / 2 - 0.02, d / 2 + 0.02));
  for (const sx of [-1, 1]) g.add(box(0.025, h - 0.45, 0.025, led, sx * ((w - 0.4) / 2 + 0.02), h / 2 + 0.05, d / 2 + 0.02));
  // Bục thuyết trình nhỏ phía trước
  const lectern = box(0.6, 1.1, 0.45, M.woodGloss('#6b4226'), w * 0.3, 0.55, d / 2 + 1.1, 0.03);
  lectern.rotation.y = -0.3;
  g.add(lectern);
  return g;
}
