'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type {
  Avatar3DConfig,
  SpaceKind,
  SpacePlacementView,
  RemoteBubble,
  RemotePlayerMeta,
  RemotePlayerState,
  SpaceMerchItem,
  SpacePresenceView,
  SpaceStructure,
} from '@/lib/space-3d-types';

import {
  BUBBLE_VISIBLE_DIST,
  animateAvatarIdle,
  createChibiAvatar,
  poseSit,
  poseWalk,
  relaxPose,
  disposeObject,
  htmlLabels,
  prepareRemoteAvatar,
  remoteSig,
  syncBubble,
  type AnimatedAvatar,
  type BubbleSlot,
} from './three/avatars';
import { createExhibitionHallEnvironment } from './three/hall';
import { createCafeEnvironment, createOfficeEnvironment, createWarehouseEnvironment } from './three/environments';
import { carpetTileTex, plankTex } from './three/props/textures';
import { buildSpaceObject, objectSignature, applyTransform } from './three/props/registry';
import type { ShelfSlot } from './three/props/kit';
import { buildMerchandise } from './three/props/packaging';
import { resolveMerchItems } from '@/lib/space-3d-merch';
import { SPACE_OBJECT_DEF_MAP } from '@/lib/space-3d-catalog';
import { SEATABLE_KINDS, clampInside, findCollisions, pickSeat, seatsFor, snap, type Seat } from '@/lib/space-3d-layout';
import { buildProductGroup } from './three/products';
import { createEpoxyTextures, windUniform } from './three/materials';
import { mergeStaticGroup } from './three/merge';
import { createRenderPipeline, type RenderPipeline } from './three/pipeline';
import { createEnvironmentMap, createSkySystem, type SkySystem } from './three/sky';
import { createDayNightRig, type DayNightRig } from './three/lighting';
import { createCameraRig, type CameraRig } from './three/camera-rig';
import {
  QUALITY_PRESETS,
  createFpsGovernor,
  detectQuality,
  lowerQuality,
  type QualityLevel,
  type QualityPref,
} from './three/quality';

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
  playerPosRef?: React.MutableRefObject<{ x: number; z: number; rotY: number; sit?: number }>;
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
  /** Realtime: roster người chơi khác (Presence) */
  remoteRoster?: RemotePlayerMeta[];
  /** Realtime: vị trí mục tiêu của người chơi khác — đọc trong vòng animate, không re-render */
  remoteStateRef?: React.MutableRefObject<Map<number, RemotePlayerState>>;
  /** Realtime: bong bóng chat gần (kể cả của chính mình) */
  bubbleRef?: React.MutableRefObject<Map<number, RemoteBubble>>;
  /** Realtime đã kết nối → bỏ avatar tĩnh từ SpacePresence (tránh avatar "ma") */
  realtimeLive?: boolean;
  onSelectRemotePlayer?: (employeeId: number) => void;
  /** Preset đồ họa người dùng chọn ('auto' = tự đo FPS) */
  qualityPref?: QualityPref;
  onQualityChange?: (level: QualityLevel) => void;
  /** Chạy intro bay camera khi chuyển sang true */
  playIntro?: boolean;
  /** Hiện bảng FPS / draw call */
  debug?: boolean;
  /** Trình thiết kế: vật thể đang chọn */
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Kết thúc kéo vật thể trên sàn (đã snap & kẹp trong mặt bằng) */
  onObjectMoved?: (id: string, pos: { posX: number; posZ: number }) => void;
  /** Loại vật thể đang được kéo từ thư viện (HTML5 drag) */
  draggingKind?: string | null;
  onDropObject?: (kind: string, x: number, z: number) => void;
  /** Hook khi kệ dựng xong (tuỳ chọn) */
  onShelvesBuilt?: (id: string, root: THREE.Group, shelves: ShelfSlot[]) => void;
  /** Hàng hoá công khai để xếp lên kệ */
  merchItems?: SpaceMerchItem[];
  /** Mặt bằng 2D nhìn từ trên (ẩn mái, hiện lưới 1m) */
  planView?: boolean;
  /** Bấm vào hàng hoá trên kệ → xem thông tin & giá */
  onSelectMerchItem?: (itemId: number) => void;
  /** Đang trò chuyện với nhân viên này → 2 nhân vật quay mặt vào nhau */
  faceEmployeeId?: number | null;
  /** Bấm vào ghế → báo ghế được chọn (hiện nút "Ngồi ghế"); null = bỏ chọn */
  onSeatCandidate?: (info: { label: string } | null) => void;
  /** Trạng thái ngồi thay đổi (hiện nút "Đứng dậy") */
  onSittingChange?: (sitting: boolean) => void;
  /** Lệnh từ giao diện: ngồi vào ghế đã chọn / đứng dậy (nonce đổi mỗi lần bấm) */
  seatCommand?: { kind: 'sit' | 'stand'; nonce: number } | null;
}

interface RemoteAvatarEntry {
  av: AnimatedAvatar;
  sig: string;
  walkTime: number;
}



/** Bán kính thân người (m) để tránh chồng nhân vật / đi xuyên đồ đạc */
const BODY_RADIUS = 0.3;
const MAX_REMOTE_AVATARS = 30;
const PASS_THROUGH = new Set(['RUG', 'PENDANT_LIGHT', 'WALL_ART', 'MENU_BOARD', 'DOOR', 'BOOTH']); // gian hàng mở: được bước vào

/**
 * Đẩy vị trí `pos` ra khỏi các nhân vật khác (hình tròn) và vật thể (hộp xoay theo rotY).
 * Trả về true nếu có va chạm.
 */
