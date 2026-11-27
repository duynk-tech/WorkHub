'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LiteLabelRenderer } from './three/html-labels';
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
  poseTalk,
  poseEmote,
  poseSeatActivity,
  type AnimatedAvatar,
  type BubbleSlot,
} from './three/avatars';
import { createExhibitionHallEnvironment } from './three/hall';
import { rebuildInstancing } from './three/instancing';
import { NpcSystem } from './three/npc';
import { Birds, FallingLeaves, SteamSystem, buildGroundLeaves } from './three/ambient';
import { localToWorld } from '@/lib/space-3d-npc';
import { EMOTE_DURATION_MS, talkDurationMs, type SpaceEmote } from '@/lib/space-3d-chat';
import type { CafeMenuItem, DrinkOrderView } from '@/lib/space-3d-cafe-menu';
import { buildDrink, buildOrderDrinks } from './three/props/drinks';
import { DEFAULT_CAFE_MENU } from '@/lib/space-3d-cafe-menu';
import { PANTRY_KINDS } from './three/props/office-extras';
import { setDeskScreenOn } from './three/props/office-extras';
import { createCafeEnvironment, createOfficeEnvironment, createWarehouseEnvironment } from './three/environments';
import { carpetTileTex, plankTex } from './three/props/textures';
import { buildSpaceObject, objectSignature, applyTransform } from './three/props/registry';
import type { ShelfSlot } from './three/props/kit';
import { buildMerchandise } from './three/props/packaging';
import { resolveMerchItems } from '@/lib/space-3d-merch';
import { SPACE_OBJECT_DEF_MAP } from '@/lib/space-3d-catalog';
import { SEATABLE_KINDS, clampInside, findCollisions, isStaffSeat, pickSeat, seatActivity, seatsFor, snap, type Seat, type SeatActivity } from '@/lib/space-3d-layout';
import { buildProductGroup } from './three/products';
import { createEpoxyTextures, windUniform } from './three/materials';
import { freezeStaticDescendants, mergeStaticGroup } from './three/merge';
import { createRenderPipeline, type RenderPipeline } from './three/pipeline';
import { buildPortal, inPortalZone, portalFor, portalSpawn, type PortalTarget } from './three/portals';
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
  /** id → hạn hiển thị "đang nhập…" */
  typingRef?: React.MutableRefObject<Map<number, number>>;
  /** id → biểu cảm đang diễn */
  emoteRef?: React.MutableRefObject<Map<number, { kind: SpaceEmote; at: number }>>;
  /** id realtime của bản thân (nhân viên: employeeId; khách: id âm) — để hiện bong bóng/biểu cảm của mình */
  selfRealtimeId?: number | null;
  /** Đơn gọi nước (quán cà phê) — đơn SERVED hiện ly trên bàn */
  drinkOrders?: DrinkOrderView[];
  cafeMenu?: CafeMenuItem[];
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
  /** Thông báo ngắn cho người dùng (vd. "Ghế dành cho nhân viên") */
  onNotice?: (text: string) => void;
  /** Nhân vật vào / ra một phòng (ROOM_ZONE) → tên phòng hoặc null */
  onRoomChange?: (name: string | null) => void;
  /** id → đồ uống đang cầm (pantry) */
  holdRef?: React.MutableRefObject<Map<number, { code: string; at: number }>>;
  /** Đứng gần pantry (quầy bếp / bình nước / tủ lạnh) */
  onPantryNear?: (near: boolean) => void;
  /** Đơn cần NPC phục vụ bưng ra bàn (quán cà phê) */
  npcDeliveries?: DrinkOrderView[];
  /** NPC phục vụ đã bưng tới bàn */
  onNpcArrive?: (orderId: number) => void;
  /** Trạng thái ngồi thay đổi (hiện nút "Đứng dậy") */
  onSittingChange?: (sitting: boolean) => void;
  /** Lệnh từ giao diện: ngồi vào ghế đã chọn / đứng dậy (nonce đổi mỗi lần bấm) */
  seatCommand?: { kind: 'sit' | 'stand' | 'dutySit'; nonce: number } | null;
  /** Khung hình đầu tiên đã vẽ xong cảnh (ẩn màn hình tải) */
  onReady?: () => void;
  /** Nhân vật đi vào cổng nối sang cảnh khác (Quán cà phê ⇄ Showroom) */
  onPortal?: (target: PortalTarget) => void;
  /** Vừa đi bộ qua cổng sang cảnh này → xuất hiện ngay cổng đối diện */
  arriveViaPortal?: boolean;
  /** Nhân vật mình tự làm biểu cảm (vd. nhân viên trực đứng dậy vẫy chào khách) → phát realtime */
  onAutoEmote?: (kind: 'wave') => void;
}

interface RemoteAvatarEntry {
  av: AnimatedAvatar;
  sig: string;
  walkTime: number;
  /** Hoạt động khi ngồi của người kia (tính lại thưa) */
  seatAct?: { activity: SeatActivity; targetId: string | null; at: number };
  /** Nhân viên đang trực trong quán cà phê → đứng gần quầy bar thì làm động tác pha chế */
  barista?: boolean;
}



/** Bán kính thân người (m) để tránh chồng nhân vật / đi xuyên đồ đạc */
const BODY_RADIUS = 0.3;
const MAX_REMOTE_AVATARS = 30;
const PASS_THROUGH = new Set([
  'RUG', 'PENDANT_LIGHT', 'WALL_ART', 'MENU_BOARD', 'DOOR', 'BOOTH',
  // Sân vườn: đi dưới lưới/mái/dù, bước trên lối cỏ & sỏi, qua cổng
  'SHADE_NET', 'METAL_ROOF', 'PATIO_UMBRELLA', 'STEPPING_PATH', 'GRAVEL_BED', 'HOI_AN_LANTERN', 'GARDEN_GATE', 'ROOM_ZONE', 'RED_CARPET', 'BALLOON_ARCH', 'LANTERN_STRING', 'STRING_LIGHTS', 'BAMBOO_PENDANT',
]); // gian hàng mở: được bước vào

/**
 * Đẩy vị trí `pos` ra khỏi các nhân vật khác (hình tròn) và vật thể (hộp xoay theo rotY).
 * Trả về true nếu có va chạm.
 */
/** Điểm (x, z) có bị đồ đạc chắn không (tính cả bán kính thân người) */
function pointBlocked(x: number, z: number, objects: SpaceStructure[]): boolean {
  for (const o of objects) {
    if (PASS_THROUGH.has(o.kind) || (o.posY ?? 0) > 0.3) continue;
    const c = Math.cos(o.rotY);
    const s = Math.sin(o.rotY);
    const rx = x - o.posX;
    const rz = z - o.posZ;
    const lx = rx * c - rz * s;
    const lz = rx * s + rz * c;
    if (Math.abs(lx) < o.widthM / 2 + BODY_RADIUS && Math.abs(lz) < o.depthM / 2 + BODY_RADIUS) return true;
  }
  return false;
}

