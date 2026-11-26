import * as THREE from 'three';
import type { SpaceMerchItem } from '@/lib/space-3d-types';
import { choosePackKind, packSize, type PackKind } from '@/lib/space-3d-merch';
import type { ShelfSlot } from './kit';
import { buildEspresso } from './cafe';
import { normalizeSpaceObject } from '@/lib/space-3d-types';
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
  ctx.font = '800 44px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const brandName = (item.manufacturer || 'TIM').toUpperCase().slice(0, 14);
  ctx.fillText(brandName, S / 2, 62);
  // Tên sản phẩm
  ctx.fillStyle = dark ? '#fafaf9' : '#111827';
  ctx.font = '700 40px Inter, "Segoe UI", system-ui, sans-serif';
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
    ctx.font = '800 64px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(item.name.trim().charAt(0).toUpperCase() || '★', 0, 4);
    ctx.restore();
  };
  drawEmblem();
  // Giá + mã vạch
  if (item.sellingPrice) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(money(item.sellingPrice), S / 2, S - 23);
  }
  ctx.fillStyle = dark ? '#e7e5e4' : '#111827';
  const r = seeded(item.id + 7);
  for (let x = 40; x < 140; x += 3) ctx.fillRect(x, 440, r() > 0.5 ? 2 : 1, 22);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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
    default:
      g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  }
  geoCache.set(kind, g);
  return g;
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
export function buildMerchandise(objectId: string, shelves: ShelfSlot[], items: SpaceMerchItem[]): THREE.Group {
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
  for (const shelf of shelves) {
    // Máy thật (có mô hình 3D) trên tầng đủ cao / bục: dựng đúng hình dáng, thu nhỏ vừa tầng kệ nếu cần
    const machineFit = (item: SpaceMerchItem) => item.isMachine && item.model3D && (shelf.single || shelf.clearance >= 0.28);
    if (shelf.single || shelf.demoMachines || items.some(machineFit)) {
      const machines = items.filter(machineFit);
      if (!machines.length && shelf.demoMachines) {
        // Kho chưa có máy nguyên chiếc → bày máy pha espresso mẫu để quầy giống showroom thật
        const n = shelf.single ? 1 : Math.max(1, Math.min(3, Math.floor(shelf.width / 0.95)));
        for (let i = 0; i < n; i++) {
          const demo = buildDemoMachine(objectId, i);
          const lx = -shelf.width / 2 + (shelf.width / n) * (i + 0.5) - (shelf.single ? 0 : 0.08);
          const cos = Math.cos(shelf.facing);
          const sin = Math.sin(shelf.facing);
          demo.position.set(shelf.x + lx * cos, shelf.y, shelf.z - lx * sin);
          demo.rotation.y = shelf.facing;
          models.push(demo);
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
          const cos = Math.cos(shelf.facing);
          const sin = Math.sin(shelf.facing);
          model.position.set(shelf.x + lx * cos, shelf.y, shelf.z - lx * sin);
          model.rotation.y = shelf.facing;
          models.push(model);
        }
        cursor += n;
        continue;
      }
      if (shelf.single) continue;
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
      x += 0.03; // khe giữa các SP
    }
  }

  models.forEach((m) => g.add(m));
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

const DEMO_COLORS = ['#d1d5db', '#111827', '#b91c1c', '#e7e5e4'];

/** Máy pha espresso mẫu (kèm máy xay) — dùng khi kho chưa có máy thật */
function buildDemoMachine(objectId: string, idx: number): THREE.Group {
  const color = DEMO_COLORS[(hashId(objectId) + idx) % DEMO_COLORS.length];
  const o = normalizeSpaceObject({ id: `demo-${objectId}-${idx}`, kind: 'ESPRESSO_MACHINE', color, widthM: 0.7, depthM: 0.52, heightM: 0.5 });
  const g = o ? buildEspresso(o) : new THREE.Group();
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
