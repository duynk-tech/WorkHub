import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { applyWindSway, sharedMat } from '../materials';
import { M, cyl, hashId, lathe, seeded } from './kit';
import { leafTex } from './textures';

/** Cây cảnh trong chậu: thân/cành hình ống + lá là thẻ alpha (InstancedMesh, 1 draw call/loài). */

type LeafKind = 'fiddle' | 'monstera' | 'palm' | 'snake';

function leafMat(kind: LeafKind): THREE.MeshStandardMaterial {
  return sharedMat(`p:leaf:${kind}`, () => {
    const m = new THREE.MeshStandardMaterial({
      map: leafTex(kind),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.55,
    });
    applyWindSway(m);
    return m;
  });
}

const leafGeo = new Map<LeafKind, THREE.BufferGeometry>();
/** Thẻ lá hơi cong (gốc lá ở đáy) để không phẳng như giấy. */
function getLeafGeo(kind: LeafKind): THREE.BufferGeometry {
  const hit = leafGeo.get(kind);
  if (hit) return hit;
  // Độ chia theo cỡ lá: lá chét cau nhỏ xíu chỉ cần 2×3 (12 tam giác thay vì 48, vẫn giữ gân gập giữa); lưỡi hổ 2×4; lá to bản 3×5
  const [sx, sy] = kind === 'palm' ? [2, 3] : kind === 'snake' ? [2, 4] : [3, 5];
  const g = new THREE.PlaneGeometry(1, 1, sx, sy);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const bend = kind === 'snake' ? 0.03 : 0.16;
    p.setZ(i, -bend * y * y + Math.abs(x) * (kind === 'snake' ? 0.05 : 0.12));
  }
  g.computeVertexNormals();
  leafGeo.set(kind, g);
  return g;
}

function pot(o: SpaceObject, rTop: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const color = o.color ?? '#e7e5e4';
  const isWicker = color === '#b45309';
  const mat = isWicker ? M.wood('#c08a52') : color === '#94a3b8' ? M.paint('#9ca3af', 0.85) : M.ceramic(color);
  const potMesh = lathe(
    [[0.0, 0.0], [rTop * 0.72, 0.0], [rTop * 0.78, 0.02], [rTop * 0.95, h * 0.85], [rTop, h], [rTop * 0.93, h], [rTop * 0.9, h * 0.9], [0.0, h * 0.9]],
    mat,
    40,
  );
  const soil = cyl(rTop * 0.9, rTop * 0.9, 0.01, M.soil(), 0, h * 0.88, 0, 32);
  g.add(potMesh, soil);
  return g;
}

