import * as THREE from 'three';
import type { SpaceMerchItem } from '@/lib/space-3d-types';
import { choosePackKind, packSize, type PackKind } from '@/lib/space-3d-merch';
import type { ShelfSlot } from './kit';
import { demoProductsForCounter } from '@/lib/space-3d-demo-products';
import { buildDemoByKind } from './demo-machines';
import { hashId, seeded } from './kit';

/**
 * Hàng hoá trên kệ: bao bì 3D vẽ bằng code (hộp, chai, lon, túi đứng, hũ, bao cà phê, thùng máy) với nhãn canvas
 * (màu thương hiệu, tên, dung tích, giá, mã vạch). Có imageUrl thì ảnh thật làm mặt nhãn chính.
 * Mỗi loại SP trên 1 kệ = 1 InstancedMesh → hàng trăm SP vẫn nhẹ.
 */

const BRAND_COLORS = ['#b91c1c', '#1d4ed8', '#047857', '#7c2d12', '#6d28d9', '#0f766e', '#be185d', '#ca8a04', '#1f2937'];

const labelCache = new Map<string, THREE.CanvasTexture>();
const geoCache = new Map<PackKind, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}đ`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = t;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

/** Nhãn bao bì (512×512, mặt trước ở giữa — cho box/lon/chai đều đọc được). */
function labelTexture(item: SpaceMerchItem, kind: PackKind): THREE.CanvasTexture {
  const key = `${item.id}:${kind}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const brand = BRAND_COLORS[hashId(String(item.id)) % BRAND_COLORS.length];
  const dark = kind === 'bag' || kind === 'appliance';
  ctx.fillStyle = dark ? '#1c1917' : '#fbfaf7';
  ctx.fillRect(0, 0, S, S);
  // Dải thương hiệu
  ctx.fillStyle = brand;
  ctx.fillRect(0, 0, S, 120);
  ctx.fillRect(0, S - 46, S, 46);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(S * 0.62, 0);
  ctx.lineTo(S, 0);
  ctx.lineTo(S, 120);
  ctx.lineTo(S * 0.5, 120);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const brandName = (item.manufacturer || 'TIM').replace(/\s*\(.*$/, '').toUpperCase().slice(0, 22);
  // Thu nhỏ cỡ chữ tới khi vừa dải thương hiệu (không cắt chữ)
  let bSize = 44;
  while (bSize > 22) {
    ctx.font = `800 ${bSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
    if (ctx.measureText(brandName).width <= S - 50) break;
    bSize -= 2;
  }
  ctx.fillText(brandName, S / 2, 62);
  // Tên sản phẩm
  ctx.fillStyle = dark ? '#fafaf9' : '#111827';
  ctx.font = '700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  const lines = wrap(ctx, item.name, S - 60, 3);
  lines.forEach((l, i) => ctx.fillText(l, S / 2, 330 + i * 46));
  // Biểu tượng minh hoạ trung tâm (khi chưa có ảnh)
  const drawEmblem = () => {
    ctx.save();
    ctx.translate(S / 2, 215);
    ctx.fillStyle = brand;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 64px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    ctx.fillText(item.name.trim().charAt(0).toUpperCase() || '★', 0, 4);
    ctx.restore();
  };
  drawEmblem();
  // Giá + mã vạch
  if (item.sellingPrice) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    ctx.fillText(money(item.sellingPrice), S / 2, S - 23);
  }
  ctx.fillStyle = dark ? '#e7e5e4' : '#111827';
  const r = seeded(item.id + 7);
  for (let x = 40; x < 140; x += 3) ctx.fillRect(x, 440, r() > 0.5 ? 2 : 1, 22);

  // Bao bì trụ (lon, chai, hũ): UV quấn 360° → nhân đôi nhãn ngang để không bị kéo giãn, mặt nào cũng đọc được
  let out: HTMLCanvasElement = c;
  const boxy = kind === 'box' || kind === 'appliance';
  const compose = () => {
    const o2 = out.getContext('2d')!;
    if (boxy) {
      // Atlas 1 ảnh cho cả hộp (1 draw call): [mặt trước 512×512 | hông 256×512 | nắp 256×256]
      o2.drawImage(c, 0, 0);
      drawBoxFace(o2, item, 'side', 512, 0, 256, 512);
      drawBoxFace(o2, item, 'top', 768, 0, 256, 256);
      drawBoxFace(o2, item, 'top', 768, 256, 256, 256);
    } else {
      o2.drawImage(c, 0, 0);
      o2.drawImage(c, S, 0);
    }
  };
  if (boxy || kind === 'can' || kind === 'bottle' || kind === 'jar') {
    out = document.createElement('canvas');
    out.width = S * 2;
    out.height = S;
    compose();
  }
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  labelCache.set(key, tex);

  // Ảnh thật trong DB → dán làm phần minh hoạ trung tâm
  if (item.imageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const box = 190;
      const ratio = Math.min(box / img.width, box / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.fillStyle = dark ? '#1c1917' : '#fbfaf7';
      ctx.fillRect(S / 2 - box / 2 - 6, 120, box + 12, box + 4);
      ctx.drawImage(img, S / 2 - w / 2, 215 - h / 2, w, h);
      if (out !== c) compose();
      tex.needsUpdate = true;
    };
    img.src = item.imageUrl;
  }
  return tex;
}

function packGeometry(kind: PackKind): THREE.BufferGeometry {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  switch (kind) {
    case 'bottle': {
      const pts = [[0, 0], [0.48, 0], [0.5, 0.04], [0.5, 0.62], [0.42, 0.72], [0.2, 0.84], [0.17, 0.92], [0.19, 0.94], [0.19, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
      g = new THREE.LatheGeometry(pts, 20);
      break;
    }
    case 'can':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
      break;
    case 'jar': {
      const pts = [[0, 0], [0.46, 0], [0.5, 0.05], [0.5, 0.82], [0.44, 0.86], [0.44, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
      g = new THREE.LatheGeometry(pts, 20);
      break;
    }
    case 'pouch': {
      g = new THREE.BoxGeometry(1, 1, 1, 2, 4, 2).translate(0, 0.5, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const z = p.getZ(i);
        // Túi đứng: phồng ở đáy, dẹt ở miệng túi
        p.setZ(i, z * (1.15 - y * 0.85));
      }
      g.computeVertexNormals();
      break;
    }
    case 'bag': {
      g = new THREE.BoxGeometry(1, 1, 1, 2, 4, 2).translate(0, 0.5, 0);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) * (1 - Math.max(0, y - 0.85) * 0.6));
        p.setZ(i, p.getZ(i) * (1 - Math.max(0, y - 0.8) * 2.5));
      }
      g.computeVertexNormals();
      break;
    }
    default: {
      g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      // UV theo atlas: mặt +x/-x → vùng hông, +y/-y → nắp, +z/-z → mặt trước (thứ tự mặt của BoxGeometry)
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const regions: [number, number, number, number][] = [
        [0.5, 0, 0.25, 1], [0.5, 0, 0.25, 1],
        [0.75, 0.5, 0.25, 0.5], [0.75, 0, 0.25, 0.5],
        [0, 0, 0.5, 1], [0, 0, 0.5, 1],
      ];
      for (let f = 0; f < 6; f++) {
        const [ux, uy, uw, uh] = regions[f];
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(i, ux + uv.getX(i) * uw, uy + uv.getY(i) * uh);
        }
      }
      g.clearGroups();
    }
  }
  geoCache.set(kind, g);
  return g;
}

const TAG_W = 312;
const TAG_H = 136;
const TAG_COLS = 8;
const TAG_ROWS = 24;
let tagAtlas: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial; slots: Map<number, number> } | null = null;

/**
 * Atlas nhãn giá dùng chung (8×24 = 192 ô): mỗi SP vẽ 1 lần vào 1 ô; cả kệ chỉ 1 InstancedMesh
 * (offset UV theo từng nhãn qua thuộc tính instance) → hàng trăm nhãn giá chỉ tốn 1 draw call / kệ.
 */
function getTagAtlas() {
  if (tagAtlas) return tagAtlas;
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W * TAG_COLS;
  canvas.height = TAG_H * TAG_ROWS;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aTagUv;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vMapUv * vec2(${(1 / TAG_COLS).toFixed(6)}, ${(1 / TAG_ROWS).toFixed(6)}) + aTagUv;`);
  };
  mat.customProgramCacheKey = () => 'space3d-tag-atlas';
  mat.userData.shared = true;
  tagAtlas = { canvas, tex, mat, slots: new Map() };
  return tagAtlas;
}

