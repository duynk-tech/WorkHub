/**
 * Nhân vật tự động (NPC) trong quán cà phê — phần thuần TS (tìm vị trí theo bố cục, đường đi), test được.
 * Mặt trước vật thể = +Z cục bộ.
 */
import type { SpaceObject } from './space-3d-types';
import { SEATABLE_KINDS, isStaffSeat, seatsFor, type Seat } from './space-3d-layout';
import { findServeSpot } from './space-3d-cafe-menu';

export type NpcRole = 'barista' | 'vendor' | 'waiter' | 'guard' | 'receptionist' | 'demo' | 'consultant' | 'labtech';

export interface NpcSpot {
  x: number;
  z: number;
  /** Hướng mặt (rad) */
  rotY: number;
  /** Ngồi làm việc (độ cao mặt ghế) — vd. lễ tân ngồi ghế xoay sau quầy */
  sitY?: number;
}

type Placed = Pick<SpaceObject, 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM'> & { variant?: string };

/** Điểm cục bộ (lx, lz) của vật thể → toạ độ thế giới */
export function localToWorld(o: Placed, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  return { x: o.posX + lx * c + lz * s, z: o.posZ - lx * s + lz * c };
}

/** Vị trí đứng làm việc của từng NPC theo bố cục quán (thiếu vật thể nào thì không có NPC đó) */
export function findNpcSpots(objects: Placed[]): Partial<Record<NpcRole, NpcSpot>> {
  const out: Partial<Record<NpcRole, NpcSpot>> = {};
  const bar = objects.find((o) => o.kind === 'BAR_COUNTER');
  if (bar) {
    // Barista đứng sau quầy, nhìn ra khách
    const p = localToWorld(bar, -bar.widthM * 0.15, -(bar.depthM / 2 + 0.38));
    out.barista = { ...p, rotY: bar.rotY };
    // Người phục vụ đứng chờ trước quầy, lệch sang 1 bên
    const w = localToWorld(bar, bar.widthM / 2 - 0.3, bar.depthM / 2 + 0.9);
    out.waiter = { ...w, rotY: bar.rotY };
  }
  const kiosk = objects.find((o) => o.kind === 'BANH_QUE_KIOSK');
  if (kiosk) {
    // Quầy gỗ đặt ở mép trước kiosk (z cục bộ = d/2 - 0.45); chị bán đứng ngay sau quầy
    const p = localToWorld(kiosk, -kiosk.widthM * 0.1, kiosk.depthM / 2 - 1.15);
    out.vendor = { ...p, rotY: kiosk.rotY };
  }
  const gate = objects.find((o) => o.kind === 'GARDEN_GATE');
  if (gate) {
    // Bảo vệ đứng phía trong cổng, cạnh cột phải, quay mặt vào lối đi giữa
    const p = localToWorld(gate, gate.widthM / 2 + 0.2, -1.4);
    out.guard = { ...p, rotY: gate.rotY - Math.PI / 2 };
  }
  // ── Showroom ──
  const desk = objects.find((o) => o.kind === 'RECEPTION_DESK');
  if (desk) {
    // Lễ tân đứng sau quầy, lệch cạnh ghế xoay, nhìn ra cửa
    // Ngồi ghế xoay ngay sau quầy (nếu có), không thì đứng sau quầy
    const chair = objects
      .filter((o) => o.kind === 'OFFICE_CHAIR' && 'heightM' in o)
      .map((o) => ({ o, d: Math.hypot(o.posX - desk.posX, o.posZ - desk.posZ) }))
      .filter((e) => e.d < 2.5)
      .sort((a, b) => a.d - b.d)[0]?.o;
    const seat = chair ? seatsFor(chair as Parameters<typeof seatsFor>[0])[0] : undefined;
    if (seat) out.receptionist = { x: seat.x, z: seat.z, rotY: seat.rotY, sitY: seat.y };
    else {
      const p = localToWorld(desk, desk.widthM * 0.25, -(desk.depthM / 2 + 0.35));
      out.receptionist = { ...p, rotY: desk.rotY };
    }
  }
  const demo = objects.find((o) => o.kind === 'DEMO_BAR');
  if (demo) {
    const p = localToWorld(demo, demo.widthM * 0.3, -(demo.depthM / 2 + 0.4));
    out.demo = { ...p, rotY: demo.rotY };
  }
  const choc = objects.find((o) => o.kind === 'LAB_COUNTER' && o.variant === 'chocolate');
  if (choc) {
    const p = localToWorld(choc, choc.widthM * 0.15, -(choc.depthM / 2 + 0.4));
    out.labtech = { ...p, rotY: choc.rotY };
  }
  const counter = objects.filter((o) => o.kind === 'DISPLAY_COUNTER').sort((a, b) => b.posZ - a.posZ)[0];
  if (counter) {
    // Tư vấn viên đứng trước quầy máy gần lối vào nhất, quay ra lối đi chờ khách
    const p = localToWorld(counter, -counter.widthM * 0.3, counter.depthM / 2 + 0.9);
    out.consultant = { ...p, rotY: counter.rotY };
  }
  return out;
}

