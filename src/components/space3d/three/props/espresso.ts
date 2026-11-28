import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { sharedMat } from '../materials';
import { mergeStaticGroup } from '../merge';
import { M, box, cyl, lathe, plane, tubePath } from './kit';

/**
 * Máy pha espresso chuyên nghiệp 2 group + máy xay on-demand — dựng tỉ mỉ theo máy thật:
 * thân sơn bóng + ốp inox xước 2 bên, khay hâm ly có lan can & ly úp, bảng nút đèn nền,
 * 2 đồng hồ áp suất có mặt số, 2 group head chuông + tay pha cán gỗ vòi đôi, khay hứng lưới,
 * vòi đánh sữa có khớp xoay, vòi nước nóng, logo kim loại; máy xay có phễu kính chứa hạt.
 */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, sans-serif';

function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  return sharedMat(`tex:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t });
    return m;
  }).map as THREE.CanvasTexture;
}

/** Mặt đồng hồ áp suất: vạch chia, vùng đỏ, kim, chữ BAR */
function gaugeTex(label: string) {
  return canvasTex(`gauge:${label}`, 256, 256, (ctx) => {
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    ctx.strokeStyle = '#c81e1e';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 96, a0 + (a1 - a0) * 0.78, a1);
    ctx.stroke();
    ctx.strokeStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(128, 128, 96, a0 + (a1 - a0) * 0.55, a0 + (a1 - a0) * 0.75);
    ctx.stroke();
    ctx.strokeStyle = '#111';
    for (let i = 0; i <= 40; i++) {
      const a = a0 + ((a1 - a0) * i) / 40;
      const major = i % 5 === 0;
      ctx.lineWidth = major ? 3.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * (major ? 84 : 92), 128 + Math.sin(a) * (major ? 84 : 92));
      ctx.lineTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#111';
        ctx.font = `700 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i / (label === 'BAR' ? 2.5 : 5)), 128 + Math.cos(a) * 66, 128 + Math.sin(a) * 66);
      }
    }
    ctx.fillStyle = '#334155';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(label, 128, 178);
    // Kim
    const an = a0 + (a1 - a0) * (label === 'BAR' ? 0.6 : 0.42);
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128 - Math.cos(an) * 16, 128 - Math.sin(an) * 16);
    ctx.lineTo(128 + Math.cos(an) * 98, 128 + Math.sin(an) * 98);
    ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(128, 128, 11, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Lưới khay hứng: khe dài song song (alpha) */
function grillTex() {
  return canvasTex('espressoGrill', 512, 128, (ctx) => {
    ctx.fillStyle = '#d9dde2';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#1a1a1a';
    for (let x = 10; x < 502; x += 14) {
      ctx.beginPath();
      ctx.roundRect(x, 18, 7, 92, 3.5);
      ctx.fill();
    }
  });
}

/** Tấm inox xước (vân ngang mảnh) dùng làm roughness/map cho ốp hông */
function brushedTex() {
  return canvasTex('brushed', 512, 512, (ctx) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * 512;
      const v = 120 + Math.random() * 90;
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(Math.random() * 512, y, 30 + Math.random() * 200, 0.7);
    }
  }, false);
}

function badgeTex(text: string) {
  return canvasTex(`badge:${text}`, 512, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#f5f5f5');
    g.addColorStop(0.5, '#a3a3a3');
    g.addColorStop(1, '#e5e5e5');
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 20);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 470);
  });
}

function screenTex() {
  return canvasTex('espressoScreen', 256, 128, (ctx) => {
    ctx.fillStyle = '#05121f';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = `700 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('93.5°', 128, 62);
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('25s · 36g', 128, 104);
  });
}

const mats = {
  brushed: () =>
    sharedMat('esp:brushed', () => new THREE.MeshStandardMaterial({ color: '#d4d6d9', metalness: 1, roughness: 0.32, roughnessMap: brushedTex() })),
  bodyPaint: (c: string) =>
    sharedMat(`esp:paint:${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 })),
  walnut: () => sharedMat('esp:walnut', () => new THREE.MeshPhysicalMaterial({ color: '#5b3a24', roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.2 })),
  rubber: () => sharedMat('esp:rubber', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 })),
  grill: () => sharedMat('esp:grill', () => new THREE.MeshStandardMaterial({ map: grillTex(), metalness: 0.85, roughness: 0.3 })),
  button: () => M.glow('#e0f2fe', 0.9, 2.2),
  buttonRing: () => M.metal('#9ca3af', 0.2),
  coffee: () => sharedMat('esp:coffee', () => new THREE.MeshPhysicalMaterial({ color: '#3a1f12', roughness: 0.25, clearcoat: 1 })),
  crema: () => sharedMat('esp:crema', () => new THREE.MeshStandardMaterial({ color: '#b07a45', roughness: 0.6 })),
  bean: () => sharedMat('esp:bean', () => new THREE.MeshPhysicalMaterial({ color: '#3b2314', roughness: 0.35, clearcoat: 0.6 })),
};

