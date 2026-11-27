/**
 * Nhân vật tự động (NPC) trong quán cà phê — phần thuần TS (tìm vị trí theo bố cục, đường đi), test được.
 * Mặt trước vật thể = +Z cục bộ.
 */
import type { SpaceObject } from './space-3d-types';

export type NpcRole = 'barista' | 'vendor' | 'waiter' | 'guard';

export interface NpcSpot {
  x: number;
  z: number;
  /** Hướng mặt (rad) */
  rotY: number;
}

type Placed = Pick<SpaceObject, 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM'>;

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
  return out;
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
};