/** Lộ trình đi tuần của tư vấn viên: trước các quầy máy cùng dãy (tối đa 3 quầy gần nhất) */
export function consultantPatrol(objects: Placed[], home: NpcSpot): { x: number; z: number }[] {
  const fronts = objects
    .filter((o) => o.kind === 'DISPLAY_COUNTER')
    .map((o) => ({ o, p: localToWorld(o, 0, o.depthM / 2 + 0.9) }))
    .filter(({ p }) => Math.abs(p.x - home.x) < 1.2)
    .sort((a, b) => Math.abs(a.p.z - home.z) - Math.abs(b.p.z - home.z))
    .slice(1, 3)
    .map(({ p }) => p);
  return fronts;
}

/**
 * Đường đi phục vụ: từ quầy ra lối giữa, đi dọc lối, rồi rẽ vào điểm đứng cạnh bàn
 * (cách mép ly ~0.65m về phía người gọi, lệch sang bên để không đứng chắn mặt khách).
 */
export function serveRoute(
  from: { x: number; z: number },
  spot: { x: number; z: number },
  customer: { x: number; z: number },
): { x: number; z: number }[] {
  const dx = customer.x - spot.x;
  const dz = customer.z - spot.z;
  const len = Math.hypot(dx, dz) || 1;
  // Đứng lệch ngang so với hướng khách → bưng ly đặt xuống từ cạnh bên
  const side = { x: -dz / len, z: dx / len };
  const stand = { x: spot.x + side.x * 0.7 + (dx / len) * 0.25, z: spot.z + side.z * 0.7 + (dz / len) * 0.25 };
  const mid = { x: from.x, z: stand.z };
  return Math.abs(mid.z - from.z) < 0.3 || Math.abs(mid.x - stand.x) < 0.3 ? [stand] : [mid, stand];
}

export const NPC_PROFILES: Record<NpcRole, { name: string; title: string }> = {
  barista: { name: 'Anh Tư', title: 'Pha chế' },
  vendor: { name: 'Chị Ba', title: 'Bánh quê' },
  waiter: { name: 'Bé Na', title: 'Phục vụ' },
  guard: { name: 'Chú Sáu', title: 'Bảo vệ' },
  receptionist: { name: 'Chị Vy', title: 'Lễ tân' },
  demo: { name: 'Anh Khoa', title: 'Barista' },
  consultant: { name: 'Anh Minh', title: 'Tư vấn thiết bị' },
  labtech: { name: 'Chị Hạnh', title: 'R&D Lab' },
};

// ───────────── Khách quen ngồi quán (NPC) ─────────────

const PATRON_TABLES = new Set(['TABLE_ROUND', 'TABLE_RECT', 'COFFEE_TABLE', 'LIVE_EDGE_TABLE', 'SAMPAN_TABLE']);

export interface PatronSeat {
  seat: Seat;
  /** Chỉ số người ngồi cùng bàn (đang trò chuyện) — null nếu ngồi một mình */
  partner: number | null;
  /** Điểm đặt ly trên mặt bàn trước mặt */
  cup: { x: number; y: number; z: number };
}

/** Xáo trộn ổn định theo hạt giống (mọi máy cùng ngày thấy giống nhau) */
function seededRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Chọn ghế cho khách NPC: 2 bàn có cặp đôi trò chuyện + 1 người ngồi một mình.
 * Chỉ dùng ghế khách (không ghế nhân viên), ghế phải sát một bàn ăn uống (có chỗ đặt ly).
 */
export function pickPatronSeats(
  objects: Pick<SpaceObject, 'id' | 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM' | 'heightM' | 'seatAccess'>[],
  seed: number,
  pairs = 2,
  solos = 1,
): PatronSeat[] {
  const tables = objects.filter((o) => PATRON_TABLES.has(o.kind));
  const byTable = new Map<string, { seat: Seat; cup: { x: number; y: number; z: number } }[]>();
  for (const o of objects) {
    if (!SEATABLE_KINDS.has(o.kind) || isStaffSeat(o, objects)) continue;
    for (const seat of seatsFor(o)) {
      const spot = findServeSpot(tables, seat.x, seat.z, 0.7);
      if (!spot) continue;
      const list = byTable.get(spot.objectId) ?? [];
      list.push({ seat, cup: { x: spot.x, y: spot.y, z: spot.z } });
      byTable.set(spot.objectId, list);
    }
  }
  const rand = seededRand(seed);
  const ids = [...byTable.keys()].sort();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const out: PatronSeat[] = [];
  let p = pairs;
  let s = solos;
  for (const id of ids) {
    const list = byTable.get(id)!;
    if (p > 0 && list.length >= 2) {
      // Cặp ngồi đối diện nhau nếu có (xa nhau nhất), không thì cạnh nhau
      let a = 0;
      let b = 1;
      let far = -1;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].seat.x - list[j].seat.x, list[i].seat.z - list[j].seat.z);
          if (d > far && d < 2.4) {
            far = d;
            a = i;
            b = j;
          }
        }
      const base = out.length;
      out.push({ ...list[a], partner: base + 1 }, { ...list[b], partner: base });
      p--;
    } else if (s > 0) {
      out.push({ ...list[Math.floor(rand() * list.length)], partner: null });
      s--;
    }
    if (p === 0 && s === 0) break;
  }
  return out;
}