/** Ô atlas của SP (vẽ lần đầu): nền trắng, vạch vàng, tên, giá đỏ to, mã vạch, SKU */
function tagSlot(item: SpaceMerchItem): [number, number] {
  const atlas = getTagAtlas();
  let slot = atlas.slots.get(item.id);
  if (slot === undefined) {
    slot = atlas.slots.size % (TAG_COLS * TAG_ROWS);
    atlas.slots.set(item.id, slot);
    const col = slot % TAG_COLS;
    const row = Math.floor(slot / TAG_COLS);
    const ctx = atlas.canvas.getContext('2d')!;
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, sans-serif';
    ctx.save();
    ctx.translate(col * TAG_W, row * TAG_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TAG_W, TAG_H);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, TAG_W, 10);
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 20px ${font}`;
    ctx.fillText(item.name.slice(0, 26), 12, 36);
    ctx.fillStyle = '#dc2626';
    ctx.font = `800 46px ${font}`;
    ctx.fillText(item.sellingPrice ? money(item.sellingPrice) : 'Liên hệ', 12, 88);
    ctx.fillStyle = '#111';
    for (let x = 12; x < 120; x += 3) ctx.fillRect(x, 100, (x * 13) % 5 === 0 ? 2.5 : 1, 26);
    ctx.fillStyle = '#64748b';
    ctx.font = `500 16px ${font}`;
    ctx.fillText(`SKU ${item.id}`, 130, 120);
    ctx.restore();
    atlas.tex.needsUpdate = true;
  }
  const col = slot % TAG_COLS;
  const row = Math.floor(slot / TAG_COLS);
  // UV gốc dưới-trái; canvas đếm từ trên xuống
  return [col / TAG_COLS, 1 - (row + 1) / TAG_ROWS];
}

/** Vẽ mặt hông / nắp hộp vào vùng (x, y, w, h) của atlas: màu thương hiệu, thành phần, mã vạch */
function drawBoxFace(ctx: CanvasRenderingContext2D, item: SpaceMerchItem, face: 'side' | 'top', x: number, y: number, w: number, h: number) {
  const brand = BRAND_COLORS[hashId(String(item.id)) % BRAND_COLORS.length];
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, sans-serif';
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = face === 'top' ? '#f4f2ee' : brand;
  ctx.fillRect(0, 0, w, h);
  if (face === 'side') {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 34;
    const name = (item.manufacturer || 'TIM').replace(/\s*\(.*$/, '').toUpperCase().slice(0, 18);
    do {
      ctx.font = `800 ${size}px ${font}`;
      size -= 2;
    } while (ctx.measureText(name).width > w - 24 && size > 14);
    ctx.fillText(name, w / 2, 70);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(14, h * 0.42, w - 28, h * 0.5);
    ctx.fillStyle = '#334155';
    ctx.font = `700 15px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText('THÔNG TIN SẢN PHẨM', 26, h * 0.42 + 26);
    ctx.font = `500 14px ${font}`;
    ['Bảo quản nơi khô ráo,', 'tránh ánh nắng trực tiếp.', 'Sản xuất: Việt Nam', `Mã SP: ${item.id}`, 'Chính hãng · Bảo hành'].forEach((l, i) => ctx.fillText(l, 26, h * 0.42 + 56 + i * 22));
    ctx.fillStyle = '#111';
    for (let bx = 26; bx < w - 40; bx += 3) ctx.fillRect(bx, h * 0.84, (bx * 7) % 3 === 0 ? 2.4 : 1, 30);
  } else {
    ctx.fillStyle = brand;
    ctx.fillRect(0, 0, w, h * 0.13);
    ctx.fillRect(0, h * 0.87, w, h * 0.13);
    ctx.fillStyle = '#9ca3af';
    for (let bx = w * 0.27; bx < w * 0.73; bx += 4) ctx.fillRect(bx, h * 0.43, (bx * 7) % 3 === 0 ? 3 : 1.5, h * 0.16);
  }
  ctx.restore();
}

