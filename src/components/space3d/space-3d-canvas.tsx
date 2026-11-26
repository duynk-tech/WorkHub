'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  Avatar3DConfig,
  Procedural3DPart,
  Product3DModelView,
  SpaceKind,
  SpacePlacementView,
  SpacePresenceView,
  SpaceStructure,
} from '@/lib/space-3d-types';

export interface TeleportTarget {
  x: number;
  z: number;
  lookX?: number;
  lookZ?: number;
  nonce: number;
}

interface Props {
  sceneKind: SpaceKind;
  widthM: number;
  depthM: number;
  branding: { appName: string; companyName: string; logoUrl: string };
  structures: SpaceStructure[];
  placements: SpacePlacementView[];
  presences: SpacePresenceView[];
  currentEmployeeId?: number | null;
  isSelfOnDuty?: boolean;
  playerName: string;
  playerAvatar: Avatar3DConfig;
  playerPosRef?: React.MutableRefObject<{ x: number; z: number; rotY: number }>;
  nightMode: boolean;
  povMode: 'THIRD' | 'FIRST';
  editMode: boolean;
  transformMode: 'translate' | 'rotate';
  selectedPlacementId: string | null;
  teleportTarget: TeleportTarget | null;
  onSelectPlacement: (id: string | null) => void;
  onSelectBooth?: (boothId: string) => void;
  onMovePlacement: (id: string, pos: { posX: number; posY: number; posZ: number; rotY: number }) => void;
  onNearbyChange: (info: { zoneName: string; nearPlacementId: string | null }) => void;
}

interface AnimatedAvatar {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
}

/** Vẽ khuôn mặt Chibi lịch sự, thanh tú, thân thiện (tỷ lệ hài hòa, mắt trong có điểm sáng, lông mày gọn, mũi thanh, cười nhẹ). */
function createPoliteFaceTexture(skinColor = '#fce2c4'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = skinColor;
  ctx.fillRect(0, 0, 512, 512);

  const drawEye = (cx: number, isLeft: boolean) => {
    // Lông mày thanh lịch, gọn gàng
    ctx.strokeStyle = '#3b2b20';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 18, 224);
    ctx.quadraticCurveTo(cx, 215, cx + 18, 223);
    ctx.stroke();

    // Lòng trắng mắt nhẹ giúp ánh nhìn chân thực hơn
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, 254, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tròng mắt nâu trầm ấm áp
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(cx, 255, 11.5, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Đốm sáng trắng tinh tế (catchlight)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 4, 249, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 4, 260, 2, 0, Math.PI * 2);
    ctx.fill();

    // Đường mi trên sắc nét lịch sự
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(cx, 256, 17.5, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    // Nét đuôi mắt nhẹ
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    const outerX = isLeft ? cx - 16 : cx + 16;
    const tipX = isLeft ? cx - 21 : cx + 21;
    ctx.moveTo(outerX, 249);
    ctx.lineTo(tipX, 246);
    ctx.stroke();
  };

  drawEye(212, true);
  drawEye(300, false);

  // Sắc ửng má rất nhẹ tạo nét tự nhiên
  const blushGrad = (cx: number) => {
    const g = ctx.createRadialGradient(cx, 282, 2, cx, 282, 20);
    g.addColorStop(0, 'rgba(244, 114, 182, 0.22)');
    g.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 282, 20, 0, Math.PI * 2);
    ctx.fill();
  };
  blushGrad(186);
  blushGrad(326);

  // Sống mũi thanh tú
  ctx.strokeStyle = 'rgba(180, 120, 90, 0.45)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(256, 264);
  ctx.lineTo(254, 276);
  ctx.lineTo(259, 278);
  ctx.stroke();

  // Nụ cười lịch sự thân thiện
  ctx.strokeStyle = '#b45340';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(240, 294);
  ctx.quadraticCurveTo(256, 304, 272, 294);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo nhãn tên nổi sắc nét trên đầu nhân vật / sản phẩm (đủ rộng để không bị cắt tên tiếng Việt). */
function createBadgeSprite(text: string, bgColor = '#0f172a', textColor = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 76;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(10, 10, 460, 56, 28);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 34), 240, 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.55, 0.42, 1);
  return sprite;
}

