/**
 * Tiện ích bố cục cho Trình thiết kế Không gian 3D — thuần TypeScript (không Three.js, không DOM) để test được.
 */
import { SPACE_OBJECT_DEF_MAP } from './space-3d-catalog';
import { normalizeSpaceObject, type SpaceObject } from './space-3d-types';

export const GRID_STEP = 0.25;
export const ROTATE_STEP = Math.PI / 12; // 15°

export function snap(v: number, step = GRID_STEP): number {
  return Math.round(v / step) * step;
}

export function snapAngle(a: number, step = ROTATE_STEP): number {
  const s = Math.round(a / step) * step;
  const tau = Math.PI * 2;
  return ((s % tau) + tau) % tau;
}

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function footprintOf(o: Pick<SpaceObject, 'posX' | 'posZ' | 'widthM' | 'depthM' | 'rotY'>): Footprint {
  const c = Math.abs(Math.cos(o.rotY));
  const s = Math.abs(Math.sin(o.rotY));
  const hw = (o.widthM * c + o.depthM * s) / 2;
  const hd = (o.widthM * s + o.depthM * c) / 2;
  return { minX: o.posX - hw, maxX: o.posX + hw, minZ: o.posZ - hd, maxZ: o.posZ + hd };
}

/** Các loại được phép đặt chồng / sát nhau (thảm, đèn thả, tranh, cây trên bồn…) */
const NON_BLOCKING = new Set(['RUG', 'PENDANT_LIGHT', 'WALL_ART', 'MENU_BOARD']);

export function overlaps(a: Footprint, b: Footprint, margin = 0.02): boolean {
  return a.minX < b.maxX - margin && a.maxX > b.minX + margin && a.minZ < b.maxZ - margin && a.maxZ > b.minZ + margin;
}

/** Danh sách id vật thể đang chồng lấn với vật thể `id` (bỏ qua loại không chắn). */
export function findCollisions(objects: SpaceObject[], id: string): string[] {
  const me = objects.find((o) => o.id === id);
  if (!me || NON_BLOCKING.has(me.kind)) return [];
  const fp = footprintOf(me);
  return objects
    .filter((o) => o.id !== id && !NON_BLOCKING.has(o.kind) && (o.posY ?? 0) === (me.posY ?? 0))
    .filter((o) => overlaps(fp, footprintOf(o)))
    .map((o) => o.id);
}

/** Kẹp vật thể vào trong mặt bằng (tính theo hộp bao đã xoay). */
export function clampInside(o: SpaceObject, widthM: number, depthM: number): SpaceObject {
  const fp = footprintOf(o);
  const hw = (fp.maxX - fp.minX) / 2;
  const hd = (fp.maxZ - fp.minZ) / 2;
  const limX = Math.max(0, widthM / 2 - hw);
  const limZ = Math.max(0, depthM / 2 - hd);
  return { ...o, posX: Math.min(limX, Math.max(-limX, o.posX)), posZ: Math.min(limZ, Math.max(-limZ, o.posZ)) };
}

export function newObjectId(kind: string, existing: Iterable<string>): string {
  const set = new Set(existing);
  const base = kind.toLowerCase().replace(/_/g, '-');
  for (let i = 1; i < 10000; i++) {
    const id = `${base}-${i}`;
    if (!set.has(id)) return id;
  }
  return `${base}-${Date.now()}`;
}

/** Tạo vật thể mới với kích thước & màu mặc định của danh mục. */
export function createObject(kind: string, x: number, z: number, existingIds: Iterable<string>, rotY = 0): SpaceObject | null {
  const def = SPACE_OBJECT_DEF_MAP[kind];
  if (!def) return null;
  return normalizeSpaceObject({
    id: newObjectId(kind, existingIds),
    kind,
    label: def.label,
    posX: snap(x),
    posZ: snap(z),
    rotY,
    widthM: def.size[0],
    depthM: def.size[1],
    heightM: def.size[2],
    color: def.color,
    accentColor: def.color ?? '#2563eb',
    levels: def.defaultLevels,
  });
}

export function duplicateObject(o: SpaceObject, existingIds: Iterable<string>): SpaceObject {
  const off = Math.max(0.5, Math.min(o.widthM, o.depthM) * 0.6);
  return { ...o, id: newObjectId(o.kind, existingIds), posX: snap(o.posX + off), posZ: snap(o.posZ + off), locked: false };
}

// ───────────── Lịch sử hoàn tác ─────────────

export interface LayoutHistory {
  past: SpaceObject[][];
  present: SpaceObject[];
  future: SpaceObject[][];
}

export const HISTORY_LIMIT = 100;

export function historyInit(objects: SpaceObject[]): LayoutHistory {
  return { past: [], present: objects, future: [] };
}

/** Ghi trạng thái mới (bỏ qua nếu không đổi). */
export function historyPush(h: LayoutHistory, next: SpaceObject[]): LayoutHistory {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export function historyUndo(h: LayoutHistory): LayoutHistory {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function historyRedo(h: LayoutHistory): LayoutHistory {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
