'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
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

export type ChibiHairStyle = 'short' | 'bob' | 'spiky';

interface Props {
  sceneKind: SpaceKind;
  widthM: number;
  depthM: number;
  branding: { appName: string; companyName: string; logoUrl: string };
  structures: SpaceStructure[];
  placements: SpacePlacementView[];
  presences: SpacePresenceView[];
  playerName: string;
  playerShirtColor: string;
  playerHairStyle: ChibiHairStyle;
  nightMode: boolean;
  povMode: 'THIRD' | 'FIRST';
  editMode: boolean;
  transformMode: 'translate' | 'rotate';
  selectedPlacementId: string | null;
  teleportTarget: TeleportTarget | null;
  onSelectPlacement: (id: string | null) => void;
  onSelectBooth?: (boothId: string) => void;
  onMovePlacement: (id: string, pos: { posX: number; posY: number; posZ: number; rotY: number }) => void;
  onNearbyChange: (info: { zoneName: string; nearPlacementId: string | null; playerPos: { x: number; z: number; rotY: number } }) => void;
}

interface AnimatedAvatar {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
}

/** Vẽ khuôn mặt Chibi sắc nét độ phân giải cao (mắt to có điểm sáng, lông mày, mũi, má hồng, miệng cười). */
function createChibiFaceTexture(skinColor = '#ffe4c4'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = skinColor;
  ctx.fillRect(0, 0, 512, 512);

  // Khuôn mặt nằm ở trung tâm UV phía trước (x ~ 256, y ~ 260)
  const drawEye = (cx: number) => {
    // Lông mày cong mềm
    ctx.strokeStyle = '#332218';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, 224, 24, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Tròng mắt đen bóng hình oval
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(cx, 256, 17, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Đốm sáng trắng chính + phụ (tạo hồn Chibi)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 6, 248, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5, 264, 3.2, 0, Math.PI * 2);
    ctx.fill();
  };

  drawEye(212);
  drawEye(300);

  // Má hồng phấn mềm mại
  ctx.fillStyle = 'rgba(244, 114, 182, 0.36)';
  ctx.beginPath();
  ctx.ellipse(184, 286, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(328, 286, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mũi nhỏ dễ thương
  ctx.fillStyle = '#e5b293';
  ctx.beginPath();
  ctx.arc(256, 276, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Miệng cười thân thiện
  ctx.strokeStyle = '#9a3412';
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(256, 288, 16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo nhãn tên nổi sắc nét trên đầu nhân vật / sản phẩm. */
function createBadgeSprite(text: string, bgColor = '#0f172a', textColor = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 76;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(12, 10, 336, 56, 28);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 24), 180, 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.15, 0.46, 1);
  return sprite;
}

/** Dựng nhân vật Chibi 3D cao cấp (có mắt-mũi-má hồng-miệng, tóc nhiều lớp, áo có cổ, thẻ nhân viên, giày sneaker, có khớp đi bộ). */
function createChibiAvatar(opts: {
  name: string;
  shirtColor: string;
  hairStyle?: ChibiHairStyle;
  hairColor?: string;
  isSelf?: boolean;
  isStaffRep?: boolean;
  isOnDuty?: boolean;
}): AnimatedAvatar {
  const { name, shirtColor, hairStyle = 'short', hairColor = '#1e1b18', isSelf = false, isStaffRep = false, isOnDuty = false } = opts;
  const group = new THREE.Group();
  const skinColor = '#ffe4c4';

  // Khớp chân trái / phải kèm giày sneaker trắng
  const makeLeg = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.42, 0);

    const pant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.075, 0.34, 12),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65 }),
    );
    pant.position.y = -0.17;
    pant.castShadow = true;
    pivot.add(pant);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.24),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    );
    shoe.position.set(0, -0.37, 0.04);
    shoe.castShadow = true;
    pivot.add(shoe);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.03, 0.245),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.7 }),
    );
    sole.position.set(0, -0.41, 0.04);
    pivot.add(sole);

    return pivot;
  };

  const leftLeg = makeLeg(-0.115);
  const rightLeg = makeLeg(0.115);
  group.add(leftLeg, rightLeg);

  // Thân áo đồng phục có cổ bẻ trắng
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.23, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.5 }),
  );
  torso.position.y = 0.68;
  torso.castShadow = true;
  group.add(torso);

  // Cổ áo polo trắng
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.07, 14),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }),
  );
  collar.position.y = 0.94;
  group.add(collar);

  // Dây đeo thẻ nhân viên cho nhân viên đứng quầy
  if (isStaffRep || isOnDuty) {
    const lanyard = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.02),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
    );
    lanyard.position.set(0, 0.72, 0.21);
    const badgeStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.035, 0.022),
      new THREE.MeshStandardMaterial({ color: '#2563eb' }),
    );
    badgeStripe.position.set(0, 0.76, 0.212);
    group.add(lanyard, badgeStripe);
  }

  // Khớp tay trái / phải (có ống tay áo + bàn tay tròn)
  const makeArm = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.86, 0);

    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.068, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.5 }),
    );
    sleeve.position.y = -0.09;
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.052, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55 }),
    );
    forearm.position.y = -0.25;
    forearm.castShadow = true;
    pivot.add(forearm);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55 }),
    );
    hand.position.y = -0.36;
    pivot.add(hand);

    return pivot;
  };

  const leftArm = makeArm(-0.25);
  const rightArm = makeArm(0.25);
  group.add(leftArm, rightArm);

  // Đầu Chibi tỷ lệ dễ thương + Khuôn mặt vẽ sắc nét + Tai + Tóc nhiều lớp
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.24;

  const faceTex = createChibiFaceTexture(skinColor);
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 24, 20),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.52 }),
  );
  headMesh.scale.set(1.06, 0.98, 0.96);
  // Xoay UV để tâm khuôn mặt hướng đúng về +Z
  headMesh.rotation.y = -Math.PI / 2;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Tai 2 bên
  const earMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55 });
  const earGeo = new THREE.SphereGeometry(0.06, 10, 10);
  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.position.set(-0.29, -0.02, 0);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.29;
  headGroup.add(leftEar, rightEar);

  // Tóc 3D nhiều lớp
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.62 });
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.305, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat,
  );
  hairCap.scale.set(1.07, 1.0, 0.99);
  hairCap.position.y = 0.025;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  // Mái trước tạo dáng Chibi
  const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.11, 0.14), hairMat);
  bangs.position.set(0, 0.17, 0.21);
  bangs.rotation.x = 0.28;
  headGroup.add(bangs);

  if (hairStyle === 'bob') {
    for (const sx of [-0.26, 0.26]) {
      const sideLock = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.34, 10), hairMat);
      sideLock.position.set(sx, -0.05, -0.02);
      headGroup.add(sideLock);
    }
    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.18), hairMat);
    backHair.position.set(0, -0.05, -0.22);
    headGroup.add(backHair);
  } else if (hairStyle === 'spiky') {
    for (let i = -1; i <= 1; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), hairMat);
      spike.position.set(i * 0.1, 0.34, 0.04);
      spike.rotation.z = -i * 0.22;
      headGroup.add(spike);
    }
  }

  group.add(headGroup);

  // Nhãn tên nổi phía trên đầu
  const badgeLabel = isOnDuty ? `● Đang trực · ${name}` : isStaffRep ? `Tư vấn · ${name}` : name;
  const badgeBg = isSelf ? '#2563eb' : isOnDuty ? '#059669' : isStaffRep ? '#0f172a' : '#334155';
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

  // 3. Hệ cột thép kiến trúc & giàn mái Truss công nghiệp + Đèn High-Bay LED
  const steelMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.55, roughness: 0.35 });
  const ledLightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const zPositions = [-halfD + 2, -halfD * 0.45, 0, halfD * 0.45, halfD - 2];

  for (const pz of zPositions) {
    for (const px of [-halfW, halfW]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, hallH, 0.42), steelMat);
      col.position.set(px, hallH * 0.5, pz);
      col.castShadow = true;
      env.add(col);
    }
    // Thanh giàn thép bắc ngang mái
    const truss = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.5, 0.32, 0.24), steelMat);
    truss.position.set(0, hallH, pz);
    env.add(truss);

    // Dàn đèn High-Bay LED trên giàn mái
    for (const lx of [-8, 0, 8]) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.36), ledLightMat);
      fixture.position.set(lx, hallH - 0.2, pz);
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
  playerName,
  playerShirtColor,
  playerHairStyle,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Ánh sáng 3 điểm chuẩn Exhibition Hall sáng trong
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#e2e8f0', 1.25);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffaf0', 1.15);
    sunLight.position.set(18, 28, 16);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 85;
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight('#dbeafe', 0.45);
    fillLight.position.set(-16, 14, -12);
    scene.add(fillLight);

    // Sàn Epoxy nhà triển lãm
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM + 4, depthM + 6),
      new THREE.MeshStandardMaterial({ map: createEpoxyFloorTexture(false, sceneKind === 'WAREHOUSE'), roughness: 0.65, metalness: 0.08 }),
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
      shirtColor: playerShirtColor || '#2563eb',
      hairStyle: playerHairStyle,
      isSelf: true,
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

      if (move.lengthSq() > 0) {
        move.normalize();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9.5 : 5.4;
        const dx = (forward.x * move.z + right.x * move.x) * speed * dt;
        const dz = (forward.z * move.z + right.z * move.x) * speed * dt;
        const nextX = THREE.MathUtils.clamp(player.group.position.x + dx, -widthM * 0.5, widthM * 0.5);
        const nextZ = THREE.MathUtils.clamp(player.group.position.z + dz, -depthM * 0.5, depthM * 0.5);
        actualDx = nextX - player.group.position.x;
        actualDz = nextZ - player.group.position.z;
        player.group.position.x = nextX;
        player.group.position.z = nextZ;
        player.group.rotation.y = Math.atan2(actualDx, actualDz);
        isMoving = true;
      } else if (sceneObjRef.current?.walkTarget) {
        // B. Tự động đi bộ tới điểm Click-to-Walk / Gian hàng
        const target = sceneObjRef.current.walkTarget;
        const diffX = target.x - player.group.position.x;
        const diffZ = target.z - player.group.position.z;
        const dist = Math.hypot(diffX, diffZ);
        if (dist < 0.25) {
          sceneObjRef.current.walkTarget = null;
          walkRing.visible = false;
        } else {
          const step = Math.min(dist, 6.2 * dt);
          actualDx = (diffX / dist) * step;
          actualDz = (diffZ / dist) * step;
          player.group.position.x += actualDx;
          player.group.position.z += actualDz;
          player.group.rotation.y = Math.atan2(actualDx, actualDz);
          isMoving = true;
        }
      }

      if (isMoving) {
        camera.position.x += actualDx;
        camera.position.z += actualDz;
        orbit.target.x += actualDx;
        orbit.target.z += actualDz;

        // Hoạt ảnh bước chân & đánh tay Chibi mượt mà
        walkTime += dt * 11;
        const swing = Math.sin(walkTime) * 0.58;
        player.leftLeg.rotation.x = swing;
        player.rightLeg.rotation.x = -swing;
        player.leftArm.rotation.x = -swing * 0.8;
        player.rightArm.rotation.x = swing * 0.8;
        player.group.position.y = Math.abs(Math.sin(walkTime)) * 0.06;
      } else {
        // Đứng yên: trả tay chân về tự nhiên + nhịp thở nhẹ
        player.leftLeg.rotation.x *= 0.82;
        player.rightLeg.rotation.x *= 0.82;
        player.leftArm.rotation.x *= 0.82;
        player.rightArm.rotation.x *= 0.82;
        player.group.position.y = 0;
        player.headGroup.position.y = 1.24 + Math.sin(totalTime * 2.2) * 0.012;
      }

      // Hiệu ứng vòng đích Click-to-Walk nhấp nháy nhẹ
      if (walkRing.visible) {
        const pulse = 1 + Math.sin(totalTime * 6) * 0.14;
        walkRing.scale.set(pulse, pulse, 1);
      }

      // Hoạt ảnh nhẹ cho các nhân viên đứng quầy (gật đầu / vẫy tay chào thân thiện)
      for (let i = 0; i < (sceneObjRef.current?.staffAvatars.length ?? 0); i++) {
        const stAv = sceneObjRef.current!.staffAvatars[i];
        stAv.headGroup.position.y = 1.24 + Math.sin(totalTime * 2 + i) * 0.012;
        stAv.rightArm.rotation.z = -0.15 - Math.max(0, Math.sin(totalTime * 1.4 + i * 2.3) - 0.65) * 1.8;
      }

      if (stateRef.current.povMode === 'FIRST') {
        player.group.visible = false;
        camera.position.lerp(new THREE.Vector3(player.group.position.x, 1.55, player.group.position.z), 0.25);
        orbit.target.set(
          player.group.position.x + Math.sin(player.group.rotation.y) * 2.5,
          1.45,
          player.group.position.z + Math.cos(player.group.rotation.y) * 2.5,
        );
      } else {
        player.group.visible = true;
      }

      orbit.update();

      frameCount += 1;
      if (frameCount % 12 === 0) {
        let nearId: string | null = null;
        let bestDist = 4.2;
        let nearObj: THREE.Group | null = null;
        for (const [id, mesh] of placementMeshes.entries()) {
          const dist = Math.hypot(mesh.position.x - player.group.position.x, mesh.position.z - player.group.position.z);
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
          const dist = Math.hypot(st.posX - player.group.position.x, st.posZ - player.group.position.z);
          if (dist < bestZoneDist) {
            bestZoneDist = dist;
            zoneName = st.label;
          }
        }
        stateRef.current.onNearbyChange({
          zoneName,
          nearPlacementId: nearId,
          playerPos: { x: player.group.position.x, z: player.group.position.z, rotY: player.group.rotation.y },
        });
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
  }, [sceneKind, widthM, depthM, branding.companyName, branding.logoUrl, playerName, playerShirtColor, playerHairStyle]);

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const bg = nightMode ? '#0f172a' : '#dbeafe';
    obj.scene.background = new THREE.Color(bg);
    obj.scene.fog = new THREE.Fog(nightMode ? '#0f172a' : '#e6effa', 36, 95);
    obj.sunLight.intensity = nightMode ? 0.38 : 1.15;
    obj.hemiLight.intensity = nightMode ? 0.55 : 1.25;
    const floorMat = obj.floorMesh.material as THREE.MeshStandardMaterial;
    floorMat.map = createEpoxyFloorTexture(nightMode, sceneKind === 'WAREHOUSE');
    floorMat.needsUpdate = true;
  }, [nightMode, sceneKind]);

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
  }, [structures, placements]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.presenceGroup.clear();
    obj.staffAvatars.length = 0;
    const hairStyles: ChibiHairStyle[] = ['short', 'bob', 'spiky'];
    const hairColors = ['#1e1b18', '#451a03', '#27272a', '#713f12'];
    presences.forEach((pr, idx) => {
      const av = createChibiAvatar({
        name: pr.employeeName,
        shirtColor: pr.status === 'ON_DUTY' ? '#059669' : '#1d4ed8',
        hairStyle: hairStyles[idx % hairStyles.length],
        hairColor: hairColors[idx % hairColors.length],
        isStaffRep: true,
        isOnDuty: pr.status === 'ON_DUTY',
      });
      av.group.position.set(pr.posX, 0, pr.posZ);
      av.group.rotation.y = pr.rotY;
      obj.presenceGroup.add(av.group);
      obj.staffAvatars.push(av);
    });
  }, [presences]);

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