/** Dựng nhân vật 3D phong cách lịch sự, chuyên nghiệp (Vest / Sơ mi / Polo, 4 kiểu tóc, kính gọng mảnh, giày chỉn chu, khớp đi bộ). */
function createChibiAvatar(opts: {
  name: string;
  config: Avatar3DConfig;
  isSelf?: boolean;
  isOnDuty?: boolean;
}): AnimatedAvatar {
  const { name, config, isSelf = false, isOnDuty = false } = opts;
  const group = new THREE.Group();
  const skinColor = config.skinTone || '#fce2c4';
  const outfitColor = config.outfitColor || '#1e3a8a';
  const pantsColor = config.pantsColor || '#1e293b';
  const hairColor = config.hairColor || '#1c1917';

  // Khớp chân trái / phải với giày tây / giày công sở
  const makeLeg = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.44, 0);

    const legColor = config.outfitStyle === 'dress' ? skinColor : pantsColor;
    const pant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.065, 0.36, 12),
      new THREE.MeshStandardMaterial({ color: legColor, roughness: 0.58 }),
    );
    pant.position.y = -0.18;
    pant.castShadow = true;
    pivot.add(pant);

    const shoeColor = config.outfitStyle === 'suit' || config.outfitStyle === 'dress' ? '#1e293b' : '#ffffff';
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.09, 0.23),
      new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.35 }),
    );
    shoe.position.set(0, -0.39, 0.04);
    shoe.castShadow = true;
    pivot.add(shoe);

    return pivot;
  };

  const leftLeg = makeLeg(-0.105);
  const rightLeg = makeLeg(0.105);
  group.add(leftLeg, rightLeg);

  // Thân trang phục (Vest / Đầm công sở / Sơ mi / Polo)
  if (config.outfitStyle === 'dress') {
    // Thân trên đầm công sở thanh lịch
    const bodice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.185, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.45 }),
    );
    bodice.position.y = 0.79;
    bodice.castShadow = true;
    group.add(bodice);

    // Chân váy chữ A thanh lịch
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.28, 0.34, 18),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.48 }),
    );
    skirt.position.y = 0.46;
    skirt.castShadow = true;
    group.add(skirt);

    // Đai thắt lưng tinh tế
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.045, 16),
      new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.35 }),
    );
    belt.position.y = 0.62;
    group.add(belt);
  } else {
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.22, 0.52, 16),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.48 }),
    );
    torso.position.y = 0.7;
    torso.castShadow = true;
    group.add(torso);
  }

  // Cổ áo sơ mi / polo trắng lịch sự
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.155, 0.075, 14),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
  );
  collar.position.y = 0.96;
  group.add(collar);

  if (config.outfitStyle === 'suit') {
    // Áo sơ mi trắng lồng bên trong vest + cà vạt lịch lãm
    const innerShirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.34, 0.04),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }),
    );
    innerShirt.position.set(0, 0.78, 0.185);
    group.add(innerShirt);

    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.28, 0.025),
      new THREE.MeshStandardMaterial({ color: outfitColor === '#1e3a8a' ? '#dc2626' : '#2563eb', roughness: 0.35 }),
    );
    tie.position.set(0, 0.76, 0.21);
    group.add(tie);
  } else if (config.outfitStyle === 'shirt') {
    // Hàng nút áo sơ mi tinh tế
    const placket = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.36, 0.02),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5 }),
    );
    placket.position.set(0, 0.74, 0.205);
    group.add(placket);
  }

  // Thẻ tên công ty trên ngực khi đang trực
  if (isOnDuty) {
    const badgeCard = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.11, 0.02),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
    );
    badgeCard.position.set(0.09, 0.74, 0.205);
    const badgeTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.077, 0.03, 0.022),
      new THREE.MeshStandardMaterial({ color: '#2563eb' }),
    );
    badgeTop.position.set(0.09, 0.78, 0.207);
    group.add(badgeCard, badgeTop);
  }

  // Khớp tay trái / phải
  const makeArm = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.88, 0);

    const isLongSleeve = config.outfitStyle === 'suit' || config.outfitStyle === 'shirt';
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.06, isLongSleeve ? 0.33 : 0.18, 12),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.48 }),
    );
    sleeve.position.y = isLongSleeve ? -0.165 : -0.09;
    sleeve.castShadow = true;
    pivot.add(sleeve);

    if (!isLongSleeve) {
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.048, 0.18, 12),
        new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.52 }),
      );
      forearm.position.y = -0.26;
      forearm.castShadow = true;
      pivot.add(forearm);
    } else {
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.035, 12),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
      );
      cuff.position.y = -0.33;
      pivot.add(cuff);
    }

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.52 }),
    );
    hand.position.y = -0.37;
    pivot.add(hand);

    return pivot;
  };

  const leftArm = makeArm(-0.245);
  const rightArm = makeArm(0.245);
  group.add(leftArm, rightArm);

  // Đầu Chibi thanh lịch + Khuôn mặt vẽ nét + Tóc nhiều lớp + Kính mắt (tùy chọn)
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.25;

  const faceTex = createPoliteFaceTexture(skinColor);
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.275, 28, 22),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.48 }),
  );
  headMesh.scale.set(1.03, 1.0, 0.96);
  headMesh.rotation.y = -Math.PI / 2;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Tai 2 bên gọn gàng
  const earMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.52 });
  const earGeo = new THREE.SphereGeometry(0.052, 10, 10);
  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.position.set(-0.275, -0.02, 0);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.275;
  headGroup.add(leftEar, rightEar);

  // Tóc 3D nhiều lớp theo 4 phong cách
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.58 });
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.292, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat,
  );
  hairCap.scale.set(1.04, 1.01, 0.99);
  hairCap.position.y = 0.025;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  if (config.hairStyle === 'slick') {
    // Rẽ ngôi lệch lịch lãm
    const wave = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.095, 0.14), hairMat);
    wave.position.set(0.04, 0.19, 0.19);
    wave.rotation.set(0.2, 0, -0.14);
    headGroup.add(wave);
  } else if (config.hairStyle === 'bob') {
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.13), hairMat);
    bangs.position.set(0, 0.17, 0.2);
    bangs.rotation.x = 0.25;
    headGroup.add(bangs);
    for (const sx of [-0.245, 0.245]) {
      const sideLock = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.082, 0.34, 12), hairMat);
      sideLock.position.set(sx, -0.05, -0.02);
      headGroup.add(sideLock);
    }
    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.17), hairMat);
    backHair.position.set(0, -0.05, -0.21);
    headGroup.add(backHair);
  } else if (config.hairStyle === 'ponytail') {
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.12), hairMat);
    bangs.position.set(0, 0.175, 0.2);
    bangs.rotation.x = 0.22;
    const tieBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.016, 8, 16),
      new THREE.MeshStandardMaterial({ color: '#2563eb' }),
    );
    tieBand.position.set(0, 0.06, -0.29);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 10), hairMat);
    tail.position.set(0, -0.08, -0.34);
    tail.rotation.x = -0.35;
    headGroup.add(bangs, tieBand, tail);
  } else {
    // short tự nhiên
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.13), hairMat);
    bangs.position.set(0, 0.175, 0.2);
    bangs.rotation.x = 0.24;
    headGroup.add(bangs);
  }

  // Kính mắt gọng mảnh lịch sự (nếu bật)
  if (config.hasGlasses) {
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.75, roughness: 0.2 });
    const lensMat = new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.28, roughness: 0.08 });
    for (const gx of [-0.088, 0.088]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.008, 8, 20), frameMat);
      rim.position.set(gx, 0.015, 0.268);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16), lensMat);
      lens.position.set(gx, 0.015, 0.267);
      headGroup.add(rim, lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.01, 0.01), frameMat);
    bridge.position.set(0, 0.02, 0.27);
    headGroup.add(bridge);
  }

  group.add(headGroup);

  // Nhãn tên nổi
  const badgeLabel = isOnDuty ? `● Đang trực · ${name}` : name;
  const badgeBg = isOnDuty ? '#059669' : isSelf ? '#2563eb' : '#0f172a';
  const badge = createBadgeSprite(badgeLabel, badgeBg);
  badge.position.y = 1.84;
  group.add(badge);

  return { group, leftLeg, rightLeg, leftArm, rightArm, headGroup };
}

