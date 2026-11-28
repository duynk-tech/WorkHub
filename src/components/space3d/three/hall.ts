import * as THREE from 'three';
import type { SpaceKind, SpaceStructure } from '@/lib/space-3d-types';
import { labelTex } from './props/textures';
import { buildTreeRow } from './props/garden';
import { corrugatedTex } from './environments';
import { campusLayout, showroomRing } from '@/lib/space-3d-tour';
import { M as K, box, cyl } from './props/kit';
import {
  applyWindSway,
  createCarpetTexture,
  createGrassTexture,
  createLightPoolTexture,
  createWoodTexture,
  ledMat,
  lightboxMat,
  registerEmissive,
  sharedMat,
} from './materials';

const M = {
  trunk: () => sharedMat('trunk', () => new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.9 })),
  foliage: (i: number) =>
    sharedMat(`foliage:${i}`, () => {
      const m = new THREE.MeshStandardMaterial({ color: ['#2f8f46', '#3fa556', '#58b96a'][i % 3], roughness: 0.78, flatShading: true });
      applyWindSway(m);
      return m;
    }),
  aluminum: () => sharedMat('alu', () => new THREE.MeshStandardMaterial({ color: '#d7dde5', metalness: 0.9, roughness: 0.26 })),
  steel: () => sharedMat('steel', () => new THREE.MeshStandardMaterial({ color: '#c9d1db', metalness: 0.85, roughness: 0.34 })),
  darkSteel: () => sharedMat('darkSteel', () => new THREE.MeshStandardMaterial({ color: '#2b3442', metalness: 0.7, roughness: 0.38 })),
  whiteGloss: () => sharedMat('whiteGloss', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
  whiteMatte: () => sharedMat('whiteMatte', () => new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.6 })),
  boothDeck: () => sharedMat('boothDeck', () => new THREE.MeshStandardMaterial({ color: '#dfe5ec', roughness: 0.82 })),
  wood: () => sharedMat('wood', () => new THREE.MeshStandardMaterial({ map: createWoodTexture(), roughness: 0.55 })),
  leaf: () => sharedMat('leaf', () => new THREE.MeshStandardMaterial({ color: '#2f9e4f', roughness: 0.7, flatShading: true })),
};

