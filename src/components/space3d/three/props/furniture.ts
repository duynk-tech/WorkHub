import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { M, box, cyl, lathe, plane, tubePath } from './kit';
import { fabricTex } from './textures';
import { sharedMat } from '../materials';

/** Bàn ghế & nội thất văn phòng. Mọi vật thể: tâm đáy tại gốc, mặt trước hướng +Z, kích thước theo o.widthM/depthM/heightM. */

const top = (o: SpaceObject) => (o.variant === 'marble' ? M.marble() : M.woodGloss(o.color ?? '#a47148'));

export function buildTableRound(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = Math.min(o.widthM, o.depthM) / 2;
  const h = o.heightM;
  const t = cyl(r, r, 0.035, top(o), 0, h - 0.0175, 0, 40);
  t.scale.set(o.widthM / (2 * r), 1, o.depthM / (2 * r));
  const edge = cyl(r * 0.995, r * 0.98, 0.012, M.metal('#2b2b2b'), 0, h - 0.04, 0, 40);
  edge.scale.copy(t.scale);
  // Chân giữa kiểu tulip + đế tròn
  const stem = lathe([[0.0, 0.0], [r * 0.42, 0.0], [r * 0.44, 0.012], [0.05, 0.05], [0.032, 0.3], [0.03, h - 0.06], [0.07, h - 0.04], [0.0, h - 0.04]], M.metal('#1f1f1f', 0.4));
  g.add(t, edge, stem);
  return g;
}

export function buildTableRect(o: SpaceObject, legInset = 0.06): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, 0.04, d, top(o), 0, h - 0.02, 0, 0.012));
  const legMat = M.metal('#1f1f1f', 0.4);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.04, h - 0.04, 0.04, legMat, sx * (w / 2 - legInset), (h - 0.04) / 2, sz * (d / 2 - legInset), 0.008));
    }
  }
  g.add(box(w - legInset * 2, 0.05, 0.02, legMat, 0, h - 0.07, d / 2 - legInset));
  g.add(box(w - legInset * 2, 0.05, 0.02, legMat, 0, h - 0.07, -(d / 2 - legInset)));
  return g;
}

export function buildChair(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const seatH = 0.46;
  const isFabric = /^#(64|33|a3|b4|16|1e|e7)/.test(o.color ?? '');
  const seatMat = isFabric ? M.fabric(o.color!) : M.wood(o.color ?? '#6b4226');
  const frame = M.metal('#1a1a1a', 0.45);
  g.add(box(w, 0.045, d * 0.92, seatMat, 0, seatH, 0.01, 0.02));
  // Tựa lưng cong nhẹ
  const back = box(w * 0.96, h - seatH - 0.12, 0.025, seatMat, 0, seatH + (h - seatH) / 2 + 0.02, -d / 2 + 0.03, 0.012);
  back.rotation.x = -0.1;
  g.add(back);
  // Khung chân thép uốn
  for (const sx of [-1, 1]) {
    g.add(
      tubePath(
        [
          [sx * (w / 2 - 0.03), 0, d / 2 - 0.04],
          [sx * (w / 2 - 0.03), seatH - 0.02, d / 2 - 0.06],
          [sx * (w / 2 - 0.03), seatH - 0.02, -d / 2 + 0.05],
          [sx * (w / 2 - 0.03), 0, -d / 2 + 0.02],
        ],
        0.011,
        frame,
      ),
    );
    g.add(tubePath([[sx * (w / 2 - 0.03), seatH, -d / 2 + 0.04], [sx * (w / 2 - 0.035), h - 0.08, -d / 2 + 0.0]], 0.01, frame));
  }
  return g;
}