/** Dựng cây xanh Low-Poly tán nhiều tầng chân thực cho sân vườn bên ngoài nhà triển lãm. */
function createOutdoorTree(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.36 * scale, 2.2 * scale, 8),
    new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 }),
  );
  trunk.position.y = 1.1 * scale;
  trunk.castShadow = true;
  g.add(trunk);

  const greens = ['#15803d', '#16a34a', '#22c55e'];
  const clusters: [number, number, number, number][] = [
    [0, 2.9, 0, 1.35],
    [-0.75, 2.4, 0.4, 0.95],
    [0.75, 2.45, -0.35, 1.0],
    [0.1, 3.65, 0.2, 0.85],
  ];
  clusters.forEach(([x, y, z, r], idx) => {
    const foliage = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r * scale, 1),
      new THREE.MeshStandardMaterial({ color: greens[idx % greens.length], roughness: 0.72, flatShading: true }),
    );
    foliage.position.set(x * scale, y * scale, z * scale);
    foliage.castShadow = true;
    g.add(foliage);
  });
  return g;
}

/** Tạo texture vách hậu Lightbox chuyên nghiệp cho Gian hàng Triển lãm Expo. */
function createExpoBackdropTexture(title: string, subtitle: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

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
  ctx.font = 'bold 38px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 26), 36, 56);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText((subtitle || 'EXHIBITION PAVILION').slice(0, 34), 36, 98);

  // Nội dung họa tiết tinh tế phần thân vách
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(36, 158, 696, 188);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('KHU TRƯNG BÀY & TƯ VẤN THIẾT BỊ CHÍNH HÃNG', 60, 210);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText('Chạm trực tiếp vào thiết bị hoặc gian hàng để xem thông số chi tiết', 60, 252);

  // Accent bar dưới
  ctx.fillStyle = accentColor;
  ctx.fillRect(36, 336, 180, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo texture sàn Epoxy công nghiệp sáng mịn. */
function createEpoxyFloorTexture(night: boolean, isWarehouse: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = night ? '#1e293b' : isWarehouse ? '#e5e7eb' : '#f4f6f9';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = night ? '#334155' : isWarehouse ? '#d1d5db' : '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dựng Gian hàng Triển lãm Hiện đại (Aluminum Truss + Lightbox Wall + LED Plinths + Bàn ghế tư vấn). */
function createExpoBoothMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = Math.max(3.2, s.heightM);
  const standX = s.posX < 0 ? s.posX + d * 0.5 + 2.1 : s.posX - d * 0.5 - 2.1;

  const boothMeta = { boothId: s.id, standX, standZ: s.posZ, lookX: s.posX, lookZ: s.posZ };
  g.userData = boothMeta;

  // Sàn nâng trải thảm xám sáng bo viền nhôm
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.1, d),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.75 }),
  );
  platform.position.y = 0.05;
  platform.receiveShadow = true;
  platform.userData = boothMeta;
  g.add(platform);

  // Viền nhôm sáng quanh sàn nâng
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.65, roughness: 0.3 }),
  );
  trim.position.y = 0.04;
  g.add(trim);

  // Vách hậu Lightbox phát sáng hiện đại
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.18),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 }),
  );
  backWall.position.set(0, h * 0.5 + 0.08, -d * 0.5 + 0.1);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  backWall.userData = boothMeta;
  g.add(backWall);

  const lightbox = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.24, h - 0.24),
    new THREE.MeshBasicMaterial({ map: createExpoBackdropTexture(s.label, s.subLabel || '', s.accentColor) }),
  );
  lightbox.position.set(0, h * 0.5 + 0.08, -d * 0.5 + 0.2);
  lightbox.userData = boothMeta;
  g.add(lightbox);

  // Khung trụ nhôm Truss 2 bên mặt trước + thanh giàn đèn rọi trên cao
  const aluMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.72, roughness: 0.28 });
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
  const topLed = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.2, 0.06, 0.2),
    new THREE.MeshStandardMaterial({ color: s.accentColor, emissive: s.accentColor, emissiveIntensity: 0.6 }),
  );
  topLed.position.set(0, h + 0.18, d * 0.46);
  g.add(topLed);

  // 2 Bục trưng bày máy móc (Display Plinths cao 0.92m) màu trắng mờ viền LED
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.08 });
  for (const bx of [-1.1, 1.1]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.86, 1.05), plinthMat);
    plinth.position.set(bx, 0.48, d * 0.5 - 0.72);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    plinth.userData = boothMeta;
    g.add(plinth);

    const plinthLed = new THREE.Mesh(
      new THREE.BoxGeometry(1.67, 0.04, 1.07),
      new THREE.MeshStandardMaterial({ color: s.accentColor, emissive: s.accentColor, emissiveIntensity: 0.45 }),
    );
    plinthLed.position.set(bx, 0.88, d * 0.5 - 0.72);
    g.add(plinthLed);
  }

  // Bàn tư vấn tròn + 2 ghế hiện đại góc trong gian hàng
  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 }),
  );
  tableTop.position.set(-w * 0.32, 0.82, -0.35);
  tableTop.castShadow = true;
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.74, 10), aluMat);
  tableLeg.position.set(-w * 0.32, 0.45, -0.35);
  g.add(tableTop, tableLeg);

  // Chậu cây trang trí góc gian hàng
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.2, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }),
  );
  pot.position.set(w * 0.44, 0.3, -0.6);
  const leaf = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.36, 1),
    new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.65, flatShading: true }),
  );
  leaf.position.set(w * 0.44, 0.78, -0.6);
  g.add(pot, leaf);

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng Kệ Kho Công Nghiệp Selective Pallet Rack (kèm pallet gỗ). */
function createWarehouseRackMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = s.heightM;
  const levels = Math.max(2, Math.min(5, s.levels ?? 3));

  const uprightMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.65, roughness: 0.32 });
  const beamMat = new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.4, roughness: 0.42 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.3, roughness: 0.55 });
  const palletMat = new THREE.MeshStandardMaterial({ color: '#d4a373', roughness: 0.85 });

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
    new THREE.MeshBasicMaterial({ map: createExpoBackdropTexture(s.label, s.aisleCode ? `ZONE ${s.aisleCode}` : 'PALLET RACK', s.accentColor) }),
  );
  sign.position.set(0, h + 0.45, 0);
  g.add(sign);

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng kiến trúc Nhà Triển Lãm (Cột thép, Giàn mái Truss, Tường kính, Cổng chào Logo TIM Corp, Quầy lễ tân & Cây xanh bên ngoài). */
function createExhibitionHallEnvironment(
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
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: '#86efac', roughness: 0.92 }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.05;
  lawn.receiveShadow = true;
  env.add(lawn);

  // Vỉa hè đá sáng bao quanh nhà triển lãm
  const sidewalk = new THREE.Mesh(
    new THREE.BoxGeometry(widthM + 8, 0.06, depthM + 10),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.8 }),
  );
  sidewalk.position.y = -0.03;
  sidewalk.receiveShadow = true;
  env.add(sidewalk);

  // 2. Thảm lối đi trung tâm màu xanh thương hiệu TIM Corp (Showroom) hoặc vạch an toàn (Kho)
  if (sceneKind === 'SHOWROOM') {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, depthM + 2),
      new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.85 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, 0);
    carpet.receiveShadow = true;
    env.add(carpet);

    for (const ex of [-2.45, 2.45]) {
      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, depthM + 2),
        new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      );
      border.rotation.x = -Math.PI / 2;
      border.position.set(ex, 0.018, 0);
      env.add(border);
    }
  } else {
    for (const ex of [-2.8, 2.8]) {
      const safetyLine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, depthM),
        new THREE.MeshBasicMaterial({ color: '#f59e0b' }),
      );
      safetyLine.rotation.x = -Math.PI / 2;
      safetyLine.position.set(ex, 0.018, 0);
      env.add(safetyLine);
    }
  }

  // 3. Hệ cột thép kiến trúc & MÁI XÉO TRUNG TÂM HỘI NGHỊ (Pitched Gable Roof + Skylight + Steel Trusses)
  const steelMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.58, roughness: 0.34 });
  const roofMetalMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.45, roughness: 0.42 });
  const ceilingSoffitMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.75 });
  const skylightMat = new THREE.MeshStandardMaterial({
    color: '#e0f2fe',
    emissive: '#bae6fd',
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.72,
    roughness: 0.1,
  });
  const ledLightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

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
    outerSheet.castShadow = true;
    const innerCeiling = new THREE.Mesh(new THREE.BoxGeometry(slopeLen - 0.95, 0.06, hallLen - 0.2), ceilingSoffitMat);
    innerCeiling.position.y = -0.02;
    // Viền nhôm diềm mái sắc nét
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, hallLen + 0.1), steelMat);
    fascia.position.set(side * (slopeLen * 0.5 - 0.45), -0.02, 0);

    roofGroup.add(outerSheet, innerCeiling, fascia);
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
  env.add(skylight);

  // Hệ cột thép + vì kèo giàn mái xéo (Gable Steel Trusses) dọc theo chiều dài hội trường
  const zPositions = [-halfD + 2, -halfD * 0.45, 0, halfD * 0.45, halfD - 2];
  for (const pz of zPositions) {
    for (const px of [-halfW, halfW]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, eaveH, 0.42), steelMat);
      col.position.set(px, eaveH * 0.5, pz);
      col.castShadow = true;
      env.add(col);
    }
    // Thanh giằng ngang dưới (Bottom Chord)
    const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.22, 0.18), steelMat);
    tieBeam.position.set(0, eaveH - 0.1, pz);
    env.add(tieBeam);

    // 2 thanh kèo mái xéo trái/phải + thanh chống đứng trung tâm (King Post)
    for (const side of [-1, 1] as const) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(slopeLen - 1.2, 0.2, 0.18), steelMat);
      rafter.position.set(side * (halfW * 0.5), eaveH + slopeRiseY * 0.46, pz);
      rafter.rotation.z = -side * pitchAngle;
      env.add(rafter);
    }
    const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, slopeRiseY - 0.3, 0.18), steelMat);
    kingPost.position.set(0, eaveH + slopeRiseY * 0.5, pz);
    env.add(kingPost);

    // Dàn đèn High-Bay LED treo dưới giàn mái
    for (const lx of [-8.5, 0, 8.5]) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.36), ledLightMat);
      fixture.position.set(lx, eaveH - 0.26, pz);
      env.add(fixture);
    }
  }

  // 4. Tường kính Curtain Wall 2 bên hông (nhìn xuyên ra hàng cây xanh bên ngoài)
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    transparent: true,
    opacity: 0.22,
    roughness: 0.1,
    metalness: 0.2,
  });
  for (const px of [-halfW, halfW]) {
    const glassWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, hallH - 0.4, halfD * 2), glassMat);
    glassWall.position.set(px, hallH * 0.5, 0);
    env.add(glassWall);
  }

  // 5. Hàng cây xanh Low-Poly tán nhiều lớp bao quanh khuôn viên ngoài tường kính
  const treeCoords: [number, number, number][] = [
    [-halfW - 4.5, -14, 1.3], [-halfW - 5, -5, 1.15], [-halfW - 4.5, 5, 1.35], [-halfW - 5, 14, 1.2],
    [halfW + 4.5, -14, 1.25], [halfW + 5, -5, 1.3], [halfW + 4.5, 5, 1.15], [halfW + 5, 14, 1.3],
    [-12, -halfD - 5, 1.4], [-4, -halfD - 6, 1.2], [4, -halfD - 6, 1.25], [12, -halfD - 5, 1.35],
    [-11, halfD + 5, 1.25], [11, halfD + 5, 1.3],
  ];
  for (const [tx, tz, sc] of treeCoords) {
    const tree = createOutdoorTree(sc);
    tree.position.set(tx, 0, tz);
    env.add(tree);
  }

  // 6. Cổng chào Thương hiệu TIM Corp + Quầy Lễ Tân Trung Tâm
  const archGroup = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.15 });
  const blueGlow = new THREE.MeshStandardMaterial({ color: '#2563eb', emissive: '#2563eb', emissiveIntensity: 0.5 });

  for (const px of [-5.2, 5.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.7), pillarMat);
    p.position.set(px, 2.6, 0);
    p.castShadow = true;
    archGroup.add(p);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.6, 0.74), blueGlow);
    stripe.position.set(px, 2.6, 0);
    archGroup.add(stripe);
  }

  const headerBox = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.65, 0.55), new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.3 }));
  headerBox.position.set(0, 5.1, 0);
  headerBox.castShadow = true;
  archGroup.add(headerBox);

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const drawLogoBanner = (img?: HTMLImageElement) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 1008, 176);

    if (img) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(42, 32, 128, 128, 22);
      ctx.fill();
      ctx.drawImage(img, 54, 44, 104, 104);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Inter, system-ui, sans-serif';
    ctx.textAlign = img ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(companyName.toUpperCase().slice(0, 26), img ? 198 : 512, 76);

    ctx.fillStyle = '#60a5fa';
    ctx.font = '600 24px Inter, system-ui, sans-serif';
    ctx.fillText(
      sceneKind === 'WAREHOUSE' ? 'KHO HÀNG 3D DIGITAL TWIN' : 'TRUNG TÂM TRIỂN LÃM & SHOWROOM THIẾT BỊ 3D',
      img ? 198 : 512,
      134,
    );
    tex.needsUpdate = true;
  };
  drawLogoBanner();
  if (logoUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => drawLogoBanner(img);
    img.src = logoUrl;
  }

  const frontPlaque = new THREE.Mesh(new THREE.PlaneGeometry(11.0, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  frontPlaque.position.set(0, 5.1, 0.29);
  const backPlaque = frontPlaque.clone();
  backPlaque.position.z = -0.29;
  backPlaque.rotation.y = Math.PI;
  archGroup.add(frontPlaque, backPlaque);
  archGroup.position.set(0, 0, -halfD + 2.5);
  env.add(archGroup);

  // Quầy Lễ Tân hiện đại ngay dưới cổng chào (Showroom)
  if (sceneKind === 'SHOWROOM') {
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.05, 1.0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
    );
    desk.position.set(0, 0.525, -halfD + 5.6);
    desk.castShadow = true;
    desk.receiveShadow = true;
    env.add(desk);

    const deskAccent = new THREE.Mesh(
      new THREE.BoxGeometry(3.84, 0.14, 1.04),
      blueGlow,
    );
    deskAccent.position.set(0, 0.14, -halfD + 5.6);
    env.add(deskAccent);
  }

  return env;
}