/** Tạo texture vách hậu Lightbox chuyên nghiệp cho Gian hàng Triển lãm Expo. */
export function createExpoBackdropTexture(title: string, subtitle: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // Vẽ ×2 (1536×768) → chữ vách gian hàng sắc nét kể cả khi nhìn xiên / lại gần
  const S = 2;
  canvas.width = 768 * S;
  canvas.height = 384 * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);

  // Nền trắng sạch hiện đại + dải màu thương hiệu
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 768, 384);

  // Header band màu nhấn
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 768, 128);

  // Đường trang trí hình học tinh tế
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(560, 0);
  ctx.lineTo(768, 0);
  ctx.lineTo(768, 128);
  ctx.lineTo(480, 128);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 26), 36, 56);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  ctx.fillText((subtitle || 'EXHIBITION PAVILION').slice(0, 34), 36, 98);

  // Nội dung họa tiết tinh tế phần thân vách
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(36, 158, 696, 188);
  ctx.fillStyle = '#64748b';
  ctx.font = '700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  ctx.fillText('KHU TRƯNG BÀY & TƯ VẤN THIẾT BỊ CHÍNH HÃNG', 60, 210);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  ctx.fillText('Chạm trực tiếp vào thiết bị hoặc gian hàng để xem thông số chi tiết', 60, 252);

  // Accent bar dưới
  ctx.fillStyle = accentColor;
  ctx.fillRect(36, 336, 180, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/** Dựng Gian hàng Triển lãm Hiện đại (Aluminum Truss + Lightbox Wall + LED Plinths + Bàn ghế tư vấn). */
export function createExpoBoothMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = Math.max(3.2, s.heightM);
  const standX = s.posX < 0 ? s.posX + d * 0.5 + 2.1 : s.posX - d * 0.5 - 2.1;

  const boothMeta = { boothId: s.id, standX, standZ: s.posZ, lookX: s.posX, lookZ: s.posZ };
  g.userData = boothMeta;

  // Sàn nâng trải thảm xám sáng bo viền nhôm
  const platform = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), M.boothDeck());
  platform.position.y = 0.05;
  platform.receiveShadow = true;
  platform.userData = boothMeta;
  g.add(platform);

  // Viền nhôm sáng quanh sàn nâng
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08), M.aluminum());
  trim.position.y = 0.04;
  g.add(trim);

  // Vách hậu Lightbox phát sáng hiện đại
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), M.whiteMatte());
  backWall.position.set(0, h * 0.5 + 0.08, -d * 0.5 + 0.1);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  backWall.userData = { ...boothMeta, occluder: true };
  g.add(backWall);

  const lightbox = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.24, h - 0.24),
    lightboxMat(createExpoBackdropTexture(s.label, s.subLabel || '', s.accentColor)),
  );
  lightbox.position.set(0, h * 0.5 + 0.08, -d * 0.5 + 0.2);
  lightbox.userData = boothMeta;
  g.add(lightbox);

  // Khung trụ nhôm Truss 2 bên mặt trước + thanh giàn đèn rọi trên cao
  const aluMat = M.aluminum();
  for (const px of [-w * 0.48, w * 0.48]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), aluMat);
    col.position.set(px, h * 0.5 + 0.08, d * 0.46);
    col.castShadow = true;
    g.add(col);
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.18), aluMat);
  topBeam.position.set(0, h + 0.08, d * 0.46);
  g.add(topBeam);

  // Dải LED nhấn màu thương hiệu trên thanh giàn
  const topLed = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.06, 0.2), ledMat(s.accentColor, 1.4, 2.6));
  topLed.position.set(0, h + 0.18, d * 0.46);
  g.add(topLed);

  // 2 Bục trưng bày máy móc (Display Plinths cao 0.92m) màu trắng mờ viền LED
  const plinthMat = M.whiteGloss();
  for (const bx of [-1.1, 1.1]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.86, 1.05), plinthMat);
    plinth.position.set(bx, 0.48, d * 0.5 - 0.72);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    plinth.userData = boothMeta;
    g.add(plinth);

    const plinthLed = new THREE.Mesh(new THREE.BoxGeometry(1.67, 0.04, 1.07), ledMat(s.accentColor, 1.1, 2.2));
    plinthLed.position.set(bx, 0.88, d * 0.5 - 0.72);
    g.add(plinthLed);
  }

  // Mặt 2 bục là chỗ trưng bày máy thật (không còn bàn / chậu cây trang trí)
  g.userData.shelves = [-1.1, 1.1].map((bx) => ({ x: bx, y: 0.9, z: d * 0.5 - 0.72, width: 1.55, depth: 0.95, clearance: 1.4, facing: 0, single: true, demoMachines: true }));

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng Kệ Kho Công Nghiệp Selective Pallet Rack (kèm pallet gỗ). */
export function createWarehouseRackMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = s.heightM;
  const levels = Math.max(2, Math.min(5, s.levels ?? 3));

  const uprightMat = sharedMat('rackUpright', () => new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.7, roughness: 0.3 }));
  const beamMat = sharedMat('rackBeam', () => new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.55, roughness: 0.35 }));
  const deckMat = sharedMat('rackDeck', () => new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.4 }));
  const palletMat = M.wood();

  const colGeo = new THREE.BoxGeometry(0.11, h, 0.11);
  for (const px of [-w * 0.5 + 0.06, 0, w * 0.5 - 0.06]) {
    for (const pz of [-d * 0.5 + 0.06, d * 0.5 - 0.06]) {
      const col = new THREE.Mesh(colGeo, uprightMat);
      col.position.set(px, h * 0.5, pz);
      col.castShadow = true;
      g.add(col);
    }
  }

  for (let lv = 0; lv < levels; lv++) {
    const y = 0.14 + lv * ((h - 0.5) / levels);
    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, 0.06), beamMat);
    frontBeam.position.set(0, y, d * 0.5 - 0.03);
    const backBeam = frontBeam.clone();
    backBeam.position.z = -d * 0.5 + 0.03;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.04, d - 0.08), deckMat);
    deck.position.set(0, y + 0.02, 0);
    deck.receiveShadow = true;
    deck.castShadow = true;
    g.add(frontBeam, backBeam, deck);

    if (lv === 0) {
      for (const px of [-w * 0.3, 0, w * 0.3]) {
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, d * 0.85), palletMat);
        pallet.position.set(px, y + 0.06, 0);
        g.add(pallet);
      }
    }
  }

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.62, 0.08),
    lightboxMat(createExpoBackdropTexture(s.label, s.aisleCode ? `ZONE ${s.aisleCode}` : 'PALLET RACK', s.accentColor)),
  );
  sign.position.set(0, h + 0.45, 0);
  g.add(sign);

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng kiến trúc Nhà Triển Lãm (Cột thép, Giàn mái Truss, Tường kính, Cổng chào Logo TIM Corp, Quầy lễ tân & Cây xanh bên ngoài). */
export function createExhibitionHallEnvironment(
  widthM: number,
  depthM: number,
  sceneKind: SpaceKind,
  companyName: string,
  logoUrl: string,
): THREE.Group {
  const env = new THREE.Group();
  const halfW = widthM * 0.5 + 1;
  const halfD = depthM * 0.5 + 2;
  const hallH = 6.8;

  // 1. Thảm cỏ sân vườn xanh mát bao quanh bên ngoài nhà triển lãm
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    sharedMat('lawn', () => new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 0.95 })),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  lawn.receiveShadow = true;
  env.add(lawn);

  // Vòng đồi low-poly ở xa tan vào sương mù (tạo chiều sâu đường chân trời)
  const hillMat = sharedMat('hill', () => new THREE.MeshStandardMaterial({ color: '#6f9a6c', roughness: 1 }));
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + (i % 3) * 0.1;
    const r = 210 + (i % 4) * 22;
    const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(30 + (i % 5) * 7, 2), hillMat);
    hill.scale.set(1.8, 0.32 + (i % 3) * 0.1, 1.2);
    hill.position.set(Math.cos(ang) * r, -6, Math.sin(ang) * r);
    hill.rotation.y = ang;
    env.add(hill);
  }

  // Vỉa hè đá sáng bao quanh nhà triển lãm
  const sidewalk = new THREE.Mesh(
    new THREE.BoxGeometry(widthM + 8, 0.06, depthM + 10),
    sharedMat('sidewalk', () => new THREE.MeshStandardMaterial({ color: '#d9dee5', roughness: 0.85 })),
  );
  sidewalk.position.y = -0.042; // mặt trên thấp hơn sàn 1.2cm → hết z-fighting sọc trắng
  sidewalk.receiveShadow = true;
  env.add(sidewalk);

  // 2. Thảm lối đi trung tâm màu xanh thương hiệu TIM Corp (Showroom) hoặc vạch an toàn (Kho)
  if (sceneKind === 'SHOWROOM') {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, depthM + 2),
      sharedMat(`carpet:${depthM}`, () =>
        new THREE.MeshPhysicalMaterial({
          map: createCarpetTexture(depthM + 2),
          roughness: 0.95,
          sheen: 1,
          sheenRoughness: 0.75,
          sheenColor: new THREE.Color('#93c5fd'),
        }),
      ),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, 0);
    carpet.receiveShadow = true;
    env.add(carpet);

    for (const ex of [-2.45, 2.45]) {
      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, depthM + 2),
        sharedMat('carpetBorder', () => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 })),
      );
      border.rotation.x = -Math.PI / 2;
      border.position.set(ex, 0.018, 0);
      env.add(border);
    }
  } else {
    for (const ex of [-2.8, 2.8]) {
      const safetyLine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, depthM),
        ledMat('#f59e0b', 0.35, 1.2),
      );
      safetyLine.rotation.x = -Math.PI / 2;
      safetyLine.position.set(ex, 0.018, 0);
      env.add(safetyLine);
    }
  }

  // 3. Hệ cột thép kiến trúc & MÁI XÉO TRUNG TÂM HỘI NGHỊ (Pitched Gable Roof + Skylight + Steel Trusses)
  const steelMat = M.steel();
  const roofMetalMat = M.darkSteel();
  const ceilingSoffitMat = sharedMat('soffit', () => new THREE.MeshStandardMaterial({ color: '#f3f5f8', roughness: 0.8 }));
  const skylightMat = sharedMat('skylight', () => {
    const m = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      emissive: '#cfe8ff',
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.8,
      roughness: 0.08,
    });
    registerEmissive({ mat: m, day: 0.9, night: 0.05, mode: 'emissive' });
    return m;
  });
  // Đèn High-Bay: sáng vừa ban ngày, bừng sáng (bloom) ban đêm
  const ledLightMat = sharedMat('highbay', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e5', emissiveIntensity: 1.2 });
    registerEmissive({ mat: m, day: 1.2, night: 3.0, mode: 'emissive' });
    return m;
  });
  const fixtureHousingMat = M.darkSteel();
  const poolMat = sharedMat('lightPool', () => {
    const m = new THREE.MeshBasicMaterial({
      map: createLightPoolTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    registerEmissive({ mat: m, day: 0, night: 0.3, mode: 'opacity' });
    return m;
  });

  const eaveH = 6.4;
  const ridgeH = 9.8;
  const roofOverhang = 1.8;
  const slopeSpanX = halfW + roofOverhang;
  const slopeRiseY = ridgeH - eaveH;
  const slopeLen = Math.hypot(slopeSpanX, slopeRiseY);
  const pitchAngle = Math.atan2(slopeRiseY, slopeSpanX);
  const hallLen = halfD * 2 + 2.4;

  // Hai tấm mái xéo kiến trúc đối xứng (mặt ngoài tôn seam xám đậm + trần nội thất sáng mịn + khe giếng trời ở đỉnh mái)
  for (const side of [-1, 1] as const) {
    const roofGroup = new THREE.Group();
    const outerSheet = new THREE.Mesh(new THREE.BoxGeometry(slopeLen - 0.9, 0.14, hallLen), roofMetalMat);
    outerSheet.position.y = 0.08;
    // Mái không chặn nắng → nắng xuyên giếng trời tạo bóng vì kèo / gian hàng sống động trong sảnh
    outerSheet.castShadow = false;
    outerSheet.userData.occluder = true;
    const innerCeiling = new THREE.Mesh(new THREE.BoxGeometry(slopeLen - 0.95, 0.06, hallLen - 0.2), ceilingSoffitMat);
    innerCeiling.position.y = -0.02;
    // Viền nhôm diềm mái sắc nét
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, hallLen + 0.1), steelMat);
    fascia.position.set(side * (slopeLen * 0.5 - 0.45), -0.02, 0);

    roofGroup.add(outerSheet, innerCeiling, fascia);
    roofGroup.traverse((c) => (c.userData.roof = true));
    roofGroup.position.set(
      side * (slopeSpanX * 0.5 + 0.4),
      eaveH + slopeRiseY * 0.5 - 0.05,
      0,
    );
    roofGroup.rotation.z = -side * pitchAngle;
    env.add(roofGroup);
  }

  // Giếng trời kính dọc đỉnh mái xéo (Skylight Ridge)
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, hallLen - 0.6), skylightMat);
  skylight.position.set(0, ridgeH + 0.04, 0);
  skylight.userData.roof = true;
  env.add(skylight);

  // Hệ cột thép + vì kèo giàn mái xéo (Gable Steel Trusses) dọc theo chiều dài hội trường
  const zPositions = [-halfD + 2, -halfD * 0.45, 0, halfD * 0.45, halfD - 2];
  for (const pz of zPositions) {
    for (const px of [-halfW, halfW]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, eaveH, 0.42), steelMat);
      col.position.set(px, eaveH * 0.5, pz);
      col.castShadow = true;
      col.userData.occluder = true;
      env.add(col);
    }
    // Thanh giằng ngang dưới (Bottom Chord)
    const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.22, 0.18), steelMat);
    tieBeam.position.set(0, eaveH - 0.1, pz);
    tieBeam.userData.occluder = true;
    tieBeam.userData.roof = true;
    env.add(tieBeam);

    // 2 thanh kèo mái xéo trái/phải + thanh chống đứng trung tâm (King Post)
    for (const side of [-1, 1] as const) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(slopeLen - 1.2, 0.2, 0.18), steelMat);
      rafter.position.set(side * (halfW * 0.5), eaveH + slopeRiseY * 0.46, pz);
      rafter.rotation.z = -side * pitchAngle;
      rafter.userData.roof = true;
      env.add(rafter);
    }
    const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, slopeRiseY - 0.3, 0.18), steelMat);
    kingPost.position.set(0, eaveH + slopeRiseY * 0.5, pz);
    kingPost.userData.roof = true;
    env.add(kingPost);

    // Dàn đèn High-Bay LED treo dưới giàn mái
    for (const lx of [-8.5, 0, 8.5]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.44), fixtureHousingMat);
      housing.position.set(lx, eaveH - 0.2, pz);
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.03, 0.34), ledLightMat);
      fixture.position.set(lx, eaveH - 0.275, pz);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(lx, 0.025, pz);
      housing.userData.roof = true;
      fixture.userData.roof = true;
      env.add(housing, fixture, pool);
    }
  }

  // 4. VỎ NHÀ XƯỞNG: showroom nằm trong khu nhà xưởng lớn → tường panel cách nhiệt bao quanh (hông + hậu + đầu hồi),
  //    dải cửa sổ lấy sáng phía trên, mặt tiền kính ở giữa; tường trái chừa ô kính trước lối đi bộ sang quán cà phê.
  const glassMat = sharedMat('curtainGlass', () =>
    new THREE.MeshPhysicalMaterial({
      color: '#cfe8fb',
      transparent: true,
      opacity: 0.2,
      roughness: 0.04,
      metalness: 0,
      ior: 1.5,
      reflectivity: 0.6,
      envMapIntensity: 1.6,
      depthWrite: false,
    }),
  );
  const mullionMat = M.aluminum();
  const wallTop = eaveH;
  const bandY0 = 4.5; // dải cửa sổ lấy sáng 4.5 → 5.9m
  const bandY1 = 5.9;
  // 1 vật liệu panel dùng chung cho mọi đoạn tường (gộp còn 1 draw call); lặp sóng tôn theo chiều dài qua toạ độ UV
  const sharedPanel = sharedMat('srPanel', () =>
    new THREE.MeshStandardMaterial({ map: corrugatedTex('sr:panel', '#e6e9ed', 'rgba(120,132,146,0.28)', false, [1, 1]), roughness: 0.6, metalness: 0.25 }),
  );
  const panelMat = (_key: string, _len: number) => sharedPanel;
  /** Nhân toạ độ U của hộp để sóng tôn lặp mỗi 2.4m theo chiều dài */
  const scaleU = (geo: THREE.BufferGeometry, len: number) => {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const k = Math.max(1, len / 2.4);
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k);
    return geo;
  };
  const plinthMat = K.paint('#8b929b', 0.85);
  const glassBand = sharedMat('srBand', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#dbeafe', emissive: '#e8f3ff', emissiveIntensity: 0.55, transparent: true, opacity: 0.75, roughness: 0.1 });
    registerEmissive({ mat: m, day: 0.55, night: 0.04, mode: 'emissive' });
    return m;
  });
  /** Đoạn tường panel đặc dọc trục (theo X nếu alongX, theo Z nếu không), có chân tường bê tông + dải cửa sổ */
  const wallRun = (alongX: boolean, fixed: number, a: number, b: number, key: string, withBand = true) => {
    const len = b - a;
    if (len < 0.05) return;
    const mid = (a + b) / 2;
    const place = (m: THREE.Mesh, y: number) => {
      if (alongX) m.position.set(mid, y, fixed);
      else m.position.set(fixed, y, mid);
      m.castShadow = false;
      m.receiveShadow = true;
      m.userData.occluder = true;
      env.add(m);
    };
    const geo = (h: number, t = 0.16) => scaleU(alongX ? new THREE.BoxGeometry(len, h, t) : new THREE.BoxGeometry(t, h, len), len);
    place(new THREE.Mesh(geo(0.6, 0.22), plinthMat), 0.3);
    if (withBand) {
      place(new THREE.Mesh(geo(bandY0 - 0.6), panelMat(key, len)), 0.6 + (bandY0 - 0.6) / 2);
      const band = new THREE.Mesh(geo(bandY1 - bandY0, 0.06), glassBand);
      place(band, (bandY0 + bandY1) / 2);
      band.userData.occluder = false;
      place(new THREE.Mesh(geo(wallTop - bandY1), panelMat(key + 't', len)), (bandY1 + wallTop) / 2);
      // Đố nhôm dải cửa sổ mỗi 3m
      for (let t = a; t <= b + 0.01; t += 3) {
        const mul = new THREE.Mesh(alongX ? new THREE.BoxGeometry(0.08, bandY1 - bandY0, 0.1) : new THREE.BoxGeometry(0.1, bandY1 - bandY0, 0.08), mullionMat);
        if (alongX) mul.position.set(t, (bandY0 + bandY1) / 2, fixed);
        else mul.position.set(fixed, (bandY0 + bandY1) / 2, t);
        env.add(mul);
      }
    } else {
      place(new THREE.Mesh(geo(wallTop - 0.6), panelMat(key, len)), 0.6 + (wallTop - 0.6) / 2);
    }
  };
  /** Ô kính cao suốt tầng (mặt tiền / lối sang quán) có khung nhôm */
  const glassRun = (alongX: boolean, fixed: number, a: number, b: number, top: number) => {
    const len = b - a;
    const mid = (a + b) / 2;
    const g = new THREE.Mesh(alongX ? new THREE.BoxGeometry(len, top - 0.25, 0.06) : new THREE.BoxGeometry(0.06, top - 0.25, len), glassMat);
    if (alongX) g.position.set(mid, 0.25 + (top - 0.25) / 2, fixed);
    else g.position.set(fixed, 0.25 + (top - 0.25) / 2, mid);
    g.renderOrder = 2;
    g.userData.occluder = true;
    env.add(g);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = a + (len / n) * i;
      const mul = new THREE.Mesh(alongX ? new THREE.BoxGeometry(0.1, top, 0.1) : new THREE.BoxGeometry(0.1, top, 0.1), mullionMat);
      if (alongX) mul.position.set(t, top / 2, fixed);
      else mul.position.set(fixed, top / 2, t);
      env.add(mul);
    }
    for (const y of [0.25, 2.6, top]) {
      const tr = new THREE.Mesh(alongX ? new THREE.BoxGeometry(len, 0.08, 0.1) : new THREE.BoxGeometry(0.1, 0.08, len), mullionMat);
      if (alongX) tr.position.set(mid, y, fixed);
      else tr.position.set(fixed, y, mid);
      env.add(tr);
    }
  };
  const portalZ = sceneKind === 'SHOWROOM' ? depthM * 0.32 : null;
  // Hông phải: đặc suốt
  wallRun(false, halfW, -halfD, halfD, 'side');
  // Hông trái: đặc, chừa ô kính trước lối đi bộ sang quán
  if (portalZ !== null) {
    const g0 = portalZ - 2.4;
    const g1 = Math.min(halfD, portalZ + 2.4);
    wallRun(false, -halfW, -halfD, g0, 'sideL');
    glassRun(false, -halfW, g0, g1, wallTop);
    wallRun(false, -halfW, g1, halfD, 'sideL2');
  } else {
    wallRun(false, -halfW, -halfD, halfD, 'side');
  }
  // Tường hậu
  wallRun(true, -halfD, -halfW, halfW, 'back');
  // Mặt tiền: panel hai bên, kính giữa (rộng ~ cổng chào), dầm panel trên kính
  const shopHalf = Math.min(8, halfW * 0.45);
  wallRun(true, halfD, -halfW, -shopHalf, 'front', false);
  wallRun(true, halfD, shopHalf, halfW, 'front', false);
  // Kính mặt tiền chừa lối cửa tự động ở giữa (±1.3m) để đi ra sân & đường nội bộ
  glassRun(true, halfD, -shopHalf, -1.3, bandY0);
  glassRun(true, halfD, 1.3, shopHalf, bandY0);
  {
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.22), mullionMat);
    door.position.set(0, 2.62, halfD);
    env.add(door);
    // 2 cánh kính trượt đã mở hé sang hai bên
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.35, 0.04), glassMat);
      leaf.position.set(s * 1.95, 1.27, halfD - 0.1);
      leaf.renderOrder = 2;
      env.add(leaf);
    }
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), K.paint('#3a3a3a', 0.95));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.012, halfD + 0.9);
    env.add(mat);
  }
  {
    const head = new THREE.Mesh(scaleU(new THREE.BoxGeometry(shopHalf * 2, wallTop - bandY0, 0.16), shopHalf * 2), panelMat('fronthead', shopHalf * 2));
    head.position.set(0, (bandY0 + wallTop) / 2, halfD);
    head.castShadow = false;
    head.userData.occluder = true;
    env.add(head);
  }
  // Tam giác đầu hồi bịt kín dưới mái (trước & sau)
  const gable = new THREE.Shape();
  gable.moveTo(-slopeSpanX + roofOverhang, 0);
  gable.lineTo(slopeSpanX - roofOverhang, 0);
  gable.lineTo(0, ridgeH - eaveH);
  gable.lineTo(-slopeSpanX + roofOverhang, 0);
  const gableGeo = new THREE.ShapeGeometry(gable);
  for (const z of [-halfD, halfD]) {
    const tri = new THREE.Mesh(gableGeo, sharedMat('srGable', () => new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.65, side: THREE.DoubleSide })));
    tri.position.set(0, eaveH, z);
    tri.userData.roof = true;
    env.add(tri);
  }

  // 5. KHU NHÀ XƯỞNG BÊN NGOÀI: sân bê tông nội bộ, vạch kẻ đường, các khối nhà xưởng lân cận, vài hàng cây
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 70, halfD * 2 + 70), K.paint('#b9bdc2', 0.92));
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = -0.045;
  yard.receiveShadow = true;
  env.add(yard);
  const laneMat = K.paint('#f1f5f9', 0.7);
  for (let x = -halfW - 30; x < halfW + 30; x += 4) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), laneMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, -0.03, halfD + 9);
    env.add(dash);
  }
  // Khối nhà xưởng lân cận: thân tôn sóng, mái dốc thấp, cửa cuốn, dải cửa sổ — đứng quanh khuôn viên
  const neighbor = (x: number, z: number, w: number, d: number, h: number, rot: number, color: string) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      scaleU(new THREE.BoxGeometry(w, h, d), Math.max(w, d)),
      sharedMat(`nbBody:${color}`, () =>
        new THREE.MeshStandardMaterial({ map: corrugatedTex(`nb:${color}`, color, 'rgba(90,100,112,0.3)', false, [1, 1]), roughness: 0.6, metalness: 0.3 }),
      ),
    );
    body.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), K.paint('#6b7280', 0.6));
    roof.position.y = h + 0.15;
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.9, d + 0.04), glassBand);
    band.position.y = h - 1.4;
    g.add(body, roof, band);
    for (const sx of [-0.25, 0.25]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(4, 4.5, 0.1), K.paint('#9aa3ad', 0.5));
      door.position.set(sx * w, 2.25, d / 2 + 0.05);
      g.add(door);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((c) => {
      c.castShadow = false;
      c.userData.occluder = false;
    });
    env.add(g);
  };
  // Xưởng lân cận & bãi đỗ ô tô theo bố cục khuôn viên dùng chung (đi bộ / lái xe va chạm đúng chỗ)
  const campus = campusLayout(widthM, depthM);
  for (const n of campus.neighbors) neighbor(n.x, n.z, n.w, n.d, n.h, n.rot, n.color);
  {
    const lineMat = K.paint('#f8fafc', 0.6);
    for (const p of campus.parking) {
      for (const dz of [-3.1, 3.1]) {
        const ln = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.1), lineMat);
        ln.rotation.x = -Math.PI / 2;
        ln.position.set(p.x, -0.02, p.z + dz);
        env.add(ln);
      }
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.5),
      lightboxMat(labelTex([{ text: 'P', size: 150, color: '#ffffff', weight: 900, y: 150 }, { text: 'Bãi đỗ ô tô', size: 44, color: '#dbeafe', weight: 700, y: 230 }], '#1d4ed8', 500, 260)),
    );
    const sp = campus.parking[0];
    env.add(cyl(0.04, 0.04, 2.2, K.paint('#374151', 0.5), sp.x + 1.6, 1.1, sp.z + 3.4, 8));
    sign.position.set(sp.x + 1.6, 2.25, sp.z + 3.42);
    env.add(sign);
  }
  // ĐƯỜNG NỘI BỘ vòng quanh nhà xưởng (xe điện chở khách tham quan chạy theo vòng này — xem tour-cart.ts)
  const ring = showroomRing(widthM, depthM);
  const asphalt = K.paint('#4a4e55', 0.95);
  const curb = K.paint('#d1d5db', 0.8);
  const RW = ring.roadW;
  const roadStrip = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, -0.025, cz);
    m.receiveShadow = true;
    env.add(m);
  };
  roadStrip(0, ring.z1, ring.x1 * 2 + RW, RW);
  roadStrip(0, ring.z0, ring.x1 * 2 + RW, RW);
  roadStrip(ring.x0, (ring.z0 + ring.z1) / 2, RW, ring.z1 - ring.z0 - RW);
  roadStrip(ring.x1, (ring.z0 + ring.z1) / 2, RW, ring.z1 - ring.z0 - RW);
  // Vạch giữa đường (nét đứt) + bó vỉa 2 bên
  const dashMat = K.paint('#f8fafc', 0.6);
  const dash = (x: number, z: number, alongX: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 1.6 : 0.12, alongX ? 0.12 : 1.6), dashMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, -0.018, z);
    env.add(m);
  };
  for (let x = ring.x0 + 3; x < ring.x1 - 2; x += 3.6) {
    dash(x, ring.z0, true);
    dash(x, ring.z1, true);
  }
  for (let z = ring.z0 + 3; z < ring.z1 - 2; z += 3.6) {
    dash(ring.x0, z, false);
    dash(ring.x1, z, false);
  }
  for (const off of [-RW / 2 - 0.12, RW / 2 + 0.12]) {
    for (const z of [ring.z0, ring.z1]) env.add(box(ring.x1 * 2 + RW + 0.5, 0.12, 0.22, curb, 0, 0.02, z + off));
    for (const x of [ring.x0, ring.x1]) env.add(box(0.22, 0.12, ring.z1 - ring.z0 + RW + 0.5, curb, x + off, 0.02, (ring.z0 + ring.z1) / 2));
  }
  // Hàng cây hai bên đường + đèn đường mỗi ~14m
  const treePts: { x: number; z: number; scale: number }[] = [];
  const outer = RW / 2 + 2.6;
  for (let x = ring.x0; x <= ring.x1 + 0.1; x += 8.5) {
    for (const z of [ring.z0 - outer, ring.z1 + outer]) treePts.push({ x: x + Math.sin(x) * 0.6, z, scale: 1.05 + Math.abs(Math.sin(x * 0.7)) * 0.3 });
  }
  for (let z = ring.z0 + 8; z <= ring.z1 - 4; z += 8.5) {
    for (const x of [ring.x0 - outer, ring.x1 + outer]) treePts.push({ x, z: z + Math.cos(z) * 0.6, scale: 1.05 + Math.abs(Math.cos(z * 0.7)) * 0.3 });
  }
  env.add(buildTreeRow(treePts, Math.round(widthM * 7 + depthM)));
  const poleMat = K.paint('#374151', 0.5);
  const lampMat = sharedMat('srStreetLamp', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffe9b0', emissiveIntensity: 0.4 });
    registerEmissive({ mat: m, day: 0.3, night: 2.6, mode: 'emissive' });
    return m;
  });
  const lamp = (x: number, z: number, faceX: number, faceZ: number) => {
    env.add(cyl(0.06, 0.08, 5.2, poleMat, x, 2.6, z, 8));
    const arm = box(Math.abs(faceX) > 0 ? 1.1 : 0.08, 0.07, Math.abs(faceZ) > 0 ? 1.1 : 0.08, poleMat, x + faceX * 0.55, 5.15, z + faceZ * 0.55);
    env.add(arm);
    env.add(box(0.42, 0.1, 0.22, lampMat, x + faceX * 1.05, 5.08, z + faceZ * 1.05));
  };
  const inner = RW / 2 + 0.7;
  for (let x = ring.x0 + 6; x <= ring.x1 - 5; x += 14) {
    lamp(x, ring.z0 + inner, 0, -1);
    lamp(x, ring.z1 - inner, 0, 1);
  }
  for (let z = ring.z0 + 10; z <= ring.z1 - 8; z += 14) {
    lamp(ring.x0 + inner, z, -1, 0);
    lamp(ring.x1 - inner, z, 1, 0);
  }
  // Trạm xe điện tham quan trước cửa: mái che + biển
  {
    const st = ring.stop;
    const roofM = K.paint('#1e3a8a', 0.5);
    for (const sx of [-1.6, 1.6]) env.add(cyl(0.05, 0.05, 2.6, poleMat, st.x + sx, 1.3, st.z - RW / 2 - 1.1, 8));
    env.add(box(3.8, 0.1, 1.6, roofM, st.x, 2.65, st.z - RW / 2 - 1.1));
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.45),
      lightboxMat(labelTex([{ text: 'XE ĐIỆN THAM QUAN', size: 64, color: '#ffffff', weight: 800, y: 80 }, { text: 'Lên xe tại đây · vòng khuôn viên', size: 34, color: '#bfdbfe', weight: 600, y: 140 }], '#1e3a8a', 900, 190)),
    );
    sign.position.set(st.x, 2.35, st.z - RW / 2 - 0.3);
    env.add(sign);
  }

  // 6. Cổng chào TIM Corp tại lối vào (thiết kế cổng doanh nghiệp hiện đại)
  const archGroup = createEntranceGate(companyName, logoUrl, sceneKind);
  archGroup.position.set(0, 0, halfD - 1.4);
  env.add(archGroup);

  // Quầy lễ tân & vách thương hiệu giờ là vật thể kéo thả (RECEPTION_DESK, BRAND_WALL) — không chắn đại lộ thảm

  return env;
}



