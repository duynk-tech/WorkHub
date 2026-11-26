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

interface Props {
  sceneKind: SpaceKind;
  widthM: number;
  depthM: number;
  branding: { appName: string; companyName: string; logoUrl: string };
  structures: SpaceStructure[];
  placements: SpacePlacementView[];
  presences: SpacePresenceView[];
  playerName: string;
  nightMode: boolean;
  povMode: 'THIRD' | 'FIRST';
  editMode: boolean;
  transformMode: 'translate' | 'rotate';
  selectedPlacementId: string | null;
  teleportTarget: TeleportTarget | null;
  onSelectPlacement: (id: string | null) => void;
  onMovePlacement: (id: string, pos: { posX: number; posY: number; posZ: number; rotY: number }) => void;
  onNearbyChange: (info: { zoneName: string; nearPlacementId: string | null; playerPos: { x: number; z: number; rotY: number } }) => void;
}

/** Tạo texture bảng hiệu sắc nét bằng Canvas 2D (phong cách hopcho.maclife.vn). */
function createMarqueeTexture(title: string, subtitle: string, accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 128);

  // Viền phát sáng màu nhấn
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 26), 256, subtitle ? 48 : 64);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 20px Inter, system-ui, sans-serif';
    ctx.fillText(subtitle.slice(0, 34), 256, 92);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo texture mái hiên sọc màu tươi sáng (kiểu gian hàng Showroom). */
function createStripedAwningTexture(accentColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const stripes = 8;
  const sw = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? accentColor : '#f8fafc';
    ctx.fillRect(i * sw, 0, sw, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo texture sàn gạch lưới sáng hiện đại. */
function createFloorTileTexture(night: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = night ? '#1e293b' : '#f1f5f9';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = night ? '#334155' : '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeRect(128, 0, 128, 128);
  ctx.strokeRect(0, 128, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tạo sprite nhãn tên nổi trên đầu nhân vật hoặc sản phẩm. */
function createBadgeSprite(text: string, bgColor = '#0f172a', textColor = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(12, 10, 296, 52, 26);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 22), 160, 36);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.48, 1);
  return sprite;
}

/** Dựng nhân vật Chibi 3D Low-Poly (phong cách hopcho.maclife.vn). */
function createChibiAvatar(name: string, shirtColor: string, isSelf: boolean, isOnDuty = false): THREE.Group {
  const g = new THREE.Group();

  // Chân
  const legMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 });
  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), legMat);
  leftLeg.position.set(-0.11, 0.21, 0);
  leftLeg.castShadow = true;
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.11;
  g.add(leftLeg, rightLeg);

  // Thân áo
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.22, 0.52, 12),
    new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.55 }),
  );
  body.position.y = 0.68;
  body.castShadow = true;
  g.add(body);

  // Tay 2 bên
  const armMat = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.6 });
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 8), armMat);
  leftArm.position.set(-0.26, 0.7, 0);
  leftArm.rotation.z = 0.18;
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.26;
  rightArm.rotation.z = -0.18;
  g.add(leftArm, rightArm);

  // Đầu chibi tròn
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 14),
    new THREE.MeshStandardMaterial({ color: '#fed7aa', roughness: 0.6 }),
  );
  head.position.y = 1.18;
  head.castShadow = true;
  g.add(head);

  // Tóc
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: isSelf ? '#0f172a' : '#78350f', roughness: 0.7 }),
  );
  hair.position.y = 1.21;
  g.add(hair);

  // Thẻ tên nổi
  const label = isOnDuty ? `● ${name}` : name;
  const badge = createBadgeSprite(label, isSelf ? '#2563eb' : isOnDuty ? '#059669' : '#0f172a');
  badge.position.y = 1.72;
  g.add(badge);

  return g;
}

/** Dựng cây xanh Low-Poly trang trí. */
function createLowPolyPlant(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24 * scale, 0.18 * scale, 0.34 * scale, 8),
    new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 }),
  );
  pot.position.y = 0.17 * scale;
  pot.castShadow = true;
  g.add(pot);

  const foliage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.36 * scale, 0),
    new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.65, flatShading: true }),
  );
  foliage.position.y = 0.62 * scale;
  foliage.castShadow = true;
  g.add(foliage);
  return g;
}