export function buildBarStool(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = Math.min(o.widthM, o.depthM) / 2;
  const h = o.heightM;
  g.add(cyl(r * 0.95, r * 0.9, 0.06, M.leather(o.color ?? '#1f2937'), 0, h - 0.03, 0, 32));
  g.add(cyl(0.025, 0.025, h - 0.06, M.chrome(), 0, (h - 0.06) / 2, 0, 16));
  g.add(cyl(r * 0.85, r * 0.9, 0.02, M.chrome(), 0, 0.01, 0, 32));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.01, 8, 32), M.chrome());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h * 0.35;
  g.add(ring);
  return g;
}

function cushionSet(o: SpaceObject, seats: number): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const mat = M.fabric(o.color ?? '#64748b');
  const armW = 0.14;
  const seatH = 0.42;
  const innerW = w - armW * 2;
  g.add(box(w, 0.22, d, mat, 0, 0.16, 0, 0.05)); // đế
  g.add(box(w, h - 0.12, 0.18, mat, 0, (h - 0.12) / 2 + 0.06, -d / 2 + 0.09, 0.06)); // lưng
  for (const sx of [-1, 1]) g.add(box(armW, 0.62, d, mat, sx * (w / 2 - armW / 2), 0.33, 0, 0.06)); // tay
  const cw = innerW / seats;
  for (let i = 0; i < seats; i++) {
    const cx = -innerW / 2 + cw * (i + 0.5);
    g.add(box(cw - 0.015, 0.14, d - 0.24, mat, cx, seatH - 0.02, 0.05, 0.06)); // nệm ngồi
    const bc = box(cw - 0.04, 0.4, 0.14, mat, cx, seatH + 0.25, -d / 2 + 0.24, 0.07); // gối tựa
    bc.rotation.x = -0.12;
    g.add(bc);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.022, 0.016, 0.06, M.wood('#3b2a1e'), sx * (w / 2 - 0.08), 0.03, sz * (d / 2 - 0.08), 12));
  return g;
}

export const buildSofa = (o: SpaceObject) => cushionSet(o, o.widthM > 2.3 ? 3 : 2);
export const buildArmchair = (o: SpaceObject) => cushionSet(o, 1);

export function buildCoffeeTable(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, 0.045, d, M.woodGloss(o.color ?? '#a47148'), 0, h - 0.022, 0, 0.015));
  g.add(box(w * 0.92, 0.025, d * 0.85, M.wood(o.color ?? '#a47148'), 0, 0.12, 0, 0.01)); // tầng dưới
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.02, 0.016, h - 0.045, M.metal('#1f1f1f', 0.4), sx * (w / 2 - 0.06), (h - 0.045) / 2, sz * (d / 2 - 0.06), 12));
  return g;
}

export function buildRug(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const mat = sharedMat(`p:rug:${o.color}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: fabricTex(), color: o.color ?? '#d6c7b0', roughness: 1 });
    return m;
  });
  const rug = box(o.widthM, 0.012, o.depthM, mat, 0, 0.006, 0, 0.004);
  rug.castShadow = false;
  // Viền dệt sẫm màu quanh mép thảm
  const edgeMat = M.fabric(`#${new THREE.Color(o.color ?? '#d6c7b0').multiplyScalar(0.72).getHexString()}`);
  const t = 0.07;
  for (const sz of [-1, 1]) {
    const e = box(o.widthM, 0.013, t, edgeMat, 0, 0.0065, sz * (o.depthM / 2 - t / 2));
    e.castShadow = false;
    g.add(e);
  }
  for (const sx of [-1, 1]) {
    const e = box(t, 0.013, o.depthM - t * 2, edgeMat, sx * (o.widthM / 2 - t / 2), 0.0065, 0);
    e.castShadow = false;
    g.add(e);
  }
  g.add(rug);
  return g;
}

// ───────────── Văn phòng ─────────────

export function buildDesk(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, 0.03, d, M.wood(o.color ?? '#e8d5b7'), 0, h - 0.015, 0, 0.008));
  const frame = M.metal('#f1f5f9', 0.45);
  for (const sx of [-1, 1]) {
    g.add(box(0.05, h - 0.03, d * 0.85, frame, sx * (w / 2 - 0.06), (h - 0.03) / 2, 0, 0.01));
  }
  g.add(box(w - 0.12, 0.3, 0.015, M.paint('#cbd5e1'), 0, h - 0.2, -d / 2 + 0.05)); // tấm chắn
  // Màn hình + bàn phím + chuột
  const mon = new THREE.Group();
  mon.add(box(0.56, 0.34, 0.025, M.black(), 0, 0.27, 0, 0.008));
  mon.add(plane(0.53, 0.31, M.screen(), 0, 0.27, 0.0135));
  mon.add(box(0.05, 0.12, 0.04, M.black(), 0, 0.07, -0.02));
  mon.add(box(0.2, 0.012, 0.14, M.black(), 0, 0.006, -0.02, 0.004));
  mon.position.set(0, h, -d / 2 + 0.2);
  g.add(mon);
  g.add(box(0.42, 0.015, 0.13, M.paint('#e5e7eb'), 0, h + 0.008, d / 2 - 0.22, 0.004));
  g.add(box(0.06, 0.02, 0.1, M.paint('#e5e7eb'), 0.3, h + 0.01, d / 2 - 0.22, 0.008));
  return g;
}

