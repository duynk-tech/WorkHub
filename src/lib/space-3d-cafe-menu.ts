/**
 * Menu đồ uống & tiện ích gọi món trong quán cà phê 3D (thuần TS, test được).
 * Không có thanh toán thật — chỉ để trải nghiệm phục vụ tại bàn.
 */
import type { SpaceObject } from './space-3d-types';

/** Kiểu ly (đồ uống) hoặc đĩa (món ăn: bánh tét lá cẩm, bánh ít trần) */
export type CupKind = 'espresso' | 'mug' | 'iced' | 'takeaway' | 'bottle' | 'tea' | 'banh_tet' | 'banh_it';

export const FOOD_KINDS = new Set<CupKind>(['banh_tet', 'banh_it']);
export const isFoodItem = (it: Pick<CafeMenuItem, 'cupKind'> | undefined) => Boolean(it && FOOD_KINDS.has(it.cupKind));

export interface CafeMenuItem {
  code: string;
  name: string;
  /** Giá hiển thị (VND) */
  price: number;
  cupKind: CupKind;
  /** Màu đồ uống (để vẽ ly 3D) */
  liquid: string;
  /** Có lớp bọt sữa / kem phía trên */
  foam?: boolean;
  desc?: string;
}

export const DEFAULT_CAFE_MENU: CafeMenuItem[] = [
  { code: 'ESP', name: 'Espresso', price: 35000, cupKind: 'espresso', liquid: '#3b2314', foam: true, desc: 'Đậm vị, lớp crema dày' },
  { code: 'CFSD', name: 'Cà phê sữa đá', price: 39000, cupKind: 'iced', liquid: '#8a5a3b', desc: 'Phin truyền thống, sữa đặc' },
  { code: 'BACXIU', name: 'Bạc xỉu', price: 42000, cupKind: 'iced', liquid: '#c8a27a', desc: 'Nhiều sữa, ít cà phê' },
  { code: 'LATTE', name: 'Latte', price: 49000, cupKind: 'mug', liquid: '#c49a6c', foam: true, desc: 'Espresso + sữa tươi đánh mịn' },
  { code: 'CAPU', name: 'Cappuccino', price: 49000, cupKind: 'mug', liquid: '#a87a52', foam: true, desc: 'Bọt sữa dày, rắc cacao' },
  { code: 'TRADAO', name: 'Trà đào cam sả', price: 45000, cupKind: 'iced', liquid: '#f59e0b', desc: 'Thanh mát, miếng đào giòn' },
  { code: 'MATCHA', name: 'Matcha latte', price: 52000, cupKind: 'iced', liquid: '#86b35b', desc: 'Matcha Nhật, sữa tươi' },
  { code: 'CAM', name: 'Nước cam ép', price: 45000, cupKind: 'iced', liquid: '#fb923c', desc: 'Cam tươi vắt tại quầy' },
  { code: 'TRASUA', name: 'Trà sữa trân châu', price: 45000, cupKind: 'takeaway', liquid: '#d6b38a', desc: 'Trân châu đen nấu mỗi ngày' },
  { code: 'TRANONG', name: 'Trà nóng', price: 30000, cupKind: 'tea', liquid: '#b45309', desc: 'Trà ô long thơm dịu' },
  { code: 'NUOC', name: 'Nước suối', price: 15000, cupKind: 'bottle', liquid: '#dbeafe', desc: 'Chai 500ml' },
  ...FOOD_MENU(),
];

/** Món ăn miền Tây (luôn có trong menu, kể cả menu tuỳ chỉnh) */
function FOOD_MENU(): CafeMenuItem[] {
  return [
    { code: 'BANHTET', name: 'Bánh tét lá cẩm', price: 25000, cupKind: 'banh_tet', liquid: '#6b2d7a', desc: 'Nếp lá cẩm, nhân đậu xanh – chuối, gói lá chuối bó lạt' },
    { code: 'BANHIT', name: 'Bánh ít trần', price: 20000, cupKind: 'banh_it', liquid: '#ece0a6', desc: 'Nhân dừa sên, trứng muối, hấp trên lá chuối' },
  ];
}

const CUP_KINDS = new Set<CupKind>(['espresso', 'mug', 'iced', 'takeaway', 'bottle', 'tea', 'banh_tet', 'banh_it']);

/** Chuẩn hoá menu từ setting `space.cafeMenu` (JSON); không hợp lệ → menu mặc định. */
export function normalizeCafeMenu(raw: unknown): CafeMenuItem[] {
  if (!Array.isArray(raw)) return DEFAULT_CAFE_MENU;
  const out: CafeMenuItem[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 40)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const code = String(o.code ?? '').trim().toUpperCase().slice(0, 24);
    const name = String(o.name ?? '').trim().slice(0, 60);
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    const cupKind = CUP_KINDS.has(o.cupKind as CupKind) ? (o.cupKind as CupKind) : 'mug';
    const price = Math.max(0, Math.round(Number(o.price) || 0));
    const liquid = typeof o.liquid === 'string' && /^#[0-9a-f]{6}$/i.test(o.liquid) ? o.liquid : '#8a5a3b';
    out.push({ code, name, price, cupKind, liquid, foam: Boolean(o.foam), desc: o.desc ? String(o.desc).slice(0, 120) : undefined });
  }
  if (!out.length) return DEFAULT_CAFE_MENU;
  // Menu tuỳ chỉnh chưa có món ăn → bổ sung món bánh mặc định
  for (const f of FOOD_MENU()) if (!seen.has(f.code)) out.push(f);
  return out;
}