function resolveBodyCollisions(pos: THREE.Vector3, avatars: THREE.Object3D[], objects: SpaceStructure[] | null): boolean {
  let hit = false;
  for (const a of avatars) {
    const dx = pos.x - a.position.x;
    const dz = pos.z - a.position.z;
    const d = Math.hypot(dx, dz);
    const min = BODY_RADIUS * 2;
    if (d < min) {
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      pos.x += nx * (min - d);
      pos.z += nz * (min - d);
      hit = true;
    }
  }
  if (objects) {
    for (const o of objects) {
      if (PASS_THROUGH.has(o.kind) || (o.posY ?? 0) > 0.3) continue;
      const rx = pos.x - o.posX;
      const rz = pos.z - o.posZ;
      if (Math.abs(rx) > o.widthM + o.depthM + 1 || Math.abs(rz) > o.widthM + o.depthM + 1) continue;
      // Đổi sang hệ toạ độ cục bộ của vật thể
      const c = Math.cos(o.rotY);
      const s = Math.sin(o.rotY);
      const lx = rx * c - rz * s;
      const lz = rx * s + rz * c;
      const hx = o.widthM / 2 + BODY_RADIUS;
      const hz = o.depthM / 2 + BODY_RADIUS;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const px = hx - Math.abs(lx);
        const pz = hz - Math.abs(lz);
        let nlx = lx;
        let nlz = lz;
        if (px < pz) nlx = Math.sign(lx || 1) * hx;
        else nlz = Math.sign(lz || 1) * hz;
        pos.x = o.posX + nlx * c + nlz * s;
        pos.z = o.posZ - nlx * s + nlz * c;
        hit = true;
      }
    }
  }
  return hit;
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
  remoteRoster,
  remoteStateRef,
  bubbleRef,
  realtimeLive = false,
  onSelectRemotePlayer,
  qualityPref = 'auto',
  onQualityChange,
  playIntro = false,
  debug = false,
  selectedObjectId = null,
  onSelectObject,
  onObjectMoved,
  draggingKind = null,
  onDropObject,
  onShelvesBuilt,
  merchItems = [],
  planView = false,
  onSelectMerchItem,
  faceEmployeeId = null,
  onSeatCandidate,
  onSittingChange,
  seatCommand = null,
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
    remoteStateRef,
    bubbleRef,
    onSelectRemotePlayer,
    currentEmployeeId,
    qualityPref,
    onQualityChange,
    debug,
    selectedObjectId,
    onSelectObject,
    onObjectMoved,
    draggingKind,
    onDropObject,
    onShelvesBuilt,
    branding,
    planView,
    onSelectMerchItem,
    faceEmployeeId,
    onSeatCandidate,
    onSittingChange,
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
    remoteStateRef,
    bubbleRef,
    onSelectRemotePlayer,
    currentEmployeeId,
    qualityPref,
    onQualityChange,
    debug,
    selectedObjectId,
    onSelectObject,
    onObjectMoved,
    draggingKind,
    onDropObject,
    onShelvesBuilt,
    branding,
    planView,
    onSelectMerchItem,
    faceEmployeeId,
    onSeatCandidate,
    onSittingChange,
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
    objectsGroup: THREE.Group;
    objectMap: Map<string, { sig: string; root: THREE.Group; shelves: ShelfSlot[] }>;
    selectionBox: THREE.Box3Helper;
    ghost: THREE.Mesh;
    dynamicGroup: THREE.Group;
    presenceGroup: THREE.Group;
    remoteGroup: THREE.Group;
    remoteAvatars: Map<number, RemoteAvatarEntry>;
    remoteBubbles: Map<number, BubbleSlot>;
    selfBubble: BubbleSlot;
    highlightRing: THREE.Mesh;
    walkRing: THREE.Mesh;
    walkTarget: THREE.Vector3 | null;
    gltfLoader: GLTFLoader;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    floorMesh: THREE.Mesh;
    pipeline: RenderPipeline;
    rig: DayNightRig;
    camRig: CameraRig;
    sky: SkySystem;
    envOccluders: THREE.Object3D[];
    occluders: THREE.Object3D[];
    quality: QualityLevel;
    applyQuality: (level: QualityLevel) => void;
  } | null>(null);
  const introPlayedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog('#bfd3ea', 80, 380);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      1500,
    );
    // Đặt camera thấp hơn xà giàn mái gần lối vào để không bị che khi vừa vào
    // Điểm xuất phát gần lối vào (mặt trước +Z), co theo không gian nhỏ (quán cà phê / văn phòng)
    // Kho có tường mặt tiền kín (cửa cuốn) → xuất phát sâu hơn để camera nằm trong nhà
    const spawnZ = sceneKind === 'WAREHOUSE' ? depthM / 2 - 6.5 : Math.min(11, depthM / 2 - 2.5);
    // Camera thấp & gần hơn: luồn dưới xà cổng chào (đáy xà ~4.3m), không bị cổng che
    camera.position.set(0, 2.9, spawnZ + 5.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    let qualityLevel: QualityLevel =
      stateRef.current.qualityPref && stateRef.current.qualityPref !== 'auto'
        ? stateRef.current.qualityPref
        : detectQuality(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PRESETS[qualityLevel].maxPixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // Neutral (Khronos PBR) giữ màu & chữ trắng trên lightbox trung thực hơn ACES
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.info.autoReset = false; // đếm draw call cả frame (composer render nhiều pass)
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Lớp nhãn HTML (tên nhân vật, bong bóng chat) — chữ trình duyệt vẽ nên luôn sắc nét
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;user-select:none;caret-color:transparent';
    container.appendChild(labelRenderer.domElement);

    // Environment map procedural (phản chiếu PBR cho thép, kính, sàn epoxy)
    const envRT = createEnvironmentMap(renderer);
    scene.environment = envRT.texture;

    // Bầu trời procedural (Sky vật lý + dome đêm, sao, trăng, mây)
    const skySys = createSkySystem();
    scene.add(skySys.group);

    // Ánh sáng 3 điểm chuẩn Exhibition Hall sáng trong
    const hemiLight = new THREE.HemisphereLight('#eaf2ff', '#c9d3df', 0.55);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff4e0', 2.6);
    sunLight.position.set(18, 28, 16);
    sunLight.castShadow = true;
    // Frustum bóng ôm sát mặt bằng hội trường (+ biên cho cây/cổng chào) → texel nhỏ, bóng sắc nét
    const shadowRadius = Math.hypot(widthM * 0.5 + 7, depthM * 0.5 + 9);
    sunLight.shadow.mapSize.set(QUALITY_PRESETS[qualityLevel].shadowMapSize, QUALITY_PRESETS[qualityLevel].shadowMapSize);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 110;
    sunLight.shadow.camera.left = -shadowRadius;
    sunLight.shadow.camera.right = shadowRadius;
    sunLight.shadow.camera.top = shadowRadius;
    sunLight.shadow.camera.bottom = -shadowRadius;
    sunLight.shadow.bias = -0.0002;
    // normalBias theo kích thước texel bóng → hết sọc acne/nhấp nháy ở mọi preset
    const fitBias = (size: number) => {
      sunLight.shadow.normalBias = ((shadowRadius * 2) / size) * 1.25;
    };
    fitBias(QUALITY_PRESETS[qualityLevel].shadowMapSize);
    sunLight.shadow.radius = 3;
    scene.add(sunLight, sunLight.target);

    const fillLight = new THREE.DirectionalLight('#dbeafe', 0.35);
    fillLight.position.set(-16, 14, -12);
    scene.add(fillLight);

    // Sàn Epoxy bóng (clearcoat phản chiếu environment + đèn); màu sàn do rig Ngày/Đêm điều khiển
    const floorTex = createEpoxyTextures(sceneKind === 'WAREHOUSE', Math.round((widthM + 4) / 2));
    const isCafe = sceneKind === 'CAFE';
    const isOffice = sceneKind === 'OFFICE';
    const isWarehouse = sceneKind === 'WAREHOUSE';
    let floorMapOverride: THREE.Texture | null = null;
    if (isCafe || isOffice) {
      // Quán cà phê: sàn gỗ ván dài; Văn phòng: thảm tấm
      floorMapOverride = (isCafe ? plankTex() : carpetTileTex()).clone();
      floorMapOverride.repeat.set((widthM + 4) / (isCafe ? 4 : 3), (depthM + 6) / (isCafe ? 4 : 3));
      floorMapOverride.needsUpdate = true;
    }
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: floorMapOverride ?? floorTex.map,
      roughnessMap: floorMapOverride ? null : floorTex.roughnessMap,
      roughness: isOffice ? 0.95 : isCafe ? 0.5 : 0.42,
      metalness: 0,
      clearcoat: isOffice ? 0 : isCafe ? 0.35 : 0.65,
      clearcoatRoughness: isCafe ? 0.3 : 0.14,
    });
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM + (isCafe || isOffice || isWarehouse ? 0.2 : 4), depthM + (isCafe || isOffice || isWarehouse ? 0.2 : 6)),
      floorMat,
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isWalkableFloor: true };
    scene.add(floorMesh);

    // Kiến trúc Nhà triển lãm + Cây cối bên ngoài + Logo TIM Corp
    // Gộp geometry tĩnh theo vật liệu → giảm mạnh draw call
    const interior = isCafe
      ? createCafeEnvironment(widthM, depthM, branding.companyName)
      : isOffice
        ? createOfficeEnvironment(widthM, depthM, branding.companyName)
        : isWarehouse
          ? createWarehouseEnvironment(widthM, depthM, branding.companyName)
          : null;
    const hallEnv = mergeStaticGroup(
      interior ? interior.group : createExhibitionHallEnvironment(widthM, depthM, sceneKind, branding.companyName, branding.logoUrl),
    );
    // Đèn nội thất ấm (point light) không merge được → thêm riêng
    interior?.lights.forEach((l) => scene.add(l));
    scene.add(hallEnv);
    const envOccluders = hallEnv.children.filter((c) => c.userData.occluder);

    // Pipeline hậu kỳ + rig Ngày/Đêm
    let pipeline = createRenderPipeline(
      renderer,
      scene,
      camera,
      QUALITY_PRESETS[qualityLevel],
      container.clientWidth,
      container.clientHeight,
    );
    const rig = createDayNightRig({ scene, renderer, sun: sunLight, hemi: hemiLight, fill: fillLight, sky: skySys, floorMat, pipeline });

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
    const objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
    // Khung chọn vật thể (xanh = hợp lệ, đỏ = chồng lấn)
    const selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#38bdf8'));
    selectionBox.visible = false;
    (selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    selectionBox.renderOrder = 20;
    scene.add(selectionBox);
    // Bóng xem trước khi kéo vật thể từ thư viện vào
    const ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    ghost.rotation.x = -Math.PI / 2;
    ghost.position.y = 0.03;
    ghost.visible = false;
    scene.add(ghost);
    const presenceGroup = new THREE.Group();
    const remoteGroup = new THREE.Group();
    scene.add(dynamicGroup, presenceGroup, remoteGroup);

    // Nhân vật Chibi của người dùng
    const player = createChibiAvatar({
      name: playerName || 'Bạn',
      config: playerAvatar,
      isSelf: true,
      isOnDuty: isSelfOnDuty,
    });
    player.group.position.set(0, 0, spawnZ);
    scene.add(player.group);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 2.8;
    orbit.maxDistance = 42;
    orbit.target.set(0, 1.3, spawnZ);
    orbit.update();

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

    const camRig = createCameraRig(
      camera,
      orbit,
      () => sceneObjRef.current?.occluders ?? envOccluders,
      () => stateRef.current.povMode !== 'FIRST' && !stateRef.current.planView,
    );
    const onWheel = () => camRig.notifyZoom();
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
    renderer.domElement.addEventListener('touchmove', onWheel, { passive: true });

    const applyQuality = (level: QualityLevel) => {
      const q = QUALITY_PRESETS[level];
      qualityLevel = level;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
      renderer.setSize(container.clientWidth, container.clientHeight);
      if (sunLight.shadow.mapSize.x !== q.shadowMapSize) {
        sunLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        fitBias(q.shadowMapSize);
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;
        renderer.shadowMap.needsUpdate = true;
      }
      pipeline.dispose();
      pipeline = createRenderPipeline(renderer, scene, camera, q, container.clientWidth, container.clientHeight);
      rig.setPipeline(pipeline);
      if (sceneObjRef.current) {
        sceneObjRef.current.pipeline = pipeline;
        sceneObjRef.current.quality = level;
      }
      stateRef.current.onQualityChange?.(level);
    };
    const governor = createFpsGovernor(() => {
      if (stateRef.current.qualityPref !== 'auto' || qualityLevel === 'low') return;
      applyQuality(lowerQuality(qualityLevel));
    });

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
      objectsGroup,
      objectMap: new Map(),
      selectionBox,
      ghost,
      dynamicGroup,
      presenceGroup,
      remoteGroup,
      remoteAvatars: new Map(),
      remoteBubbles: new Map(),
      selfBubble: { sprite: null, text: '' },
      highlightRing,
      walkRing,
      walkTarget: null,
      gltfLoader,
      sunLight,
      hemiLight,
      floorMesh,
      pipeline,
      rig,
      camRig,
      sky: skySys,
      envOccluders,
      occluders: envOccluders,
      quality: qualityLevel,
      applyQuality,
    };
    stateRef.current.onQualityChange?.(qualityLevel);
    // ?debug=1: lộ scene ra window để kiểm tra trực quan (không bật ở chế độ thường)
    if (stateRef.current.debug) (window as unknown as { __space3d?: unknown }).__space3d = sceneObjRef.current;

    // Bảng debug (?debug=1) cập nhật trực tiếp DOM, không qua React
    const debugEl = document.createElement('div');
    debugEl.style.cssText =
      'position:fixed;left:12px;bottom:84px;z-index:70;padding:6px 10px;border-radius:8px;background:rgba(2,6,23,.78);color:#a7f3d0;font:11px/1.5 ui-monospace,monospace;pointer-events:none;white-space:pre;display:none';
    container.appendChild(debugEl);
    let debugFrames = 0;
    let debugTime = 0;

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (camRig.introActive) camRig.skipIntro();
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
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const setPointer = (e: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    /** Vật thể (theo id) dưới con trỏ, ưu tiên trước sản phẩm khi đang ở chế độ thiết kế */
    const pickObject = (): string | null => {
      const hits = raycaster.intersectObjects(objectsGroup.children, true);
      for (const h of hits) {
        const id = h.object.userData?.objectId as string | undefined;
        if (id) return id;
      }
      return null;
    };
    let drag: { id: string; offX: number; offZ: number; moved: boolean } | null = null;
    // Góc nhìn thứ nhất: kéo chuột để quay đầu (yaw/pitch có giảm chấn)
    const fp = { active: false, yaw: 0, pitch: 0, yawT: 0, pitchT: 0, looking: false, lx: 0, ly: 0 };
    const fpLook = new THREE.Vector3();
    const onFpDown = (e: PointerEvent) => {
      if (!fp.active || stateRef.current.editMode) return;
      fp.looking = true;
      fp.lx = e.clientX;
      fp.ly = e.clientY;
    };
    const onFpMove = (e: PointerEvent) => {
      if (!fp.looking) return;
      const dx = e.clientX - fp.lx;
      const dy = e.clientY - fp.ly;
      fp.lx = e.clientX;
      fp.ly = e.clientY;
      fp.yawT -= dx * 0.0042;
      fp.pitchT = THREE.MathUtils.clamp(fp.pitchT - dy * 0.0035, -1.1, 0.9);
    };
    const onFpUp = () => {
      fp.looking = false;
    };
    renderer.domElement.addEventListener('pointerdown', onFpDown);
    window.addEventListener('pointermove', onFpMove);
    window.addEventListener('pointerup', onFpUp);

    const updateSelectionBox = (id: string | null, collide = false) => {
      const entry = id ? sceneObjRef.current?.objectMap.get(id) : null;
      if (!entry) {
        selectionBox.visible = false;
        return;
      }
      selectionBox.box.setFromObject(entry.root);
      selectionBox.box.expandByScalar(0.03);
      (selectionBox.material as THREE.LineBasicMaterial).color.set(collide ? '#ef4444' : '#38bdf8');
      selectionBox.visible = true;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (camRig.introActive) camRig.skipIntro();
      downX = e.clientX;
      downY = e.clientY;
      if (!stateRef.current.editMode || e.button !== 0) return;
      setPointer(e);
      // Sản phẩm (TransformControls) ưu tiên nếu đang chọn sản phẩm
      if (transform.dragging) return;
      const id = pickObject();
      if (!id) return;
      const o = stateRef.current.structures.find((x) => x.id === id);
      if (!o || o.locked) {
        stateRef.current.onSelectObject?.(id);
        return;
      }
      if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
        drag = { id, offX: hitPoint.x - o.posX, offZ: hitPoint.z - o.posZ, moved: false };
        orbit.enabled = false;
        stateRef.current.onSelectObject?.(id);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      setPointer(e);
      if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
      const entry = sceneObjRef.current?.objectMap.get(drag.id);
      const o = stateRef.current.structures.find((x) => x.id === drag!.id);
      if (!entry || !o) return;
      let nx = hitPoint.x - drag.offX;
      let nz = hitPoint.z - drag.offZ;
      if (!e.altKey) {
        nx = snap(nx);
        nz = snap(nz);
      }
      const clamped = clampInside({ ...o, posX: nx, posZ: nz }, widthM, depthM);
      if (Math.abs(clamped.posX - o.posX) > 0.001 || Math.abs(clamped.posZ - o.posZ) > 0.001) drag.moved = true;
      entry.root.position.x = clamped.posX;
      entry.root.position.z = clamped.posZ;
      entry.root.userData.dragPos = { posX: clamped.posX, posZ: clamped.posZ };
      const others = stateRef.current.structures.map((x) => (x.id === o.id ? clamped : x));
      updateSelectionBox(o.id, findCollisions(others, o.id).length > 0);
    };
    const endDrag = () => {
      if (!drag) return false;
      const d = drag;
      drag = null;
      orbit.enabled = true;
      const entry = sceneObjRef.current?.objectMap.get(d.id);
      const pos = entry?.root.userData.dragPos as { posX: number; posZ: number } | undefined;
      if (entry) delete entry.root.userData.dragPos;
      if (d.moved && pos) {
        stateRef.current.onObjectMoved?.(d.id, pos);
        renderer.shadowMap.needsUpdate = true;
      }
      return true;
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDrag = drag !== null;
      endDrag();
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      if (wasDrag) return; // click chọn vật thể đã xử lý ở pointerdown
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
        const objId = pickObject();
        stateRef.current.onSelectObject?.(objId);
        return;
      }

      // 2. Click vào nhân vật nhân viên khác (realtime) -> mở thẻ / nhắn tin
      if (stateRef.current.onSelectRemotePlayer) {
        const remoteHits = raycaster.intersectObjects(remoteGroup.children, true);
        const hitId = remoteHits.find((h) => h.object.userData?.remoteEmployeeId)?.object.userData.remoteEmployeeId as
          | number
          | undefined;
        if (hitId) {
          stateRef.current.onSelectRemotePlayer(hitId);
          return;
        }
      }

      // 2a. Click vào ghế / sofa / ghế bar → đi tới và ngồi xuống
      {
        const seatObjId = pickObject();
        const seatObj = seatObjId ? stateRef.current.structures.find((x) => x.id === seatObjId) : null;
        if (seatObj && SEATABLE_KINDS.has(seatObj.kind) && sceneObjRef.current) {
          const clickPt = raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : new THREE.Vector3(seatObj.posX, 0, seatObj.posZ);
          const occupied: { x: number; z: number }[] = [];
          const rs = stateRef.current.remoteStateRef?.current;
          rs?.forEach((st) => {
            if ((st.sit ?? 0) > 0) occupied.push({ x: st.tx, z: st.tz });
          });
          const seat = pickSeat(seatsFor(seatObj), clickPt.x, clickPt.z, occupied);
          if (seat) {
            // Chọn ghế → hiện nút "Ngồi ghế" (vòng sáng đánh dấu chỗ ngồi)
            const reach = seatObj.depthM / 2 + BODY_RADIUS + 0.1;
            const ax = seatObj.posX + Math.sin(seatObj.rotY) * reach + (seat.x - seatObj.posX);
            const az = seatObj.posZ + Math.cos(seatObj.rotY) * reach + (seat.z - seatObj.posZ);
            setCandidate({ seat, approach: new THREE.Vector3(ax, 0, az) }, seatObj.label || 'Ghế');
            walkRing.position.set(seat.x, 0.03, seat.z);
            walkRing.visible = true;
            return;
          }
        }
      }

      // 2b. Click vào hàng hoá trên kệ / máy trưng bày → thông tin sản phẩm & giá
      if (stateRef.current.onSelectMerchItem) {
        const merchHits = raycaster.intersectObjects(objectsGroup.children, true);
        const first = merchHits[0];
        const merchId = first?.object.userData?.merchItemId as number | undefined;
        if (merchId) {
          stateRef.current.onSelectMerchItem(merchId);
          return;
        }
      }

      // 3. Click vào Gian hàng / Phòng ban -> Tự đi bộ tới trước gian hàng đó
      const boothHits = raycaster.intersectObjects(sceneObjRef.current?.boothMeshes ?? [], true);
      if (boothHits.length > 0) {
        let obj: THREE.Object3D | null = boothHits[0].object;
        while (obj && !obj.userData?.boothId) obj = obj.parent;
        if (obj?.userData?.boothId && sceneObjRef.current) {
          const { standX, standZ, boothId } = obj.userData as { standX: number; standZ: number; boothId: string };
          standUp();
          pendingSeat = null;
          setCandidate(null);
          sceneObjRef.current.walkTarget = new THREE.Vector3(standX, 0, standZ);
          walkRing.position.set(standX, 0.03, standZ);
          walkRing.visible = true;
          stateRef.current.onSelectBooth?.(boothId);
          return;
        }
      }

      // 4. Click vào mặt sàn -> Click-to-Walk mượt mà
      const floorHits = raycaster.intersectObject(floorMesh, false);
      if (floorHits.length > 0 && sceneObjRef.current) {
        const pt = floorHits[0].point;
        const clampedX = THREE.MathUtils.clamp(pt.x, -widthM * 0.5, widthM * 0.5);
        const clampedZ = THREE.MathUtils.clamp(pt.z, -depthM * 0.5, depthM * 0.5);
        standUp();
        pendingSeat = null;
        setCandidate(null);
        sceneObjRef.current.walkTarget = new THREE.Vector3(clampedX, 0, clampedZ);
        walkRing.position.set(clampedX, 0.03, clampedZ);
        walkRing.visible = true;
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);

    // Kéo thả HTML5 từ Thư viện vào cảnh
    const onDragOver = (e: DragEvent) => {
      const kind = stateRef.current.draggingKind;
      if (!kind || !stateRef.current.editMode) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setPointer(e);
      if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
        const def = SPACE_OBJECT_DEF_MAP[kind];
        ghost.scale.set(def?.size[0] ?? 1, def?.size[1] ?? 1, 1);
        ghost.position.set(snap(hitPoint.x), 0.03, snap(hitPoint.z));
        ghost.visible = true;
      }
    };
    const onDragLeave = () => {
      ghost.visible = false;
    };
    const onDrop = (e: DragEvent) => {
      const kind = stateRef.current.draggingKind;
      ghost.visible = false;
      if (!kind || !stateRef.current.editMode) return;
      e.preventDefault();
      setPointer(e);
      if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
        stateRef.current.onDropObject?.(kind, snap(hitPoint.x), snap(hitPoint.z));
      }
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);
    (sceneObjRef.current as unknown as { updateSelectionBox?: typeof updateSelectionBox }).updateSelectionBox = updateSelectionBox;

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      (sceneObjRef.current?.pipeline ?? pipeline).setSize(container.clientWidth, container.clientHeight);
      labelRenderer.setSize(container.clientWidth, container.clientHeight);
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
    let blockedTime = 0;
    // Ngồi ghế: đi tới điểm đứng trước ghế rồi ngồi xuống; phím di chuyển / bấm chỗ khác thì đứng dậy
    let sitting: Seat | null = null;
    let pendingSeat: Seat | null = null;
    let seatCandidate: { seat: Seat; approach: THREE.Vector3 } | null = null;
    const setCandidate = (c: typeof seatCandidate, label = '') => {
      seatCandidate = c;
      stateRef.current.onSeatCandidate?.(c ? { label } : null);
    };
    const setSitting = (sv: Seat | null) => {
      const changed = Boolean(sv) !== Boolean(sitting);
      sitting = sv;
      if (playerPosRef) playerPosRef.current.sit = sv ? sv.y : 0;
      if (changed) stateRef.current.onSittingChange?.(Boolean(sv));
    };
    const sitOnCandidate = () => {
      if (!seatCandidate || !sceneObjRef.current) return;
      standUp();
      sceneObjRef.current.walkTarget = seatCandidate.approach.clone();
      walkRing.position.set(seatCandidate.approach.x, 0.03, seatCandidate.approach.z);
      walkRing.visible = true;
      pendingSeat = seatCandidate.seat;
      setCandidate(null);
    };
    const standUp = () => {
      if (!sitting) return;
      const pl = sceneObjRef.current?.player ?? player;
      pl.group.position.x = sitting.x + Math.sin(sitting.rotY) * 0.75;
      pl.group.position.z = sitting.z + Math.cos(sitting.rotY) * 0.75;
      pl.group.position.y = 0;
      setSitting(null);
    };
    (sceneObjRef.current as unknown as { seatApi?: { sit: () => void; stand: () => void } }).seatApi = {
      sit: sitOnCandidate,
      stand: () => {
        standUp();
        pendingSeat = null;
      },
    };
    const tmpLabelPos = new THREE.Vector3();

    // Tiết kiệm tài nguyên: tối đa 60 FPS (kể cả màn 120Hz); khi cảnh đứng yên > 3s hạ còn 20 FPS
    let lastFrameAt = 0;
    let lastActivityAt = performance.now();
    const markActive = () => {
      lastActivityAt = performance.now();
    };
    const activityEvents = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));
    orbit.addEventListener('change', markActive);

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const frameNow = performance.now();
      const idle = frameNow - lastActivityAt > 3000;
      const minInterval = idle ? 1000 / 20 : 1000 / 60;
      if (frameNow - lastFrameAt < minInterval - 1.5) return;
      lastFrameAt = frameNow;
      renderer.info.reset();
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      totalTime += dt;
      windUniform.value = totalTime;
      // Chỉ đo FPS khi đang hoạt động (lúc rảnh đã chủ động hạ còn 20 FPS)
      if (!idle) governor.tick(rawDt);
      else governor.reset();
      if (rig.update(Math.min(rawDt, 0.25))) {
        markActive();
        // Ánh sáng đổi hướng khi chuyển ngày/đêm → bake lại bóng theo nhịp thưa
        if (frameCount % 10 === 0) renderer.shadowMap.needsUpdate = true;
      }
      const introLock = camRig.introActive;
      if (introLock) keys.clear();

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
      if (move.lengthSq() > 0 && (sitting || seatCandidate)) {
        standUp();
        pendingSeat = null;
        if (seatCandidate) setCandidate(null);
      }
      if (sitting) {
        // Đang ngồi: giữ đúng chỗ & hướng ghế, tư thế ngồi
        currentPlayer.group.position.x = sitting.x;
        currentPlayer.group.position.z = sitting.z;
        const dr = Math.atan2(Math.sin(sitting.rotY - currentPlayer.group.rotation.y), Math.cos(sitting.rotY - currentPlayer.group.rotation.y));
        currentPlayer.group.rotation.y += dr * 0.3;
        poseSit(currentPlayer, sitting.y);
      } else if (move.lengthSq() > 0) {
        pendingSeat = null;
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
      } else if (!introLock && sceneObjRef.current?.walkTarget) {
        // B. Tự động đi bộ tới điểm Click-to-Walk / Gian hàng
        const target = sceneObjRef.current.walkTarget;
        const diffX = target.x - currentPlayer.group.position.x;
        const diffZ = target.z - currentPlayer.group.position.z;
        const dist = Math.hypot(diffX, diffZ);
        if (dist < 0.25) {
          sceneObjRef.current.walkTarget = null;
          walkRing.visible = false;
          if (pendingSeat) {
            // Tới trước ghế → xoay lưng về ghế và ngồi xuống
            setSitting(pendingSeat);
            pendingSeat = null;
          }
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

      // Va chạm thân người: không đi xuyên nhân vật khác & đồ đạc (đẩy ra mềm), bị chặn thì dừng click-to-walk
      if (!sitting) {
        const before = { x: currentPlayer.group.position.x, z: currentPlayer.group.position.z };
        const others: THREE.Object3D[] = [];
        const so = sceneObjRef.current;
        if (so) {
          so.staffAvatars.forEach((a) => others.push(a.group));
          so.remoteAvatars.forEach((e) => others.push(e.av.group));
        }
        const pushed = resolveBodyCollisions(currentPlayer.group.position, others, isMoving ? stateRef.current.structures : null);
        const pdx = currentPlayer.group.position.x - before.x;
        const pdz = currentPlayer.group.position.z - before.z;
        if (pushed) {
          actualDx += pdx;
          actualDz += pdz;
          if (!isMoving && (Math.abs(pdx) > 1e-4 || Math.abs(pdz) > 1e-4)) {
            // Đứng yên mà bị đẩy (ví dụ xuất hiện trùng chỗ) → camera đi theo
            camera.position.x += pdx;
            camera.position.z += pdz;
            orbit.target.x += pdx;
            orbit.target.z += pdz;
          }
          if (so?.walkTarget) {
            blockedTime += dt;
            if (blockedTime > 0.6) {
              so.walkTarget = null;
              walkRing.visible = false;
              blockedTime = 0;
            }
          }
        } else {
          blockedTime = 0;
        }
      }

      if (isMoving || introLock || drag || fp.looking) markActive();
      if (isMoving) {
        camera.position.x += actualDx;
        camera.position.z += actualDz;
        orbit.target.x += actualDx;
        orbit.target.z += actualDz;

        // Đầm công sở bước ngắn & nhanh hơn để chân luôn nằm trong váy
        walkTime += dt * (currentPlayer.stride < 1 ? 13 : 10);
        poseWalk(currentPlayer, walkTime);
      } else if (!sitting) {
        relaxPose(currentPlayer);
        // Đang trò chuyện → nhân vật mình quay mặt về phía người kia
        const faceId = stateRef.current.faceEmployeeId;
        const partner = faceId ? sceneObjRef.current?.remoteAvatars.get(faceId) : null;
        if (partner && stateRef.current.povMode !== 'FIRST') {
          const want = Math.atan2(
            partner.av.group.position.x - currentPlayer.group.position.x,
            partner.av.group.position.z - currentPlayer.group.position.z,
          );
          const d = Math.atan2(Math.sin(want - currentPlayer.group.rotation.y), Math.cos(want - currentPlayer.group.rotation.y));
          currentPlayer.group.rotation.y += d * (1 - Math.exp(-dt * 8));
        }
        currentPlayer.headGroup.position.y = currentPlayer.headBaseY + Math.sin(totalTime * 2.2) * 0.01;
      }

      animateAvatarIdle(currentPlayer, totalTime);

      if (walkRing.visible) {
        const pulse = 1 + Math.sin(totalTime * 6) * 0.14;
        walkRing.scale.set(pulse, pulse, 1);
      }

      for (let i = 0; i < (sceneObjRef.current?.staffAvatars.length ?? 0); i++) {
        const stAv = sceneObjRef.current!.staffAvatars[i];
        stAv.headGroup.position.y = stAv.headBaseY + Math.sin(totalTime * 2 + i) * 0.01;
        animateAvatarIdle(stAv, totalTime);
        stAv.rightArm.rotation.z = -0.15 - Math.max(0, Math.sin(totalTime * 1.4 + i * 2.3) - 0.65) * 1.6;
      }

      // Người chơi realtime: nội suy mượt tới vị trí mục tiêu (đọc ref, không React re-render)
      const objNow = sceneObjRef.current;
      if (objNow && objNow.remoteAvatars.size + (stateRef.current.bubbleRef?.current.size ?? 0) > 0) {
        const rs = stateRef.current.remoteStateRef?.current;
        const bubbles = stateRef.current.bubbleRef?.current;
        const nowMs = Date.now();
        const posK = 1 - Math.exp(-dt * 12);
        const rotK = 1 - Math.exp(-dt * 14);
        const px = currentPlayer.group.position.x;
        const pz = currentPlayer.group.position.z;
        for (const [rid, entry] of objNow.remoteAvatars) {
          const g = entry.av.group;
          const st = rs?.get(rid);
          let walking = false;
          if (st) {
            const dx = st.tx - g.position.x;
            const dz = st.tz - g.position.z;
            const d = Math.hypot(dx, dz);
            if (d > 5) {
              g.position.x = st.tx;
              g.position.z = st.tz;
            } else {
              g.position.x += dx * posK;
              g.position.z += dz * posK;
            }
            // Đang nói chuyện với mình → quay mặt về phía mình (khi họ đứng yên)
            const faceMe = stateRef.current.faceEmployeeId === rid && !st.moving;
            const wantR = faceMe ? Math.atan2(px - g.position.x, pz - g.position.z) : st.tr;
            const dr = Math.atan2(Math.sin(wantR - g.rotation.y), Math.cos(wantR - g.rotation.y));
            g.rotation.y += dr * rotK;
            walking = (st.moving && nowMs - st.ts < 600) || d > 0.06;
            if (walking) markActive();
          }
          // Hai nhân vật đứng trùng chỗ → tách nhẹ (chỉ phần hiển thị, không đổi vị trí thật của họ)
          for (const [oid, other] of objNow.remoteAvatars) {
            if (oid === rid) continue;
            const ox = g.position.x - other.av.group.position.x;
            const oz = g.position.z - other.av.group.position.z;
            const od = Math.hypot(ox, oz);
            if (od < BODY_RADIUS * 2) {
              const push = (BODY_RADIUS * 2 - od) * 0.5;
              const nx = od > 1e-4 ? ox / od : Math.cos(rid);
              const nz = od > 1e-4 ? oz / od : Math.sin(rid);
              g.position.x += nx * push;
              g.position.z += nz * push;
            }
          }
          animateAvatarIdle(entry.av, totalTime);
          if (st && (st.sit ?? 0) > 0) {
            // Người kia đang ngồi ghế → tư thế ngồi đúng chỗ
            g.position.x = st.tx;
            g.position.z = st.tz;
            poseSit(entry.av, st.sit!);
          } else if (walking) {
            entry.walkTime += dt * (entry.av.stride < 1 ? 13 : 10);
            poseWalk(entry.av, entry.walkTime);
          } else {
            relaxPose(entry.av);
            entry.av.headGroup.position.y = entry.av.headBaseY + Math.sin(totalTime * 2 + rid) * 0.01;
          }

          if (frameCount % 6 === 0) {
            const b = bubbles?.get(rid);
            const near = Math.hypot(g.position.x - px, g.position.z - pz) <= BUBBLE_VISIBLE_DIST;
            let slot = objNow.remoteBubbles.get(rid);
            if (!slot) {
              slot = { sprite: null, text: '' };
              objNow.remoteBubbles.set(rid, slot);
            }
            syncBubble(slot, g, b && b.expiresAt > nowMs && near ? b.text : null);
          }
        }
        const selfId = stateRef.current.currentEmployeeId;
        if (selfId && frameCount % 6 === 0) {
          const b = bubbles?.get(selfId);
          syncBubble(objNow.selfBubble, currentPlayer.group, b && b.expiresAt > nowMs ? b.text : null);
        }
      }

      const firstPerson = stateRef.current.povMode === 'FIRST' && !stateRef.current.planView;
      if (firstPerson !== fp.active) {
        // Chuyển góc nhìn: vào POV lấy hướng nhân vật; ra POV đặt camera lại sau lưng
        fp.active = firstPerson;
        if (firstPerson) {
          fp.yaw = fp.yawT = currentPlayer.group.rotation.y;
          fp.pitch = fp.pitchT = -0.05;
          orbit.enabled = false;
        } else {
          orbit.enabled = true;
          const px = currentPlayer.group.position.x;
          const pz = currentPlayer.group.position.z;
          orbit.target.set(px, 1.3, pz);
          camera.position.set(px - Math.sin(fp.yaw) * 5.2, 3.2, pz - Math.cos(fp.yaw) * 5.2);
        }
      }
      if (firstPerson) {
        currentPlayer.group.visible = false;
        // Nội suy góc nhìn (giảm chấn) → kéo chuột mượt, không giật
        const k = 1 - Math.exp(-dt * 16);
        fp.yaw += (fp.yawT - fp.yaw) * k;
        fp.pitch += (fp.pitchT - fp.pitch) * k;
        const eyeY = currentPlayer.group.position.y + currentPlayer.headBaseY + 0.01; // ngồi thì tầm mắt thấp xuống
        camera.position.set(currentPlayer.group.position.x, eyeY, currentPlayer.group.position.z);
        const cp = Math.cos(fp.pitch);
        fpLook.set(
          camera.position.x + Math.sin(fp.yaw) * cp,
          eyeY + Math.sin(fp.pitch),
          camera.position.z + Math.cos(fp.yaw) * cp,
        );
        camera.lookAt(fpLook);
        orbit.target.copy(fpLook);
      } else {
        currentPlayer.group.visible = true;
      }

      camRig.beforeOrbit();
      if (!camRig.introActive && !firstPerson) orbit.update();
      // Intro dùng thời gian thực (không bị kẹp 0.05s) để không "đứng hình" khi máy chậm
      camRig.afterOrbit(Math.min(rawDt, 0.1), frameCount);
      skySys.update(dt, camera.position);

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

      (sceneObjRef.current?.pipeline ?? pipeline).render();
      // Nhãn HTML: mờ dần khi xa (> 18m), ẩn khi > 30m để không rối mắt
      if (frameCount % 6 === 0) {
        for (const lbl of htmlLabels) {
          // Nhãn của nhân vật đã bị gỡ khỏi cảnh (đổi diện mạo, người chơi rời đi) → xoá phần tử DOM
          let root: THREE.Object3D = lbl;
          while (root.parent) root = root.parent;
          if (root !== scene) {
            (lbl.element as HTMLElement).remove();
            htmlLabels.delete(lbl);
            continue;
          }
          lbl.getWorldPosition(tmpLabelPos);
          const dist = tmpLabelPos.distanceTo(camera.position);
          const op = dist > 30 ? 0 : dist > 18 ? 1 - (dist - 18) / 12 : 1;
          const el = lbl.element as HTMLElement;
          const v = op.toFixed(2);
          if (el.style.opacity !== v) el.style.opacity = v;
        }
      }
      labelRenderer.render(scene, camera);

      if (stateRef.current.debug) {
        debugFrames += 1;
        debugTime += rawDt;
        if (debugTime >= 0.5) {
          const info = renderer.info;
          debugEl.style.display = 'block';
          debugEl.textContent = `FPS ${(debugFrames / debugTime).toFixed(0)}  ·  ${qualityLevel.toUpperCase()}\ndraw ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k\ngeo ${info.memory.geometries}  tex ${info.memory.textures}  prog ${info.programs?.length ?? 0}`;
          debugFrames = 0;
          debugTime = 0;
        }
      } else if (debugEl.style.display !== 'none') {
        debugEl.style.display = 'none';
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onFpDown);
      window.removeEventListener('pointermove', onFpMove);
      window.removeEventListener('pointerup', onFpUp);
      window.removeEventListener('pointerup', endDrag);
      activityEvents.forEach((ev) => window.removeEventListener(ev, markActive));
      orbit.removeEventListener('change', markActive);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('dragleave', onDragLeave);
      container.removeEventListener('drop', onDrop);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('touchmove', onWheel);
      camRig.dispose();
      orbit.dispose();
      transform.dispose();
      (sceneObjRef.current?.pipeline ?? pipeline).dispose();
      skySys.dispose();
      envRT.dispose();
      floorTex.map.dispose();
      floorTex.roughnessMap.dispose();
      floorMat.dispose();
      debugEl.remove();
      labelRenderer.domElement.remove();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneObjRef.current = null;
      introPlayedRef.current = false;
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
    if (obj.selfBubble.sprite) {
      obj.selfBubble.sprite.parent?.remove(obj.selfBubble.sprite);
      nextPlayer.group.add(obj.selfBubble.sprite);
    }
  }, [avatarSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.rig.setNight(nightMode);
    obj.renderer.shadowMap.needsUpdate = true;
  }, [nightMode, sceneKind, widthM, depthM]);

  // Mặt bằng 2D: camera nhìn thẳng từ trên, ẩn mái/trần, hiện lưới 1m; trả lại góc nhìn cũ khi tắt
  const planSaved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; maxDist: number } | null>(null);
  const planGrid = useRef<THREE.GridHelper | null>(null);
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const roofs: THREE.Object3D[] = [];
    obj.scene.traverse((c) => {
      if (c.userData?.roof) roofs.push(c);
    });
    if (planView) {
      planSaved.current = { pos: obj.camera.position.clone(), target: obj.orbit.target.clone(), maxDist: obj.orbit.maxDistance };
      roofs.forEach((r) => (r.visible = false));
      const size = Math.max(widthM, depthM);
      const grid = new THREE.GridHelper(size + 4, Math.round(size + 4), 0x60a5fa, 0x334155);
      grid.position.y = 0.025;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.45;
      obj.scene.add(grid);
      planGrid.current = grid;
      const fov = THREE.MathUtils.degToRad(obj.camera.fov / 2);
      const h = (Math.max(widthM / obj.camera.aspect, depthM) / 2 + 2) / Math.tan(fov);
      obj.orbit.maxDistance = Math.max(120, h * 1.5);
      obj.orbit.enableRotate = false;
      obj.orbit.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      obj.orbit.target.set(0, 0, 0);
      obj.camera.position.set(0, h, 0.01);
      obj.orbit.update();
    } else if (planSaved.current) {
      roofs.forEach((r) => (r.visible = true));
      if (planGrid.current) {
        obj.scene.remove(planGrid.current);
        planGrid.current.geometry.dispose();
        planGrid.current = null;
      }
      obj.orbit.enableRotate = true;
      obj.orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      obj.orbit.maxDistance = planSaved.current.maxDist;
      obj.camera.position.copy(planSaved.current.pos);
      obj.orbit.target.copy(planSaved.current.target);
      obj.orbit.update();
      planSaved.current = null;
    }
    obj.renderer.shadowMap.needsUpdate = true;
  }, [planView, sceneKind, widthM, depthM]);

  // Nút "Ngồi ghế" / "Đứng dậy" từ giao diện
  useEffect(() => {
    if (!seatCommand) return;
    const api = (sceneObjRef.current as unknown as { seatApi?: { sit: () => void; stand: () => void } } | null)?.seatApi;
    if (seatCommand.kind === 'sit') api?.sit();
    else api?.stand();
  }, [seatCommand]);

  // Đổi preset đồ họa thủ công
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj || qualityPref === 'auto' || obj.quality === qualityPref) return;
    obj.applyQuality(qualityPref);
  }, [qualityPref]);

  // Intro bay camera cinematic khi vào không gian
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj || !playIntro || introPlayedRef.current) return;
    introPlayedRef.current = true;
    const p = obj.player.group.position;
    const halfD = depthM * 0.5 + 2;
    obj.camRig.playIntro(
      { target: new THREE.Vector3(p.x, 1.35, p.z), position: new THREE.Vector3(p.x, 2.9, p.z + 5.4) },
      sceneKind === 'WAREHOUSE'
        ? [
            // Nhà kho: bay qua sân, luồn vào cửa cuốn bên trái đang mở hé (cao ~2.7m)
            new THREE.Vector3(-34, 22, halfD + 40),
            new THREE.Vector3(-widthM * 0.225, 6, halfD + 16),
            new THREE.Vector3(-widthM * 0.225, 1.9, halfD + 4),
            new THREE.Vector3(-widthM * 0.225, 1.9, halfD - 3),
          ]
        : [
            new THREE.Vector3(-34, 26, halfD + 46),
            new THREE.Vector3(-10, 12, halfD + 22),
            // Hạ thấp trước cổng rồi luồn dưới xà cổng chào vào sảnh
            new THREE.Vector3(0, 3.1, halfD + 6),
            new THREE.Vector3(0, 2.9, halfD - 1.4),
          ],
    );
  }, [playIntro, sceneKind, widthM, depthM]);

  // Vật thể (quầy kệ, nội thất, cây, tường…): dựng lại THEO DIFF — kéo 1 món chỉ cập nhật vị trí món đó
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const ctx = { companyName: branding.companyName, logoUrl: branding.logoUrl };
    const seen = new Set<string>();
    let changed = false;
    for (const o of structures) {
      seen.add(o.id);
      const sig = objectSignature(o, `${ctx.companyName}|${o.merch ? `${o.merch.mode}:${o.merch.itemIds.join(',')}:${merchItems.length}` : ''}`);
      const existing = obj.objectMap.get(o.id);
      if (existing && existing.sig === sig) {
        if (existing.root.position.x !== o.posX || existing.root.position.z !== o.posZ || existing.root.rotation.y !== o.rotY) {
          applyTransform(existing.root, o);
          changed = true;
        }
        continue;
      }
      if (existing) {
        obj.objectsGroup.remove(existing.root);
        disposeObject(existing.root);
      }
      const built = buildSpaceObject(o, ctx);
      if (built.shelves.length && merchItems.length) {
        const manualPick = o.merch?.mode === 'MANUAL' && o.merch.itemIds.length > 0;
        built.root.add(buildMerchandise(o.id, built.shelves, resolveMerchItems(o.merch, merchItems, o.kind), manualPick));
      }
      obj.objectsGroup.add(built.root);
      obj.objectMap.set(o.id, { sig, root: built.root, shelves: built.shelves });
      if (built.shelves.length) stateRef.current.onShelvesBuilt?.(o.id, built.root, built.shelves);
      changed = true;
    }
    for (const [id, entry] of obj.objectMap) {
      if (seen.has(id)) continue;
      obj.objectsGroup.remove(entry.root);
      disposeObject(entry.root);
      obj.objectMap.delete(id);
      changed = true;
    }
    obj.boothMeshes.length = 0;
    const objOccluders: THREE.Object3D[] = [];
    for (const entry of obj.objectMap.values()) {
      if (entry.root.userData.isBooth) obj.boothMeshes.push(entry.root);
      entry.root.traverse((c) => {
        if (c.userData?.occluder) objOccluders.push(c);
      });
    }
    obj.occluders = [...obj.envOccluders, ...objOccluders];
    if (changed) obj.renderer.shadowMap.needsUpdate = true;
    const upd = (obj as unknown as { updateSelectionBox?: (id: string | null, c?: boolean) => void }).updateSelectionBox;
    upd?.(editMode ? selectedObjectId : null, selectedObjectId ? findCollisions(structures, selectedObjectId).length > 0 : false);
  }, [structures, sceneKind, widthM, depthM, editMode, selectedObjectId, branding.companyName, merchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sản phẩm đặt rời (SpacePlacement)
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.transform.detach();
    for (const child of obj.dynamicGroup.children) disposeObject(child);
    obj.dynamicGroup.clear();
    obj.placementMeshes.clear();
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
  }, [placements, sceneKind, widthM, depthM]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    obj.presenceGroup.clear();
    obj.staffAvatars.length = 0;
    // Realtime đã kết nối → người online lấy từ roster realtime, bỏ bản ghi tĩnh (tránh avatar "ma")
    if (realtimeLive) {
      obj.renderer.shadowMap.needsUpdate = true;
      return;
    }
    // Lọc bỏ chính mình khỏi danh sách presences để KHÔNG bao giờ hiện 2 bản sao trùng nhau!
    presences
      .filter((pr) => !currentEmployeeId || pr.employeeId !== currentEmployeeId)
      .forEach((pr) => {
        const av = createChibiAvatar({
          name: pr.employeeName,
          config: pr.avatar,
          isOnDuty: pr.status === 'ON_DUTY',
          isStaff: true,
        });
        av.group.position.set(pr.posX, 0, pr.posZ);
        av.group.rotation.y = pr.rotY;
        obj.presenceGroup.add(av.group);
        obj.staffAvatars.push(av);
      });
    obj.renderer.shadowMap.needsUpdate = true;
  }, [presences, currentEmployeeId, realtimeLive, sceneKind, widthM, depthM]);

  // Người chơi realtime: thêm / xoá / dựng lại avatar THEO DIFF (không clear toàn bộ)
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const seen = new Set<number>();
    // Đông người: chỉ dựng tối đa 30 nhân vật gần nhất (nhân viên ưu tiên) để giữ mượt
    const me = obj.player.group.position;
    const visible = [...(remoteRoster ?? [])]
      .map((m) => {
        const st = remoteStateRef?.current.get(m.employeeId);
        const dx = (st?.tx ?? m.x) - me.x;
        const dz = (st?.tz ?? m.z) - me.z;
        return { m, score: Math.hypot(dx, dz) + (m.isGuest ? 6 : 0) };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_REMOTE_AVATARS)
      .map((x) => x.m);
    for (const m of visible) {
      if (currentEmployeeId && m.employeeId === currentEmployeeId) continue;
      seen.add(m.employeeId);
      const sig = remoteSig(m);
      const existing = obj.remoteAvatars.get(m.employeeId);
      if (existing && existing.sig === sig) continue;

      const st = remoteStateRef?.current.get(m.employeeId);
      const x = existing ? existing.av.group.position.x : st?.tx ?? m.x;
      const z = existing ? existing.av.group.position.z : st?.tz ?? m.z;
      const r = existing ? existing.av.group.rotation.y : st?.tr ?? m.r;
      if (existing) {
        const slot = obj.remoteBubbles.get(m.employeeId);
        if (slot?.sprite) {
          slot.sprite.parent?.remove(slot.sprite);
          disposeObject(slot.sprite);
          slot.sprite = null;
          slot.text = '';
        }
        obj.remoteGroup.remove(existing.av.group);
        disposeObject(existing.av.group);
      }
      const av = createChibiAvatar({ name: m.employeeName, config: m.avatar, isOnDuty: m.onDuty, isStaff: !m.isGuest });
      prepareRemoteAvatar(av, m.employeeId);
      av.group.position.set(x, 0, z);
      av.group.rotation.y = r;
      obj.remoteGroup.add(av.group);
      obj.remoteAvatars.set(m.employeeId, { av, sig, walkTime: Math.random() * 6 });
    }
    for (const [id, entry] of obj.remoteAvatars) {
      if (seen.has(id)) continue;
      obj.remoteGroup.remove(entry.av.group);
      disposeObject(entry.av.group);
      obj.remoteAvatars.delete(id);
      obj.remoteBubbles.delete(id);
    }
  }, [remoteRoster, currentEmployeeId, sceneKind, widthM, depthM]); // eslint-disable-line react-hooks/exhaustive-deps

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