/** Dựng gian hàng Showroom / Phòng ban (BOOTH). */
function createBoothMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = s.heightM;

  // Nền gỗ nhạt
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.08, d),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 }),
  );
  base.position.y = 0.04;
  base.receiveShadow = true;
  g.add(base);

  // Quầy trưng bày phía trước (mặt trên cao 0.92m)
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.94, 0.9, 0.95),
    new THREE.MeshStandardMaterial({ color: '#d6bfa2', roughness: 0.65 }),
  );
  counter.position.set(0, 0.45, d * 0.5 - 0.55);
  counter.castShadow = true;
  counter.receiveShadow = true;
  g.add(counter);

  // Dải LED nhấn mặt trước quầy
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: s.accentColor, emissive: s.accentColor, emissiveIntensity: 0.5 }),
  );
  strip.position.set(0, 0.25, d * 0.5 - 0.06);
  g.add(strip);

  // Vách hậu phía sau
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h * 0.85, 0.14),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 }),
  );
  backWall.position.set(0, h * 0.425, -d * 0.5 + 0.08);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  g.add(backWall);

  // 4 cột gỗ khung gian hàng
  const poleMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.75 });
  const poleGeo = new THREE.BoxGeometry(0.12, h, 0.12);
  for (const px of [-w * 0.47, w * 0.47]) {
    for (const pz of [-d * 0.47, d * 0.47]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, h * 0.5, pz);
      pole.castShadow = true;
      g.add(pole);
    }
  }

  // Mái hiên sọc nghiêng phía trên
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.3, 0.1, d + 0.5),
    new THREE.MeshStandardMaterial({ map: createStripedAwningTexture(s.accentColor), roughness: 0.5 }),
  );
  awning.position.set(0, h, 0.12);
  awning.rotation.x = 0.12;
  awning.castShadow = true;
  g.add(awning);

  // Biển hiệu CanvasTexture mặt trước
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.88, 0.68, 0.08),
    new THREE.MeshStandardMaterial({ map: createMarqueeTexture(s.label, s.subLabel || '', s.accentColor), roughness: 0.3 }),
  );
  sign.position.set(0, h - 0.55, d * 0.5 - 0.02);
  g.add(sign);

  // Chậu cây trang trí 2 bên
  const plant = createLowPolyPlant(0.85);
  plant.position.set(w * 0.5 + 0.35, 0, d * 0.35);
  g.add(plant);

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng kệ kho công nghiệp nhiều tầng (RACK). */
function createWarehouseRackMesh(s: SpaceStructure): THREE.Group {
  const g = new THREE.Group();
  const w = s.widthM;
  const d = s.depthM;
  const h = s.heightM;
  const levels = Math.max(2, Math.min(5, s.levels ?? 3));

  const uprightMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', metalness: 0.6, roughness: 0.35 });
  const beamMat = new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.4, roughness: 0.45 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.3, roughness: 0.6 });

  // 4 cột đứng
  const colGeo = new THREE.BoxGeometry(0.1, h, 0.1);
  for (const px of [-w * 0.5 + 0.05, 0, w * 0.5 - 0.05]) {
    for (const pz of [-d * 0.5 + 0.05, d * 0.5 - 0.05]) {
      const col = new THREE.Mesh(colGeo, uprightMat);
      col.position.set(px, h * 0.5, pz);
      col.castShadow = true;
      g.add(col);
    }
  }

  // Các tầng kệ
  for (let lv = 0; lv < levels; lv++) {
    const y = 0.12 + lv * ((h - 0.5) / levels);
    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.06), beamMat);
    frontBeam.position.set(0, y, d * 0.5 - 0.03);
    const backBeam = frontBeam.clone();
    backBeam.position.z = -d * 0.5 + 0.03;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.04, d - 0.08), deckMat);
    deck.position.set(0, y + 0.02, 0);
    deck.receiveShadow = true;
    deck.castShadow = true;

    g.add(frontBeam, backBeam, deck);
  }

  // Biển mã dãy kệ phía trên
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.55, 0.08),
    new THREE.MeshStandardMaterial({ map: createMarqueeTexture(s.label, s.aisleCode ? `KHU ${s.aisleCode}` : 'KỆ KHO', s.accentColor) }),
  );
  sign.position.set(0, h + 0.45, 0);
  g.add(sign);

  g.position.set(s.posX, 0, s.posZ);
  g.rotation.y = s.rotY;
  return g;
}