export function buildOfficeChair(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const mat = M.fabric(o.color ?? '#1f2937');
  const plastic = M.paint('#111827', 0.4);
  // Chân sao 5 cánh + bánh xe
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.32, 0.03, 0.04, plastic, Math.cos(a) * 0.16, 0.07, Math.sin(a) * 0.16, 0.01);
    leg.rotation.y = -a;
    g.add(leg);
    g.add(cyl(0.025, 0.025, 0.04, plastic, Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3, 12));
  }
  g.add(cyl(0.025, 0.03, 0.36, M.chrome(), 0, 0.27, 0, 16));
  g.add(box(w * 0.85, 0.08, d * 0.8, mat, 0, 0.49, 0.02, 0.035));
  const back = box(w * 0.78, h - 0.62, 0.07, mat, 0, 0.55 + (h - 0.62) / 2, -d / 2 + 0.08, 0.035);
  back.rotation.x = -0.12;
  g.add(back);
  for (const sx of [-1, 1]) g.add(box(0.05, 0.03, d * 0.45, plastic, sx * (w / 2 - 0.05), 0.68, 0, 0.012));
  return g;
}

export function buildMeetingTable(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const t = box(w, 0.05, d, M.woodGloss(o.color ?? '#6b4226'), 0, h - 0.025, 0, Math.min(d / 2 - 0.01, 0.35));
  g.add(t);
  for (const sx of [-1, 1]) g.add(box(0.12, h - 0.05, d * 0.5, M.metal('#1f1f1f', 0.4), sx * (w / 2 - 0.4), (h - 0.05) / 2, 0, 0.02));
  return g;
}

export function buildFileCabinet(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const body = M.gloss(o.color ?? '#e5e7eb');
  g.add(box(w, h, d, body, 0, h / 2, 0, 0.01));
  const rows = Math.max(2, Math.round(h / 0.38));
  const cols = w > 0.8 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cw = w / cols;
      const cx = -w / 2 + cw * (c + 0.5);
      const cy = (h / rows) * (r + 0.5);
      g.add(box(cw - 0.03, h / rows - 0.03, 0.01, body, cx, cy, d / 2 + 0.004, 0.004));
      g.add(box(0.12, 0.015, 0.025, M.chrome(), cx, cy + h / rows / 2 - 0.08, d / 2 + 0.018, 0.006));
    }
  }
  return g;
}

export function buildPartition(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  g.add(box(w, h, d, M.fabric(o.color ?? '#64748b'), 0, h / 2, 0, 0.02));
  g.add(box(w + 0.02, 0.03, d + 0.01, M.metal('#cbd5e1'), 0, h, 0, 0.01));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.03, 0.3, M.metal('#cbd5e1'), sx * (w / 2 - 0.15), 0.015, 0, 0.01));
  return g;
}
