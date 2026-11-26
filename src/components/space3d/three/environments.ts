import * as THREE from 'three';
import { createOutdoorTree } from './hall';
import { createGrassTexture, lightboxMat, registerEmissive, sharedMat } from './materials';
import { M, box, cyl } from './props/kit';
import { brickBumpTex, brickTex, labelTex } from './props/textures';

/**
 * Môi trường kiến trúc cho Quán cà phê & Văn phòng (Showroom/Kho dùng hall.ts).
 * Mặt trước (lối vào) ở phía +Z. Trả về group + đèn nội thất ấm (không đổ bóng, rẻ).
 */

function outdoor(w: number, d: number, env: THREE.Group) {
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    sharedMat('lawn', () => new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 0.95 })),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  lawn.receiveShadow = true;
  env.add(lawn);
  // Vỉa hè + đường phố trước mặt tiền
  const walk = box(w + 10, 0.06, d + 10, M.paint('#cfd4da', 0.85), 0, -0.042, 0);
  walk.castShadow = false;
  env.add(walk);
  const road = box(w + 60, 0.02, 7, M.paint('#3a3d42', 0.9), 0, -0.04, d / 2 + 9);
  road.castShadow = false;
  env.add(road);
  for (let x = -w / 2 - 20; x < w / 2 + 20; x += 4) env.add(box(2, 0.022, 0.15, M.paint('#f8fafc', 0.6), x, -0.028, d / 2 + 9));
  const trees: [number, number, number][] = [
    [-w / 2 - 4, d / 2 + 4, 1.2], [w / 2 + 4, d / 2 + 4, 1.3], [-w / 2 - 5, -d / 4, 1.25], [w / 2 + 5, -d / 4, 1.15], [0, -d / 2 - 6, 1.4],
  ];
  for (const [x, z, s] of trees) {
    const t = createOutdoorTree(s);
    t.position.set(x, 0, z);
    env.add(t);
  }
}

function warmLight(env: THREE.Group, lights: THREE.Light[], x: number, y: number, z: number, intensity: number, color = '#ffd8a8', distance = 11) {
  const l = new THREE.PointLight(color, intensity, distance, 1.6);
  l.position.set(x, y, z);
  env.add(l);
  lights.push(l);
}

function perimeter(w: number, d: number, h: number, wallMat: THREE.Material, env: THREE.Group, storefront: boolean) {
  const t = 0.2;
  const back = box(w + t * 2, h, t, wallMat, 0, h / 2, -d / 2 - t / 2);
  back.userData.occluder = true;
  env.add(back);
  for (const s of [-1, 1]) {
    const side = box(t, h, d, wallMat, s * (w / 2 + t / 2), h / 2, 0);
    side.userData.occluder = true;
    env.add(side);
  }
  if (storefront) {
    // Mặt tiền kính khung đen + cửa đi ở giữa
    const glass = box(w, h - 0.5, 0.04, M.glass(), 0, (h - 0.5) / 2 + 0.25, d / 2);
    glass.castShadow = false;
    glass.userData.occluder = true;
    env.add(glass);
    const frame = M.metal('#111111', 0.45);
    env.add(box(w + t * 2, 0.25, t, wallMat, 0, 0.125, d / 2));
    env.add(box(w + t * 2, 0.5, t, wallMat, 0, h - 0.25, d / 2));
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) env.add(box(0.06, h - 0.5, 0.08, frame, x, (h - 0.5) / 2 + 0.25, d / 2));
  } else {
    const front = box(w + t * 2, h, t, wallMat, 0, h / 2, d / 2 + t / 2);
    front.userData.occluder = true;
    env.add(front);
  }
}

