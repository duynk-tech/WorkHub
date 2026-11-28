import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { createWarehouseRackMesh } from '../hall';
import { M, box, cyl, hashId, seeded, type ShelfSlot } from './kit';

/** Kho: kệ pallet, chồng pallet hàng, xe nâng, thùng carton. */

export function buildRack(o: SpaceObject): THREE.Group {
  const g = createWarehouseRackMesh(o);
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  const levels = Math.max(2, Math.min(5, o.levels ?? 3));
  const shelves: ShelfSlot[] = [];
  for (let lv = 0; lv < levels; lv++) {
    const y = 0.14 + lv * ((o.heightM - 0.5) / levels) + 0.04;
    shelves.push({ x: 0, y, z: 0, width: o.widthM - 0.2, depth: o.depthM - 0.2, clearance: (o.heightM - 0.5) / levels - 0.1, facing: 0 });
  }
  g.userData.shelves = shelves;
  return g;
}

const cartonMat = (shade: number) => M.paint(`#${new THREE.Color('#c08a52').multiplyScalar(shade).getHexString()}`, 0.92);

function cartonStack(w: number, d: number, h: number, seed: number, baseY = 0): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(seed);
  const bw = 0.4;
  const bd = 0.3;
  const bh = 0.28;
  const nx = Math.max(1, Math.floor(w / bw));
  const nz = Math.max(1, Math.floor(d / bd));
  const ny = Math.max(1, Math.floor(h / bh));
  const tape = M.paint('#d6b98c', 0.6);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      for (let z = 0; z < nz; z++) {
        if (y === ny - 1 && r() < 0.25) continue;
        const cx = -w / 2 + (w / nx) * (x + 0.5) + (r() - 0.5) * 0.02;
        const cz = -d / 2 + (d / nz) * (z + 0.5) + (r() - 0.5) * 0.02;
        const cy = baseY + bh * y + bh / 2;
        const b = box(w / nx - 0.015, bh - 0.008, d / nz - 0.015, cartonMat(0.88 + r() * 0.2), cx, cy, cz, 0.006);
        b.rotation.y = (r() - 0.5) * 0.04;
        g.add(b);
        g.add(box(0.05, 0.002, d / nz - 0.01, tape, cx, cy + bh / 2 - 0.003, cz));
      }
    }
  }
  return g;
}

function pallet(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const wood = M.wood('#c69c6d');
  for (let i = 0; i < 5; i++) g.add(box(w, 0.022, d / 7, wood, 0, 0.133, -d / 2 + (d / 4) * i + d / 14));
  for (const sx of [-1, 0, 1]) g.add(box(0.1, 0.09, d, wood, sx * (w / 2 - 0.05), 0.075, 0));
  for (let i = 0; i < 3; i++) g.add(box(w, 0.022, 0.1, wood, 0, 0.018, -d / 2 + 0.05 + (d - 0.1) * (i / 2)));
  return g;
}

export function buildPalletStack(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  g.add(pallet(o.widthM, o.depthM));
  g.add(cartonStack(o.widthM - 0.04, o.depthM - 0.04, o.heightM - 0.15, hashId(o.id), 0.145));
  // Màng co bọc hàng
  const wrap = box(o.widthM, o.heightM - 0.2, o.depthM, M.glass(), 0, 0.145 + (o.heightM - 0.2) / 2, 0);
  wrap.castShadow = false;
  g.add(wrap);
  return g;
}

export function buildCartonStack(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  g.add(cartonStack(o.widthM, o.depthM, o.heightM, hashId(o.id)));
  return g;
}

export function buildForklift(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const paint = M.gloss(o.color ?? '#f59e0b');
  const dark = M.paint('#1f2937', 0.5);
  // Thân xe + đối trọng
  g.add(box(w, 0.7, d * 0.62, paint, 0, 0.55, -d * 0.12, 0.08));
  g.add(box(w * 0.95, 0.55, 0.4, dark, 0, 0.6, -d * 0.43, 0.06));
  // Ghế + vô lăng
  g.add(box(0.45, 0.1, 0.45, M.leather('#111827'), 0, 0.95, -d * 0.18, 0.04));
  g.add(box(0.45, 0.45, 0.08, M.leather('#111827'), 0, 1.18, -d * 0.32, 0.04));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 8, 24), M.black());
  wheel.position.set(0, 1.18, d * 0.05);
  wheel.rotation.x = -1.0;
  g.add(wheel);
  // Khung bảo vệ đầu
  for (const sx of [-1, 1]) for (const sz of [-0.38, 0.12]) g.add(box(0.05, 1.25, 0.05, dark, sx * (w / 2 - 0.06), 1.48, d * sz));
  g.add(box(w, 0.05, d * 0.55, dark, 0, 2.1, -d * 0.13));
  // Bánh xe
  for (const sx of [-1, 1]) {
    for (const [sz, r] of [[0.18, 0.24], [-0.36, 0.2]] as const) {
      const t = cyl(r, r, 0.2, M.black(), sx * (w / 2 - 0.08), r, d * sz, 24);
      t.rotation.z = Math.PI / 2;
      g.add(t);
    }
  }
  // Cột nâng cố định; giá càng + 2 càng là nhóm riêng nâng/hạ được khi lái (userData.forkCarriage)
  for (const sx of [-1, 1]) g.add(box(0.07, 2.0, 0.08, dark, sx * 0.3, 1.0, d * 0.28));
  const carriage = new THREE.Group();
  carriage.userData = { forkCarriage: true, noMerge: true, dynamic: true };
  for (const sx of [-1, 1]) carriage.add(box(0.1, 0.04, 1.0, M.metal('#374151', 0.5), sx * 0.25, 0.08, d * 0.28 + 0.5));
  carriage.add(box(0.75, 0.6, 0.04, dark, 0, 0.4, d * 0.3));
  g.add(carriage);
  // Xe lái được → không gộp tĩnh vào lô vẽ chung của cảnh
  g.userData.vehicle = true;
  return g;
}