/** Logo ngang chính thức (public/brand) dùng cho cổng chào */
const GATE_LOGO_URL = '/brand/timcorp-logo-ngang.png';

/**
 * Cổng chào doanh nghiệp: 2 trụ nhôm xước trên đế granite (khe kính navy viền LED, hộp đèn biểu tượng trên đỉnh),
 * dầm composite navy với lightbox trắng in logo ngang + dòng giới thiệu, viền halo LED, downlight dưới gầm,
 * bồn cây cắt tỉa & thảm đón khách. Mặt sau: lời chào tạm biệt.
 */
function createEntranceGate(companyName: string, fallbackLogoUrl: string, sceneKind: SpaceKind): THREE.Group {
  const g = new THREE.Group();
  const span = 11.2; // khoảng thông thuỷ giữa 2 trụ
  const pylonW = 0.95;
  const pylonH = 6.3;
  const headH = 1.9;
  const headD = 0.85;
  const headY = pylonH - headH / 2 + 0.15;
  const px = span / 2 + pylonW / 2;

  const granite = sharedMat('gateGranite', () => new THREE.MeshPhysicalMaterial({ color: '#2a2d33', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  const alu = sharedMat('gateAlu', () => new THREE.MeshStandardMaterial({ color: '#c7ccd4', metalness: 0.92, roughness: 0.3 }));
  const navy = sharedMat('gateNavy', () => new THREE.MeshPhysicalMaterial({ color: '#0d2150', roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const navyGlass = sharedMat('gateNavyGlass', () => new THREE.MeshPhysicalMaterial({ color: '#12307a', roughness: 0.08, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92 }));
  const halo = ledMat('#3b82f6', 1.4, 3.2);
  const warm = ledMat('#fff3d6', 1.6, 4.2);

  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, occluder = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (occluder) m.userData.occluder = true;
    g.add(m);
    return m;
  };

  // Ảnh logo dùng chung cho dầm & hộp đèn đỉnh trụ
  const logoImg = new Image();
  const onLogo: (() => void)[] = [];
  logoImg.onload = () => onLogo.forEach((f) => f());
  logoImg.onerror = () => {
    if (fallbackLogoUrl && logoImg.src.indexOf(fallbackLogoUrl) < 0) logoImg.src = fallbackLogoUrl;
  };

  for (const s of [-1, 1]) {
    const x = s * px;
    addMesh(new THREE.BoxGeometry(pylonW + 0.5, 0.32, pylonW + 0.5), granite, x, 0.16, 0); // đế granite
    addMesh(new THREE.BoxGeometry(pylonW, pylonH, pylonW), alu, x, 0.32 + pylonH / 2, 0, true); // thân trụ
    // Khe kính navy mặt trước & sau + viền LED hai bên khe
    for (const fz of [1, -1]) {
      addMesh(new THREE.BoxGeometry(pylonW * 0.46, pylonH - 1.6, 0.04), navyGlass, x, 0.32 + (pylonH - 1.6) / 2 + 0.35, fz * (pylonW / 2 + 0.01));
      for (const ex of [-1, 1]) addMesh(new THREE.BoxGeometry(0.025, pylonH - 1.6, 0.03), halo, x + ex * pylonW * 0.25, 0.32 + (pylonH - 1.6) / 2 + 0.35, fz * (pylonW / 2 + 0.02));
    }
    // Hộp đèn biểu tượng trên đỉnh trụ (cắt phần biểu tượng bên trái logo ngang)
    const embCanvas = document.createElement('canvas');
    embCanvas.width = 512;
    embCanvas.height = 512;
    const ec = embCanvas.getContext('2d')!;
    const embTex = new THREE.CanvasTexture(embCanvas);
    embTex.colorSpace = THREE.SRGBColorSpace;
    embTex.anisotropy = 16;
    const drawEmblem = () => {
      ec.fillStyle = '#ffffff';
      ec.fillRect(0, 0, 512, 512);
      if (logoImg.complete && logoImg.naturalWidth) {
        // Biểu tượng chiếm ~20% bên trái logo ngang (vuông theo chiều cao)
        const sh = logoImg.naturalHeight;
        ec.imageSmoothingQuality = 'high';
        ec.drawImage(logoImg, 0, 0, sh * 1.05, sh, 96, 96, 320, 305);
      } else {
        ec.fillStyle = '#1d3f91';
        ec.font = '800 220px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
        ec.textAlign = 'center';
        ec.textBaseline = 'middle';
        ec.fillText('T', 256, 270);
      }
      embTex.needsUpdate = true;
    };
    drawEmblem();
    onLogo.push(drawEmblem);
    const embMat = lightboxMat(embTex);
    const embY = 0.32 + pylonH - 0.62;
    for (const fz of [1, -1]) {
      const emb = addMesh(new THREE.PlaneGeometry(pylonW * 0.82, pylonW * 0.82), embMat, x, embY, fz * (pylonW / 2 + 0.012));
      emb.castShadow = false;
      if (fz < 0) emb.rotation.y = Math.PI;
    }
    // Bồn cây cắt tỉa phía ngoài chân trụ
    const potX = x + s * 1.35;
    addMesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), granite, potX, 0.35, 0.3);
    const bush = addMesh(new THREE.SphereGeometry(0.55, 14, 10), sharedMat('gateBush', () => new THREE.MeshStandardMaterial({ color: '#2f7a3f', roughness: 0.8, flatShading: true })), potX, 1.05, 0.3);
    bush.scale.set(1, 0.85, 1);
  }

  // Dầm ngang navy (nhô hơn trụ) + halo LED trên/dưới
  const beamW = span + pylonW * 2 + 0.6;
  addMesh(new THREE.BoxGeometry(beamW, headH, headD), navy, 0, headY, 0, true);
  addMesh(new THREE.BoxGeometry(beamW + 0.08, 0.12, headD + 0.08), alu, 0, headY + headH / 2 + 0.06, 0);
  for (const fz of [1, -1]) {
    addMesh(new THREE.BoxGeometry(beamW - 0.3, 0.025, 0.025), halo, 0, headY + headH / 2 - 0.08, fz * (headD / 2 + 0.015));
    addMesh(new THREE.BoxGeometry(beamW - 0.3, 0.025, 0.025), halo, 0, headY - headH / 2 + 0.08, fz * (headD / 2 + 0.015));
  }
  // Downlight dưới gầm dầm rọi lối vào
  for (let i = 0; i < 6; i++) {
    const dl = addMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), warm, -span / 2 + 0.9 + (i * (span - 1.8)) / 5, headY - headH / 2 - 0.005, 0);
    dl.castShadow = false;
  }

  // Lightbox mặt trước: logo ngang + dòng giới thiệu
  const W = 2600;
  const panelW = span - 0.6;
  const panelH = headH - 0.45;
  const H = Math.round((W * panelH) / panelW);
  const fc = document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const fctx = fc.getContext('2d')!;
  const frontTex = new THREE.CanvasTexture(fc);
  frontTex.colorSpace = THREE.SRGBColorSpace;
  frontTex.anisotropy = 16;
  const tagline = sceneKind === 'WAREHOUSE' ? 'KHO HÀNG & TRUNG TÂM PHÂN PHỐI' : 'TRUNG TÂM TRIỂN LÃM & SHOWROOM THIẾT BỊ F&B';
  const drawFront = () => {
    const bg = fctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#eef3fb');
    fctx.fillStyle = bg;
    fctx.fillRect(0, 0, W, H);
    fctx.fillStyle = '#e11d2a';
    fctx.fillRect(0, H - 14, W * 0.16, 14);
    fctx.fillStyle = '#1d3f91';
    fctx.fillRect(W * 0.16, H - 14, W * 0.84, 14);
    const leftW = W * 0.54;
    if (logoImg.complete && logoImg.naturalWidth) {
      const lw = leftW * 0.86;
      const lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(logoImg, (leftW - lw) / 2 + W * 0.02, (H - lh) / 2 - 6, lw, lh);
    } else {
      fctx.fillStyle = '#1d3f91';
      fctx.font = `800 ${Math.round(H * 0.42)}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.fillText((companyName || 'TIM CORP').toUpperCase().slice(0, 18), leftW / 2, H / 2);
    }
    // Vạch phân cách + dòng giới thiệu bên phải
    fctx.fillStyle = '#cbd5e1';
    fctx.fillRect(leftW + 20, H * 0.2, 4, H * 0.56);
    fctx.textAlign = 'left';
    fctx.textBaseline = 'middle';
    fctx.fillStyle = '#0f172a';
    fctx.font = `800 ${Math.round(H * 0.16)}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
    fctx.fillText('CHÀO MỪNG QUÝ KHÁCH', leftW + 70, H * 0.38);
    fctx.fillStyle = '#1d3f91';
    fctx.font = `600 ${Math.round(H * 0.105)}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif`;
    fctx.fillText(tagline, leftW + 70, H * 0.6, W - leftW - 110);
    frontTex.needsUpdate = true;
  };
  drawFront();
  onLogo.push(drawFront);
  const front = addMesh(new THREE.PlaneGeometry(panelW, panelH), lightboxMat(frontTex), 0, headY, headD / 2 + 0.006);
  front.castShadow = false;

  // Mặt sau: lời chào tạm biệt
  const backTex = labelTex(
    [
      { text: 'CẢM ƠN QUÝ KHÁCH · HẸN GẶP LẠI', size: 96, color: '#ffffff', weight: 800, y: 170 },
      { text: (companyName || 'TIM CORP').toUpperCase().slice(0, 30), size: 52, color: '#93c5fd', weight: 600, y: 300 },
    ],
    '#0d2150',
    2400,
    420,
  );
  const back = addMesh(new THREE.PlaneGeometry(panelW, panelH * 0.82), lightboxMat(backTex), 0, headY, -headD / 2 - 0.006);
  back.rotation.y = Math.PI;
  back.castShadow = false;

  // Thảm đón khách dưới cổng
  const mat = addMesh(
    new THREE.BoxGeometry(5.2, 0.014, 3),
    sharedMat('gateMat', () => new THREE.MeshStandardMaterial({ color: '#1f2a44', roughness: 0.95 })),
    0,
    0.022,
    0.4,
  );
  mat.castShadow = false;

  logoImg.src = GATE_LOGO_URL;
  return g;
}