export function createCafeEnvironment(widthM: number, depthM: number, companyName: string): { group: THREE.Group; lights: THREE.Light[] } {
  const env = new THREE.Group();
  const lights: THREE.Light[] = [];
  const w = widthM;
  const d = depthM;
  const h = 3.8;
  outdoor(w, d, env);
  const brick = sharedMat(`cafeBrick:${w}`, () => {
    const t = brickTex().clone();
    t.repeat.set(w / 1.8, h / 1.8);
    t.needsUpdate = true;
    const b = brickBumpTex().clone();
    b.repeat.copy(t.repeat);
    b.needsUpdate = true;
    // Mạch vữa lõm thật (bump) → ánh đèn hắt lên tường gạch có chiều sâu
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: b, bumpScale: 2.2, roughness: 0.95 });
  });
  perimeter(w, d, h, brick, env, true);
  // Mảng tường xanh rêu ốp gỗ phía sau quầy (điểm nhấn)
  const accent = box(w * 0.45, h - 0.4, 0.04, M.paint('#2f4f3a', 0.85), -w * 0.2, (h - 0.4) / 2 + 0.2, -d / 2 + 0.03);
  env.add(accent);
  // Bảng hiệu neon tên quán
  const sign = labelTex(
    [
      { text: (companyName || 'TIM').toUpperCase().slice(0, 18) + ' CAFÉ', size: 110, color: '#ffe8b0', weight: 800, y: 210 },
      { text: 'SPECIALTY COFFEE · SINCE 2026', size: 46, color: '#fcd34d', weight: 600, y: 330 },
    ],
    '#1a1410',
    1400,
    480,
  );
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), lightboxMat(sign));
  plaque.position.set(-w * 0.2, h * 0.68, -d / 2 + 0.06);
  env.add(plaque);
  const front = plaque.clone();
  front.position.set(0, h + 0.55, d / 2 + 0.12);
  env.add(front);
  // Trần đen lộ dầm + ống gió (phong cách industrial)
  const ceiling = box(w + 0.4, 0.12, d + 0.4, M.paint('#1b1b1d', 0.9), 0, h + 0.06, 0);
  ceiling.castShadow = false; ceiling.userData.roof = true;
  env.add(ceiling);
  for (let z = -d / 2 + 1.5; z < d / 2; z += 3) {
    const beam = box(w, 0.28, 0.16, M.paint('#222224', 0.8), 0, h - 0.14, z);
    beam.castShadow = false; beam.userData.roof = true;
    env.add(beam);
  }
  for (const x of [-w * 0.28, w * 0.28]) {
    const duct = cyl(0.22, 0.22, d - 0.6, M.metal('#9ca3af', 0.45), x, h - 0.45, 0, 20);
    duct.rotation.x = Math.PI / 2;
    duct.castShadow = false; duct.userData.roof = true;
    env.add(duct);
  }
  // Đèn ấm khắp quán (không đổ bóng)
  for (let x = -w / 2 + 3; x < w / 2; x += 6) for (let z = -d / 2 + 3; z < d / 2; z += 6) warmLight(env, lights, x, h - 0.6, z, 9);
  return { group: env, lights };
}