function leaves(kind: LeafKind, list: { pos: THREE.Vector3; yaw: number; pitch: number; roll: number; scale: [number, number] }[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(getLeafGeo(kind), leafMat(kind), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  list.forEach((l, i) => {
    e.set(l.pitch, l.yaw, l.roll, 'YXZ');
    q.setFromEuler(e);
    m.compose(l.pos, q, new THREE.Vector3(l.scale[0], l.scale[1], 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.userData.noMerge = true;
  return mesh;
}

export function buildPlant(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const H = o.heightM;
  const potR = Math.min(o.widthM, o.depthM) * (o.kind === 'PLANT_SNAKE' ? 0.42 : 0.3);
  const potH = Math.min(0.5, H * (o.kind === 'PLANT_SNAKE' ? 0.32 : 0.24));
  g.add(pot(o, potR, potH));
  const stemMat = M.wood('#6b4a2f');
  const list: Parameters<typeof leaves>[1] = [];

  if (o.kind === 'PLANT_FIDDLE') {
    // Thân gỗ thẳng, lá to bản xếp xoắn dọc thân phần trên
    const trunkH = H - potH;
    g.add(cyl(0.022, 0.03, trunkH * 0.95, stemMat, 0, potH + trunkH * 0.47, 0, 10));
    const n = Math.round(26 + H * 10);
    for (let i = 0; i < n; i++) {
      const t = 0.35 + (i / n) * 0.65;
      const y = potH + trunkH * t;
      const yaw = i * 2.4 + r() * 0.4;
      const s = 0.2 + r() * 0.08;
      const out = 0.05 + r() * 0.07;
      list.push({ pos: new THREE.Vector3(Math.sin(yaw) * out, y, Math.cos(yaw) * out), yaw, pitch: -0.9 + r() * 0.5, roll: (r() - 0.5) * 0.4, scale: [s * 0.8, s] });
    }
    g.add(leaves('fiddle', list));
  } else if (o.kind === 'PLANT_MONSTERA') {
    // Cuống dài vươn ra từ gốc, lá xẻ to ở đầu cuống
    const n = 12 + Math.round(o.widthM * 4);
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + r() * 0.5;
      const lean = 0.35 + r() * 0.5;
      const len = (H - potH) * (0.55 + r() * 0.45);
      const tip = new THREE.Vector3(Math.sin(yaw) * Math.sin(lean) * len, potH + Math.cos(lean) * len, Math.cos(yaw) * Math.sin(lean) * len);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, potH, 0), new THREE.Vector3(tip.x * 0.3, tip.y * 0.85, tip.z * 0.3), tip);
      const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.008, 5, false), leafStalkMat());
      g.add(stalk);
      const s = 0.3 + r() * 0.16;
      list.push({ pos: tip, yaw, pitch: -1.1 + r() * 0.4, roll: (r() - 0.5) * 0.5, scale: [s, s] });
    }
    g.add(leaves('monstera', list));
  } else if (o.kind === 'PLANT_SNAKE') {
    const n = 16 + Math.round(o.widthM * 10);
    for (let i = 0; i < n; i++) {
      const yaw = r() * Math.PI * 2;
      const rr = r() * potR * 0.7;
      const s = (H - potH) * (0.65 + r() * 0.4);
      list.push({ pos: new THREE.Vector3(Math.sin(yaw) * rr, potH - 0.02, Math.cos(yaw) * rr), yaw: r() * Math.PI, pitch: (r() - 0.5) * 0.25, roll: (r() - 0.5) * 0.2, scale: [0.09 + r() * 0.03, s] });
    }
    g.add(leaves('snake', list));
  } else {
    // PLANT_PALM: nhiều thân mảnh, lá kép dạng lông chim
    const stems = 5 + Math.round(o.widthM * 3);
    for (let sIdx = 0; sIdx < stems; sIdx++) {
      const yaw = (sIdx / stems) * Math.PI * 2 + r() * 0.6;
      const lean = 0.1 + r() * 0.3;
      const len = (H - potH) * (0.7 + r() * 0.3);
      const tip = new THREE.Vector3(Math.sin(yaw) * Math.sin(lean) * len, potH + Math.cos(lean) * len, Math.cos(yaw) * Math.sin(lean) * len);
      const curve = new THREE.LineCurve3(new THREE.Vector3(0, potH, 0), tip);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 2, 0.01, 5, false), stemMat));
      const fronds = 5;
      for (let f = 0; f < fronds; f++) {
        const fy = yaw + (f / fronds) * Math.PI * 2 + r();
        for (let k = 0; k < 9; k++) {
          const t = k / 9;
          const base = tip.clone().add(new THREE.Vector3(Math.sin(fy) * t * 0.45, -t * t * 0.35, Math.cos(fy) * t * 0.45));
          for (const side of [-1, 1]) {
            list.push({ pos: base, yaw: fy + side * 1.1, pitch: -0.4 - t * 0.6, roll: 0, scale: [0.045, 0.22 * (1 - t * 0.5)] });
          }
        }
      }
    }
    g.add(leaves('palm', list));
  }
  return g;
}

let stalkMat: THREE.MeshStandardMaterial | null = null;
function leafStalkMat() {
  stalkMat ??= sharedMat('p:stalk', () => new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.6 }));
  return stalkMat;
}

export function buildPlanterBox(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const boxH = Math.min(0.55, o.heightM * 0.5);
  const mat = o.color === '#a47148' ? M.wood('#a47148') : M.paint(o.color ?? '#52525b', 0.8);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, boxH, d), mat);
  body.position.y = boxH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.01, d - 0.06), M.soil());
  soil.position.y = boxH - 0.02;
  g.add(body, soil);
  // Hàng cỏ lá dày (lưỡi hổ + cau mini) phủ dọc bồn
  const r = seeded(hashId(o.id));
  const list: Parameters<typeof leaves>[1] = [];
  const n = Math.round(w * 22);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * (w - 0.1);
    const z = (r() - 0.5) * (d - 0.1);
    list.push({ pos: new THREE.Vector3(x, boxH - 0.02, z), yaw: r() * Math.PI, pitch: (r() - 0.5) * 0.4, roll: (r() - 0.5) * 0.3, scale: [0.08, (o.heightM - boxH) * (0.6 + r() * 0.4)] });
  }
  g.add(leaves('snake', list));
  return g;
}