/** Dựng cổng chào công ty kèm Logo TIM Corp thật. */
function createEntranceArchway(companyName: string, logoUrl: string): THREE.Group {
  const g = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45, metalness: 0.1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#2563eb', emissive: '#2563eb', emissiveIntensity: 0.45 });

  for (const px of [-4.2, 4.2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.4, 0.65), pillarMat);
    pillar.position.set(px, 2.2, 0);
    pillar.castShadow = true;
    g.add(pillar);

    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.8, 0.7), accentMat);
    glow.position.set(px, 2.2, 0);
    g.add(glow);
  }

  // Thanh ngang trên cổng
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(9.4, 1.35, 0.5),
    new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.35 }),
  );
  header.position.set(0, 4.5, 0);
  header.castShadow = true;
  g.add(header);

  // Vẽ bảng tên + logo công ty lên CanvasTexture
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const drawHeader = (img?: HTMLImageElement) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 1008, 176);

    if (img) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(42, 34, 124, 124, 22);
      ctx.fill();
      ctx.drawImage(img, 54, 46, 100, 100);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Inter, system-ui, sans-serif';
    ctx.textAlign = img ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(companyName.toUpperCase().slice(0, 28), img ? 196 : 512, 78);

    ctx.fillStyle = '#60a5fa';
    ctx.font = '600 24px Inter, system-ui, sans-serif';
    ctx.fillText('SHOWROOM 3D & KHÔNG GIAN LÀM VIỆC', img ? 196 : 512, 134);
    tex.needsUpdate = true;
  };

  drawHeader();
  if (logoUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => drawHeader(img);
    img.src = logoUrl;
  }

  const frontPlaque = new THREE.Mesh(
    new THREE.PlaneGeometry(9.0, 1.25),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  frontPlaque.position.set(0, 4.5, 0.27);
  g.add(frontPlaque);

  const backPlaque = frontPlaque.clone();
  backPlaque.position.z = -0.27;
  backPlaque.rotation.y = Math.PI;
  g.add(backPlaque);

  g.position.set(0, 0, -14.2);
  return g;
}

