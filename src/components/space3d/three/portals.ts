import * as THREE from 'three';
import { M, box, cyl } from './props/kit';
import { sharedMat } from './materials';

export * from '@/lib/space-3d-portals';
import type { ScenePortal } from '@/lib/space-3d-portals';

const alu = () => sharedMat('alu', () => new THREE.MeshStandardMaterial({ color: '#d7dde5', metalness: 0.9, roughness: 0.26 }));

function signTexture(text: string, sub: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 54px "Segoe UI", Arial, sans-serif';
  ctx.fillText(text, 256, 66);
  ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(sub, 256, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Mũi tên dẫn đường vẽ trên nền (phát sáng nhẹ, canvas nhấp nháy) */
function floorArrows(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  for (const y of [40, 130]) {
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(112, y + 60);
    ctx.lineTo(84, y + 60);
    ctx.lineTo(64, y + 32);
    ctx.lineTo(44, y + 60);
    ctx.lineTo(16, y + 60);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: t, color: '#fbbf24', transparent: true, opacity: 0.75, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), mat);
  m.rotation.x = -Math.PI / 2;
  m.userData = { portalArrow: true, noAO: true };
  return m;
}

/**
 * Dựng cổng nối + khung cảnh bên kia. Gốc = tâm cổng trên mặt tường, +Z cục bộ = hướng vào trong cảnh.
 */
/** Tôn sóng panel nhà xưởng (dọc), lặp theo chiều dài */
function ribMat(key: string, repeat: number, color = '#e6e9ed') {
  return sharedMat(`portal:rib:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(120,132,146,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0.1)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 16, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(repeat, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.25 });
  });
}

/**
 * Khối nhà xưởng Showroom nhìn từ quán (đúng tỉ lệ sảnh: hông dài 36m, sâu 38m, tường 6.4m, nóc 9.8m):
 * tường hông panel + chân bê tông + dải cửa sổ, góc nhà & đầu hồi phía trước, mái dốc. Lối vào ở x = 0 (cổng).
 * Gốc: mặt tường tại z = fx; khối kéo dài về −Z (xa quán). Bên phải (+X) là mặt tiền showroom.
 */
function showroomBlock(fx: number): THREE.Group {
  const g = new THREE.Group();
  const L0 = -28.2; // đầu hậu
  const L1 = 7.8; // góc mặt tiền
  const len = L1 - L0;
  const mid = (L0 + L1) / 2;
  const depth = 38;
  const eave = 6.4;
  const ridge = 9.8;
  const plinth = M.paint('#8b929b', 0.85);
  const bandMat = sharedMat('portal:band', () => new THREE.MeshStandardMaterial({ color: '#cfe1f2', emissive: '#b8d4ee', emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.3 }));
  // Tường hông (hai đoạn chừa ô kính lối vào ±2.4m)
  for (const [a, b] of [[L0, -2.4], [2.4, L1]] as [number, number][]) {
    const l = b - a;
    const m = (a + b) / 2;
    g.add(box(l, 0.6, 0.34, plinth, m, 0.3, fx));
    g.add(box(l, 3.9, 0.3, ribMat('side', Math.round(l / 1.2)), m, 0.6 + 1.95, fx));
  }
  g.add(box(4.8, 1.9, 0.3, ribMat('head', 4), 0, 4.45 + 0.5, fx)); // dầm trên ô kính
  g.add(box(len, 1.4, 0.06, bandMat, mid, 5.2, fx + 0.02)); // dải cửa sổ lấy sáng
  for (let x = L0; x <= L1 + 0.01; x += 3) g.add(box(0.08, 1.4, 0.1, alu(), x, 5.2, fx + 0.06));
  g.add(box(len, 0.5, 0.3, ribMat('top', Math.round(len / 1.2)), mid, 6.15, fx));
  // Cột góc & diềm mái
  g.add(box(0.45, eave, 0.45, M.paint('#9aa3ad', 0.5), L1, eave / 2, fx));
  g.add(box(len + 1.2, 0.35, 0.2, M.paint('#475569', 0.5), mid, eave + 0.1, fx + 0.35));
  // Đầu hồi mặt tiền (vuông góc, kéo về phía xa) + tam giác hồi
  g.add(box(0.3, eave, depth, ribMat('end', Math.round(depth / 1.2)), L1, eave / 2, fx - depth / 2));
  const tri = new THREE.Shape();
  tri.moveTo(0, 0);
  tri.lineTo(depth, 0);
  tri.lineTo(depth / 2, ridge - eave);
  tri.lineTo(0, 0);
  const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), sharedMat('portal:gable', () => new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.65, side: THREE.DoubleSide })));
  gable.rotation.y = Math.PI / 2;
  gable.position.set(L1 + 0.16, eave, fx);
  g.add(gable);
  // Mái dốc: tấm gần (lên nóc) + tấm xa
  const run = depth / 2 + 1;
  const rise = ridge - eave;
  const slope = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  const roofMat = sharedMat('portal:roof', () => new THREE.MeshStandardMaterial({ color: '#6b7380', roughness: 0.55, metalness: 0.4 }));
  for (const s of [1, -1]) {
    const r = box(len + 1.2, 0.14, slope, roofMat, mid, eave + rise / 2 + 0.1, fx - depth / 2 + (s * (depth / 2 + 1)) / 2);
    r.rotation.x = s * ang;
    g.add(r);
  }
  g.traverse((o) => {
    o.userData.noAO = true;
  });
  return g;
}

export function buildPortal(p: ScenePortal): THREE.Group {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.inward;
  const w = p.width;
  if (p.target === 'SHOWROOM') {
    // Khung cổng sắt sơn đen + bảng chỉ dẫn xanh TIM
    const steel = M.paint('#1f2328', 0.5);
    for (const s of [-1, 1]) g.add(box(0.1, 2.5, 0.1, steel, (s * w) / 2, 1.25, 0));
    g.add(box(w + 0.1, 0.1, 0.1, steel, 0, 2.5, 0));
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.5),
      sharedMat('portal:sign:show', () => new THREE.MeshStandardMaterial({ map: signTexture('→ SHOWROOM', 'TIM Corp · Thiết bị F&B', '#1e3a8a', '#ffffff'), roughness: 0.5 })),
    );
    sign.position.set(0, 2.85, 0.06);
    g.add(box(1.7, 0.58, 0.04, steel, 0, 2.85, 0.02), sign);
    // Lối đá dẫn ra ngoài
    const slab = sharedMat('portal:slab', () => new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.85 }));
    for (let i = 0; i < 5; i++) {
      const s = cyl(0.3, 0.32, 0.04, slab, (i % 2 ? 0.1 : -0.1), 0.02, 0.9 - i * 0.75, 8);
      s.castShadow = false;
      g.add(s);
    }
    // Bên kia: đường nội bộ + mặt tiền showroom kính, biển TIM CORP
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), sharedMat('portal:road', () => new THREE.MeshStandardMaterial({ color: '#5b5f66', roughness: 0.95 })));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.005, -3.2);
    road.receiveShadow = true;
    g.add(road);
    const fx = -6.6; // mặt tiền nằm sau đường
    g.add(showroomBlock(fx));
    const glass = sharedMat('portal:glass', () => new THREE.MeshStandardMaterial({ color: '#9cc3e4', metalness: 0.4, roughness: 0.08, emissive: '#253a52', emissiveIntensity: 0.25 }));
    // Ô kính trước lối đi (khớp ô kính tường trái bên trong showroom)
    g.add(box(4.8, 4.2, 0.05, glass, 0, 2.35, fx + 0.18));
    for (const x of [-2.4, -1.2, 1.2, 2.4]) g.add(box(0.1, 4.3, 0.08, alu(), x, 2.35, fx + 0.2));
    const brand = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.1),
      sharedMat('portal:brand', () => new THREE.MeshStandardMaterial({ map: signTexture('TIM CORP', 'SHOWROOM THIẾT BỊ F&B', '#ffffff', '#1e3a8a'), roughness: 0.4 })),
    );
    brand.position.set(0, 5.35, fx + 0.17);
    g.add(brand);
    // Logo tam giác TIM Corp cạnh biển tên (texture tải nền, không chặn dựng cảnh)
    const logoMat = sharedMat('portal:logo', () => {
      const tex = new THREE.TextureLoader().load('/logo-3d.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4 });
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), logoMat);
    logo.position.set(-3.4, 5.35, fx + 0.18);
    g.add(logo);
    // Mái hiên kính khung thép trên lối vào + cửa kính đôi + thảm chùi chân
    const steelDark = M.paint('#2a2f36', 0.45);
    g.add(box(5.2, 0.08, 1.6, steelDark, 0, 3.75, fx + 0.95));
    const canopyGlass = sharedMat('portal:canopy', () => new THREE.MeshStandardMaterial({ color: '#cfe3f3', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    g.add(box(5.0, 0.02, 1.5, canopyGlass, 0, 3.8, fx + 0.95));
    for (const sx of [-2.4, 2.4]) {
      const rod = box(0.04, 0.04, 1.9, steelDark, sx, 4.3, fx + 0.75);
      rod.rotation.x = -0.55;
      g.add(rod);
    }
    for (const sx of [-0.62, 0.62]) {
      g.add(box(1.2, 2.5, 0.05, glass, sx, 1.27, fx + 0.22));
      g.add(box(0.05, 0.5, 0.06, M.chrome(), sx > 0 ? 0.1 : -0.1, 1.2, fx + 0.28));
    }
    g.add(box(2.6, 0.08, 0.1, alu(), 0, 2.55, fx + 0.22));
    g.add(box(2.4, 0.015, 1.2, M.paint('#3a3a3a', 0.95), 0, 0.01, fx + 0.9));
    // Chậu cây cao hai bên cửa + đèn hắt tường
    const pot = M.paint('#1f2937', 0.6);
    const leaf = sharedMat('portal:leaf', () => new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.6 }));
    for (const sx of [-1.9, 1.9]) {
      g.add(cyl(0.28, 0.22, 0.7, pot, sx, 0.35, fx + 0.6, 16));
      for (let k = 0; k < 3; k++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 - k * 0.07, 1), leaf);
        bush.position.set(sx + (k - 1) * 0.08, 0.95 + k * 0.38, fx + 0.6);
        g.add(bush);
      }
    }
    for (const x of [-6.6, 6.6]) g.add(box(0.18, 0.1, 0.12, M.glow('#fff2d6', 0.6, 2.6), x, 3.4, fx + 0.32));
  } else {
    // Cửa kính khung nhôm trên tường kính + bảng chỉ dẫn gỗ kiểu quán
    for (const s of [-1, 1]) g.add(box(0.1, 2.6, 0.12, alu(), (s * w) / 2, 1.3, 0));
    g.add(box(w + 0.1, 0.12, 0.12, alu(), 0, 2.6, 0));
    const wood = M.wood('#8a5a35');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.5),
      sharedMat('portal:sign:cafe', () => new THREE.MeshStandardMaterial({ map: signTexture('→ XỞI LỞI', 'Quán cà phê sân vườn', '#3b2414', '#fde68a'), roughness: 0.7 })),
    );
    sign.position.set(0, 2.98, 0.08);
    g.add(box(1.8, 0.58, 0.05, wood, 0, 2.98, 0.04), sign);
    // Bên ngoài: lối gạch qua bãi cỏ tới cổng gỗ quán + hàng rào + dây đèn
    const brick = sharedMat('portal:brick', () => new THREE.MeshStandardMaterial({ color: '#a7765a', roughness: 0.9 }));
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2, 7), brick);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, -0.03, -3.6);
    path.receiveShadow = true;
    g.add(path);
    const gz = -7.2;
    for (const s of [-1, 1]) g.add(box(0.22, 3, 0.22, wood, s * 1.5, 1.5, gz));
    g.add(box(3.6, 0.22, 0.26, wood, 0, 3.05, gz));
    const cafeSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.7),
      sharedMat('portal:cafeSign', () => new THREE.MeshStandardMaterial({ map: signTexture('Xởi Lởi', 'Xởi lởi trời cho', '#f5ecd7', '#7c2d12'), roughness: 0.8 })),
    );
    cafeSign.position.set(0, 3.55, gz + 0.02);
    g.add(box(2.8, 0.8, 0.06, wood, 0, 3.55, gz - 0.02), cafeSign);
    const fence = M.paint('#7f7a70', 0.92);
    for (const s of [-1, 1]) {
      for (const y of [0.4, 1.6]) g.add(box(5, 0.07, 0.04, fence, s * 4.2, y, gz));
      for (let x = 1.75; x < 6.7; x += 0.15) g.add(box(0.11, 2, 0.025, fence, s * x, 1, gz));
    }
    const bulb = M.glow('#ffd58a', 0.8, 3.5);
    for (let x = -1.4; x <= 1.4; x += 0.35) g.add(cyl(0.03, 0.03, 0.05, bulb, x, 2.85 - Math.sin(((x + 1.4) / 2.8) * Math.PI) * 0.18, gz + 0.15, 8));
  }
  const arrows = floorArrows();
  arrows.position.set(0, 0.03, p.reach + 0.6);
  // Mũi tên vẽ hướng lên đầu ảnh = -Z cục bộ → chỉ thẳng ra cổng
  g.add(arrows);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.portalArrow) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}