function packMaterial(item: SpaceMerchItem, kind: PackKind): THREE.Material {
  const key = `${item.id}:${kind}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const map = labelTexture(item, kind);
  const m =
    kind === 'can' || kind === 'bottle' || kind === 'jar'
      ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.28, metalness: kind === 'can' ? 0.55 : 0, clearcoat: 0.8, clearcoatRoughness: 0.15 })
      : new THREE.MeshStandardMaterial({ map, roughness: kind === 'bag' ? 0.65 : 0.45 });
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

/**
 * Xếp hàng lên các tầng kệ: mỗi SP chiếm 1 đoạn facing liền nhau (2 hàng sâu, chồng 2 tầng nếu thấp),
 * xoay lệch nhẹ ngẫu nhiên cho tự nhiên. Trả về group chứa các InstancedMesh.
 */
export function buildMerchandise(objectId: string, shelves: ShelfSlot[], items: SpaceMerchItem[], manual = false, counterLabel?: string): THREE.Group {
  const g = new THREE.Group();
  g.userData.noMerge = true;
  if (!items.length || !shelves.length) return g;
  const r = seeded(hashId(objectId));
  const perItem = new Map<string, { item: SpaceMerchItem; kind: PackKind; mats: THREE.Matrix4[] }>();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let cursor = hashId(objectId) % items.length;

  const models: THREE.Object3D[] = [];
  const priceTags: { item: SpaceMerchItem; mat: THREE.Matrix4 }[] = [];
  for (const shelf of shelves) {
    // Máy thật (có mô hình 3D) trên tầng đủ cao / bục: dựng đúng hình dáng, thu nhỏ vừa tầng kệ nếu cần
    const machineFit = (item: SpaceMerchItem) => item.isMachine && item.model3D && (shelf.single || shelf.clearance >= 0.28);
    if (shelf.single || (shelf.demoMachines && !manual) || items.some(machineFit)) {
      const machines = items.filter(machineFit);
      if (!machines.length && shelf.demoMachines && !manual) {
        // Kho chưa có máy nguyên chiếc → bày máy mẫu ĐÚNG LOẠI theo tên quầy (kem, xay, sinh tố, lò nướng…)
        const pool = demoProductsForCounter(counterLabel);
        const n = shelf.single ? 1 : Math.max(1, Math.min(3, Math.floor(shelf.width / 0.95)));
        for (let i = 0; i < n; i++) {
          const product = pool[(hashId(objectId) + i) % pool.length];
          const demo = buildDemoByKind(product.demoKind ?? 'espresso', objectId, i);
          demo.traverse((c) => (c.userData.merchItemId = product.id));
          const lx = -shelf.width / 2 + (shelf.width / n) * (i + 0.5) - (shelf.single ? 0 : 0.08);
          placeOnShelf(demo, shelf, lx, -0.06);
          models.push(demo);
          const card = buildTentCard(product, product.model);
          placeOnShelf(card, shelf, lx + (shelf.single ? 0 : 0.08), shelf.depth / 2 - 0.07);
          models.push(card);
        }
        continue;
      }
      if (machines.length) {
        const n = shelf.single ? 1 : Math.max(1, Math.min(3, Math.floor(shelf.width / 0.55)));
        for (let i = 0; i < n; i++) {
          const item = machines[(cursor + i) % machines.length];
          const m3 = item.model3D!;
          const k = Math.min(1, (shelf.clearance - 0.03) / m3.heightM, (shelf.width / n - 0.04) / m3.widthM, (shelf.depth - 0.02) / m3.depthM);
          const model = buildMachineModel(item, k);
          const lx = -shelf.width / 2 + (shelf.width / n) * (i + 0.5);
          placeOnShelf(model, shelf, lx, -0.06);
          models.push(model);
          // Biển mica tên / model / giá trước máy — bấm để xem chi tiết
          const card = buildTentCard(item, item.itemCode ?? null);
          placeOnShelf(card, shelf, lx, shelf.depth / 2 - 0.07);
          models.push(card);
        }
        cursor += n;
        continue;
      }
      if (shelf.single && !manual) continue;
    }
    let x = -shelf.width / 2;
    while (x < shelf.width / 2 - 0.05) {
      const item = items[cursor % items.length];
      cursor += 1;
      const kind = choosePackKind(item);
      const [pw, ph, pd] = packSize(kind, shelf.clearance);
      const facings = Math.max(1, Math.min(4, Math.floor((shelf.width * 0.32) / (pw + 0.006))));
      const rows = Math.max(1, Math.min(3, Math.floor(shelf.depth / (pd + 0.01))));
      const stacks = ph * 2 + 0.02 < shelf.clearance && kind === 'box' ? 2 : 1;
      const keyName = `${item.id}:${kind}`;
      let bucket = perItem.get(keyName);
      if (!bucket) {
        bucket = { item, kind, mats: [] };
        perItem.set(keyName, bucket);
      }
      const runStart = x;
      for (let f = 0; f < facings && x + pw < shelf.width / 2; f++) {
        for (let row = 0; row < rows; row++) {
          for (let st = 0; st < stacks; st++) {
            // Hàng phía trước có thể đã bị "mua" bớt → trống ngẫu nhiên cho chân thật
            if (row === 0 && st === stacks - 1 && r() < 0.06) continue;
            const lx = x + pw / 2;
            const lz = shelf.depth / 2 - pd / 2 - row * (pd + 0.008) - 0.01;
            e.set(0, shelf.facing + (r() - 0.5) * 0.06, 0);
            q.setFromEuler(e);
            // Toạ độ cục bộ của kệ: trục z dương = hướng mặt trước hàng hoá
            const cos = Math.cos(shelf.facing);
            const sin = Math.sin(shelf.facing);
            pos.set(shelf.x + lx * cos + lz * sin, shelf.y + st * (ph + 0.004), shelf.z - lx * sin + lz * cos);
            scl.set(pw, ph, pd);
            bucket.mats.push(new THREE.Matrix4().compose(pos, q, scl));
          }
        }
        x += pw + 0.006;
      }
      // Nhãn giá dán mép kệ ngay dưới nhóm sản phẩm
      if (x > runStart + 0.01) {
        const lx = (runStart + x) / 2;
        const lz = shelf.depth / 2 + 0.031; // trước mặt nẹp giá
        const cos = Math.cos(shelf.facing);
        const sin = Math.sin(shelf.facing);
        e.set(0, shelf.facing, 0);
        q.setFromEuler(e);
        pos.set(shelf.x + lx * cos + lz * sin, shelf.y - 0.006, shelf.z - lx * sin + lz * cos);
        scl.set(0.078, 0.034, 1);
        priceTags.push({ item, mat: new THREE.Matrix4().compose(pos, q, scl) });
      }
      x += 0.03; // khe giữa các SP
    }
  }

  models.forEach((m) => g.add(m));
  if (priceTags.length) {
    // Geometry riêng cho kệ (mang thuộc tính offset UV từng nhãn), vật liệu atlas dùng chung
    const geo = new THREE.PlaneGeometry(1, 1);
    const offsets = new Float32Array(priceTags.length * 2);
    priceTags.forEach((t, i) => {
      const [u, v] = tagSlot(t.item);
      offsets[i * 2] = u;
      offsets[i * 2 + 1] = v;
    });
    geo.setAttribute('aTagUv', new THREE.InstancedBufferAttribute(offsets, 2));
    const tags = new THREE.InstancedMesh(geo, getTagAtlas().mat, priceTags.length);
    priceTags.forEach((t, i) => tags.setMatrixAt(i, t.mat));
    tags.userData = { noMerge: true, priceTags: priceTags.map((t) => t.item.id) };
    g.add(tags);
  }
  for (const { item, kind, mats } of perItem.values()) {
    if (!mats.length) continue;
    const mesh = new THREE.InstancedMesh(packGeometry(kind), packMaterial(item, kind), mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData = { merchItemId: item.id, noMerge: true, shared: true };
    g.add(mesh);
  }
  return g;
}

/** Đặt vật thể lên mặt kệ theo toạ độ cục bộ (lx dọc kệ, lz hướng mặt trước) */
function placeOnShelf(obj: THREE.Object3D, shelf: ShelfSlot, lx: number, lz: number) {
  const cos = Math.cos(shelf.facing);
  const sin = Math.sin(shelf.facing);
  obj.position.set(shelf.x + lx * cos + lz * sin, shelf.y, shelf.z - lx * sin + lz * cos);
  obj.rotation.y = shelf.facing;
}

const cardTexCache = new Map<string, THREE.CanvasTexture>();
/** Biển mica để bàn: tên sản phẩm, model, giá niêm yết, gợi ý "Bấm để xem chi tiết" */
function buildTentCard(item: SpaceMerchItem, model: string | null): THREE.Group {
  const key = `${item.id}:${model ?? ''}:${item.sellingPrice ?? ''}`;
  let tex = cardTexCache.get(key);
  if (!tex) {
    const W = 640;
    const H = 380;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d3f91';
    ctx.fillRect(0, 0, W, 16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#64748b';
    ctx.font = '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    ctx.fillText((item.manufacturer || 'TIM CORP').toUpperCase().slice(0, 28), 30, 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 44px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    wrap(ctx, item.name, W - 60, 2).forEach((l, i) => ctx.fillText(l, 30, 78 + i * 52));
    if (model) {
      ctx.fillStyle = '#2563eb';
      ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
      ctx.fillText(`Model: ${model}`.slice(0, 32), 30, 194);
    }
    ctx.fillStyle = '#b91c1c';
    ctx.font = '800 46px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    ctx.fillText(item.sellingPrice ? money(item.sellingPrice) : 'Liên hệ báo giá', 30, 246);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
    ctx.fillText('Bấm để xem chi tiết ›', 30, 322);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    cardTexCache.set(key, tex);
  }
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1425), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 0.075, 0);
  face.rotation.x = -0.32;
  // Mica trong + đế
  const acrylic = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.155, 0.004),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1 }),
  );
  acrylic.position.set(0, 0.075, -0.003);
  acrylic.rotation.x = -0.32;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.012, 0.06), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.3 }));
  base.position.set(0, 0.006, -0.02);
  g.add(face, acrylic, base);
  g.traverse((c) => {
    c.userData.merchItemId = item.id;
  });
  g.userData.noMerge = true;
  return g;
}



/** Máy trưng bày: dựng từ các khối procedural của Product3DModel (thép, kính, đèn…) + ảnh thật ở mặt trước. */
function buildMachineModel(item: SpaceMerchItem, scale: number): THREE.Group {
  const g = new THREE.Group();
  const m = item.model3D!;
  const parts = m.proceduralParts ?? [];
  if (parts.length) {
    for (const part of parts) {
      const geo =
        part.shape === 'cylinder'
          ? new THREE.CylinderGeometry(part.size[0], part.size[2] ?? part.size[0], part.size[1], 18)
          : part.shape === 'sphere'
            ? new THREE.SphereGeometry(part.size[0], 16, 12)
            : new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      const mat = new THREE.MeshPhysicalMaterial({
        color: part.color || m.primaryColor,
        metalness: part.metalness ?? 0.6,
        roughness: part.roughness ?? 0.3,
        clearcoat: 0.4,
        transparent: (part.opacity ?? 1) < 1,
        opacity: part.opacity ?? 1,
        emissive: part.emissive ? new THREE.Color(part.emissive) : new THREE.Color('#000000'),
        emissiveIntensity: part.emissive ? 0.6 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...part.pos);
      if (part.rot) mesh.rotation.set(...part.rot);
      mesh.castShadow = true;
      g.add(mesh);
    }
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshPhysicalMaterial({ color: m.primaryColor, metalness: 0.7, roughness: 0.25, clearcoat: 0.5 }),
    );
    body.position.y = m.heightM / 2;
    g.add(body);
  }
  if (item.imageUrl) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(item.imageUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(m.widthM * 0.6, m.heightM * 0.6), new THREE.MeshBasicMaterial({ map: tex }));
      front.position.set(0, m.heightM * 0.5, m.depthM / 2 + 0.006);
      front.userData = { merchItemId: item.id };
      g.add(front);
    });
  }
  g.scale.setScalar(scale);
  g.traverse((c) => {
    c.userData.merchItemId = item.id;
  });
  g.userData.noMerge = true;
  return g;
}