export function createOfficeEnvironment(widthM: number, depthM: number, companyName: string): { group: THREE.Group; lights: THREE.Light[] } {
  const env = new THREE.Group();
  const lights: THREE.Light[] = [];
  const w = widthM;
  const d = depthM;
  const h = 3.2;
  outdoor(w, d, env);
  const wall = M.paint('#f3f4f6', 0.85);
  perimeter(w, d, h, wall, env, true);
  // Dải cửa sổ dọc 2 bên hông
  for (const s of [-1, 1]) {
    for (let z = -d / 2 + 2; z < d / 2 - 1; z += 3) {
      const win = box(0.05, 1.6, 2.2, M.glass(), s * (w / 2 + 0.11), 1.7, z);
      win.castShadow = false;
      env.add(win);
    }
  }
  // Trần thạch cao + đèn panel âm trần
  const ceiling = box(w + 0.4, 0.06, d + 0.4, M.paint('#fafafa', 0.95), 0, h + 0.03, 0);
  ceiling.castShadow = false; ceiling.userData.roof = true;
  env.add(ceiling);
  const panelMat = sharedMat('officePanel', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f5f7ff', emissiveIntensity: 1.1 });
    registerEmissive({ mat: m, day: 1.1, night: 2.4, mode: 'emissive' });
    return m;
  });
  for (let x = -w / 2 + 2; x < w / 2 - 1; x += 3.6) {
    for (let z = -d / 2 + 2; z < d / 2 - 1; z += 3.6) {
      const p = box(0.6, 0.02, 1.2, panelMat, x, h - 0.01, z);
      p.castShadow = false; p.userData.roof = true;
      env.add(p);
    }
  }
  // Logo công ty trên tường sau
  const logo = labelTex(
    [
      { text: (companyName || 'TIM CORP').toUpperCase().slice(0, 26), size: 100, color: '#1e3a8a', weight: 800, y: 200 },
      { text: 'VĂN PHÒNG LÀM VIỆC', size: 44, color: '#475569', weight: 600, y: 320 },
    ],
    '#f3f4f6',
    1600,
    460,
  );
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.26), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.6 }));
  plaque.position.set(0, 2.1, -d / 2 + 0.02);
  env.add(plaque);
  for (let x = -w / 2 + 4; x < w / 2; x += 8) for (let z = -d / 2 + 4; z < d / 2; z += 8) warmLight(env, lights, x, h - 0.4, z, 6, '#f1f5ff', 12);
  return { group: env, lights };
}

// ───────────────────────── Nhà kho công nghiệp ─────────────────────────

function corrugatedTex(key: string, base: string, rib: string, horizontal = false, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  return sharedTexture(`corr:${key}:${repeat.join('x')}`, () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    // Sóng tôn: dải sáng/tối xen kẽ tạo cảm giác gờ nổi
    for (let i = 0; i < 16; i++) {
      const p = i * 16;
      const g = horizontal ? ctx.createLinearGradient(0, p, 0, p + 16) : ctx.createLinearGradient(p, 0, p + 16, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.35, rib);
      g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0.1)');
      ctx.fillStyle = g;
      if (horizontal) ctx.fillRect(0, p, 256, 16);
      else ctx.fillRect(p, 0, 16, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    return t;
  });
}

const texCache = new Map<string, THREE.CanvasTexture>();
function sharedTexture(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = make();
  texCache.set(key, t);
  return t;
}

/** Sọc vàng–đen cảnh báo (ốp chân cột, mép dock) */
function hazardMat(): THREE.Material {
  return sharedMat('hazard', () => {
    const t = sharedTexture('hazardTex', () => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#111111';
      for (let i = -128; i < 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 16, 0);
        ctx.lineTo(i + 16 + 128, 128);
        ctx.lineTo(i + 128, 128);
        ctx.fill();
      }
      const tt = new THREE.CanvasTexture(c);
      tt.wrapS = THREE.RepeatWrapping;
      tt.wrapT = THREE.RepeatWrapping;
      tt.colorSpace = THREE.SRGBColorSpace;
      return tt;
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  });
}

/** Cột / kèo thép chữ I */
function iBeam(len: number, depth: number, mat: THREE.Material, vertical: boolean): THREE.Group {
  const g = new THREE.Group();
  const fl = depth * 0.55;
  const t = depth * 0.08;
  if (vertical) {
    g.add(box(fl, len, t, mat, 0, len / 2, depth / 2 - t / 2));
    g.add(box(fl, len, t, mat, 0, len / 2, -depth / 2 + t / 2));
    g.add(box(t, len, depth - 2 * t, mat, 0, len / 2, 0));
  } else {
    g.add(box(len, t, fl, mat, 0, depth / 2 - t / 2, 0));
    g.add(box(len, t, fl, mat, 0, -depth / 2 + t / 2, 0));
    g.add(box(len, depth - 2 * t, t, mat, 0, 0, 0));
  }
  g.traverse((c) => (c.castShadow = true));
  return g;
}

