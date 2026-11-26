import * as THREE from 'three';
import type { SpaceObject } from '@/lib/space-3d-types';
import { SPACE_OBJECT_DEF_MAP } from '@/lib/space-3d-catalog';
import { mergeStaticGroup } from '../merge';
import type { BuildContext, ShelfSlot } from './kit';
import {
  buildArmchair,
  buildChair,
  buildBarStool,
  buildCoffeeTable,
  buildDesk,
  buildFileCabinet,
  buildMeetingTable,
  buildOfficeChair,
  buildPartition,
  buildRug,
  buildSofa,
  buildTableRect,
  buildTableRound,
} from './furniture';
import { buildPlant, buildPlanterBox } from './plants';
import { buildBooth, buildBrandWall, buildCheckout, buildDisplayCabinet, buildGondola, buildPodium, buildReception, buildWallShelf } from './retail';
import { buildBarCounter, buildEspresso, buildMenuBoard, buildPastryCase, buildPendant } from './cafe';
import { buildCartonStack, buildForklift, buildPalletStack, buildRack } from './warehouse';
import { buildDoor, buildFloorLamp, buildGlassWall, buildWall, buildWallArt } from './structure';

type Builder = (o: SpaceObject, ctx: BuildContext) => THREE.Group;

const BUILDERS: Record<string, Builder> = {
  BOOTH: buildBooth,
  GONDOLA: buildGondola,
  WALL_SHELF: buildWallShelf,
  DISPLAY_CABINET: buildDisplayCabinet,
  PODIUM: buildPodium,
  CHECKOUT: buildCheckout,
  RECEPTION_DESK: buildReception,
  TABLE_ROUND: buildTableRound,
  TABLE_RECT: (o) => buildTableRect(o),
  CHAIR: buildChair,
  BAR_STOOL: buildBarStool,
  SOFA: buildSofa,
  ARMCHAIR: buildArmchair,
  COFFEE_TABLE: buildCoffeeTable,
  RUG: buildRug,
  PLANT_FIDDLE: buildPlant,
  PLANT_MONSTERA: buildPlant,
  PLANT_SNAKE: buildPlant,
  PLANT_PALM: buildPlant,
  PLANTER_BOX: buildPlanterBox,
  BAR_COUNTER: buildBarCounter,
  ESPRESSO_MACHINE: buildEspresso,
  PASTRY_CASE: buildPastryCase,
  MENU_BOARD: buildMenuBoard,
  PENDANT_LIGHT: buildPendant,
  DESK: buildDesk,
  OFFICE_CHAIR: buildOfficeChair,
  MEETING_TABLE: buildMeetingTable,
  FILE_CABINET: buildFileCabinet,
  PARTITION: buildPartition,
  RACK: buildRack,
  PALLET_STACK: buildPalletStack,
  FORKLIFT: buildForklift,
  CARTON_STACK: buildCartonStack,
  BRAND_WALL: buildBrandWall,
  FLOOR_LAMP: buildFloorLamp,
  WALL_ART: buildWallArt,
  WALL: buildWall,
  GLASS_WALL: buildGlassWall,
  DOOR: buildDoor,
};

/** Chữ ký thay đổi — chỉ dựng lại vật thể khi chữ ký đổi (không dựng lại cả cảnh khi kéo 1 món). */
export function objectSignature(o: SpaceObject, extra = ''): string {
  return [o.kind, o.widthM, o.depthM, o.heightM, o.color, o.accentColor, o.variant, o.levels, o.label, o.subLabel, extra].join('|');
}

/** Điểm đứng phía trước vật thể (để khách bấm vào gian hàng thì tự đi tới). */
export function standPoint(o: SpaceObject): { x: number; z: number } {
  const dist = o.depthM / 2 + 2.1;
  return { x: o.posX + Math.sin(o.rotY) * dist, z: o.posZ + Math.cos(o.rotY) * dist };
}

export interface BuiltObject {
  /** Nhóm gốc: đặt vị trí/xoay theo vật thể; userData.objectId để raycast chọn */
  root: THREE.Group;
  shelves: ShelfSlot[];
}

/** Dựng 1 vật thể: builder → gộp geometry tĩnh → bọc trong root (vị trí/xoay). */
export function buildSpaceObject(o: SpaceObject, ctx: BuildContext): BuiltObject {
  const builder = BUILDERS[o.kind];
  const root = new THREE.Group();
  root.userData = { objectId: o.id, kind: o.kind };
  if (!builder) return { root, shelves: [] };
  const raw = builder(o, ctx);
  const shelves = (raw.userData.shelves as ShelfSlot[] | undefined) ?? [];
  const def = SPACE_OBJECT_DEF_MAP[o.kind];
  // Gian hàng giữ mesh tương tác (boothId) — merge vẫn bỏ qua các mesh này
  const merged = mergeStaticGroup(raw);
  if (raw.userData.noShadowCast) merged.traverse((c) => (c.castShadow = false));
  root.add(merged);
  if (def?.walkTarget) {
    const sp = standPoint(o);
    const meta = { boothId: o.id, standX: sp.x, standZ: sp.z, lookX: o.posX, lookZ: o.posZ };
    root.traverse((c) => {
      if (c.userData.boothId !== undefined || c === root) Object.assign(c.userData, meta);
    });
    root.userData.isBooth = true;
  }
  root.traverse((c) => {
    c.userData.objectId = o.id;
  });
  applyTransform(root, o);
  return { root, shelves };
}

export function applyTransform(root: THREE.Object3D, o: SpaceObject) {
  root.position.set(o.posX, o.posY ?? 0, o.posZ);
  root.rotation.set(0, o.rotY, 0);
}

/** Hộp bao (AABB) trên mặt sàn sau khi xoay — dùng kiểm tra chồng lấn. */
export function footprint(o: SpaceObject): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = Math.abs(Math.cos(o.rotY));
  const s = Math.abs(Math.sin(o.rotY));
  const hw = (o.widthM * c + o.depthM * s) / 2;
  const hd = (o.widthM * s + o.depthM * c) / 2;
  return { minX: o.posX - hw, maxX: o.posX + hw, minZ: o.posZ - hd, maxZ: o.posZ + hd };
}

export function hasBuilder(kind: string): boolean {
  return kind in BUILDERS;
}