/** Chỗ đứng để vào ghế: thử trước → trái → phải → sau ghế, chọn chỗ không bị bàn/đồ đạc chắn. */
function seatApproach(seatObj: SpaceStructure, seat: Seat, objects: SpaceStructure[]): THREE.Vector3 {
  const c = Math.cos(seatObj.rotY);
  const s = Math.sin(seatObj.rotY);
  // Hướng cục bộ (lx, lz) → thế giới: x = lx*c + lz*s, z = -lx*s + lz*c (mặt trước ghế là +Z cục bộ)
  const dirs: [number, number, number][] = [
    [0, 1, seatObj.depthM / 2 + BODY_RADIUS + 0.1],
    [-1, 0, seatObj.widthM / 2 + BODY_RADIUS + 0.1],
    [1, 0, seatObj.widthM / 2 + BODY_RADIUS + 0.1],
    [0, -1, seatObj.depthM / 2 + BODY_RADIUS + 0.12],
  ];
  const others = objects.filter((o) => o.id !== seatObj.id);
  let first: THREE.Vector3 | null = null;
  for (const [dx, dz, reach] of dirs) {
    const ax = seat.x + (dx * c + dz * s) * reach;
    const az = seat.z + (-dx * s + dz * c) * reach;
    const p = new THREE.Vector3(ax, 0, az);
    first ??= p;
    if (!pointBlocked(ax, az, others)) return p;
  }
  return first!;
}

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
  typingRef,
  emoteRef,
  selfRealtimeId = null,
  drinkOrders,
  cafeMenu,
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
  onNotice,
  onRoomChange,
  holdRef,
  onPantryNear,
  onAutoEmote,
  npcDeliveries,
  onNpcArrive,
  onSittingChange,
  seatCommand = null,
  onReady,
  onPortal,
  arriveViaPortal = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onPortalRef = useRef(onPortal);
  onPortalRef.current = onPortal;
  const arriveRef = useRef(arriveViaPortal);
  arriveRef.current = arriveViaPortal;
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
    typingRef,
    emoteRef,
    selfRealtimeId,
    drinkRids: new Set((drinkOrders ?? []).filter((o) => o.status === 'SERVED').map((o) => o.customerRid)) as Set<number>,
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
    onNotice,
    onRoomChange,
    holdRef,
    onPantryNear,
    onAutoEmote,
    npcDeliveries,
    onNpcArrive,
    cafeMenu,
    isSelfOnDuty,
    remoteRoster,
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
    typingRef,
    emoteRef,
    selfRealtimeId,
    drinkRids: new Set((drinkOrders ?? []).filter((o) => o.status === 'SERVED').map((o) => o.customerRid)) as Set<number>,
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
    onNotice,
    onRoomChange,
    holdRef,
    onPantryNear,
    onAutoEmote,
    npcDeliveries,
    onNpcArrive,
    cafeMenu,
    isSelfOnDuty,
    remoteRoster,
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
    /** Bản vẽ gộp instancing cho các vật thể giống hệt nhau (ghế, đá, cây…) — chỉ khi không ở chế độ thiết kế */
    instancedGroup: THREE.Group;
    /** Nhân vật tự động quán cà phê */
    npcs: NpcSystem;
    /** Lá rơi quanh cây đa (quán cà phê) */
    leaves: FallingLeaves | null;
    /** Lá khô rải trên nền quanh gốc đa */
    groundLeaves: THREE.InstancedMesh | null;
    /** Hơi nóng bốc lên từ ly nóng / chảo bánh / máy pha */
    steam: SteamSystem;
    /** Đàn chim bay ngang trời (quán cà phê) */
    birds: Birds | null;
    steamFixed?: { x: number; y: number; z: number; size?: number }[];
    /** Bộ phận quay liên tục (cánh quạt phun sương) */
    spinners?: { obj: THREE.Object3D; speed: number }[];
    /** Texture dòng chảy (socola) trượt theo thời gian */
    flows?: { map: THREE.Texture; speed: number }[];
    /** Vệt nắng xuyên lá dưới lưới (trượt texture chậm) */
    dapples?: THREE.Mesh[];
    /** Đàn cá koi trong ao */
    kois?: THREE.Object3D[];
    steamCups?: { x: number; y: number; z: number; size?: number }[];
    objectMap: Map<string, { sig: string; root: THREE.Group; shelves: ShelfSlot[] }>;
    selectionBox: THREE.Box3Helper;
    ghost: THREE.Mesh;
    dynamicGroup: THREE.Group;
    presenceGroup: THREE.Group;
    remoteGroup: THREE.Group;
    remoteAvatars: Map<number, RemoteAvatarEntry>;
    remoteBubbles: Map<number, BubbleSlot>;
    selfBubble: BubbleSlot;
    drinksGroup: THREE.Group;
    drinkMeshes: Map<number, THREE.Group>;
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
    /** Mesh làm mờ khi chắn giữa camera và nhân vật (bảng hiệu cổng…) */
    fadeables: THREE.Mesh[];
    /** Cánh cửa tự mở: nhóm cánh + tâm cửa (toạ độ thế giới) + độ mở hiện tại 0..1 */
    doors: { leaf: THREE.Object3D; x: number; z: number; open: number }[];
    /** Màn hình bàn làm việc theo id bàn (sáng khi có người ngồi gõ phím) */
    deskScreens: Map<string, { mesh: THREE.Mesh; variant: number; on: boolean }>;
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
    // Quán cà phê sân vườn: xuất hiện ngay TRƯỚC cổng → bảng hiệu nằm phía trước, hiện rõ trên đầu nhân vật
    const spawnZ = sceneKind === 'WAREHOUSE' ? depthM / 2 - 6.5 : sceneKind === 'CAFE' ? depthM / 2 - 0.15 : Math.min(11, depthM / 2 - 2.5);
    // Camera thấp & gần hơn: luồn dưới xà cổng chào (đáy xà ~4.3m), không bị cổng che
    // Quán cà phê: mở đầu lùi xa, ngước nhẹ → thấy trọn bảng hiệu cổng; bấm đi thì camera thu lại gần
    const cafeWide = sceneKind === 'CAFE';
    camera.position.set(0, cafeWide ? 3.4 : 2.9, spawnZ + (cafeWide ? 9.5 : 5.4));

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
    const labelRenderer = new LiteLabelRenderer();
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
      // Ván gỗ thật rộng ~18cm (texture 8 ván = 1.44m); thảm tấm 50cm (texture 4 tấm = 2m)
      floorMapOverride.repeat.set((widthM + 0.2) / (isCafe ? 1.44 : 2), (depthM + 0.2) / (isCafe ? 1.44 : 2));
      floorMapOverride.needsUpdate = true;
    }
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: floorMapOverride ?? floorTex.map,
      roughnessMap: floorMapOverride ? null : floorTex.roughnessMap,
      // Khe ván / sợi thảm nổi khối dưới ánh đèn
      bumpMap: floorMapOverride ?? null,
      bumpScale: isCafe ? 0.9 : 1.4,
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
        ? createOfficeEnvironment(widthM, depthM, branding.companyName, branding.logoUrl)
        : isWarehouse
          ? createWarehouseEnvironment(widthM, depthM, branding.companyName)
          : null;
    const hallEnv = mergeStaticGroup(
      interior ? interior.group : createExhibitionHallEnvironment(widthM, depthM, sceneKind, branding.companyName, branding.logoUrl),
    );
    // Đèn nội thất ấm (point light) không merge được → thêm riêng
    interior?.lights.forEach((l) => scene.add(l));
    freezeStaticDescendants(hallEnv);
    scene.add(hallEnv);
    // Cổng đi bộ nối Quán cà phê ⇄ Showroom
    const portal = portalFor(sceneKind, widthM, depthM);
    let portalArrow: THREE.Mesh | null = null;
    if (portal) {
      const pg = buildPortal(portal);
      pg.traverse((c) => {
        if (c.userData.portalArrow) portalArrow = c as THREE.Mesh;
      });
      scene.add(pg);
    }
    const arriving = Boolean(portal && arriveRef.current);
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
    const instancedGroup = new THREE.Group();
    scene.add(instancedGroup);
    const npcs = new NpcSystem((orderId) => stateRef.current.onNpcArrive?.(orderId));
    scene.add(npcs.group);
    const steam = new SteamSystem();
    scene.add(steam.group);
    const birds = sceneKind === 'CAFE' ? new Birds(Math.max(widthM, depthM) * 0.9) : null;
    if (birds) scene.add(birds.group);
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
    const drinksGroup = new THREE.Group();
    scene.add(dynamicGroup, presenceGroup, remoteGroup, drinksGroup);

    // Nhân vật Chibi của người dùng
    const player = createChibiAvatar({
      name: playerName || 'Bạn',
      config: playerAvatar,
      isSelf: true,
      isOnDuty: isSelfOnDuty,
    });
    player.group.position.set(0, 0, spawnZ);
    if (arriving && portal) {
      const sp = portalSpawn(portal);
      player.group.position.set(sp.x, 0, sp.z);
      player.group.rotation.y = sp.rotY;
    }
    scene.add(player.group);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.minDistance = 2.8;
    orbit.maxDistance = 42;
    orbit.target.set(0, cafeWide ? 2.3 : 1.3, cafeWide ? spawnZ - 0.6 : spawnZ);
    let cafeZoomIn = !cafeWide; // true = đã thu camera về gần
    if (arriving) {
      // Đi bộ qua cổng: camera đứng sau lưng nhân vật, nhìn vào trong cảnh
      const pp = player.group.position;
      const ry = player.group.rotation.y;
      camera.position.set(pp.x - Math.sin(ry) * 5.4, 2.9, pp.z - Math.cos(ry) * 5.4);
      orbit.target.set(pp.x, 1.3, pp.z);
      cafeZoomIn = true;
    }
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
      instancedGroup,
      npcs,
      leaves: null,
      groundLeaves: null,
      steam,
      birds,
      objectMap: new Map(),
      selectionBox,
      ghost,
      dynamicGroup,
      presenceGroup,
      remoteGroup,
      remoteAvatars: new Map(),
      remoteBubbles: new Map(),
      selfBubble: { sprite: null, text: '' },
      drinksGroup,
      drinkMeshes: new Map(),
      highlightRing,
      walkRing,
      // Vừa đi bộ qua cổng: tự bước tiếp vào trong ~2m (trong lúc màn hình sáng dần)
      walkTarget:
        arriving && portal
          ? new THREE.Vector3(player.group.position.x + Math.sin(portal.inward) * 2, 0, player.group.position.z + Math.cos(portal.inward) * 2)
          : null,
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
      fadeables: [],
      deskScreens: new Map(),
      doors: [],
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
    /**
     * Vật thể dưới con trỏ. Lớp "đi xuyên" (lưới che, mái tôn, vùng phòng, thảm, sỏi…) không chặn click khi chơi
     * → bấm được ghế / sản phẩm nằm dưới lưới cây đa. Chế độ thiết kế vẫn chọn được chúng (ưu tiên vật thể thường).
     */
    const kindOf = (id: string) => stateRef.current.structures.find((x) => x.id === id)?.kind ?? '';
    const pickObject = (): string | null => {
      const hits = raycaster.intersectObjects(objectsGroup.children, true);
      let passFallback: string | null = null;
      for (const h of hits) {
        const id = h.object.userData?.objectId as string | undefined;
        if (!id) continue;
        if (PASS_THROUGH.has(kindOf(id))) {
          passFallback ??= id;
          continue;
        }
        return id;
      }
      return stateRef.current.editMode ? passFallback : null;
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
        if (seatObj && SEATABLE_KINDS.has(seatObj.kind) && sceneObjRef.current && !stateRef.current.currentEmployeeId && isStaffSeat(seatObj, stateRef.current.structures)) {
          // Khách không được ngồi ghế nhân viên (sau quầy trưng bày / lễ tân / thu ngân / bar)
          stateRef.current.onNotice?.('Ghế này dành cho nhân viên');
          return;
        }
        if (seatObj && SEATABLE_KINDS.has(seatObj.kind) && sceneObjRef.current) {
          const clickPt = raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : new THREE.Vector3(seatObj.posX, 0, seatObj.posZ);
          const occupied: { x: number; z: number }[] = [...(sceneObjRef.current?.npcs.occupiedSeats ?? [])];
          const rs = stateRef.current.remoteStateRef?.current;
          rs?.forEach((st) => {
            if ((st.sit ?? 0) > 0) occupied.push({ x: st.tx, z: st.tz });
          });
          const seat = pickSeat(seatsFor(seatObj), clickPt.x, clickPt.z, occupied);
          if (!seat) {
            stateRef.current.onNotice?.('Ghế này đã có người ngồi');
            return;
          }
          if (seat && seatObj.kind === 'BAR_STOOL') {
            // Ghế bar tròn: ngồi quay mặt vào quầy bar / bàn gần nhất (như ngoài đời)
            let best: { d: number; x: number; z: number } | null = null;
            for (const o of stateRef.current.structures) {
              if (!['BAR_COUNTER', 'DEMO_BAR', 'LIVE_EDGE_TABLE', 'TABLE_RECT', 'TABLE_ROUND'].includes(o.kind)) continue;
              const d = Math.hypot(o.posX - seat.x, o.posZ - seat.z) - Math.max(o.widthM, o.depthM) / 2;
              if (d < 1.4 && (!best || d < best.d)) {
                // Điểm gần nhất trên mặt quầy (theo hệ cục bộ của quầy)
                const c = Math.cos(o.rotY);
                const sn = Math.sin(o.rotY);
                const dx = seat.x - o.posX;
                const dz = seat.z - o.posZ;
                const lx = Math.max(-o.widthM / 2, Math.min(o.widthM / 2, dx * c - dz * sn));
                const lz = Math.max(-o.depthM / 2, Math.min(o.depthM / 2, dx * sn + dz * c));
                best = { d, x: o.posX + lx * c + lz * sn, z: o.posZ - lx * sn + lz * c };
              }
            }
            if (best) seat.rotY = Math.atan2(best.x - seat.x, best.z - seat.z);
          }
          if (seat) {
            const act = seatActivity(seat, stateRef.current.structures);
            seat.activity = act.activity;
            seat.targetId = act.targetId;
            seat.staff = isStaffSeat(seatObj, stateRef.current.structures);
            // Chọn ghế → hiện nút "Ngồi ghế" (vòng sáng đánh dấu chỗ ngồi)
            setCandidate({ seat, approach: seatApproach(seatObj, seat, stateRef.current.structures) }, seatObj.label || 'Ghế');
            walkRing.position.set(seat.x, 0.03, seat.z);
            walkRing.visible = true;
            return;
          }
        }
      }

      // 2b. Click vào hàng hoá trên kệ / máy trưng bày → thông tin sản phẩm & giá
      if (stateRef.current.onSelectMerchItem) {
        const merchHits = raycaster.intersectObjects(objectsGroup.children, true);
        // Bỏ qua lớp đi xuyên (lưới, mái…) phía trên hàng hoá
        const first = merchHits.find((h) => !PASS_THROUGH.has(kindOf((h.object.userData?.objectId as string) ?? '')));
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
    /** Thời gian kể từ lúc bắt đầu ngồi: 0–0.35s xoay lưng về ghế, sau đó lùi & hạ người xuống */
    let sitT = 0;
    /** Đang đứng dậy: nhổm người lên rồi bước ra khỏi ghế tới điểm này */
    let rising: { x: number; z: number; t: number } | null = null;
    let pendingSeat: Seat | null = null;
    let seatCandidate: { seat: Seat; approach: THREE.Vector3 } | null = null;
    const setCandidate = (c: typeof seatCandidate, label = '') => {
      seatCandidate = c;
      stateRef.current.onSeatCandidate?.(c ? { label } : null);
    };
    const setSitting = (sv: Seat | null) => {
      const changed = Boolean(sv) !== Boolean(sitting);
      sitting = sv;
      if (sv) {
        sitT = 0;
        rising = null;
      }
      if (playerPosRef) playerPosRef.current.sit = sv ? sv.y : 0;
      if (changed) stateRef.current.onSittingChange?.(Boolean(sv));
    };
    const sitOnCandidate = () => {
      if (!seatCandidate || !sceneObjRef.current) return;
      standUp();
      const pl = sceneObjRef.current.player;
      const near = Math.hypot(pl.group.position.x - seatCandidate.seat.x, pl.group.position.z - seatCandidate.seat.z);
      if (near < 0.9) {
        // Đứng ngay cạnh ghế → ngồi luôn (trượt vào ghế)
        sceneObjRef.current.walkTarget = null;
        walkRing.visible = false;
        pendingSeat = null;
        setSitting(seatCandidate.seat);
        setCandidate(null);
        return;
      }
      sceneObjRef.current.walkTarget = seatCandidate.approach.clone();
      walkRing.position.set(seatCandidate.approach.x, 0.03, seatCandidate.approach.z);
      walkRing.visible = true;
      pendingSeat = seatCandidate.seat;
      setCandidate(null);
    };
    const standUp = () => {
      if (!sitting) return;
      // Không dịch chuyển tức thời: nhổm lên rồi bước ra trước ghế ~0.6m
      // Phía trước bị quầy/bàn chắn (ghế bar quay vào quầy) → bước lùi ra sau
      let dir = 1;
      if (pointBlocked(sitting.x + Math.sin(sitting.rotY) * 0.6, sitting.z + Math.cos(sitting.rotY) * 0.6, stateRef.current.structures.filter((o) => !SEATABLE_KINDS.has(o.kind)))) dir = -1;
      rising = { x: sitting.x + Math.sin(sitting.rotY) * 0.6 * dir, z: sitting.z + Math.cos(sitting.rotY) * 0.6 * dir, t: 0 };
      setSitting(null);
    };
    /** Nhân viên vào trực: tự đi tới ghế nhân viên trống gần nhất (≤ 4m) và ngồi */
    const dutySit = () => {
      const pl = sceneObjRef.current?.player ?? player;
      const objs = stateRef.current.structures;
      const occupied: { x: number; z: number }[] = [...(sceneObjRef.current?.npcs.occupiedSeats ?? [])];
      stateRef.current.remoteStateRef?.current.forEach((st) => {
        if ((st.sit ?? 0) > 0) occupied.push({ x: st.tx, z: st.tz });
      });
      let best: { seat: Seat; obj: SpaceStructure; d: number } | null = null;
      for (const o of objs) {
        if (!SEATABLE_KINDS.has(o.kind) || !isStaffSeat(o, objs)) continue;
        const seat = pickSeat(seatsFor(o), pl.group.position.x, pl.group.position.z, occupied);
        if (!seat) continue;
        const d = Math.hypot(seat.x - pl.group.position.x, seat.z - pl.group.position.z);
        if (d <= 4 && (!best || d < best.d)) best = { seat, obj: o, d };
      }
      if (!best) return false;
      const act = seatActivity(best.seat, objs);
      best.seat.activity = act.activity;
      best.seat.targetId = act.targetId;
      best.seat.staff = true;
      setCandidate({ seat: best.seat, approach: seatApproach(best.obj, best.seat, objs) }, best.obj.label || 'Ghế');
      sitOnCandidate();
      return true;
    };
    // Trực quầy: khách tới gần → đứng dậy chào; khách đi hết 20s → ngồi lại
    let dutyGreet: { guestId: number; at: number } | null = null;
    let dutyResitAfter = 0;
    let faceTarget: { x: number; z: number; until: number } | null = null;
    const updateDutyHost = (pl: AnimatedAvatar, nowS: number) => {
      if (!stateRef.current.isSelfOnDuty || !stateRef.current.currentEmployeeId) {
        dutyGreet = null;
        return;
      }
      const so = sceneObjRef.current;
      if (!so) return;
      const guests = (stateRef.current.remoteRoster ?? []).filter((m) => m.isGuest);
      let nearest: { id: number; x: number; z: number; d: number } | null = null;
      for (const g of guests) {
        const e = so.remoteAvatars.get(g.employeeId);
        if (!e) continue;
        const d = Math.hypot(e.av.group.position.x - pl.group.position.x, e.av.group.position.z - pl.group.position.z);
        if (!nearest || d < nearest.d) nearest = { id: g.employeeId, x: e.av.group.position.x, z: e.av.group.position.z, d };
      }
      if (sitting?.staff && nearest && nearest.d < 2.8 && (!dutyGreet || dutyGreet.guestId !== nearest.id)) {
        standUp();
        pendingSeat = null;
        dutyGreet = { guestId: nearest.id, at: nowS };
        faceTarget = { x: nearest.x, z: nearest.z, until: nowS + 4 };
        window.setTimeout(() => stateRef.current.onAutoEmote?.('wave'), 650);
        dutyResitAfter = nowS + 20;
      }
      if (!sitting && dutyGreet) {
        if (nearest && nearest.d < 6) dutyResitAfter = nowS + 20;
        else if (nowS > dutyResitAfter && !sceneObjRef.current?.walkTarget) {
          dutyGreet = null;
          dutySit();
        }
      }
    };
    (sceneObjRef.current as unknown as { seatApi?: { sit: () => void; stand: () => void; dutySit: () => boolean } }).seatApi = {
      dutySit,
      sit: sitOnCandidate,
      stand: () => {
        standUp();
        pendingSeat = null;
      },
    };

    // Tiết kiệm tài nguyên: tối đa 60 FPS (kể cả màn 120Hz); khi cảnh đứng yên > 3s hạ còn 20 FPS
    let lastFrameAt = 0;
    let lastActivityAt = performance.now();
    const markActive = () => {
      lastActivityAt = performance.now();
    };
    const activityEvents = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));
    orbit.addEventListener('change', markActive);

    // Bảng hiệu chắn giữa camera và nhân vật → mờ dần (không phải treo thật cao)
    const fadeRay = new THREE.Raycaster();
    const fadeHead = new THREE.Vector3();
    const fadeDir = new THREE.Vector3();
    const fadeHit = new Set<THREE.Object3D>();
    const updateOcclusionFade = (pl: AnimatedAvatar, dtS: number) => {
      const list = sceneObjRef.current?.fadeables;
      if (!list || list.length === 0) return;
      if (frameCount % 2 === 0) {
        fadeHit.clear();
        fadeHead.set(pl.group.position.x, pl.group.position.y + 1.65, pl.group.position.z);
        fadeDir.subVectors(fadeHead, camera.position);
        const dist = fadeDir.length();
        fadeRay.set(camera.position, fadeDir.normalize());
        fadeRay.far = Math.max(0, dist - 0.3);
        for (const h of fadeRay.intersectObjects(list, false)) fadeHit.add(h.object);
      }
      const k = 1 - Math.exp(-dtS * 10);
      for (const m of list) {
        const target = fadeHit.has(m) ? 0.18 : 1;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (!mat.transparent) mat.transparent = true;
          const next = mat.opacity + (target - mat.opacity) * k;
          if (Math.abs(next - mat.opacity) > 0.002) {
            mat.opacity = next;
            markActive();
          }
          mat.depthWrite = mat.opacity > 0.95;
        }
      }
    };

    // ── Cầm ly nước (pantry): gắn ly vào bàn tay phải, giữ ly luôn thẳng đứng ──
    const heldCups = new Map<number, { code: string; cup: THREE.Group; av: AnimatedAvatar }>();
    let pantryNear = false;
    const syncHeld = (id: number, av: AnimatedAvatar, code: string | null) => {
      const cur = heldCups.get(id);
      if (cur && (cur.code !== code || cur.av !== av)) {
        cur.cup.parent?.remove(cur.cup);
        disposeObject(cur.cup);
        heldCups.delete(id);
      }
      if (code && !heldCups.has(id)) {
        const item = DEFAULT_CAFE_MENU.find((m) => m.code === code) ?? DEFAULT_CAFE_MENU[3];
        const cup = buildDrink(item);
        cup.scale.setScalar(0.9);
        cup.position.set(0, -0.36, 0.05);
        av.rightElbow.add(cup);
        heldCups.set(id, { code, cup, av });
      }
    };
    const poseHold = (av: AnimatedAvatar, cup: THREE.Group, busy: boolean) => {
      if (!busy) {
        // Tay cầm ly trước ngực
        av.rightArm.rotation.x += (-0.3 - av.rightArm.rotation.x) * 0.2;
        av.rightElbow.rotation.x += (-1.2 - av.rightElbow.rotation.x) * 0.2;
      }
      // Bù góc tay → ly luôn đứng thẳng
      cup.rotation.x = -(av.rightArm.rotation.x + av.rightElbow.rotation.x);
      cup.rotation.z = -av.rightArm.rotation.z;
    };

    // ── Camera vào phòng (ROOM_ZONE): bay tới góc phòng phía lối vào, nhìn bao quát phòng, ẩn mái trong vùng ──
    type RoomCam = { id: string; zone: SpaceStructure; dirX: number; dirZ: number; pos: THREE.Vector3; look: THREE.Vector3; hidden: THREE.Object3D[] };
    const ROOM_CAM_DIST = 3.6;
    const ROOM_CAM_H = 2.5;
    let room: RoomCam | null = null;
    let roomCandidate: { id: string; since: number; entryX: number; entryZ: number } | null = null;
    let roomExit: { pos: THREE.Vector3; look: THREE.Vector3; t: number } | null = null;
    const inZone = (o: SpaceStructure, x: number, z: number, pad = 0) => {
      const c = Math.cos(o.rotY);
      const sn = Math.sin(o.rotY);
      const dx = x - o.posX;
      const dz = z - o.posZ;
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      return Math.abs(lx) <= o.widthM / 2 + pad && Math.abs(lz) <= o.depthM / 2 + pad;
    };
    const enterRoom = (zone: SpaceStructure, entryX: number, entryZ: number) => {
      // Góc phòng gần lối vào nhất (thụt vào 0.35m), cao gần trần, nhìn chéo xuống giữa phòng
      const c = Math.cos(zone.rotY);
      const sn = Math.sin(zone.rotY);
      let best: THREE.Vector3 | null = null;
      let bestD = Infinity;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lx = sx * (zone.widthM / 2 - 0.35);
          const lz = sz * (zone.depthM / 2 - 0.35);
          const x = zone.posX + lx * c + lz * sn;
          const z = zone.posZ - lx * sn + lz * c;
          const d = Math.hypot(x - entryX, z - entryZ);
          if (d < bestD) {
            bestD = d;
            best = new THREE.Vector3(x, Math.min(zone.heightM - 0.2, 2.7), z);
          }
        }
      }
      // Ẩn mái / trần của vật thể nằm trong phòng để nhìn rõ bên trong
      const hidden: THREE.Object3D[] = [];
      const so = sceneObjRef.current;
      if (so) {
        for (const [id, entry] of so.objectMap) {
          const st = stateRef.current.structures.find((x) => x.id === id);
          if (!st || !inZone(zone, st.posX, st.posZ, 0.5)) continue;
          entry.root.traverse((ch) => {
            if (ch.userData?.roof && ch.visible) {
              ch.visible = false;
              hidden.push(ch);
            }
          });
        }
      }
      // Hướng từ tâm phòng về góc lối vào → camera đặt về phía đó, cách nhân vật ~3.6m (không lùi tận góc xa)
      const dx = best!.x - zone.posX;
      const dz = best!.z - zone.posZ;
      const dl = Math.hypot(dx, dz) || 1;
      room = { id: zone.id, zone, dirX: dx / dl, dirZ: dz / dl, pos: best!, look: new THREE.Vector3(zone.posX, 0.9, zone.posZ), hidden };
      roomExit = null;
      orbit.enabled = false;
      stateRef.current.onRoomChange?.(zone.label || 'Phòng');
    };
    const leaveRoom = (pl: AnimatedAvatar) => {
      if (!room) return;
      for (const h of room.hidden) h.visible = true;
      room = null;
      // Trả camera về sau lưng nhân vật
      const r = pl.group.rotation.y;
      const hw = widthM / 2 - 0.4;
      const hd = depthM / 2 - 0.4;
      roomExit = {
        // Kẹp trong mặt bằng → không văng camera ra ngoài hàng rào
        pos: new THREE.Vector3(
          THREE.MathUtils.clamp(pl.group.position.x - Math.sin(r) * 5.2, -hw, hw),
          2.9,
          THREE.MathUtils.clamp(pl.group.position.z - Math.cos(r) * 5.2, -hd, hd),
        ),
        look: new THREE.Vector3(pl.group.position.x, 1.3, pl.group.position.z),
        t: 0,
      };
      stateRef.current.onRoomChange?.(null);
    };
    const updateRoomCamera = (pl: AnimatedAvatar, dtS: number, nowS: number): boolean => {
      const allow = stateRef.current.povMode !== 'FIRST' && !stateRef.current.planView && !stateRef.current.editMode && !camRig.introActive;
      const px = pl.group.position.x;
      const pz = pl.group.position.z;
      const zones = allow ? stateRef.current.structures.filter((o) => o.kind === 'ROOM_ZONE') : [];
      const cur = zones.find((z) => inZone(z, px, pz));
      if (room) {
        // Ra khỏi phòng (quá mép 0.3m — chống chập chờn ở cửa) hoặc vùng bị xoá / tắt chế độ → trả camera
        const zoneNow = zones.find((z) => z.id === room!.id);
        if (!zoneNow || !inZone(zoneNow, px, pz, 0.3)) leaveRoom(pl);
      }
      if (!room && cur) {
        if (!roomCandidate || roomCandidate.id !== cur.id) roomCandidate = { id: cur.id, since: nowS, entryX: px, entryZ: pz };
        else if (nowS - roomCandidate.since > 0.4) enterRoom(cur, roomCandidate.entryX, roomCandidate.entryZ);
      } else if (!cur) {
        roomCandidate = null;
      }
      const k = 1 - Math.exp(-dtS * 3.2);
      if (room) {
        // Camera theo nhân vật ở khoảng cách vừa phải, hướng về góc lối vào, luôn nằm trong phòng
        const z0 = room.zone;
        const c = Math.cos(z0.rotY);
        const sn = Math.sin(z0.rotY);
        let cx = px + room.dirX * ROOM_CAM_DIST;
        let cz = pz + room.dirZ * ROOM_CAM_DIST;
        const lx0 = (cx - z0.posX) * c - (cz - z0.posZ) * sn;
        const lz0 = (cx - z0.posX) * sn + (cz - z0.posZ) * c;
        const lx = Math.max(-(z0.widthM / 2 - 0.3), Math.min(z0.widthM / 2 - 0.3, lx0));
        const lz = Math.max(-(z0.depthM / 2 - 0.3), Math.min(z0.depthM / 2 - 0.3, lz0));
        cx = z0.posX + lx * c + lz * sn;
        cz = z0.posZ - lx * sn + lz * c;
        room.pos.set(cx, Math.min(z0.heightM - 0.25, ROOM_CAM_H), cz);
        // Nhìn vào nhân vật, kéo nhẹ về tâm phòng để thấy bao quát
        room.look.set(px * 0.75 + z0.posX * 0.25, 1.0, pz * 0.75 + z0.posZ * 0.25);
        camera.position.lerp(room.pos, k);
        orbit.target.lerp(room.look, k);
        camera.lookAt(orbit.target);
        markActive();
        return true;
      }
      if (roomExit) {
        roomExit.t += dtS;
        camera.position.lerp(roomExit.pos, k);
        orbit.target.lerp(roomExit.look, k);
        camera.lookAt(orbit.target);
        markActive();
        if (roomExit.t > 0.9) {
          roomExit = null;
          orbit.enabled = true;
        }
        return true;
      }
      return false;
    };

    let readyFrames = 0;
    // Cổng chỉ kích hoạt sau khi nhân vật đã ở ngoài vùng cổng ít nhất 1 lần (tránh bật lại ngay khi vừa tới)
    let portalArmed = false;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const frameNow = performance.now();
      const idleFor = frameNow - lastActivityAt;
      const idle = idleFor > 3000;
      // Rảnh > 3s: 20 FPS · rảnh > 20s hoặc cửa sổ không được focus: 8 FPS (chỉ còn thở/chớp mắt)
      const deepIdle = idle && (idleFor > 20000 || !document.hasFocus());
      const minInterval = deepIdle ? 1000 / 8 : idle ? 1000 / 20 : 1000 / 60;
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
        // Ngồi xuống như thật: (1) đứng trước ghế xoay lưng lại, (2) lùi nửa bước & hạ hông xuống đệm
        sitT += dt;
        const dr = Math.atan2(Math.sin(sitting.rotY - currentPlayer.group.rotation.y), Math.cos(sitting.rotY - currentPlayer.group.rotation.y));
        currentPlayer.group.rotation.y += dr * (1 - Math.exp(-dt * 12));
        if (sitT < 0.35 && Math.abs(dr) > 0.15) {
          relaxPose(currentPlayer);
        } else {
          const k = 1 - Math.exp(-dt * 6);
          currentPlayer.group.position.x += (sitting.x - currentPlayer.group.position.x) * k;
          currentPlayer.group.position.z += (sitting.z - currentPlayer.group.position.z) * k;
          poseSit(currentPlayer, sitting.y);
          poseSeatActivity(currentPlayer, sitting.activity ?? 'rest', totalTime);
        }
        markActive();
      } else if (rising) {
        // Đứng dậy: thân nhổm lên trước, rồi bước ra khỏi ghế
        rising.t += dt;
        relaxPose(currentPlayer);
        if (rising.t > 0.18) {
          const k = 1 - Math.exp(-dt * 7);
          const rdx = (rising.x - currentPlayer.group.position.x) * k;
          const rdz = (rising.z - currentPlayer.group.position.z) * k;
          currentPlayer.group.position.x += rdx;
          currentPlayer.group.position.z += rdz;
          // Camera đi theo nhịp bước ra
          camera.position.x += rdx;
          camera.position.z += rdz;
          orbit.target.x += rdx;
          orbit.target.z += rdz;
        }
        if (rising.t > 0.6 || (Math.hypot(rising.x - currentPlayer.group.position.x, rising.z - currentPlayer.group.position.z) < 0.03 && currentPlayer.group.position.y === 0)) {
          currentPlayer.group.position.y = 0;
          rising = null;
        }
        markActive();
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
          so.npcs.avatars.forEach((a) => others.push(a.group));
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
              // Đang đi tới ghế mà bị bàn/người chắn ngay cạnh → vẫn ngồi (trượt vào ghế, bỏ qua va chạm)
              if (pendingSeat && Math.hypot(currentPlayer.group.position.x - pendingSeat.x, currentPlayer.group.position.z - pendingSeat.z) < 1.6) {
                setSitting(pendingSeat);
              }
              pendingSeat = null;
            }
          }
        } else {
          blockedTime = 0;
        }
      }

      if (isMoving || introLock || drag || fp.looking) markActive();
      // Quán cà phê: lần đầu di chuyển → thu camera về khoảng cách thường, hạ tầm nhìn về nhân vật
      if (!cafeZoomIn && (isMoving || sceneObjRef.current?.walkTarget || sitting)) {
        cafeZoomIn = true;
        camRig.easeDistance(5.6);
      }
      if (cafeZoomIn && cafeWide && orbit.target.y > 1.31 && !introLock) {
        orbit.target.y += (1.3 - orbit.target.y) * (1 - Math.exp(-dt * 2.4));
        orbit.target.z += (currentPlayer.group.position.z - orbit.target.z) * (1 - Math.exp(-dt * 2.4));
      }
      if (isMoving) {
        if (!room && !roomExit) {
          camera.position.x += actualDx;
          camera.position.z += actualDz;
          orbit.target.x += actualDx;
          orbit.target.z += actualDz;
        }

        // Đầm công sở bước ngắn & nhanh hơn để chân luôn nằm trong váy
        walkTime += dt * (currentPlayer.stride < 1 ? 13 : 10);
        poseWalk(currentPlayer, walkTime);
      } else if (!sitting && !rising) {
        relaxPose(currentPlayer);
        if (faceTarget && totalTime < faceTarget.until) {
          const want = Math.atan2(faceTarget.x - currentPlayer.group.position.x, faceTarget.z - currentPlayer.group.position.z);
          const dd = Math.atan2(Math.sin(want - currentPlayer.group.rotation.y), Math.cos(want - currentPlayer.group.rotation.y));
          currentPlayer.group.rotation.y += dd * (1 - Math.exp(-dt * 6));
        }
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
      const typingMap = stateRef.current.typingRef?.current;
      const emoteMap = stateRef.current.emoteRef?.current;
      /** Nói (nhép miệng, cử chỉ) + biểu cảm cho 1 nhân vật — gọi sau khi đã đặt tư thế đi/đứng/ngồi */
      const applyTalkAndEmote = (av: AnimatedAvatar, id: number, b: RemoteBubble | undefined, nowMs: number, busy: boolean) => {
        const talking = Boolean(b && b.expiresAt > nowMs && nowMs - (b.startedAt ?? 0) < talkDurationMs(b.text));
        poseTalk(av, totalTime, talking, !busy);
        if (talking) markActive();
        // Có ly nước đã phục vụ → thỉnh thoảng nâng ly uống (chu kỳ ~30s, lệch pha theo id)
        if (!talking && stateRef.current.drinkRids?.has(id)) {
          const cyc = (totalTime + Math.abs(id % 17) * 1.9) % 30;
          if (cyc < 2.2) poseEmote(av, 'sip', cyc / 2.2, totalTime);
        }
        const em = emoteMap?.get(id);
        if (em) {
          const t = (nowMs - em.at) / EMOTE_DURATION_MS;
          if (t >= 1) emoteMap!.delete(id);
          else {
            poseEmote(av, em.kind, t, totalTime);
            markActive();
          }
        }
      };
      const nowMsAll = Date.now();
      const selfRid = stateRef.current.selfRealtimeId ?? stateRef.current.currentEmployeeId ?? null;
      if (selfRid) {
        const sb = stateRef.current.bubbleRef?.current.get(selfRid);
        applyTalkAndEmote(currentPlayer, selfRid, sb, nowMsAll, isMoving || Boolean(sitting));
      }
      if (objNow && objNow.remoteAvatars.size + (stateRef.current.bubbleRef?.current.size ?? 0) > 0) {
        const rs = stateRef.current.remoteStateRef?.current;
        const bubbles = stateRef.current.bubbleRef?.current;
        const nowMs = nowMsAll;
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
            // Người kia đang ngồi ghế → trượt dần vào chỗ & hạ người xuống (không nhảy cóc)
            g.position.x += (st.tx - g.position.x) * posK * 0.6;
            g.position.z += (st.tz - g.position.z) * posK * 0.6;
            poseSit(entry.av, st.sit!);
            if (!entry.seatAct || nowMs - entry.seatAct.at > 1500) {
              const a = seatActivity({ x: st.tx, z: st.tz, y: st.sit!, rotY: st.tr }, stateRef.current.structures);
              entry.seatAct = { activity: a.activity, targetId: a.targetId, at: nowMs };
            }
            poseSeatActivity(entry.av, entry.seatAct.activity, totalTime);
          } else if (walking) {
            entry.seatAct = undefined;
            entry.walkTime += dt * (entry.av.stride < 1 ? 13 : 10);
            poseWalk(entry.av, entry.walkTime);
          } else {
            relaxPose(entry.av);
            entry.av.headGroup.position.y = entry.av.headBaseY + Math.sin(totalTime * 2 + rid) * 0.01;
          }
          const rb = bubbles?.get(rid);
          applyTalkAndEmote(entry.av, rid, rb, nowMs, walking || Boolean(st && (st.sit ?? 0) > 0));
          // Barista: đứng yên gần quầy bar → thỉnh thoảng pha chế (~6s mỗi 20s)
          if (entry.barista && !walking && !(rb && rb.expiresAt > nowMs)) {
            const nearBar = stateRef.current.structures.some(
              (o) => o.kind === 'BAR_COUNTER' && Math.hypot(o.posX - g.position.x, o.posZ - g.position.z) < Math.max(o.widthM, o.depthM) / 2 + 1.2,
            );
            const cyc = (totalTime + Math.abs(rid % 13)) % 20;
            if (nearBar && cyc < 6) poseEmote(entry.av, 'brew', cyc / 6, totalTime);
          }

          if (frameCount % 6 === 0) {
            const near = Math.hypot(g.position.x - px, g.position.z - pz) <= BUBBLE_VISIBLE_DIST;
            let slot = objNow.remoteBubbles.get(rid);
            if (!slot) {
              slot = { sprite: null, text: '' };
              objNow.remoteBubbles.set(rid, slot);
            }
            const live = rb && rb.expiresAt > nowMs && near ? rb : null;
            const typing = !live && near && (typingMap?.get(rid) ?? 0) > nowMs;
            syncBubble(slot, g, live ? live.text : null, typing, live?.prev);
          }
        }
      }
      if (objNow && selfRid && frameCount % 6 === 0) {
        const b = stateRef.current.bubbleRef?.current.get(selfRid);
        const live = b && b.expiresAt > nowMsAll ? b : null;
        syncBubble(objNow.selfBubble, currentPlayer.group, live ? live.text : null, false, live?.prev);
      }

      if (frameCount % 10 === 0) updateDutyHost(currentPlayer, totalTime);
      // Cổng nối cảnh: mũi tên nhấp nháy; bước vào → chuyển cảnh (đi bộ sang)
      if (portal) {
        if (portalArrow) ((portalArrow as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(totalTime * 3.2));
        const pp = currentPlayer.group.position;
        const inZone = inPortalZone(portal, pp.x, pp.z);
        if (!inZone) portalArmed = true;
        else if (portalArmed && !stateRef.current.editMode && !sitting) {
          portalArmed = false;
          onPortalRef.current?.(portal.target);
        }
      }
      sceneObjRef.current?.leaves?.update(dt, totalTime);
      sceneObjRef.current?.steam.update(dt);
      // Cánh quạt quay; vệt nắng trôi chậm như lá đung đưa
      for (const sp of sceneObjRef.current?.spinners ?? []) sp.obj.rotation.z += sp.speed * dt;
      for (const f of sceneObjRef.current?.flows ?? []) f.map.offset.y = (f.map.offset.y + f.speed * dt) % 1;
      // Cá koi lượn hình số 8 dưới mặt ao, vẫy đuôi
      for (const school of sceneObjRef.current?.kois ?? []) {
        const { w: kw, d: kd } = school.userData.koi as { w: number; d: number };
        for (const fish of school.children) {
          const u = fish.userData as { phase: number; speed: number; rx: number; rz: number };
          const a = totalTime * u.speed + u.phase;
          const x = Math.sin(a) * kw * u.rx;
          const z = Math.sin(a * 2) * kd * u.rz;
          const nx = Math.cos(a) * kw * u.rx;
          const nz = Math.cos(a * 2) * 2 * kd * u.rz;
          fish.position.set(x, 0.032 + Math.sin(a * 3) * 0.004, z); // sát mặt nước (nước không trong suốt)
          fish.rotation.y = Math.atan2(nx, nz);
          const tail = fish.children[2];
          if (tail) tail.rotation.y = Math.sin(totalTime * 9 + u.phase) * 0.5;
        }
      }
      for (const dm of sceneObjRef.current?.dapples ?? []) {
        const map = (dm.material as THREE.MeshBasicMaterial).map;
        if (map) map.offset.set(Math.sin(totalTime * 0.15) * 0.04, Math.cos(totalTime * 0.11) * 0.03);
      }
      sceneObjRef.current?.birds?.update(dt, totalTime);
      // NPC quán cà phê: làm việc, chào khách, bưng nước
      if (sceneObjRef.current?.npcs.avatars.length) {
        const people: { id: string; x: number; z: number }[] = [{ id: 'self', x: currentPlayer.group.position.x, z: currentPlayer.group.position.z }];
        for (const [rid, e] of sceneObjRef.current.remoteAvatars) people.push({ id: String(rid), x: e.av.group.position.x, z: e.av.group.position.z });
        sceneObjRef.current.npcs.update(
          dt,
          totalTime,
          people,
          stateRef.current.npcDeliveries ?? [],
          stateRef.current.cafeMenu ?? DEFAULT_CAFE_MENU,
          (pos) => resolveBodyCollisions(pos, [], stateRef.current.structures),
          frameCount,
        );
      }
      // Ly nước đang cầm (mình + người khác)
      const holds = stateRef.current.holdRef?.current;
      if (holds && sceneObjRef.current) {
        if (frameCount % 10 === 0) {
          if (selfRid) syncHeld(selfRid, currentPlayer, holds.get(selfRid)?.code ?? null);
          for (const [rid, e] of sceneObjRef.current.remoteAvatars) syncHeld(rid, e.av, holds.get(rid)?.code ?? null);
          for (const id of [...heldCups.keys()]) if (id !== selfRid && !sceneObjRef.current.remoteAvatars.has(id)) syncHeld(id, heldCups.get(id)!.av, null);
        }
        for (const [id, h] of heldCups) {
          // Thỉnh thoảng nâng ly uống (chu kỳ ~25s, lệch pha theo id)
          const cyc = (totalTime + Math.abs(id % 11) * 2.1) % 25;
          const sipping = cyc < 2;
          if (sipping) poseEmote(h.av, 'sip', cyc / 2, totalTime);
          poseHold(h.av, h.cup, sipping);
        }
      }
      // Gần pantry → hiện nút "Lấy nước"
      if (frameCount % 15 === 0) {
        const px = currentPlayer.group.position.x;
        const pz = currentPlayer.group.position.z;
        const near = !sitting && stateRef.current.structures.some((o) => PANTRY_KINDS.has(o.kind) && Math.hypot(o.posX - px, o.posZ - pz) < Math.max(o.widthM, o.depthM) / 2 + 1.1);
        if (near !== pantryNear) {
          pantryNear = near;
          stateRef.current.onPantryNear?.(near);
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

      if (!firstPerson) updateOcclusionFade(currentPlayer, dt);
      // Cửa tự mở khi có người trong 1.6m (mình hoặc người khác), tự đóng khi đi xa
      const doorList = sceneObjRef.current?.doors;
      if (doorList && doorList.length) {
        const kd = 1 - Math.exp(-dt * 5);
        for (const door of doorList) {
          let near = Math.hypot(currentPlayer.group.position.x - door.x, currentPlayer.group.position.z - door.z) < 1.6;
          if (!near) {
            for (const a of sceneObjRef.current!.npcs.avatars) {
              if (Math.hypot(a.group.position.x - door.x, a.group.position.z - door.z) < 1.6) {
                near = true;
                break;
              }
            }
          }
          if (!near) {
            for (const e of sceneObjRef.current!.remoteAvatars.values()) {
              if (Math.hypot(e.av.group.position.x - door.x, e.av.group.position.z - door.z) < 1.6) {
                near = true;
                break;
              }
            }
          }
          const target = near ? 1 : 0;
          if (Math.abs(target - door.open) < 0.002) continue;
          door.open += (target - door.open) * kd;
          const info = door.leaf.userData.doorLeaf as { kind: 'swing' | 'slide'; angle?: number; side?: number; closedX?: number; travel?: number };
          if (info.kind === 'swing') door.leaf.rotation.y = (info.angle ?? 1.48) * door.open;
          else door.leaf.position.x = (info.closedX ?? 0) + (info.side ?? 1) * (info.travel ?? 0.5) * door.open;
          markActive();
        }
      }
      // Màn hình bàn làm việc: sáng khi có người ngồi gõ phím tại bàn đó
      if (frameCount % 20 === 0 && sceneObjRef.current && sceneObjRef.current.deskScreens.size) {
        const active = new Set<string>();
        if (sitting?.activity === 'type' && sitting.targetId) active.add(sitting.targetId);
        for (const e of sceneObjRef.current.remoteAvatars.values()) if (e.seatAct?.activity === 'type' && e.seatAct.targetId) active.add(e.seatAct.targetId);
        for (const [id, sc] of sceneObjRef.current.deskScreens) {
          const on = active.has(id);
          if (on !== sc.on) {
            sc.on = on;
            setDeskScreenOn(sc.mesh.material as THREE.MeshStandardMaterial, on, sc.variant);
          }
        }
      }
      const roomCamActive = !firstPerson && updateRoomCamera(currentPlayer, dt, totalTime);
      if (!roomCamActive) {
        camRig.beforeOrbit();
        if (!camRig.introActive && !firstPerson) orbit.update();
        // Intro dùng thời gian thực (không bị kẹp 0.05s) để không "đứng hình" khi máy chậm
        camRig.afterOrbit(Math.min(rawDt, 0.1), frameCount);
      }
      // Chốt an toàn camera: toạ độ lỗi (NaN) hoặc văng quá xa nhân vật → đưa về sau lưng, bật lại xoay
      {
        const pp = currentPlayer.group.position;
        const far = camera.position.distanceTo(pp) > Math.max(widthM, depthM) + 25;
        const bad = !Number.isFinite(camera.position.x + camera.position.y + camera.position.z + orbit.target.x + orbit.target.y + orbit.target.z);
        if ((bad || far) && !camRig.introActive && !firstPerson) {
          const rr = currentPlayer.group.rotation.y;
          orbit.target.set(pp.x, 1.3, pp.z);
          camera.position.set(pp.x - Math.sin(rr) * 5.2, 2.9, pp.z - Math.cos(rr) * 5.2);
          if (room) {
            for (const h of room.hidden) h.visible = true;
            stateRef.current.onRoomChange?.(null);
          }
          room = null;
          roomExit = null;
          orbit.enabled = true;
        }
        // Không ở phòng / intro / góc thứ nhất / đang kéo vật thể mà orbit bị tắt → bật lại (tránh kẹt không xoay được)
        if (!room && !roomExit && !camRig.introActive && !firstPerson && !drag && !orbit.enabled) orbit.enabled = true;
      }
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
      // Báo sẵn sàng sau 2 khung hình có đồ đạc (shader đã biên dịch xong)
      if (readyFrames < 2 && (sceneObjRef.current?.objectMap.size ?? 0) > 0 && ++readyFrames === 2) onReadyRef.current?.();
      // Nhãn HTML (tên, bong bóng chat): chỉ cập nhật DOM khi đổi; mờ dần khi xa
      labelRenderer.render(htmlLabels, scene, camera);

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
      sceneObjRef.current?.npcs.dispose();
      sceneObjRef.current?.leaves?.dispose();
      sceneObjRef.current?.groundLeaves?.dispose();
      sceneObjRef.current?.steam.dispose();
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
  const avatarSig = `${playerName}|${isSelfOnDuty}|${playerAvatar.outfitStyle}|${playerAvatar.outfitColor}|${playerAvatar.pantsColor}|${playerAvatar.bottomStyle}|${playerAvatar.hairStyle}|${playerAvatar.hairColor}|${playerAvatar.skinTone}|${playerAvatar.hasGlasses}`;
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
    else if (seatCommand.kind === 'dutySit') (api as { dutySit?: () => boolean } | undefined)?.dutySit?.();
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
      sceneKind === 'CAFE'
        ? { target: new THREE.Vector3(p.x, 2.3, p.z - 0.6), position: new THREE.Vector3(p.x, 3.4, p.z + 9.5) }
        : { target: new THREE.Vector3(p.x, 1.35, p.z), position: new THREE.Vector3(p.x, 2.9, p.z + 5.4) },
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
      let built: ReturnType<typeof buildSpaceObject>;
      try {
        built = buildSpaceObject(o, ctx);
      } catch (err) {
        // 1 vật thể lỗi không được làm hỏng cả cảnh
        console.error('[space3d] dựng vật thể lỗi', o.kind, o.id, err);
        continue;
      }
      if (built.shelves.length && merchItems.length) {
        const manualPick = o.merch?.mode === 'MANUAL' && o.merch.itemIds.length > 0;
        built.root.add(buildMerchandise(o.id, built.shelves, resolveMerchItems(o.merch, merchItems, o.kind), manualPick, o.label));
      }
      freezeStaticDescendants(built.root);
      if (o.kind === 'ROOM_ZONE') built.root.visible = editMode;
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
    // Vùng phòng chỉ hiện khi đang thiết kế
    for (const entry of obj.objectMap.values()) if (entry.root.userData.kind === 'ROOM_ZONE') entry.root.visible = editMode;
    const fades: THREE.Mesh[] = [];
    for (const entry of obj.objectMap.values()) {
      entry.root.traverse((c) => {
        if (c.userData?.fadeOnOcclude && (c as THREE.Mesh).isMesh) fades.push(c as THREE.Mesh);
      });
    }
    obj.fadeables = fades;
    const screens = new Map<string, { mesh: THREE.Mesh; variant: number; on: boolean }>();
    for (const entry of obj.objectMap.values()) {
      entry.root.traverse((c) => {
        if (c.userData?.screenOf && (c as THREE.Mesh).isMesh) {
          const prev = obj.deskScreens.get(c.userData.screenOf);
          screens.set(c.userData.screenOf, { mesh: c as THREE.Mesh, variant: c.userData.screenVariant ?? 0, on: prev?.mesh === c ? prev.on : false });
        }
      });
    }
    obj.deskScreens = screens;
    const doors: { leaf: THREE.Object3D; x: number; z: number; open: number }[] = [];
    for (const [id, entry] of obj.objectMap) {
      const src = structures.find((st) => st.id === id);
      if (!src) continue;
      entry.root.traverse((c) => {
        if (c.userData?.doorLeaf) {
          const prev = obj.doors.find((dd) => dd.leaf === c);
          doors.push({ leaf: c, x: src.posX, z: src.posZ, open: prev?.open ?? 0 });
        }
      });
    }
    obj.doors = doors;
    rebuildInstancing(obj.objectMap, obj.instancedGroup, editMode);
    // NPC quán cà phê theo bố cục (tắt khi đang thiết kế)
    obj.npcs.rebuild(structures, sceneKind === 'CAFE' && !editMode);
    // Lá đa rơi lả tả quanh cây đa
    if (obj.leaves) {
      obj.scene.remove(obj.leaves.mesh);
      obj.leaves.dispose();
      obj.leaves = null;
    }
    if (obj.groundLeaves) {
      obj.scene.remove(obj.groundLeaves);
      obj.groundLeaves.dispose();
      obj.groundLeaves = null;
    }
    const banyan = structures.find((o) => o.kind === 'BANYAN_TREE');
    if (banyan && !editMode) {
      obj.leaves = new FallingLeaves(banyan.posX, banyan.posZ, banyan.widthM * 2.2, Math.min(7, banyan.heightM * 0.7));
      obj.scene.add(obj.leaves.mesh);
      obj.groundLeaves = buildGroundLeaves(banyan.posX, banyan.posZ, banyan.widthM * 2.6);
      obj.scene.add(obj.groundLeaves);
    }
    // Hơi nóng cố định: chảo bánh quê + máy pha trên quầy bar
    const fixedSteam: { x: number; y: number; z: number; size?: number }[] = [];
    if (sceneKind === 'CAFE' && !editMode) {
      for (const o of structures) {
        if (o.kind === 'BANH_QUE_KIOSK') {
          const p = localToWorld(o, -o.widthM * 0.25, o.depthM / 2 - 0.45);
          fixedSteam.push({ x: p.x, y: 1.18, z: p.z, size: 0.14 });
        }
        if (o.kind === 'ESPRESSO_MACHINE') fixedSteam.push({ x: o.posX + 0.2, y: (o.posY ?? 0) + 0.55, z: o.posZ + 0.1, size: 0.08 });
        if (o.kind === 'MIST_FAN') {
          // Sương phun trước đầu quạt
          const p = localToWorld(o, 0, 0.38);
          fixedSteam.push({ x: p.x, y: o.heightM - 0.1, z: p.z, size: 0.2 });
        }
      }
    }
    obj.steamFixed = fixedSteam;
    const spinners: { obj: THREE.Object3D; speed: number }[] = [];
    const flows: { map: THREE.Texture; speed: number }[] = [];
    const dapples: THREE.Mesh[] = [];
    const kois: THREE.Object3D[] = [];
    for (const entry of obj.objectMap.values()) {
      entry.root.traverse((c) => {
        if (c.userData?.spinner) spinners.push({ obj: c, speed: c.userData.spinner.speed ?? 10 });
        // Dòng socola chảy (phòng Lab): trượt texture — gom theo vật liệu dùng chung
        if (c.userData?.flow) {
          const fm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (fm?.map && !flows.some((f) => f.map === fm.map)) flows.push({ map: fm.map, speed: c.userData.flow.speed ?? 0.6 });
        }
        if (c.userData?.dapple) dapples.push(c as THREE.Mesh);
        if (c.userData?.koi) kois.push(c);
      });
    }
    obj.spinners = spinners;
    obj.flows = flows;
    obj.dapples = dapples;
    obj.kois = kois;
    obj.steam.setEmitters([...fixedSteam, ...(obj.steamCups ?? [])]);
    // Bóng đã bake theo mesh cũ → tính lại sau khi gom/bỏ gom instancing
    obj.renderer.shadowMap.needsUpdate = true;
    if (changed) obj.renderer.shadowMap.needsUpdate = true;
    const upd = (obj as unknown as { updateSelectionBox?: (id: string | null, c?: boolean) => void }).updateSelectionBox;
    upd?.(editMode ? selectedObjectId : null, selectedObjectId ? findCollisions(structures, selectedObjectId).length > 0 : false);
  }, [structures, sceneKind, widthM, depthM, editMode, selectedObjectId, branding.companyName, merchItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ly nước đã phục vụ trên bàn (quán cà phê) — dựng lại khi danh sách đơn đổi
  useEffect(() => {
    const obj = sceneObjRef.current;
    if (!obj) return;
    const served = (drinkOrders ?? []).filter((o) => o.status === 'SERVED' && o.spot);
    const keep = new Set(served.map((o) => o.id));
    for (const [id, g] of obj.drinkMeshes) {
      if (keep.has(id)) continue;
      obj.drinksGroup.remove(g);
      disposeObject(g);
      obj.drinkMeshes.delete(id);
    }
    // Ly nóng (espresso, latte, cappuccino, trà) trên bàn → hơi nóng bốc lên
    const hot = new Set((cafeMenu ?? []).filter((m) => m.cupKind === 'espresso' || m.cupKind === 'mug' || m.cupKind === 'tea').map((m) => m.code));
    obj.steamCups = served
      .filter((o) => o.lines.some((l) => hot.has(l.code)) && o.spot)
      .map((o) => ({ x: o.spot!.x, y: o.spot!.y + 0.1, z: o.spot!.z, size: 0.06 }));
    obj.steam.setEmitters([...(obj.steamFixed ?? []), ...obj.steamCups]);
    for (const o of served) {
      if (obj.drinkMeshes.has(o.id)) continue;
      const g = buildOrderDrinks(o, cafeMenu ?? []);
      if (!g) continue;
      obj.drinksGroup.add(g);
      obj.drinkMeshes.set(o.id, g);
    }
  }, [drinkOrders, cafeMenu]);

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
      // Khách không mặc đồng phục công ty → hiển thị sơ mi
      const cfg = m.isGuest && m.avatar.outfitStyle === 'uniform' ? { ...m.avatar, outfitStyle: 'shirt' as const } : m.avatar;
      const av = createChibiAvatar({ name: m.employeeName, config: cfg, isOnDuty: m.onDuty, isStaff: !m.isGuest });
      prepareRemoteAvatar(av, m.employeeId);
      av.group.position.set(x, 0, z);
      av.group.rotation.y = r;
      obj.remoteGroup.add(av.group);
      obj.remoteAvatars.set(m.employeeId, { av, sig, walkTime: Math.random() * 6, barista: m.onDuty && !m.isGuest && sceneKind === 'CAFE' });
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