/** Ly espresso có quai + đĩa lót */
function espressoCup(withCoffee = false): THREE.Group {
  const g = new THREE.Group();
  const cer = M.ceramic('#ffffff');
  g.add(lathe([[0, 0], [0.055, 0], [0.06, 0.006], [0.058, 0.01], [0, 0.01]], cer, 32)); // đĩa
  const cup = lathe([[0, 0.01], [0.022, 0.01], [0.03, 0.03], [0.034, 0.06], [0.031, 0.06], [0.028, 0.032], [0.02, 0.016], [0, 0.016]], cer, 32);
  g.add(cup);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 16, Math.PI * 1.2), cer);
  handle.position.set(0.036, 0.04, 0);
  handle.rotation.z = -Math.PI * 0.6;
  g.add(handle);
  if (withCoffee) {
    const c = cyl(0.029, 0.029, 0.002, mats.crema(), 0, 0.05, 0, 24);
    c.castShadow = false;
    g.add(c);
  }
  return g;
}

/** Tay pha (portafilter): lòng lọc inox + cán gỗ óc chó + vòi đôi */
function portafilter(): THREE.Group {
  const g = new THREE.Group();
  g.add(lathe([[0, -0.035], [0.012, -0.035], [0.038, -0.012], [0.04, 0.0], [0.042, 0.004], [0, 0.004]], M.chrome(), 32));
  // 2 tai khoá
  for (const s of [-1, 1]) g.add(box(0.014, 0.008, 0.02, M.chrome(), s * 0.044, 0, 0));
  // Cổ cán + cán gỗ thuôn
  const neck = cyl(0.008, 0.01, 0.04, M.chrome(), 0, -0.004, 0.055, 16);
  neck.rotation.x = Math.PI / 2 - 0.25;
  g.add(neck);
  const handle = lathe([[0, 0], [0.012, 0.004], [0.015, 0.04], [0.014, 0.1], [0.012, 0.115], [0, 0.118]], mats.walnut(), 20);
  handle.rotation.x = Math.PI / 2 - 0.25;
  handle.position.set(0, -0.012, 0.072);
  g.add(handle);
  // Vòi đôi
  for (const s of [-1, 1]) {
    const sp = cyl(0.005, 0.004, 0.03, M.chrome(), s * 0.012, -0.05, 0.004, 10);
    sp.rotation.z = s * 0.3;
    g.add(sp);
  }
  return g;
}

