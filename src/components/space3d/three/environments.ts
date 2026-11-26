import * as THREE from 'three';
import { createOutdoorTree } from './hall';
import { createGrassTexture, lightboxMat, registerEmissive, sharedMat } from './materials';
import { M, box, cyl } from './props/kit';
import { brickTex, labelTex } from './props/textures';

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
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
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
