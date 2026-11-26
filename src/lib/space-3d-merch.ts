/**
 * Chọn kiểu bao bì & kích thước cho hàng hoá trên kệ — thuần TS để test được.
 */
import type { SpaceMerchItem } from './space-3d-types';

export type PackKind = 'box' | 'bottle' | 'can' | 'pouch' | 'jar' | 'bag' | 'appliance';

const has = (s: string, words: string[]) => words.some((w) => s.includes(w));

export function choosePackKind(item: Pick<SpaceMerchItem, 'name' | 'category' | 'isMachine'>): PackKind {
  const n = (item.name || '').toLowerCase();
  const c = (item.category || '').toUpperCase();
  if (item.isMachine) return 'appliance';
  if (has(n, ['siro', 'syrup', 'sốt', 'sauce', 'nước ép', 'chai', 'rượu', 'dầu'])) return 'bottle';
  if (has(n, ['lon', 'can ', 'nước ngọt', 'soda', 'bia'])) return 'can';
  if (has(n, ['hạt cà phê', 'cà phê hạt', 'coffee bean', 'cà phê rang', 'bao '])) return 'bag';
  if (has(n, ['trà', 'tea', 'bột', 'powder', 'matcha', 'cacao'])) return 'pouch';
  if (has(n, ['đường', 'mứt', 'jam', 'kem', 'topping', 'hũ', 'thạch'])) return 'jar';
  if (c === 'MACHINE' || c === 'EQUIPMENT' || has(n, ['máy ', 'machine', 'blender', 'xay'])) return 'appliance';
  return 'box';
}

/**
 * Kích thước [rộng, cao, sâu] (m) theo kiểu bao bì, thu nhỏ nếu tầng kệ thấp.
 */
export function packSize(kind: PackKind, clearance: number): [number, number, number] {
  const base: Record<PackKind, [number, number, number]> = {
    box: [0.14, 0.2, 0.08],
    bottle: [0.08, 0.28, 0.08],
    can: [0.066, 0.12, 0.066],
    pouch: [0.13, 0.2, 0.06],
    jar: [0.09, 0.12, 0.09],
    bag: [0.17, 0.26, 0.09],
    appliance: [0.34, 0.38, 0.32],
  };
  const [w, h, d] = base[kind];
  const maxH = Math.max(0.06, clearance - 0.02);
  const k = h > maxH ? maxH / h : 1;
  return [w * k, h * k, d * k];
}

/** Danh sách SP cho 1 kệ theo cấu hình merch (AUTO: toàn bộ danh sách công khai; MANUAL: theo id đã chọn). */
/** Loại kệ trưng bày máy móc (tủ kính, bục, kệ pallet) — ưu tiên máy/thiết bị nguyên chiếc */
const MACHINE_DISPLAYS = new Set(['DISPLAY_COUNTER', 'DISPLAY_CABINET', 'PODIUM', 'RACK']);

export function resolveMerchItems(
  merch: { mode: 'AUTO' | 'MANUAL'; itemIds: number[] } | undefined,
  pool: SpaceMerchItem[],
  objectKind?: string,
): SpaceMerchItem[] {
  if (!merch || merch.mode === 'AUTO' || merch.itemIds.length === 0) {
    if (!objectKind) return pool;
    const machines = pool.filter((p) => p.isMachine);
    const others = pool.filter((p) => !p.isMachine);
    // Tủ kính / bục / kệ pallet: máy móc trước; kệ gondola / áp tường: linh kiện, vật tư trước
    if (MACHINE_DISPLAYS.has(objectKind)) return machines.length ? machines : pool;
    return others.length ? others : pool;
  }
  const byId = new Map(pool.map((p) => [p.id, p]));
  return merch.itemIds.map((id) => byId.get(id)).filter((x): x is SpaceMerchItem => Boolean(x));
}