export function buildEspresso(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const paint = mats.bodyPaint(o.color ?? '#d1d5db');
  const brushed = mats.brushed();
  const bodyD = d * 0.82;
  const bodyZ = -d * 0.06;
  const front = bodyZ + bodyD / 2;

  // Chân cao su + đế
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.016, 0.02, 0.03, mats.rubber(), sx * (w / 2 - 0.05), 0.015, bodyZ + sz * (bodyD / 2 - 0.05), 16));
  g.add(box(w, 0.035, bodyD, M.black(), 0, 0.048, bodyZ, 0.008));

  // Thân chính: mặt trước sơn bóng, 2 hông ốp inox xước, nóc
  const bodyY0 = 0.065;
  const bodyH = h * 0.78 - bodyY0;
  g.add(box(w - 0.04, bodyH, bodyD - 0.02, paint, 0, bodyY0 + bodyH / 2, bodyZ, 0.018));
  for (const sx of [-1, 1]) g.add(box(0.022, bodyH + 0.01, bodyD, brushed, sx * (w / 2 - 0.011), bodyY0 + bodyH / 2, bodyZ, 0.008));
  // Đường viền chrome chạy ngang mặt trước
  g.add(box(w - 0.03, 0.008, 0.01, M.chrome(), 0, bodyY0 + bodyH * 0.92, front + 0.002, 0.003));
  g.add(box(w - 0.03, 0.006, 0.01, M.chrome(), 0, bodyY0 + bodyH * 0.38, front + 0.002, 0.003));

  // Khay hâm ly + lan can + ly úp
  const topY = bodyY0 + bodyH;
  g.add(box(w - 0.02, 0.014, bodyD - 0.01, M.chrome(), 0, topY + 0.007, bodyZ, 0.004));
  const railY = topY + 0.05;
  const rw = w / 2 - 0.03;
  const rd = bodyD / 2 - 0.03;
  g.add(
    tubePath(
      [[-rw, railY, bodyZ + rd], [rw, railY, bodyZ + rd], [rw, railY, bodyZ - rd], [-rw, railY, bodyZ - rd], [-rw, railY, bodyZ + rd]],
      0.0045,
      M.chrome(),
    ),
  );
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) g.add(cyl(0.004, 0.004, 0.05, M.chrome(), sx * rw, topY + 0.025, bodyZ + sz * rd, 8));
  const cer = M.ceramic('#ffffff');
  const cupGeo = new THREE.LatheGeometry([[0, 0], [0.034, 0], [0.031, 0.05], [0.022, 0.06], [0, 0.06]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const cups = new THREE.InstancedMesh(cupGeo, cer, 8);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const cx = -w * 0.32 + (i % 4) * (w * 0.21);
    const cz = bodyZ + (i < 4 ? -0.05 : 0.07);
    mtx.makeTranslation(cx, topY + 0.014, cz);
    cups.setMatrixAt(i, mtx);
  }
  cups.userData.noMerge = true;
  cups.castShadow = true;
  g.add(cups);

  // Bảng điều khiển: màn hình + nút đèn nền cho mỗi group
  const panelY = bodyY0 + bodyH * 0.72;
  const groups = w > 0.55 ? [-0.24, 0.24] : [0];
  for (const gx of groups) {
    const cx = gx * w;
    g.add(box(0.17, 0.07, 0.008, M.black(), cx, panelY, front + 0.004, 0.006));
    g.add(plane(0.07, 0.035, screenMat(), cx - 0.04, panelY, front + 0.0085));
    for (let b = 0; b < 4; b++) {
      const bx = cx + 0.012 + b * 0.019;
      const ring = cyl(0.008, 0.008, 0.004, mats.buttonRing(), bx, panelY, front + 0.009, 16);
      ring.rotation.x = Math.PI / 2;
      const btn = cyl(0.0062, 0.0062, 0.005, mats.button(), bx, panelY, front + 0.0105, 16);
      btn.rotation.x = Math.PI / 2;
      g.add(ring, btn);
    }
  }

  // 2 đồng hồ áp suất (lò hơi BAR & bơm) ở giữa
  const gy = bodyY0 + bodyH * 0.55;
  ['BAR', 'PUMP'].forEach((lbl, i) => {
    const gx = (i === 0 ? -1 : 1) * Math.min(0.055, w * 0.08);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, 12, 36), M.chrome());
    bezel.position.set(gx, gy, front + 0.006);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.03, 36), sharedMat(`esp:gauge:${lbl}`, () => new THREE.MeshStandardMaterial({ map: gaugeTex(lbl), roughness: 0.3 })));
    face.position.set(gx, gy, front + 0.005);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.031, 24, 8, 0, Math.PI * 2, 0, 0.5), M.glass());
    glass.rotation.x = Math.PI / 2;
    glass.position.set(gx, gy, front + 0.002);
    g.add(bezel, face, glass);
  });

  // Logo kim loại
  const badge = plane(Math.min(0.22, w * 0.32), Math.min(0.055, w * 0.08), sharedMat('esp:badge', () => new THREE.MeshStandardMaterial({ map: badgeTex('TIM ESPRESSO'), metalness: 0.6, roughness: 0.25 })), 0, bodyY0 + bodyH * 0.86, front + 0.005);
  g.add(badge);

  // Group head chuông + tay pha + ly dưới vòi
  const ghY = bodyY0 + bodyH * 0.3;
  groups.forEach((gx, i) => {
    const cx = gx * w;
    const head = lathe([[0, 0.05], [0.045, 0.05], [0.052, 0.03], [0.047, 0.005], [0.038, 0], [0, 0]], M.chrome(), 36);
    head.position.set(cx, ghY - 0.01, front + 0.05);
    const neck = box(0.07, 0.04, 0.06, M.chrome(), cx, ghY + 0.035, front + 0.03, 0.01);
    g.add(head, neck);
    const pf = portafilter();
    pf.position.set(cx, ghY - 0.012, front + 0.05);
    pf.rotation.y = i === 0 ? 0.35 : -0.2;
    g.add(pf);
    const cup = espressoCup(true);
    cup.position.set(cx, 0.105, front + 0.06);
    g.add(cup);
  });

  // Khay hứng: thân inox + lưới khe
  const trayD = 0.17;
  g.add(box(w - 0.06, 0.035, trayD, M.chrome(), 0, 0.085, front + trayD / 2 - 0.04, 0.008));
  const grill = plane(w - 0.09, trayD - 0.03, mats.grill(), 0, 0.1035, front + trayD / 2 - 0.04);
  grill.rotation.x = -Math.PI / 2;
  g.add(grill);

  // Vòi đánh sữa có khớp xoay + núm vặn (2 bên), vòi nước nóng ở giữa
  for (const s of [-1, 1]) {
    const sx = s * (w / 2 - 0.045);
    const knob = lathe([[0, 0], [0.018, 0], [0.02, 0.01], [0.016, 0.03], [0, 0.032]], M.black(), 20);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(sx, bodyY0 + bodyH * 0.82, front);
    g.add(knob);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), M.chrome());
    joint.position.set(sx, bodyY0 + bodyH * 0.62, front + 0.02);
    g.add(joint);
    g.add(
      tubePath(
        [
          [sx, bodyY0 + bodyH * 0.62, front + 0.02],
          [sx + s * 0.02, bodyY0 + bodyH * 0.55, front + 0.07],
          [sx + s * 0.03, bodyY0 + bodyH * 0.25, front + 0.09],
          [sx + s * 0.03, 0.15, front + 0.095],
        ],
        0.005,
        M.chrome(),
      ),
    );
    const tip = cyl(0.007, 0.005, 0.018, M.chrome(), sx + s * 0.03, 0.142, front + 0.095, 12);
    g.add(tip);
    const grip = cyl(0.009, 0.009, 0.05, mats.rubber(), sx + s * 0.022, bodyY0 + bodyH * 0.45, front + 0.08, 12);
    grip.rotation.x = 0.35;
    g.add(grip);
  }
  g.add(
    tubePath(
      [
        [0, bodyY0 + bodyH * 0.42, front + 0.005],
        [0, bodyY0 + bodyH * 0.4, front + 0.05],
        [0, bodyY0 + bodyH * 0.18, front + 0.06],
      ],
      0.005,
      M.chrome(),
    ),
  );

  // Máy xay on-demand bên cạnh (nếu còn chỗ)
  const grinder = buildGrinder();
  grinder.position.set(w / 2 + 0.13, 0, bodyZ);
  g.add(grinder);
  // Gộp ~100 chi tiết theo vật liệu dùng chung → vài draw call / máy (ly & hạt cà phê vẫn instanced)
  return mergeStaticGroup(g);
}

