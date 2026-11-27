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
const NON_BLOCKING = new Set([
  'RUG', 'PENDANT_LIGHT', 'WALL_ART', 'MENU_BOARD',
  'SHADE_NET', 'METAL_ROOF', 'PATIO_UMBRELLA', 'STEPPING_PATH', 'GRAVEL_BED', 'HOI_AN_LANTERN', 'ROOM_ZONE', 'RED_CARPET', 'BALLOON_ARCH', 'LANTERN_STRING', 'STRING_LIGHTS', 'BAMBOO_PENDANT',
]);

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

// ───────────── Chỗ ngồi (ghế, ghế bar, sofa, ghế bành, ghế xoay) ─────────────

export interface Seat {
  /** Toạ độ thế giới của điểm ngồi (hông) */
  x: number;
  z: number;
  /** Độ cao mặt ngồi (m) */
  y: number;
  /** Hướng mặt người ngồi (rad) */
  rotY: number;
  /** Hoạt động khi ngồi (gõ phím / họp / nghỉ) + bàn đang dùng */
  activity?: 'type' | 'meeting' | 'rest';
  targetId?: string | null;
  /** Ghế nhân viên (sau quầy) */
  staff?: boolean;
}

export const SEATABLE_KINDS = new Set(['CHAIR', 'BAR_STOOL', 'SOFA', 'ARMCHAIR', 'OFFICE_CHAIR', 'STACK_CHAIR']);

/** Danh sách chỗ ngồi của 1 vật thể (sofa nhiều chỗ). Mặt trước vật thể là +Z cục bộ. */
export function seatsFor(o: Pick<SpaceObject, 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM' | 'heightM'>): Seat[] {
  if (!SEATABLE_KINDS.has(o.kind)) return [];
  const local: { lx: number; lz: number; y: number }[] = [];
  switch (o.kind) {
    case 'CHAIR':
      local.push({ lx: 0, lz: -0.06, y: 0.48 }); // mặt ghế 0.48m, hông lùi về tựa lưng
      break;
    case 'STACK_CHAIR':
      local.push({ lx: 0, lz: -0.04, y: 0.47 });
      break;
    case 'BAR_STOOL':
      local.push({ lx: 0, lz: 0, y: o.heightM - 0.02 });
      break;
    case 'OFFICE_CHAIR':
      local.push({ lx: 0, lz: -0.04, y: 0.53 });
      break;
    case 'ARMCHAIR':
      local.push({ lx: 0, lz: -0.1, y: 0.47 }); // đệm ghế bành
      break;
    case 'SOFA': {
      const n = o.widthM > 2.3 ? 3 : 2;
      const inner = o.widthM - 0.28;
      for (let i = 0; i < n; i++) local.push({ lx: -inner / 2 + (inner / n) * (i + 0.5), lz: -0.1, y: 0.47 });
      break;
    }
  }
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  return local.map((p) => ({
    x: o.posX + p.lx * c + p.lz * s,
    z: o.posZ - p.lx * s + p.lz * c,
    y: p.y,
    rotY: o.rotY,
  }));
}

/** Chỗ ngồi trống gần điểm bấm nhất (bỏ chỗ đã có người ngồi trong bán kính 0.35m) */
export function pickSeat(seats: Seat[], clickX: number, clickZ: number, occupied: { x: number; z: number }[]): Seat | null {
  const free = seats.filter((st) => !occupied.some((p) => Math.hypot(p.x - st.x, p.z - st.z) < 0.35));
  if (!free.length) return null;
  return free.reduce((best, st) => (Math.hypot(st.x - clickX, st.z - clickZ) < Math.hypot(best.x - clickX, best.z - clickZ) ? st : best));
}

// ───────────── Ghế nhân viên & hoạt động khi ngồi ─────────────

type Placed = Pick<SpaceObject, 'id' | 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM'>;

/** Quầy có phía sau dành cho nhân viên (mặt trước = +Z cục bộ, khách đứng phía trước) */
export const STAFF_COUNTER_KINDS = new Set(['DISPLAY_COUNTER', 'RECEPTION_DESK', 'CHECKOUT', 'BAR_COUNTER', 'BANH_QUE_KIOSK', 'PANTRY_COUNTER']);

/** Toạ độ (x, z) trong hệ cục bộ của vật thể */
function toLocal(o: Placed, x: number, z: number) {
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  const dx = x - o.posX;
  const dz = z - o.posZ;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** Quầy mà ghế đang nằm PHÍA SAU (trong 1.2m tính từ mép sau, nằm trong bề ngang quầy) */
export function counterBehind(seat: Pick<SpaceObject, 'posX' | 'posZ'>, objects: Placed[]): Placed | null {
  for (const o of objects) {
    if (!STAFF_COUNTER_KINDS.has(o.kind)) continue;
    const { lx, lz } = toLocal(o, seat.posX, seat.posZ);
    // Lễ tân chữ L: phía sau là vùng bên trong chữ L (z cục bộ âm) — dùng chung quy tắc
    if (Math.abs(lx) <= o.widthM / 2 + 0.2 && lz < -o.depthM / 2 + 0.25 && lz > -o.depthM / 2 - 1.2) return o;
  }
  return null;
}

/** Ghế chỉ dành cho nhân viên? (seatAccess ghi đè; auto → ghế phía sau quầy) */
export function isStaffSeat(seatObj: Pick<SpaceObject, 'kind' | 'posX' | 'posZ' | 'seatAccess'>, objects: Placed[]): boolean {
  if (!SEATABLE_KINDS.has(seatObj.kind)) return false;
  if (seatObj.seatAccess === 'staff') return true;
  if (seatObj.seatAccess === 'all') return false;
  return counterBehind(seatObj, objects) !== null;
}

export type SeatActivity = 'type' | 'meeting' | 'rest';

/** Hoạt động khi ngồi: ghế xoay trước bàn làm việc → gõ phím; quanh bàn họp → họp; còn lại → nghỉ */
export function seatActivity(seat: Seat, objects: Placed[]): { activity: SeatActivity; targetId: string | null } {
  // Điểm trước mặt người ngồi ~0.55m
  const fx = seat.x + Math.sin(seat.rotY) * 0.55;
  const fz = seat.z + Math.cos(seat.rotY) * 0.55;
  for (const o of objects) {
    if (o.kind !== 'DESK' && o.kind !== 'MEETING_TABLE') continue;
    const { lx, lz } = toLocal(o, fx, fz);
    if (Math.abs(lx) <= o.widthM / 2 + 0.15 && Math.abs(lz) <= o.depthM / 2 + 0.25) {
      return { activity: o.kind === 'DESK' ? 'type' : 'meeting', targetId: o.id };
    }
  }
  return { activity: 'rest', targetId: null };
}
