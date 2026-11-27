import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { sharedMat } from '../materials';
import { M, box, cyl, lathe, plane, tubePath } from './kit';
import { brickBumpTex, brickTex, labelTex, woodTex } from './textures';

/** Tường ngăn phòng, vách kính, cửa, đèn cây, tranh treo. */

export function buildWall(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  let mat: THREE.Material;
  if (o.variant === 'brick') {
    mat = sharedMat(`p:brickwall:${w}x${h}`, () => {
      const t = brickTex().clone();
      t.repeat.set(w / 1.6, h / 1.6);
      t.needsUpdate = true;
      const b = brickBumpTex().clone();
      b.repeat.copy(t.repeat);
      b.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 2.2, roughness: 0.95 });
    });
  } else if (o.variant === 'wood') {
    mat = sharedMat(`p:woodwall:${o.color}:${w}x${h}`, () => {
      const t = woodTex().clone();
      t.repeat.set(w / 1.2, h / 2.4);
      t.rotation = Math.PI / 2;
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.6, color: o.color ?? '#c69c6d', roughness: 0.6 });
    });
  } else {
    mat = M.paint(o.color ?? '#f1f5f9', 0.85);
  }
  const wall = box(w, h, d, mat, 0, h / 2, 0);
  wall.userData.occluder = true;
  g.add(wall);
  g.add(box(w + 0.002, 0.1, d + 0.02, M.paint('#e2e8f0', 0.5), 0, 0.05, 0)); // len chân tường
  return g;
}

export function buildGlassWall(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const glass = box(w, h, d * 0.4, M.glass(), 0, h / 2, 0);
  glass.castShadow = false;
  g.add(glass);
  const alu = M.metal('#1f2937', 0.4);
  g.add(box(w, 0.05, d, alu, 0, 0.025, 0));
  g.add(box(w, 0.05, d, alu, 0, h - 0.025, 0));
  const n = Math.max(1, Math.round(w / 1.2));
  for (let i = 0; i <= n; i++) g.add(box(0.04, h, d, alu, -w / 2 + (w / n) * i, h / 2, 0));
  // Dải decal mờ ngang tầm mắt (an toàn)
  const decal = box(w, 0.08, d * 0.45, M.paint('#e2e8f0', 0.9), 0, 1.2, 0);
  decal.castShadow = false;
  g.add(decal);
  return g;
}

export function buildDoor(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const frame = M.paint('#e5e7eb', 0.5);
  g.add(box(0.06, h, d, frame, -w / 2 - 0.03, h / 2, 0));
  g.add(box(0.06, h, d, frame, w / 2 + 0.03, h / 2, 0));
  g.add(box(w + 0.12, 0.06, d, frame, 0, h + 0.03, 0));
  // Cánh cửa động: tự mở khi có người tới gần (canvas điều khiển userData.doorLeaf.open 0..1)
  if (o.variant === 'slide') {
    // Cửa kính trượt 2 cánh: mỗi cánh trượt sang 1 bên
    const glass = M.glass();
    const frameMat = M.metal('#1f2937', 0.4);
    for (const s of [-1, 1]) {
      const panel = new THREE.Group();
      panel.add(box(w / 2 - 0.02, h - 0.04, 0.03, glass, 0, h / 2, 0));
      panel.add(box(w / 2, 0.05, 0.05, frameMat, 0, h - 0.03, 0), box(w / 2, 0.05, 0.05, frameMat, 0, 0.03, 0));
      panel.add(box(0.04, h, 0.05, frameMat, -s * (w / 4 - 0.02), h / 2, 0), box(0.04, h, 0.05, frameMat, s * (w / 4 - 0.02), h / 2, 0));
      panel.position.x = s * (w / 4);
      panel.userData = { noMerge: true, dynamic: true, doorLeaf: { kind: 'slide', side: s, closedX: s * (w / 4), travel: w / 2 - 0.05 } };
      g.add(panel);
    }
  } else {
    const leaf = new THREE.Group();
    leaf.add(box(w - 0.02, h - 0.02, 0.045, M.woodGloss(o.color ?? '#a47148'), w / 2, h / 2, 0, 0.006));
    leaf.add(box(0.03, 0.18, 0.05, M.chrome(), w - 0.1, 1.0, 0.04, 0.01));
    leaf.position.x = -w / 2;
    // Mở vào trong (−Z cục bộ) ~85°
    leaf.userData = { noMerge: true, dynamic: true, doorLeaf: { kind: 'swing', angle: 1.48 } };
    g.add(leaf);
  }
  return g;
}

export function buildFloorLamp(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const h = o.heightM;
  g.add(cyl(0.15, 0.17, 0.025, M.metal(o.color ?? '#111827', 0.4), 0, 0.0125, 0, 28));
  g.add(tubePath([[0, 0.02, 0], [0, h * 0.7, 0], [0.12, h * 0.95, 0], [0.2, h * 0.92, 0]], 0.012, M.metal(o.color ?? '#111827', 0.4)));
  const shade = lathe([[0.03, 0], [0.16, -0.18], [0.03, 0.01]], M.paint('#f5f0e6', 0.9), 28);
  shade.position.set(0.2, h * 0.94, 0);
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), M.glow('#ffd59a', 1.5, 4));
  bulb.position.set(0.2, h * 0.94 - 0.1, 0);
  g.add(bulb);
  return g;
}

export function buildWallArt(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const y = 1.55;
  g.add(box(w, h, d, M.wood('#2b2b2b'), 0, y, 0, 0.005));
  // Tranh trừu tượng procedural theo màu nhấn
  const accent = o.color ?? '#2563eb';
  const tex = labelTex([{ text: '', size: 10, color: accent, y: 0 }], '#f5f1ea', 800, 540);
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5f1ea';
  ctx.fillRect(0, 0, 800, 540);
  const cols = [accent, '#1f2937', '#d6b98c', '#e5e7eb'];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(120 + ((i * 173) % 600), 110 + ((i * 97) % 340), 40 + ((i * 37) % 120), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  tex.needsUpdate = true;
  g.add(plane(w - 0.08, h - 0.08, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0, y, d / 2 + 0.002));
  return g;
}

/**
 * Vùng phòng (ROOM_ZONE): chỉ hiện trong chế độ thiết kế (sàn xanh mờ + viền đứt + tên phòng).
 * Khi chơi bị ẩn; nhân vật bước vào → camera chuyển vào góc phòng (canvas).
 */
export function buildRoomZone(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.12, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.userData.noMerge = true;
  g.add(floor);
  const pts = [
    new THREE.Vector3(-w / 2, 0.05, -d / 2),
    new THREE.Vector3(w / 2, 0.05, -d / 2),
    new THREE.Vector3(w / 2, 0.05, d / 2),
    new THREE.Vector3(-w / 2, 0.05, d / 2),
    new THREE.Vector3(-w / 2, 0.05, -d / 2),
  ];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#0ea5e9', dashSize: 0.3, gapSize: 0.18 }));
  line.computeLineDistances();
  line.userData.noMerge = true;
  g.add(line);
  g.userData.roomZone = true;
  return g;
}
