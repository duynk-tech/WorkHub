import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, hashId, lathe, seeded, sphere } from './kit';
import { labelTex } from './textures';

/**
 * Phòng Lab R&D Kem & Socola (showroom): quầy inox chuẩn bếp công nghiệp, máy làm kem gelato (batch freezer),
 * tủ cấp đông nhanh, máy tôi socola (bánh xe xoay, dòng socola chảy), tháp socola, bàn đá tôi socola.
 * Gốc = tâm đáy, mặt trước +Z.
 *
 * Phần chuyển động (canvas điều khiển):
 *  - userData.spinner { speed } → quay quanh trục Z cục bộ (bánh xe máy tôi, cánh khuấy máy kem)
 *  - userData.flow { speed }    → trượt texture theo V (dòng socola chảy mượt)
 */

// ───────────── Vật liệu ─────────────
/** Inox xước (brushed): texture sọc mảnh ngang */
function brushedTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c9ced4';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = 185 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 7},0.55)`;
    ctx.fillRect(0, y, 256, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const steel = () => sharedMat('lab:steel', () => new THREE.MeshStandardMaterial({ map: brushedTex(), color: '#e3e7eb', metalness: 0.85, roughness: 0.32 }));
const steelDark = () => sharedMat('lab:steelDark', () => new THREE.MeshStandardMaterial({ color: '#9aa1a9', metalness: 0.9, roughness: 0.38 }));
const rubber = () => sharedMat('lab:rubber', () => new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.7 }));
const granite = () =>
  sharedMat('lab:granite', () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.9 ? 'rgba(220,220,225,0.5)' : `rgba(${60 + v * 60},${60 + v * 60},${66 + v * 60},0.6)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  });
/** Socola mượt bóng như vừa tôi xong */
const chocolate = (tone = '#3b1f12') =>
  sharedMat(`lab:choco:${tone}`, () => new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.3, sheenColor: new THREE.Color('#7a4a2a') }));
/** Dòng socola chảy: sọc bóng dọc trượt xuống (canvas trượt offset theo userData.flow) */
function chocoFlowMat(key: string, tone = '#3b1f12'): THREE.MeshPhysicalMaterial {
  return sharedMat(`lab:flow:${key}:${tone}`, () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 64;
      const y = Math.random() * 256;
      const g = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
      g.addColorStop(0, 'rgba(255,220,190,0)');
      g.addColorStop(0.5, 'rgba(255,220,190,0.28)');
      g.addColorStop(1, 'rgba(255,220,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 3, y, 6, 30 + Math.random() * 70);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  }) as THREE.MeshPhysicalMaterial;
}
const lcd = (text: string, color = '#38bdf8') =>
  sharedMat(`lab:lcd:${text}:${color}`, () => {
    const t = labelTex([{ text, size: 110, color, weight: 700, y: 128 }], '#0b1220', 512, 256);
    const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.3 });
    registerEmissive({ mat: m, day: 0.7, night: 1.3, mode: 'emissive' });
    return m;
  });

function plate(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  return m;
}
function dynamic(o: THREE.Object3D, data: Record<string, unknown>) {
  o.userData = { ...o.userData, noMerge: true, dynamic: true, ...data };
}

// ───────────── Quầy inox ─────────────
/** Thân quầy inox: chân tăng chỉnh, kệ dưới/cánh tủ, ngăn kéo, gờ chắn sau (backsplash) */
function counterBody(g: THREE.Group, w: number, d: number, h: number, top: THREE.Material, withDoors: boolean) {
  const s = steel();
  const topT = 0.04;
  g.add(box(w, topT, d, top, 0, h - topT / 2, 0, 0.006));
  g.add(box(w, 0.1, 0.03, s, 0, h + 0.05, -d / 2 + 0.015)); // gờ chắn sau
  const bodyH = h - topT - 0.15;
  if (withDoors) {
    g.add(box(w - 0.02, bodyH, d - 0.06, s, 0, 0.15 + bodyH / 2, -0.01));
    // Cánh tủ + tay nắm dài, 1 dãy ngăn kéo bên trên
    const n = Math.max(2, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      g.add(box(w / n - 0.02, 0.005, 0.005, steelDark(), x, h - topT - 0.15, d / 2 - 0.025)); // khe ngăn kéo
      g.add(box(w / n * 0.5, 0.012, 0.02, M.chrome(), x, h - topT - 0.08, d / 2 - 0.02));
      g.add(box(0.012, bodyH * 0.45, 0.02, M.chrome(), x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.06), 0.15 + bodyH * 0.55, d / 2 - 0.02));
      g.add(box(0.004, bodyH - 0.12, 0.004, steelDark(), -w / 2 + (w / n) * (i + 1), 0.15 + (bodyH - 0.12) / 2, d / 2 - 0.028));
    }
  } else {
    // Bàn chân rời: kệ dưới
    g.add(box(w - 0.06, 0.025, d - 0.08, s, 0, 0.22, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.02, 0.02, h - 0.08, s, sx * (w / 2 - 0.05), (h - 0.08) / 2 + 0.04, sz * (d / 2 - 0.05), 10));
  }
  // Chân tăng chỉnh
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.025, 0.03, 0.04, rubber(), sx * (w / 2 - 0.05), 0.02, sz * (d / 2 - 0.05), 10));
  if (withDoors) g.add(box(w - 0.02, 0.11, d - 0.1, rubber(), 0, 0.095, -0.03)); // chân đế phào
}

function scale(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.24, 0.035, 0.2, M.paint('#e5e7eb', 0.4), 0, 0.018, 0, 0.008));
  g.add(box(0.2, 0.006, 0.16, steel(), 0, 0.038, -0.01));
  g.add(plate(0.08, 0.025, lcd('250.0g', '#86efac'), 0, 0.02, 0.101));
  return g;
}
function standMixer(color = '#b91c1c'): THREE.Group {
  const g = new THREE.Group();
  const paint = M.gloss(color);
  g.add(box(0.22, 0.04, 0.34, paint, 0, 0.02, 0, 0.02));
  g.add(box(0.1, 0.3, 0.1, paint, 0, 0.17, -0.12, 0.04));
  const head = box(0.14, 0.12, 0.34, paint, 0, 0.36, -0.02, 0.05);
  g.add(head);
  g.add(lathe([[0.001, 0], [0.06, 0.005], [0.1, 0.06], [0.11, 0.17], [0.105, 0.172]], steel(), 24).translateY(0.045).translateZ(0.06));
  g.add(cyl(0.008, 0.008, 0.12, steelDark(), 0, 0.25, 0.06, 8));
  return g;
}
function jug(h = 0.16, liquid?: string): THREE.Group {
  const g = new THREE.Group();
  g.add(lathe([[0.001, 0], [0.05, 0], [0.055, h * 0.9], [0.06, h]], steel(), 18));
  if (liquid) g.add(cyl(0.05, 0.05, 0.004, M.paint(liquid, 0.3), 0, h * 0.7, 0, 16));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 12, Math.PI), steel());
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.06, h * 0.55, 0);
  g.add(handle);
  return g;
}

/** Máy tôi socola để bàn: bồn inox chứa socola lỏng, bánh xe xoay vớt socola đổ thành dòng chảy mượt */
function temperingMachine(): THREE.Group {
  const g = new THREE.Group();
  const s = steel();
  g.add(box(0.46, 0.22, 0.5, s, 0, 0.11, 0, 0.03));
  // Bồn socola lỏng (mặt bóng)
  g.add(box(0.36, 0.02, 0.26, steelDark(), 0, 0.225, 0.04));
  g.add(box(0.34, 0.012, 0.24, chocolate(), 0, 0.232, 0.04));
  // Bánh xe xoay: đĩa tròn + gân, trục ngang theo trục Z cục bộ → spinner
  const wheelHub = new THREE.Group();
  wheelHub.position.set(0, 0.33, -0.12);
  wheelHub.rotation.y = Math.PI / 2; // trục bánh xe nằm ngang (theo X quầy)
  const spin = new THREE.Group();
  const disc = cyl(0.13, 0.13, 0.05, chocolate('#3f2214'), 0, 0, 0, 32);
  disc.rotation.x = Math.PI / 2;
  spin.add(disc);
  for (let i = 0; i < 8; i++) {
    const rib = box(0.012, 0.13, 0.056, s, 0, 0, 0);
    rib.rotation.z = (i / 8) * Math.PI;
    spin.add(rib);
  }
  dynamic(spin, { spinner: { axis: 'z', speed: 1.1 } });
  wheelHub.add(spin);
  g.add(wheelHub);
  g.add(box(0.03, 0.22, 0.04, s, 0.17, 0.33, -0.12), box(0.03, 0.22, 0.04, s, -0.17, 0.33, -0.12));
  // Dòng socola đổ xuống từ máng (dải cong, texture trượt)
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.1, 18, 1, true), chocoFlowMat('temper'));
  ribbon.position.set(0, 0.29, 0.1);
  dynamic(ribbon, { flow: { speed: 0.9 } });
  g.add(ribbon);
  g.add(box(0.14, 0.012, 0.08, s, 0, 0.34, 0.08)); // máng rót
  g.add(plate(0.1, 0.04, lcd('31.5°C', '#fbbf24'), 0.14, 0.15, 0.251));
  return g;
}

/** Tháp socola 3 tầng: dòng socola phủ kín mặt tháp chảy mượt liên tục */
function chocolateFountain(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.18, 0.1, steel(), 0, 0.05, 0, 28));
  g.add(lathe([[0.001, 0.1], [0.2, 0.1], [0.21, 0.13], [0.19, 0.12], [0.001, 0.12]], steel(), 32));
  g.add(cyl(0.19, 0.19, 0.012, chocolate(), 0, 0.122, 0, 28));
  // Thân tháp: côn chảy socola (flow) + 3 tầng đĩa
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 24, 1, true), chocoFlowMat('fountain'));
  body.position.y = 0.33;
  dynamic(body, { flow: { speed: 0.6 } });
  g.add(body);
  for (const [y, r] of [[0.26, 0.15], [0.38, 0.11], [0.5, 0.07]] as [number, number][]) {
    g.add(lathe([[0.001, y], [r, y - 0.018], [r + 0.005, y - 0.012]], steel(), 28));
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.006, r + 0.018, 0.09, 28, 1, true), chocoFlowMat('fountain'));
    curtain.position.y = y - 0.06;
    dynamic(curtain, { flow: { speed: 0.6 } });
    g.add(curtain);
  }
  g.add(sphere(0.03, chocolate(), 0, 0.56, 0));
  return g;
}

/** Khuôn bonbon polycarbonate + viên socola bóng */
function bonbonMold(r: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.27, 0.02, 0.13, sharedMat('lab:poly', () => new THREE.MeshPhysicalMaterial({ color: '#e5f2ff', transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false })), 0, 0.01, 0));
  const tones = ['#3b1f12', '#5a3420', '#7b4a2c', '#f1e4cf'];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const b = sphere(0.016, chocolate(tones[Math.floor(r() * tones.length)]), -0.11 + i * 0.044, 0.024, -0.04 + j * 0.04);
      b.scale.y = 0.6;
      g.add(b);
    }
  return g;
}

/** Hộp kem gelato trên khay (đầu múc cuộn sóng) */
function gelatoPan(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.16, 0.08, 0.25, steel(), 0, 0.04, 0, 0.005));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), sharedMat(`lab:gelato:${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') })));
  top.scale.set(0.85, 0.5, 1.35);
  top.position.y = 0.08;
  g.add(top);
  return g;
}

export function buildLabCounter(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const r = seeded(hashId(o.id));
  const v = o.variant ?? 'prep';
  if (v === 'chocolate') {
    // Đảo socola: thân tủ inox, mặt đá granite đen bóng (bàn tôi socola)
    counterBody(g, w, d, h, granite(), true);
    const tm = temperingMachine();
    tm.position.set(-w * 0.3, h, -d * 0.12);
    g.add(tm);
    const ft = chocolateFountain();
    ft.position.set(w * 0.3, h, -d * 0.05);
    g.add(ft);
    // Vũng socola đang "tabling" trên mặt đá + dao chà
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), chocolate());
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(1.5, 1, 1);
    pool.position.set(-w * 0.02, h + 0.002, d * 0.18);
    g.add(pool);
    const knife = box(0.04, 0.004, 0.22, steel(), w * 0.1, h + 0.004, d * 0.2);
    knife.rotation.y = 0.5;
    g.add(knife, box(0.03, 0.02, 0.1, rubber(), w * 0.1 + 0.07, h + 0.012, d * 0.2 - 0.12));
    for (let i = 0; i < 2; i++) {
      const m = bonbonMold(r);
      m.position.set(w * 0.08 + i * 0.3, h, -d * 0.25);
      g.add(m);
    }
    const sc = scale();
    sc.position.set(-w * 0.44, h, d * 0.22);
    g.add(sc);
  } else if (v === 'sink') {
    counterBody(g, w, d, h, steel(), true);
    for (const sx of [-1, 1]) {
      const x = sx * w * 0.2;
      g.add(box(w * 0.32, 0.006, d * 0.56, steelDark(), x, h + 0.001, 0.02));
      g.add(cyl(0.02, 0.02, 0.004, rubber(), x, h + 0.004, 0.02, 12));
    }
    // Vòi cổ ngỗng + vòi xịt rửa có lò xo
    g.add(cyl(0.012, 0.012, 0.42, M.chrome(), 0, h + 0.21, -d / 2 + 0.08, 10));
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 16, Math.PI), M.chrome());
    arc.position.set(0, h + 0.42, -d / 2 + 0.18);
    arc.rotation.y = Math.PI / 2;
    g.add(arc);
    const spring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 18), M.chrome());
    spring.position.set(w * 0.2, h + 0.55, -d / 2 + 0.1);
    spring.rotation.x = Math.PI / 2;
    g.add(cyl(0.012, 0.012, 0.9, M.chrome(), w * 0.2, h + 0.45, -d / 2 + 0.08, 10), spring);
    g.add(box(0.1, 0.12, 0.05, M.paint('#f8fafc', 0.4), -w * 0.42, h + 0.4, -d / 2 + 0.03, 0.01)); // hộp xà phòng
  } else if (v === 'gelato') {
    counterBody(g, w, d, h, steel(), true);
    // Khay kem mẫu vừa ra lò + muỗng múc, giá ốc quế
    const colors = ['#f6e7c1', '#8b5a3c', '#f4a6b8', '#a7d88a', '#fbe38e', '#3b1f12'];
    for (let i = 0; i < 6; i++) {
      const p = gelatoPan(colors[i]);
      p.position.set(-w * 0.38 + i * 0.18, h, d * 0.05);
      g.add(p);
    }
    for (let i = 0; i < 3; i++) {
      const sp = box(0.02, 0.01, 0.2, steel(), -w * 0.3 + i * 0.12, h + 0.12, d * 0.3);
      sp.rotation.x = -0.4;
      g.add(sp);
    }
    const jg = jug(0.18, '#fdf6e3');
    jg.position.set(w * 0.4, h, -d * 0.2);
    g.add(jg);
    const sc = scale();
    sc.position.set(w * 0.25, h, d * 0.2);
    g.add(sc);
  } else {
    // Sơ chế: bàn inox chân rời, cân điện tử, máy đánh trứng, ca inox, thớt, khay nguyên liệu
    counterBody(g, w, d, h, steel(), false);
    const mx = standMixer();
    mx.position.set(-w * 0.32, h, -d * 0.08);
    g.add(mx);
    const sc = scale();
    sc.position.set(-w * 0.05, h, d * 0.15);
    g.add(sc);
    for (let i = 0; i < 3; i++) {
      const j = jug(0.14 + i * 0.02, i === 1 ? '#f5f0e6' : undefined);
      j.position.set(w * 0.12 + i * 0.14, h, -d * 0.2);
      g.add(j);
    }
    g.add(box(0.36, 0.02, 0.24, M.paint('#f8fafc', 0.6), w * 0.33, h + 0.01, d * 0.12, 0.01)); // thớt
    for (const [i, c] of ['#f3ead7', '#c08a52', '#3b1f12'].entries()) {
      g.add(cyl(0.06, 0.055, 0.08, sharedMat('lab:bowlGlass', () => new THREE.MeshPhysicalMaterial({ color: '#f1f5f9', transparent: true, opacity: 0.5, roughness: 0.08, depthWrite: false })), w * 0.25 + i * 0.13, h + 0.04, d * 0.3, 18));
      g.add(cyl(0.05, 0.05, 0.03, M.paint(c, 0.8), w * 0.25 + i * 0.13, h + 0.02, d * 0.3, 16));
    }
  }
  return g;
}