/** Dựng vật thể 3D của sản phẩm từ Product3DModelView. */
function buildProductGroup(placement: SpacePlacementView, gltfLoader: GLTFLoader): THREE.Group {
  const root = new THREE.Group();
  root.userData = { placementId: placement.id };
  const m: Product3DModelView = placement.model3D;

  const addProcedural = (parts: Procedural3DPart[]) => {
    for (const part of parts) {
      let geo: THREE.BufferGeometry;
      if (part.shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(part.size[0], part.size[2] ?? part.size[0], part.size[1], 14);
      } else if (part.shape === 'sphere') {
        geo = new THREE.SphereGeometry(part.size[0], 14, 12);
      } else {
        geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: part.color || m.primaryColor,
        metalness: part.metalness ?? 0.35,
        roughness: part.roughness ?? 0.4,
        transparent: (part.opacity ?? 1) < 1,
        opacity: part.opacity ?? 1,
        emissive: part.emissive ? new THREE.Color(part.emissive) : undefined,
        emissiveIntensity: part.emissive ? 0.35 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
      if (part.rot) mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { placementId: placement.id };
      root.add(mesh);
    }
  };

  if (m.modelType === 'GLB' && m.glbUrl) {
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshStandardMaterial({ color: m.primaryColor, wireframe: true }),
    );
    placeholder.position.y = m.heightM * 0.5;
    placeholder.userData = { placementId: placement.id };
    root.add(placeholder);

    gltfLoader.load(m.glbUrl, (gltf) => {
      root.remove(placeholder);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetMax = Math.max(m.widthM, m.heightM, m.depthM);
      const s = targetMax / maxDim;
      model.scale.multiplyScalar(s);
      model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.userData = { placementId: placement.id };
        }
      });
      root.add(model);
    });
  } else if (m.modelType === 'PROCEDURAL_JSON' && m.proceduralParts && m.proceduralParts.length > 0) {
    addProcedural(m.proceduralParts);
  } else {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshStandardMaterial({ color: m.primaryColor, roughness: 0.42, metalness: 0.22 }),
    );
    box.position.y = m.heightM * 0.5;
    box.castShadow = true;
    box.receiveShadow = true;
    box.userData = { placementId: placement.id };
    root.add(box);

    if (placement.imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(placement.imageUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const front = new THREE.Mesh(
          new THREE.PlaneGeometry(m.widthM * 0.85, m.heightM * 0.85),
          new THREE.MeshBasicMaterial({ map: tex }),
        );
        front.position.set(0, m.heightM * 0.5, m.depthM * 0.5 + 0.008);
        front.userData = { placementId: placement.id };
        root.add(front);
      });
    }
  }

  const tagText = placement.locationCode ? `${placement.itemCode} · ${placement.locationCode}` : placement.itemCode;
  const tag = createBadgeSprite(tagText, '#0f172a', '#e2e8f0');
  tag.scale.set(1.45, 0.32, 1);
  tag.position.y = m.heightM + 0.38;
  root.add(tag);

  root.position.set(placement.posX, placement.posY, placement.posZ);
  root.rotation.y = placement.rotY;
  root.scale.setScalar(placement.scale || 1);
  return root;
}