export function createWarehouseEnvironment(widthM: number, depthM: number, companyName: string): { group: THREE.Group; lights: THREE.Light[] } {
  const env = new THREE.Group();
  const lights: THREE.Light[] = [];
  const w = widthM;
  const d = depthM;
  const halfW = w / 2;
  const halfD = d / 2;
  const eave = 8.5;
  const ridge = eave + w * 0.07; // mái dốc thấp ~8°
  outdoor(w, d, env);

  // Sân bê tông bao quanh + vạch đỗ xe tải trước dock
  const apron = box(w + 16, 0.05, d + 20, M.paint('#b8bcc2', 0.92), 0, -0.035, 4);
  apron.castShadow = false;
  env.add(apron);

  const steel = M.paint('#3b5b8c', 0.45);
  const wallTex = corrugatedTex('wall', '#d7dde4', 'rgba(120,135,150,0.35)', false, [w / 2.4, 1]);
  const wallMat = sharedMat(`whWall:${w}`, () => new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.55, metalness: 0.35 }));
  const sideTex = corrugatedTex('side', '#d7dde4', 'rgba(120,135,150,0.35)', false, [d / 2.4, 1]);
  const sideMat = sharedMat(`whSide:${d}`, () => new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55, metalness: 0.35 }));
  const t = 0.15;
  // Tường hông & tường hồi (để chừa dải cửa sổ lấy sáng phía trên)
  const winBand = 1.1;
  const wallH = eave - winBand - 0.6;
  for (const s of [-1, 1]) {
    const side = box(t, wallH, d, sideMat, s * (halfW + t / 2), wallH / 2, 0);
    side.userData.occluder = true;
    env.add(side);
    const top = box(t, 0.6, d, sideMat, s * (halfW + t / 2), eave - 0.3, 0);
    env.add(top);
    const win = box(0.04, winBand, d - 0.4, M.glow('#dff1ff', 0.55, 0.12), s * (halfW + 0.02), wallH + winBand / 2, 0);
    win.castShadow = false;
    env.add(win);
  }
  const back = box(w + t * 2, eave, t, wallMat, 0, eave / 2, -halfD - t / 2);
  back.userData.occluder = true;
  env.add(back);
  // Tam giác hồi trên tường sau / trước
  const gable = new THREE.Shape();
  gable.moveTo(-halfW - t, 0);
  gable.lineTo(halfW + t, 0);
  gable.lineTo(0, ridge - eave);
  gable.lineTo(-halfW - t, 0);
  for (const z of [-halfD - t / 2, halfD + t / 2]) {
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: t, bevelEnabled: false }), M.paint('#cfd6de', 0.6));
    tri.position.set(0, eave, z - t / 2);
    tri.castShadow = true;
    env.add(tri);
  }

  // Mặt tiền (+Z): 2 cửa cuốn + cửa đi bộ, phần tường còn lại
  const doorW = 4.2;
  const doorH = 5;
  const doorXs = [-halfW * 0.45, halfW * 0.45];
  const frontSegs: [number, number][] = [];
  let cursor = -halfW;
  for (const x of doorXs) {
    frontSegs.push([cursor, x - doorW / 2]);
    cursor = x + doorW / 2;
  }
  frontSegs.push([cursor, halfW]);
  for (const [a, b] of frontSegs) {
    const seg = box(b - a, eave, t, wallMat, (a + b) / 2, eave / 2, halfD + t / 2);
    seg.userData.occluder = true;
    env.add(seg);
  }
  const shutterTex = corrugatedTex('shutter', '#9aa3ad', 'rgba(60,70,80,0.45)', true, [1, 6]);
  const shutterMat = sharedMat('whShutter', () => new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.45, metalness: 0.6 }));
  doorXs.forEach((x, i) => {
    env.add(box(doorW, eave - doorH, t, wallMat, x, doorH + (eave - doorH) / 2, halfD + t / 2));
    const open = i === 0 ? 0.55 : 0.05; // cửa trái mở hé để nhìn vào kho
    const sh = box(doorW - 0.1, doorH * (1 - open), 0.06, shutterMat, x, doorH - (doorH * (1 - open)) / 2, halfD + 0.05);
    sh.userData.occluder = true;
    env.add(sh);
    env.add(box(doorW + 0.3, 0.45, 0.4, M.paint('#4b5563', 0.5), x, doorH + 0.25, halfD + 0.22)); // hộp cuốn
    for (const sx of [-1, 1]) env.add(box(0.12, doorH, 0.16, hazardMat(), x + sx * (doorW / 2 + 0.06), doorH / 2, halfD + 0.12)); // ray dẫn sơn cảnh báo
    // Sàn dock + đệm cao su + mái che
    env.add(box(doorW + 1, 1.2, 2.2, M.paint('#9ca3af', 0.85), x, -0.6 + 0.02, halfD + 1.25));
    for (const sx of [-1, 1]) env.add(box(0.25, 0.45, 0.22, M.paint('#111111', 0.9), x + sx * (doorW / 2 - 0.4), 0.85, halfD + 2.4));
    env.add(box(doorW + 1.6, 0.12, 2.2, M.paint('#334155', 0.5), x, doorH + 0.9, halfD + 1.1));
    // Cọc chắn vàng
    for (const sx of [-1, 1]) {
      const bol = cyl(0.09, 0.09, 1.1, M.paint('#facc15', 0.5), x + sx * (doorW / 2 + 0.7), 0.55, halfD + 0.6, 16);
      env.add(bol);
    }
  });
  // Cửa đi bộ + biển tên công ty trên mặt tiền
  env.add(box(1.0, 2.2, 0.08, M.paint('#334155', 0.4), 0, 1.1, halfD + 0.09));
  const sign = labelTex(
    [
      { text: (companyName || 'TIM CORP').toUpperCase().slice(0, 26), size: 110, color: '#ffffff', weight: 800, y: 150 },
      { text: 'KHO HÀNG & TRUNG TÂM PHÂN PHỐI', size: 50, color: '#bfdbfe', weight: 600, y: 270 },
    ],
    '#1d3f91',
    1600,
    360,
  );
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(9, w * 0.3), Math.min(9, w * 0.3) * 0.225), lightboxMat(sign));
  plaque.position.set(0, eave - 1.2, halfD + t + 0.02);
  env.add(plaque);

  // Khung thép tiền chế: cột chữ I dọc tường + kèo mái mỗi 6m, xà gồ, dải tấm lấy sáng
  const bays = Math.max(3, Math.round(d / 6));
  const rafterLen = Math.hypot(halfW, ridge - eave);
  const pitch = Math.atan2(ridge - eave, halfW);
  for (let i = 0; i <= bays; i++) {
    const z = -halfD + (d / bays) * i;
    for (const s of [-1, 1]) {
      const col = iBeam(eave, 0.45, steel, true);
      col.position.set(s * (halfW - 0.25), 0, z);
      col.traverse((c) => (c.userData.occluder = true));
      env.add(col);
      // Ốp chống va chân cột + bình chữa cháy
      env.add(box(0.62, 1.1, 0.62, hazardMat(), s * (halfW - 0.25), 0.55, z));
      if (i % 2 === 1) {
        const ext = cyl(0.08, 0.08, 0.5, M.paint('#dc2626', 0.35), s * (halfW - 0.62), 1.45, z, 16);
        env.add(ext);
      }
      const raf = iBeam(rafterLen, 0.55, steel, false);
      raf.position.set(s * halfW * 0.5, eave + (ridge - eave) / 2, z);
      raf.rotation.z = -s * pitch;
      raf.traverse((c) => (c.userData.roof = true));
      env.add(raf);
    }
  }
  const roofTex = corrugatedTex('roof', '#c4cbd3', 'rgba(110,120,130,0.4)', false, [d / 2, 1]);
  const roofMat = sharedMat(`whRoof:${d}`, () => new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide }));
  const skyMat = sharedMat('whSky', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#eaf6ff', emissive: '#eaf6ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
    registerEmissive({ mat: m, day: 0.8, night: 0.05, mode: 'emissive' });
    return m;
  });
  for (const s of [-1, 1]) {
    const sheet = box(rafterLen + 0.6, 0.06, d + 0.6, roofMat, s * halfW * 0.5, eave + (ridge - eave) / 2 + 0.34, 0);
    sheet.rotation.z = -s * pitch;
    sheet.castShadow = false;
    sheet.userData.roof = true;
    env.add(sheet);
    for (const k of [0.3, 0.7]) {
      const sk = box(1.2, 0.07, d - 1, skyMat, s * halfW * k, eave + (ridge - eave) * (1 - k) + 0.36, 0);
      sk.rotation.z = -s * pitch;
      sk.castShadow = false;
      sk.userData.roof = true;
      env.add(sk);
    }
    // Xà gồ dọc
    for (const k of [0.15, 0.5, 0.85]) {
      const pur = box(0.12, 0.2, d, M.paint('#475569', 0.5), s * halfW * k, eave + (ridge - eave) * (1 - k) + 0.18, 0);
      pur.userData.roof = true;
      env.add(pur);
    }
  }
  // Đèn high-bay tròn treo dưới kèo
  const lamp = sharedMat('whLamp', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff8e7', emissiveIntensity: 1.2 });
    registerEmissive({ mat: m, day: 1.2, night: 3.2, mode: 'emissive' });
    return m;
  });
  for (let i = 0; i < bays; i++) {
    const z = -halfD + (d / bays) * (i + 0.5);
    for (const x of [-halfW * 0.5, 0, halfW * 0.5]) {
      const shade = cyl(0.18, 0.42, 0.35, M.paint('#475569', 0.5), x, eave - 0.6, z, 20);
      shade.userData.roof = true;
      const bulb = cyl(0.38, 0.38, 0.02, lamp, x, eave - 0.78, z, 20);
      bulb.userData.roof = true;
      env.add(shade, bulb);
      warmLight(env, lights, x, eave - 1.2, z, 5, '#fff8e7', 14);
    }
  }

  // Vạch sơn sàn: làn xe nâng (vàng), lối đi bộ (xanh lá), ô tập kết trước cửa (sọc chéo)
  const yellow = M.paint('#eab308', 0.6);
  const green = M.paint('#16a34a', 0.7);
  const line = (x: number, z: number, lw: number, ld: number, mat: THREE.Material) => {
    const m = box(lw, 0.012, ld, mat, x, 0.006, z);
    m.castShadow = false;
    env.add(m);
  };
  for (const s of [-1, 1]) {
    line(s * 2.8, -1, 0.12, d - 8, yellow);
    line(s * (halfW - 1.4), -0.5, 0.1, d - 6, yellow);
  }
  line(0, halfD - 3.5, w - 4, 0.12, yellow);
  line(-halfW + 0.8, 0, 1.2, d - 2, sharedMat('walkway', () => new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8, transparent: true, opacity: 0.55 })));
  void green;
  doorXs.forEach((x) => {
    const zone = box(doorW, 0.012, 2.4, hazardMat(), x, 0.007, halfD - 1.4);
    zone.castShadow = false;
    env.add(zone);
  });

  // Xe tải container đỗ ở dock phải
  const truck = new THREE.Group();
  truck.add(box(2.5, 2.7, 9, M.paint('#e5e7eb', 0.6), 0, 2.25, 0, 0.05)); // thùng container
  truck.add(box(2.4, 0.6, 9.2, M.paint('#1f2937', 0.6), 0, 0.75, 0.1)); // khung gầm
  truck.add(box(2.4, 2.4, 2.2, M.paint('#1d4ed8', 0.35), 0, 1.9, 5.9, 0.15)); // cabin
  truck.add(box(2.2, 0.9, 0.05, M.glass(), 0, 2.4, 7.01));
  for (const z of [-3.2, -2, 5.6]) for (const sx of [-1, 1]) {
    const wheel = cyl(0.5, 0.5, 0.35, M.black(), sx * 1.15, 0.5, z, 24);
    wheel.rotation.z = Math.PI / 2;
    truck.add(wheel);
  }
  truck.position.set(doorXs[1], 0, halfD + 7.4);
  env.add(truck);
  return { group: env, lights };
}