/** Máy làm kem gelato (batch freezer) đứng sàn: thân inox, cửa xi lanh có ô kính thấy cánh khuấy quay, phễu nạp, màn hình, máng ra kem */
export function buildBatchFreezer(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const s = steel();
  g.add(box(w, h * 0.92, d, s, 0, (h * 0.92) / 2 + 0.04, 0, 0.03));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(cyl(0.035, 0.035, 0.04, rubber(), sx * (w / 2 - 0.08), 0.02, sz * (d / 2 - 0.08), 12));
  }
  // Lưới tản nhiệt hai bên
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) g.add(box(0.004, 0.012, d * 0.6, steelDark(), sx * (w / 2 + 0.001), 0.25 + i * 0.035, 0));
  const cy = h * 0.62;
  // Cửa xi lanh tròn: vành inox + kính + cánh khuấy quay (spinner)
  const door = cyl(0.17, 0.17, 0.05, M.chrome(), 0, cy, d / 2 + 0.025, 32);
  door.rotation.x = Math.PI / 2;
  g.add(door);
  const glass = cyl(0.13, 0.13, 0.01, M.glass(), 0, cy, d / 2 + 0.055, 32);
  glass.rotation.x = Math.PI / 2;
  g.add(glass);
  const inner = cyl(0.125, 0.125, 0.01, sharedMat('lab:gelatoMix', () => new THREE.MeshStandardMaterial({ color: '#f6e7c1', roughness: 0.5 })), 0, cy, d / 2 + 0.035, 32);
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
  const dasher = new THREE.Group();
  dasher.position.set(0, cy, d / 2 + 0.045);
  for (let i = 0; i < 3; i++) {
    const blade = box(0.22, 0.018, 0.006, steelDark(), 0, 0, 0);
    blade.rotation.z = (i / 3) * Math.PI;
    dasher.add(blade);
  }
  dynamic(dasher, { spinner: { axis: 'z', speed: 3.2 } });
  g.add(dasher);
  // Tay cầm khoá cửa + máng ra kem + khay hứng
  g.add(box(0.05, 0.12, 0.03, rubber(), 0.17, cy, d / 2 + 0.06, 0.01));
  const chute = box(0.12, 0.025, 0.16, s, 0, cy - 0.2, d / 2 + 0.06, 0.005);
  chute.rotation.x = 0.35;
  g.add(chute, box(0.36, 0.02, 0.24, steelDark(), 0, h * 0.3, d / 2 + 0.1));
  const pan = gelatoPan('#f6e7c1');
  pan.position.set(0, h * 0.31, d / 2 + 0.1);
  g.add(pan);
  // Phễu nạp trên đỉnh + bảng điều khiển màn hình
  g.add(lathe([[0.06, 0], [0.09, 0.08], [0.11, 0.1]], s, 20).translateY(h * 0.96).translateZ(-d * 0.1));
  g.add(box(w * 0.8, 0.14, 0.04, M.paint('#1f2937', 0.4), 0, h * 0.86, d / 2 + 0.01, 0.01));
  g.add(plate(w * 0.36, 0.08, lcd('-8°C  GELATO', '#38bdf8'), -w * 0.12, h * 0.86, d / 2 + 0.032));
  for (let i = 0; i < 3; i++) g.add(cyl(0.015, 0.015, 0.01, M.glow(['#22c55e', '#f59e0b', '#ef4444'][i], 1, 2.4), w * 0.18 + i * 0.05, h * 0.86, d / 2 + 0.033, 10).rotateX(Math.PI / 2));
  // Logo / tên máy
  const tag = plate(0.2, 0.05, lcd('TIM · BATCH', '#e5e7eb'), 0, h * 0.4, d / 2 + 0.001);
  g.add(tag);
  return g;
}