export function Space3DCanvas({
  sceneKind,
  widthM,
  depthM,
  branding,
  structures,
  placements,
  presences,
  currentEmployeeId,
  isSelfOnDuty = false,
  playerName,
  playerAvatar,
  playerPosRef,
  nightMode,
  povMode,
  editMode,
  transformMode,
  selectedPlacementId,
  teleportTarget,
  onSelectPlacement,
  onSelectBooth,
  onMovePlacement,
  onNearbyChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    editMode,
    povMode,
    transformMode,
    selectedPlacementId,
    placements,
    structures,
    onSelectPlacement,
    onSelectBooth,
    onMovePlacement,
    onNearbyChange,
  });
  stateRef.current = {
    editMode,
    povMode,
    transformMode,
    selectedPlacementId,
    placements,
    structures,
    onSelectPlacement,
    onSelectBooth,
    onMovePlacement,
    onNearbyChange,
  };

  const sceneObjRef = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    player: AnimatedAvatar;
    staffAvatars: AnimatedAvatar[];
    placementMeshes: Map<string, THREE.Group>;
    boothMeshes: THREE.Group[];
    dynamicGroup: THREE.Group;
    presenceGroup: THREE.Group;
    highlightRing: THREE.Mesh;
    walkRing: THREE.Mesh;
    walkTarget: THREE.Vector3 | null;
    gltfLoader: GLTFLoader;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    floorMesh: THREE.Mesh;
    dayFloorTex: THREE.CanvasTexture;
    nightFloorTex: THREE.CanvasTexture;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dbeafe');
    scene.fog = new THREE.Fog('#e6effa', 38, 95);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      180,
    );
    camera.position.set(0, 7.2, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Ánh sáng 3 điểm chuẩn Exhibition Hall sáng trong
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#e2e8f0', 1.25);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffaf0', 1.15);
    sunLight.position.set(18, 28, 16);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 85;
    sunLight.shadow.camera.left = -28;
    sunLight.shadow.camera.right = 28;
    sunLight.shadow.camera.top = 28;
    sunLight.shadow.camera.bottom = -28;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight('#dbeafe', 0.45);
    fillLight.position.set(-16, 14, -12);
    scene.add(fillLight);

    // Sàn Epoxy nhà triển lãm (cache sẵn 2 texture ngày/đêm để đổi tức thì không giật)
    const dayFloorTex = createEpoxyFloorTexture(false, sceneKind === 'WAREHOUSE');
    const nightFloorTex = createEpoxyFloorTexture(true, sceneKind === 'WAREHOUSE');
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM + 4, depthM + 6),
      new THREE.MeshStandardMaterial({ map: dayFloorTex, roughness: 0.65, metalness: 0.08 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isWalkableFloor: true };
    scene.add(floorMesh);

    // Kiến trúc Nhà triển lãm + Cây cối bên ngoài + Logo TIM Corp
    const hallEnv = createExhibitionHallEnvironment(widthM, depthM, sceneKind, branding.companyName, branding.logoUrl);
    scene.add(hallEnv);

    // Vòng highlight sản phẩm gần nhất
    const highlightRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.78, 32),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    highlightRing.rotation.x = -Math.PI / 2;
    highlightRing.visible = false;
    scene.add(highlightRing);

    // Vòng đích Click-to-Walk dưới sàn
    const walkRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.44, 28),
      new THREE.MeshBasicMaterial({ color: '#2563eb', side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    walkRing.rotation.x = -Math.PI / 2;
    walkRing.position.y = 0.03;
    walkRing.visible = false;
    scene.add(walkRing);

    const dynamicGroup = new THREE.Group();
    const presenceGroup = new THREE.Group();
    scene.add(dynamicGroup, presenceGroup);

    // Nhân vật Chibi của người dùng
    const player = createChibiAvatar({
      name: playerName || 'Bạn',
      config: playerAvatar,
      isSelf: true,
      isOnDuty: isSelfOnDuty,
    });
    player.group.position.set(0, 0, 11);
    scene.add(player.group);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 2.8;
    orbit.maxDistance = 42;
    orbit.target.set(0, 1.3, 11);

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setTranslationSnap(0.25);
    transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    transform.addEventListener('dragging-changed', (ev) => {
      orbit.enabled = !ev.value;
      if (!ev.value && transform.object) {
        renderer.shadowMap.needsUpdate = true;
        const pid = transform.object.userData?.placementId as string | undefined;
        if (pid) {
          const p = transform.object.position;
          stateRef.current.onMovePlacement(pid, {
            posX: Number(p.x.toFixed(2)),
            posY: Math.max(0, Number(p.y.toFixed(2))),
            posZ: Number(p.z.toFixed(2)),
            rotY: Number(transform.object.rotation.y.toFixed(3)),
          });
        }
      }
    });
    scene.add(transform.getHelper());

    const gltfLoader = new GLTFLoader();
    const placementMeshes = new Map<string, THREE.Group>();
    const boothMeshes: THREE.Group[] = [];
    const staffAvatars: AnimatedAvatar[] = [];

    sceneObjRef.current = {
      scene,
      renderer,
      camera,
      orbit,
      transform,
      player,
      staffAvatars,
      placementMeshes,
      boothMeshes,
      dynamicGroup,
      presenceGroup,
      highlightRing,
      walkRing,
      walkTarget: null,
      gltfLoader,
      sunLight,
      hemiLight,
      floorMesh,
      dayFloorTex,
      nightFloorTex,
    };

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      keys.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if (sceneObjRef.current) {
          sceneObjRef.current.walkTarget = null;
          walkRing.visible = false;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Raycaster: Click sản phẩm / Click Gian hàng / Click-to-Walk trên mặt sàn
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // 1. Ưu tiên click vào Sản phẩm 3D
      const prodHits = raycaster.intersectObjects(Array.from(placementMeshes.values()), true);
      if (prodHits.length > 0) {
        let obj: THREE.Object3D | null = prodHits[0].object;
        while (obj && !obj.userData?.placementId) obj = obj.parent;
        if (obj?.userData?.placementId) {
          stateRef.current.onSelectPlacement(obj.userData.placementId as string);
          return;
        }
      }

      if (stateRef.current.editMode) {
        stateRef.current.onSelectPlacement(null);
        return;
      }

      // 2. Click vào Gian hàng / Phòng ban -> Tự đi bộ tới trước gian hàng đó
      const boothHits = raycaster.intersectObjects(sceneObjRef.current?.boothMeshes ?? [], true);
      if (boothHits.length > 0) {
        let obj: THREE.Object3D | null = boothHits[0].object;
        while (obj && !obj.userData?.boothId) obj = obj.parent;
        if (obj?.userData?.boothId && sceneObjRef.current) {
          const { standX, standZ, boothId } = obj.userData as { standX: number; standZ: number; boothId: string };
          sceneObjRef.current.walkTarget = new THREE.Vector3(standX, 0, standZ);
          walkRing.position.set(standX, 0.03, standZ);
          walkRing.visible = true;
          stateRef.current.onSelectBooth?.(boothId);
          return;
        }
      }

      // 3. Click vào mặt sàn -> Click-to-Walk mượt mà
      const floorHits = raycaster.intersectObject(floorMesh, false);
      if (floorHits.length > 0 && sceneObjRef.current) {
        const pt = floorHits[0].point;
        const clampedX = THREE.MathUtils.clamp(pt.x, -widthM * 0.5, widthM * 0.5);
        const clampedZ = THREE.MathUtils.clamp(pt.z, -depthM * 0.5, depthM * 0.5);
        sceneObjRef.current.walkTarget = new THREE.Vector3(clampedX, 0, clampedZ);
        walkRing.position.set(clampedX, 0.03, clampedZ);
        walkRing.visible = true;
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();
    let walkTime = 0;
    let totalTime = 0;
    let frameCount = 0;
    let lastZone = '';
    let lastNearId: string | null = null;
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      totalTime += dt;

      let isMoving = false;
      let actualDx = 0;
      let actualDz = 0;

      // A. Điều khiển bằng phím WASD / Mũi tên
      move.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) move.z += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) move.z -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) move.x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) move.x += 1;

      const currentPlayer = sceneObjRef.current?.player ?? player;
      if (move.lengthSq() > 0) {
        move.normalize();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9.5 : 5.4;
        const dx = (forward.x * move.z + right.x * move.x) * speed * dt;
        const dz = (forward.z * move.z + right.z * move.x) * speed * dt;
        const nextX = THREE.MathUtils.clamp(currentPlayer.group.position.x + dx, -widthM * 0.5, widthM * 0.5);
        const nextZ = THREE.MathUtils.clamp(currentPlayer.group.position.z + dz, -depthM * 0.5, depthM * 0.5);
        actualDx = nextX - currentPlayer.group.position.x;
        actualDz = nextZ - currentPlayer.group.position.z;
        currentPlayer.group.position.x = nextX;
        currentPlayer.group.position.z = nextZ;
        currentPlayer.group.rotation.y = Math.atan2(actualDx, actualDz);
        isMoving = true;
      } else if (sceneObjRef.current?.walkTarget) {
        // B. Tự động đi bộ tới điểm Click-to-Walk / Gian hàng
        const target = sceneObjRef.current.walkTarget;
        const diffX = target.x - currentPlayer.group.position.x;
        const diffZ = target.z - currentPlayer.group.position.z;
        const dist = Math.hypot(diffX, diffZ);
        if (dist < 0.25) {
          sceneObjRef.current.walkTarget = null;
          walkRing.visible = false;
        } else {
          const step = Math.min(dist, 6.2 * dt);
          actualDx = (diffX / dist) * step;
          actualDz = (diffZ / dist) * step;
          currentPlayer.group.position.x += actualDx;
          currentPlayer.group.position.z += actualDz;
          currentPlayer.group.rotation.y = Math.atan2(actualDx, actualDz);
          isMoving = true;
        }
      }

      if (isMoving) {
        camera.position.x += actualDx;
        camera.position.z += actualDz;
        orbit.target.x += actualDx;
        orbit.target.z += actualDz;

        walkTime += dt * 11;
        const swing = Math.sin(walkTime) * 0.58;
        currentPlayer.leftLeg.rotation.x = swing;
        currentPlayer.rightLeg.rotation.x = -swing;
        currentPlayer.leftArm.rotation.x = -swing * 0.8;
        currentPlayer.rightArm.rotation.x = swing * 0.8;
        currentPlayer.group.position.y = Math.abs(Math.sin(walkTime)) * 0.055;
      } else {
        currentPlayer.leftLeg.rotation.x *= 0.82;
        currentPlayer.rightLeg.rotation.x *= 0.82;
        currentPlayer.leftArm.rotation.x *= 0.82;
        currentPlayer.rightArm.rotation.x *= 0.82;
        currentPlayer.group.position.y = 0;
        currentPlayer.headGroup.position.y = 1.25 + Math.sin(totalTime * 2.2) * 0.01;
      }

      if (walkRing.visible) {
        const pulse = 1 + Math.sin(totalTime * 6) * 0.14;
        walkRing.scale.set(pulse, pulse, 1);
      }

      for (let i = 0; i < (sceneObjRef.current?.staffAvatars.length ?? 0); i++) {
        const stAv = sceneObjRef.current!.staffAvatars[i];
        stAv.headGroup.position.y = 1.25 + Math.sin(totalTime * 2 + i) * 0.01;
        stAv.rightArm.rotation.z = -0.15 - Math.max(0, Math.sin(totalTime * 1.4 + i * 2.3) - 0.65) * 1.6;
      }

      if (stateRef.current.povMode === 'FIRST') {
        currentPlayer.group.visible = false;
        camera.position.lerp(new THREE.Vector3(currentPlayer.group.position.x, 1.55, currentPlayer.group.position.z), 0.25);
        orbit.target.set(
          currentPlayer.group.position.x + Math.sin(currentPlayer.group.rotation.y) * 2.5,
          1.45,
          currentPlayer.group.position.z + Math.cos(currentPlayer.group.rotation.y) * 2.5,
        );
      } else {
        currentPlayer.group.visible = true;
      }

      orbit.update();

      // Cập nhật tọa độ nhân vật qua ref (KHÔNG gây React re-render 60fps!)
      if (playerPosRef) {
        playerPosRef.current.x = currentPlayer.group.position.x;
        playerPosRef.current.z = currentPlayer.group.position.z;
        playerPosRef.current.rotY = currentPlayer.group.rotation.y;
      }

      frameCount += 1;
      if (frameCount % 15 === 0) {
        let nearId: string | null = null;
        let bestDist = 4.2;
        let nearObj: THREE.Group | null = null;
        for (const [id, mesh] of placementMeshes.entries()) {
          const dist = Math.hypot(mesh.position.x - currentPlayer.group.position.x, mesh.position.z - currentPlayer.group.position.z);
          if (dist < bestDist) {
            bestDist = dist;
            nearId = id;
            nearObj = mesh;
          }
        }
        if (nearObj) {
          highlightRing.visible = true;
          highlightRing.position.set(nearObj.position.x, 0.06, nearObj.position.z);
        } else {
          highlightRing.visible = false;
        }

        let zoneName = sceneKind === 'WAREHOUSE' ? 'Khu vực Kho hàng' : 'Sảnh Triển Lãm Trung Tâm';
        let bestZoneDist = 7.5;
        for (const st of stateRef.current.structures) {
          const dist = Math.hypot(st.posX - currentPlayer.group.position.x, st.posZ - currentPlayer.group.position.z);
          if (dist < bestZoneDist) {
            bestZoneDist = dist;
            zoneName = st.label;
          }
        }
        // Chỉ gọi setState React khi zone hoặc sản phẩm gần nhất THỰC SỰ thay đổi (chống lag tuyệt đối!)
        if (zoneName !== lastZone || nearId !== lastNearId) {
          lastZone = zoneName;
          lastNearId = nearId;
          stateRef.current.onNearbyChange({ zoneName, nearPlacementId: nearId });
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      orbit.dispose();
      transform.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneObjRef.current = null;
    };
  }, [sceneKind, widthM, depthM, branding.companyName, branding.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cập nhật nóng diện mạo & trạng thái trực của chính nhân vật (không reload scene)
  const avatarSig = `${playerName}|${isSelfOnDuty}|${playerAvatar.outfitStyle}|${playerAvatar.outfitColor}|${playerAvatar.pantsColor}|${playerAvatar.hairStyle}|${playerAvatar.hairColor}|${playerAvatar.skinTone}|${playerAvatar.hasGlasses}`;
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const oldPos = obj.player.group.position.clone();
    const oldRotY = obj.player.group.rotation.y;
    obj.scene.remove(obj.player.group);
    const nextPlayer = createChibiAvatar({
      name: playerName || 'Bạn',
      config: playerAvatar,
      isSelf: true,
      isOnDuty: isSelfOnDuty,
    });
    nextPlayer.group.position.copy(oldPos);
    nextPlayer.group.rotation.y = oldRotY;
    obj.scene.add(nextPlayer.group);
    obj.player = nextPlayer;
  }, [avatarSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const bg = nightMode ? '#0f172a' : '#dbeafe';
    obj.scene.background = new THREE.Color(bg);
    obj.scene.fog = new THREE.Fog(nightMode ? '#0f172a' : '#e6effa', 36, 95);
    obj.sunLight.intensity = nightMode ? 0.42 : 1.15;
    obj.hemiLight.intensity = nightMode ? 0.62 : 1.25;
    const floorMat = obj.floorMesh.material as THREE.MeshStandardMaterial;
    floorMat.map = nightMode ? obj.nightFloorTex : obj.dayFloorTex;
    floorMat.needsUpdate = true;
    obj.renderer.shadowMap.needsUpdate = true;
  }, [nightMode]);

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;

    obj.transform.detach();
    obj.dynamicGroup.clear();
    obj.placementMeshes.clear();
    obj.boothMeshes.length = 0;

    for (const st of structures) {
      const mesh = st.kind === 'RACK' ? createWarehouseRackMesh(st) : createExpoBoothMesh(st);
      obj.dynamicGroup.add(mesh);
      if (st.kind !== 'RACK') obj.boothMeshes.push(mesh);
    }

    for (const p of placements) {
      const group = buildProductGroup(p, obj.gltfLoader);
      obj.dynamicGroup.add(group);
      obj.placementMeshes.set(p.id, group);
    }

    if (editMode && selectedPlacementId) {
      const target = obj.placementMeshes.get(selectedPlacementId);
      if (target) obj.transform.attach(target);
    }
    obj.renderer.shadowMap.needsUpdate = true;
  }, [structures, placements]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.presenceGroup.clear();
    obj.staffAvatars.length = 0;
    // Lọc bỏ chính mình khỏi danh sách presences để KHÔNG bao giờ hiện 2 bản sao trùng nhau!
    presences
      .filter((pr) => !currentEmployeeId || pr.employeeId !== currentEmployeeId)
      .forEach((pr) => {
        const av = createChibiAvatar({
          name: pr.employeeName,
          config: pr.avatar,
          isOnDuty: pr.status === 'ON_DUTY',
        });
        av.group.position.set(pr.posX, 0, pr.posZ);
        av.group.rotation.y = pr.rotY;
        obj.presenceGroup.add(av.group);
        obj.staffAvatars.push(av);
      });
    obj.renderer.shadowMap.needsUpdate = true;
  }, [presences, currentEmployeeId]);

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.transform.setMode(transformMode);
    if (editMode && selectedPlacementId) {
      const target = obj.placementMeshes.get(selectedPlacementId);
      if (target) obj.transform.attach(target);
      else obj.transform.detach();
    } else {
      obj.transform.detach();
    }
  }, [editMode, selectedPlacementId, transformMode]);

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj || !teleportTarget) return;
    const { x, z, lookX, lookZ } = teleportTarget;
    obj.walkTarget = null;
    obj.walkRing.visible = false;
    obj.player.group.position.set(x, 0, z);
    if (lookX !== undefined && lookZ !== undefined) {
      obj.player.group.rotation.y = Math.atan2(lookX - x, lookZ - z);
    }
    obj.orbit.target.set(x, 1.3, z);
    obj.camera.position.set(x, 6.2, z + 8.5);
    obj.orbit.update();
  }, [teleportTarget]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: '#dbeafe' }}
    />
  );
}