const screenMat = () => sharedMat('esp:screen', () => new THREE.MeshBasicMaterial({ map: screenTex(), toneMapped: false }));

/** Máy xay on-demand: thân đúc, phễu kính chứa hạt cà phê, núm chỉnh độ mịn, ngàm giữ tay pha */
const BEAN_COUNT = 150;
let beanGeo: THREE.BufferGeometry | null = null;
function beanGeometry(): THREE.BufferGeometry {
  if (!beanGeo) {
    beanGeo = new THREE.IcosahedronGeometry(0.0068, 0);
    beanGeo.scale(1, 0.7, 1.35);
  }
  return beanGeo;
}

export function buildGrinder(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = mats.bodyPaint('#1f2328');
  g.add(box(0.17, 0.02, 0.24, mats.rubber(), 0, 0.01, 0, 0.006));
  g.add(box(0.16, 0.33, 0.2, bodyMat, 0, 0.185, -0.01, 0.025));
  g.add(box(0.14, 0.04, 0.17, M.chrome(), 0, 0.37, -0.01, 0.01)); // cổ đầu xay
  // Núm chỉnh vô cấp
  const dial = cyl(0.04, 0.04, 0.02, M.chrome(), 0.085, 0.36, -0.01, 32);
  dial.rotation.z = Math.PI / 2;
  g.add(dial);
  // Phễu kính + hạt cà phê
  const hopper = lathe([[0.03, 0], [0.04, 0], [0.085, 0.17], [0.083, 0.17], [0.038, 0.004], [0.03, 0.004]], M.glass(), 32);
  hopper.position.set(0, 0.39, -0.01);
  g.add(hopper);
  g.add(cyl(0.088, 0.088, 0.018, M.black(), 0, 0.57, -0.01, 32)); // nắp
  // Hạt nhỏ sau kính: khối 20 mặt dùng chung (20 tam giác/hạt thay vì 80), 150 hạt — nhìn vẫn đầy phễu
  const beans = new THREE.InstancedMesh(beanGeometry(), mats.bean(), BEAN_COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < BEAN_COUNT; i++) {
    const y = rnd() * 0.12;
    const rMax = 0.036 + (y / 0.17) * 0.045;
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * rMax;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(a) * rr, 0.395 + y, -0.01 + Math.sin(a) * rr), q, new THREE.Vector3(1, 1, 1));
    beans.setMatrixAt(i, m);
  }
  beans.userData = { noMerge: true, shared: true };
  g.add(beans);
  // Ngàm giữ tay pha + nút xay + màn hình nhỏ
  for (const s of [-1, 1]) g.add(box(0.012, 0.012, 0.07, M.chrome(), s * 0.035, 0.2, 0.12, 0.004));
  const grindBtn = cyl(0.012, 0.012, 0.01, M.chrome(), 0, 0.26, 0.095, 16);
  grindBtn.rotation.x = Math.PI / 2;
  g.add(grindBtn);
  g.add(plane(0.06, 0.03, screenMat(), 0, 0.3, 0.091));
  return g;
}