/** Tủ cấp đông nhanh (blast freezer) đứng: cửa inox tay nắm dài, màn hình nhiệt độ, chân bánh xe */
export function buildBlastFreezer(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const s = steel();
  g.add(box(w, h - 0.1, d, s, 0, (h - 0.1) / 2 + 0.1, 0, 0.02));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.04, 0.04, 0.08, rubber(), sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08), 12));
  // Cửa + gioăng + tay nắm dọc
  g.add(box(w - 0.04, h - 0.42, 0.02, s, 0, (h - 0.42) / 2 + 0.12, d / 2 + 0.01, 0.01));
  g.add(box(w - 0.02, 0.008, 0.012, rubber(), 0, h - 0.29, d / 2 + 0.02));
  g.add(box(0.025, h * 0.4, 0.04, M.chrome(), w / 2 - 0.08, h * 0.5, d / 2 + 0.04, 0.01));
  // Panel trên: màn hình + nút
  g.add(box(w - 0.04, 0.22, 0.02, M.paint('#1f2937', 0.4), 0, h - 0.14, d / 2 + 0.01, 0.01));
  g.add(plate(w * 0.45, 0.1, lcd('-35°C', '#38bdf8'), -w * 0.15, h - 0.14, d / 2 + 0.022));
  for (let i = 0; i < 3; i++) g.add(cyl(0.018, 0.018, 0.01, M.glow(['#22c55e', '#38bdf8', '#f8fafc'][i], 1, 2.4), w * 0.15 + i * 0.07, h - 0.14, d / 2 + 0.024, 10).rotateX(Math.PI / 2));
  // Lưới gió dưới
  for (let i = 0; i < 5; i++) g.add(box(w * 0.7, 0.008, 0.01, steelDark(), 0, 0.14 + i * 0.022, d / 2 + 0.02));
  return g;
}
