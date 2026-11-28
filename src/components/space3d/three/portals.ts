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
    const white = M.paint('#f4f5f7', 0.6);
    const fx = -6.6; // mặt tiền nằm sau đường
    g.add(box(16, 6.5, 0.3, white, 0, 3.25, fx));
    const glass = sharedMat('portal:glass', () => new THREE.MeshStandardMaterial({ color: '#9cc3e4', metalness: 0.4, roughness: 0.08, emissive: '#253a52', emissiveIntensity: 0.25 }));
    for (const x of [-5, -1.7, 1.7, 5]) g.add(box(3, 3.6, 0.05, glass, x, 1.95, fx + 0.18));
    for (const x of [-6.6, -3.35, 0, 3.35, 6.6]) g.add(box(0.12, 3.7, 0.08, alu(), x, 1.95, fx + 0.2));
    const brand = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.1),
      sharedMat('portal:brand', () => new THREE.MeshStandardMaterial({ map: signTexture('TIM CORP', 'SHOWROOM THIẾT BỊ F&B', '#ffffff', '#1e3a8a'), roughness: 0.4 })),
    );
    brand.position.set(0, 4.9, fx + 0.17);
    g.add(brand);
    // Logo tam giác TIM Corp cạnh biển tên (texture tải nền, không chặn dựng cảnh)
    const logoMat = sharedMat('portal:logo', () => {
      const tex = new THREE.TextureLoader().load('/logo-3d.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4 });
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), logoMat);
    logo.position.set(-3.4, 4.9, fx + 0.18);
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
    for (const x of [-6.6, 6.6]) g.add(box(0.18, 0.1, 0.12, M.glow('#fff2d6', 0.6, 2.6), x, 3.4, fx + 0.22));
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