/** Dựng vật thể 3D của sản phẩm từ Product3DModelView (Procedural JSON / GLB / Box Preset). */
function buildProductGroup(
  placement: SpacePlacementView,
  gltfLoader: GLTFLoader,
): THREE.Group {
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
    // Placeholder box trong lúc tải GLB
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshStandardMaterial({ color: m.primaryColor, wireframe: true }),
    );
    placeholder.position.y = m.heightM * 0.5;
    placeholder.userData = { placementId: placement.id };
    root.add(placeholder);

    gltfLoader.load(
      m.glbUrl,
      (gltf) => {
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
      },
      undefined,
      () => {
        // Giữ nguyên fallback box nếu lỗi tải
      },
    );
  } else if (m.modelType === 'PROCEDURAL_JSON' && m.proceduralParts && m.proceduralParts.length > 0) {
    addProcedural(m.proceduralParts);
  } else {
    // BOX_PRESET theo đúng kích thước thực tế + dán ảnh sản phẩm nếu có
    const boxMat = new THREE.MeshStandardMaterial({ color: m.primaryColor, roughness: 0.45, metalness: 0.25 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM), boxMat);
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

  // Nhãn mã hàng nổi phía trên
  const tagText = placement.locationCode ? `${placement.itemCode} · ${placement.locationCode}` : placement.itemCode;
  const tag = createBadgeSprite(tagText, '#0f172a', '#e2e8f0');
  tag.scale.set(1.4, 0.32, 1);
  tag.position.y = m.heightM + 0.36;
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
  nightMode,
  povMode,
  editMode,
  transformMode,
  selectedPlacementId,
  teleportTarget,
  onSelectPlacement,
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
    onMovePlacement,
    onNearbyChange,
  };

  const sceneObjRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transform: TransformControls;
    player: THREE.Group;
    placementMeshes: Map<string, THREE.Group>;
    dynamicGroup: THREE.Group;
    presenceGroup: THREE.Group;
    highlightRing: THREE.Mesh;
    gltfLoader: GLTFLoader;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    floorMesh: THREE.Mesh;
  } | null>(null);

  // Khởi tạo WebGL Scene một lần duy nhất
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f6');
    scene.fog = new THREE.Fog('#eef2f6', 32, 75);

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      150,
    );
    camera.position.set(0, 7.5, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    // Ánh sáng studio ban ngày mềm
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffbeb', 1.15);
    sunLight.position.set(16, 26, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 70;
    sunLight.shadow.camera.left = -26;
    sunLight.shadow.camera.right = 26;
    sunLight.shadow.camera.top = 26;
    sunLight.shadow.camera.bottom = -26;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Sàn gạch lưới
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(48, widthM + 16), Math.max(48, depthM + 16)),
      new THREE.MeshStandardMaterial({ map: createFloorTileTexture(false), roughness: 0.85 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Cổng chào công ty với Logo thật
    const archway = createEntranceArchway(branding.companyName, branding.logoUrl);
    scene.add(archway);

    // 4 cột đèn trang trí lối đi giữa
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.7 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#fde047', emissiveIntensity: 0.9 });
    for (const lx of [-4.2, 4.2]) {
      for (const lz of [-8, 0, 8]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.8, 8), lampPoleMat);
        pole.position.set(lx, 1.9, lz);
        pole.castShadow = true;
        scene.add(pole);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), bulbMat);
        bulb.position.set(lx, 3.85, lz);
        scene.add(bulb);
      }
    }

    // Vòng sáng highlight sản phẩm đang đứng gần
    const highlightRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.78, 32),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    highlightRing.rotation.x = -Math.PI / 2;
    highlightRing.visible = false;
    scene.add(highlightRing);

    const dynamicGroup = new THREE.Group();
    const presenceGroup = new THREE.Group();
    scene.add(dynamicGroup, presenceGroup);

    // Nhân vật Chibi của người dùng
    const player = createChibiAvatar(playerName || 'Bạn', '#2563eb', true);
    player.position.set(0, 0, 10);
    scene.add(player);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 2.5;
    orbit.maxDistance = 38;
    orbit.target.set(0, 1.2, 10);

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

    sceneObjRef.current = {
      scene,
      camera,
      orbit,
      transform,
      player,
      placementMeshes,
      dynamicGroup,
      presenceGroup,
      highlightRing,
      gltfLoader,
      sunLight,
      hemiLight,
      floorMesh,
    };

    // Điều khiển bàn phím WASD / Mũi tên + Shift
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Raycaster click chọn sản phẩm 3D
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
      const targets = Array.from(placementMeshes.values());
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.placementId) obj = obj.parent;
        if (obj?.userData?.placementId) {
          stateRef.current.onSelectPlacement(obj.userData.placementId as string);
        }
      } else if (stateRef.current.editMode) {
        stateRef.current.onSelectPlacement(null);
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

    // Animation loop 60 FPS
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const move = new THREE.Vector3();
    let frameCount = 0;
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      // Di chuyển nhân vật Chibi bằng WASD / Arrow
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

        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9.5 : 5.2;
        const dx = (forward.x * move.z + right.x * move.x) * speed * dt;
        const dz = (forward.z * move.z + right.z * move.x) * speed * dt;

        const maxX = widthM * 0.5 + 2;
        const maxZ = depthM * 0.5 + 2;
        const nextX = THREE.MathUtils.clamp(player.position.x + dx, -maxX, maxX);
        const nextZ = THREE.MathUtils.clamp(player.position.z + dz, -maxZ, maxZ);

        const actualDx = nextX - player.position.x;
        const actualDz = nextZ - player.position.z;
        player.position.x = nextX;
        player.position.z = nextZ;
        player.rotation.y = Math.atan2(actualDx, actualDz);

        // Camera di chuyển theo nhân vật
        camera.position.x += actualDx;
        camera.position.z += actualDz;
        orbit.target.x += actualDx;
        orbit.target.z += actualDz;
      }

      // Chế độ góc nhìn thứ 1 (POV)
      if (stateRef.current.povMode === 'FIRST') {
        player.visible = false;
        const eyeY = 1.55;
        camera.position.lerp(new THREE.Vector3(player.position.x, eyeY, player.position.z), 0.25);
        orbit.target.set(
          player.position.x + Math.sin(player.rotation.y) * 2.5,
          1.45,
          player.position.z + Math.cos(player.rotation.y) * 2.5,
        );
      } else {
        player.visible = true;
      }

      orbit.update();

      // Mỗi ~12 frames kiểm tra sản phẩm / khu vực gần nhất (nhẹ CPU)
      frameCount += 1;
      if (frameCount % 12 === 0) {
        let nearId: string | null = null;
        let bestDist = 4.2;
        let nearObj: THREE.Group | null = null;
        for (const [id, mesh] of placementMeshes.entries()) {
          const dist = Math.hypot(mesh.position.x - player.position.x, mesh.position.z - player.position.z);
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

        let zoneName = sceneKind === 'WAREHOUSE' ? 'Khu vực Kho hàng' : 'Sảnh chính Công ty';
        let bestZoneDist = 7.5;
        for (const st of stateRef.current.structures) {
          const dist = Math.hypot(st.posX - player.position.x, st.posZ - player.position.z);
          if (dist < bestZoneDist) {
            bestZoneDist = dist;
            zoneName = st.label;
          }
        }
        stateRef.current.onNearbyChange({
          zoneName,
          nearPlacementId: nearId,
          playerPos: { x: player.position.x, z: player.position.z, rotY: player.rotation.y },
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
  }, [sceneKind, widthM, depthM, branding.companyName, branding.logoUrl, playerName]);

  // Cập nhật ánh sáng Ngày / Đêm
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const bg = nightMode ? '#0f172a' : '#eef2f6';
    obj.scene.background = new THREE.Color(bg);
    obj.scene.fog = new THREE.Fog(bg, 30, 75);
    obj.sunLight.intensity = nightMode ? 0.35 : 1.15;
    obj.hemiLight.intensity = nightMode ? 0.45 : 0.95;
    const floorMat = obj.floorMesh.material as THREE.MeshStandardMaterial;
    floorMat.map = createFloorTileTexture(nightMode);
    floorMat.needsUpdate = true;
  }, [nightMode]);

  // Dựng lại kết cấu (Phòng ban / Kệ kho) & Sản phẩm khi dữ liệu thay đổi
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;

    obj.transform.detach();
    obj.dynamicGroup.clear();
    obj.placementMeshes.clear();

    for (const st of structures) {
      const mesh = st.kind === 'RACK' ? createWarehouseRackMesh(st) : createBoothMesh(st);
      obj.dynamicGroup.add(mesh);
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

  // Dựng các nhân viên đang trực tại quầy
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.presenceGroup.clear();
    for (const pr of presences) {
      const avatar = createChibiAvatar(pr.employeeName, '#059669', false, true);
      avatar.position.set(pr.posX, 0, pr.posZ);
      avatar.rotation.y = pr.rotY;
      obj.presenceGroup.add(avatar);
    }
  }, [presences]);

  // Gắn / gỡ TransformControls khi chọn đối tượng trong chế độ Thiết kế
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

  // Dịch chuyển tức thì (Teleport)
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj || !teleportTarget) return;
    const { x, z, lookX, lookZ } = teleportTarget;
    obj.player.position.set(x, 0, z);
    if (lookX !== undefined && lookZ !== undefined) {
      obj.player.rotation.y = Math.atan2(lookX - x, lookZ - z);
    }
    obj.orbit.target.set(x, 1.3, z);
    obj.camera.position.set(x, 6.2, z + 8.5);
    obj.orbit.update();
  }, [teleportTarget]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: '#eef2f6' }}
    />
  );
}