export const MAX_ORDER_QTY = 5;
export const DRINK_ORDER_TTL_MS = 30 * 60_000;

export interface OrderLine {
  code: string;
  qty: number;
}

/** Kiểm tra đơn: món có trong menu, số lượng nguyên dương, tổng tối đa 5 ly. Gộp dòng trùng mã. */
export function validateOrderLines(
  raw: unknown,
  menu: CafeMenuItem[],
): { ok: true; lines: OrderLine[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: 'Chưa chọn món' };
  const byCode = new Map(menu.map((m) => [m.code, m]));
  const merged = new Map<string, number>();
  for (const r of raw.slice(0, 20)) {
    const code = String((r as OrderLine)?.code ?? '').toUpperCase();
    const qty = Math.floor(Number((r as OrderLine)?.qty));
    if (!byCode.has(code)) return { ok: false, message: 'Món không có trong menu' };
    if (!Number.isFinite(qty) || qty < 1) return { ok: false, message: 'Số lượng không hợp lệ' };
    merged.set(code, (merged.get(code) ?? 0) + qty);
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total > MAX_ORDER_QTY) return { ok: false, message: `Mỗi lần gọi tối đa ${MAX_ORDER_QTY} món` };
  return { ok: true, lines: [...merged].map(([code, qty]) => ({ code, qty })) };
}

export function orderSummary(lines: OrderLine[], menu: CafeMenuItem[]): string {
  const byCode = new Map(menu.map((m) => [m.code, m]));
  return lines.map((l) => `${l.qty} ${byCode.get(l.code)?.name ?? l.code}`).join(', ');
}

export function orderTotal(lines: OrderLine[], menu: CafeMenuItem[]): number {
  const byCode = new Map(menu.map((m) => [m.code, m]));
  return lines.reduce((s, l) => s + (byCode.get(l.code)?.price ?? 0) * l.qty, 0);
}

const SERVE_SURFACES = new Set(['TABLE_ROUND', 'TABLE_RECT', 'COFFEE_TABLE', 'BAR_COUNTER', 'DESK', 'MEETING_TABLE', 'LIVE_EDGE_TABLE', 'SAMPAN_TABLE']);

export interface ServeSpot {
  objectId: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Chỗ đặt ly: mặt bàn gần khách nhất (≤ 1.2m tính từ mép bàn), điểm đặt nằm trên mặt bàn,
 * lệch về phía khách. Không có bàn gần → null.
 */
export function findServeSpot(
  objects: Pick<SpaceObject, 'id' | 'kind' | 'posX' | 'posZ' | 'rotY' | 'widthM' | 'depthM' | 'heightM'>[],
  x: number,
  z: number,
  maxGap = 1.2,
): ServeSpot | null {
  let best: { o: (typeof objects)[number]; gap: number; lx: number; lz: number } | null = null;
  for (const o of objects) {
    if (!SERVE_SURFACES.has(o.kind)) continue;
    // Toạ độ khách trong hệ cục bộ của bàn
    const c = Math.cos(o.rotY);
    const s = Math.sin(o.rotY);
    const dx = x - o.posX;
    const dz = z - o.posZ;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hw = o.widthM / 2;
    const hd = o.depthM / 2;
    const gap = Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd));
    if (gap <= maxGap && (!best || gap < best.gap)) best = { o, gap, lx, lz };
  }
  if (!best) return null;
  const { o, lx, lz } = best;
  // Điểm trên mặt bàn: cách mép phía khách ~12cm
  const inset = 0.12;
  const px = Math.max(-(o.widthM / 2 - inset), Math.min(o.widthM / 2 - inset, lx));
  const pz = Math.max(-(o.depthM / 2 - inset), Math.min(o.depthM / 2 - inset, lz));
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  return {
    objectId: o.id,
    x: o.posX + px * c + pz * s,
    y: o.heightM,
    z: o.posZ - px * s + pz * c,
  };
}

export type DrinkOrderStatus = 'NEW' | 'PREPARING' | 'SERVED' | 'CANCELLED' | 'CLEARED';

export interface DrinkOrderView {
  id: number;
  sceneCode: string;
  customerName: string;
  /** id realtime của người gọi (khách: âm; nhân viên: employeeId) */
  customerRid: number;
  lines: OrderLine[];
  note: string | null;
  status: DrinkOrderStatus;
  servedByName: string | null;
  spot: ServeSpot | null;
  posX: number;
  posZ: number;
  createdAt: string;
  servedAt: string | null;
}
