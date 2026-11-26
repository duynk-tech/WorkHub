/**
 * Bố cục mẫu cho 4 loại không gian. Lối vào luôn ở phía +Z; đại lộ giữa được chừa trống.
 * Quầy lễ tân / quầy order đặt LỆCH sang bên cạnh lối vào (không chắn cửa, không chắn đại lộ).
 */
import type { SpaceSceneKind } from './space-3d-catalog';
import { normalizeSpaceObject, type SpaceObject } from './space-3d-types';

type Seed = Partial<SpaceObject> & { kind: string; posX: number; posZ: number };

interface TemplateCtx {
  widthM: number;
  depthM: number;
  departments?: { id: number; code: string; name: string }[];
}

const ACCENTS = ['#7c3aed', '#ea580c', '#0891b2', '#2563eb', '#16a34a', '#db2777', '#ca8a04', '#0f766e'];
const HALF_PI = Math.PI / 2;

function finalize(seeds: Seed[]): SpaceObject[] {
  const counts = new Map<string, number>();
  const out: SpaceObject[] = [];
  for (const s of seeds) {
    const n = (counts.get(s.kind) ?? 0) + 1;
    counts.set(s.kind, n);
    const o = normalizeSpaceObject({ rotY: 0, ...s, id: s.id ?? `${s.kind.toLowerCase().replace(/_/g, '-')}-${n}` });
    if (o) out.push(o);
  }
  return out;
}

/** Bàn tròn + ghế quây quanh */
function tableSet(x: number, z: number, chairs: number, round = true, color = '#c69c6d'): Seed[] {
  const seeds: Seed[] = [{ kind: round ? 'TABLE_ROUND' : 'TABLE_RECT', posX: x, posZ: z, color, variant: round ? 'marble' : 'wood' }];
  const r = round ? 0.62 : 0.72;
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + (round ? Math.PI / 4 : 0);
    // Ghế quay mặt vào bàn: mặt trước ghế là +Z cục bộ
    seeds.push({ kind: 'CHAIR', posX: x + Math.sin(a) * r, posZ: z + Math.cos(a) * r, rotY: a + Math.PI, color: '#6b4226' });
  }
  return seeds;
}

/** Tên quầy trưng bày mặc định (đổi được trong bảng thuộc tính) */
export const SHOWROOM_COUNTER_NAMES = [
  'Máy pha cà phê Espresso',
  'Máy xay cà phê',
  'Máy pha tự động',
  'Máy làm kem & Socola',
  'Máy xay sinh tố & Pha chế',
  'Thiết bị quầy bar',
  'Máy pha chuyên nghiệp',
  'Thiết bị bếp & Bánh',
];

/**
 * Showroom thiết bị F&B như cửa hàng thật: 2 dãy quầy trưng bày máy hai bên quay mặt ra đại lộ,
 * khu kệ phụ tùng & tủ linh kiện ở giữa, lễ tân cạnh cổng, ghế chờ, quầy thu ngân, vách thương hiệu cuối sảnh.
 * Không còn gian hàng phòng ban / gian triển lãm.
 */
export function showroomTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  // Vách thương hiệu LED cuối sảnh + bồn cây hai bên
  s.push({ kind: 'BRAND_WALL', posX: 0, posZ: -halfD + 0.8, widthM: Math.min(10, w * 0.35), heightM: 3.6 });
  s.push({ kind: 'PLANTER_BOX', posX: -Math.min(6.4, w * 0.22), posZ: -halfD + 1.4, widthM: 1.8 });
  s.push({ kind: 'PLANTER_BOX', posX: Math.min(6.4, w * 0.22), posZ: -halfD + 1.4, widthM: 1.8 });
  // Lễ tân lệch phải ngay sau cổng, xoay chéo về phía khách đi vào
  s.push({ kind: 'RECEPTION_DESK', posX: Math.min(6.5, halfW - 3), posZ: halfD - 5, rotY: -0.55, label: 'Lễ tân' });
  s.push({ kind: 'PLANT_FIDDLE', posX: Math.min(9.3, halfW - 1.2), posZ: halfD - 7.8 });
  // Quầy thu ngân sau lễ tân
  s.push({ kind: 'CHECKOUT', posX: Math.min(6.4, halfW - 3.5), posZ: halfD - 8.6, rotY: -HALF_PI });
  // Khu ghế chờ bên trái lối vào
  const lx = -Math.min(6.5, halfW - 3.2);
  const lz = halfD - 5;
  s.push({ kind: 'RUG', posX: lx, posZ: lz, widthM: 3.4, depthM: 2.6, color: '#d6c7b0' });
  s.push({ kind: 'SOFA', posX: lx - 0.2, posZ: lz - 0.9, color: '#64748b' });
  s.push({ kind: 'ARMCHAIR', posX: lx + 1.4, posZ: lz + 0.3, rotY: -HALF_PI, color: '#b45309' });
  s.push({ kind: 'COFFEE_TABLE', posX: lx - 0.2, posZ: lz + 0.1 });
  s.push({ kind: 'PLANT_MONSTERA', posX: lx - 1.9, posZ: lz - 1.1 });
  // 2 dãy quầy trưng bày máy sát tường hai bên, quay mặt vào lối đi giữa
  const rowX = halfW - 1.6;
  const zFrom = -halfD + 4;
  const zTo = halfD - 11;
  const perSide = Math.max(2, Math.min(4, Math.floor((zTo - zFrom) / 4.2) + 1));
  let idx = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const z = zFrom + ((zTo - zFrom) / Math.max(1, perSide - 1)) * i;
      s.push({
        kind: 'DISPLAY_COUNTER',
        posX: side * rowX,
        posZ: z,
        rotY: side < 0 ? HALF_PI : -HALF_PI,
        widthM: 3.2,
        label: SHOWROOM_COUNTER_NAMES[idx % SHOWROOM_COUNTER_NAMES.length],
        accentColor: ACCENTS[idx % ACCENTS.length],
        variant: idx % 3 === 2 ? 'dark' : 'wood',
      });
      idx++;
    }
  }
  // Khu giữa: kệ gondola phụ tùng & vật tư + tủ kính linh kiện (chừa đại lộ thảm 4.8m)
  for (const side of [-1, 1]) {
    s.push({ kind: 'GONDOLA', posX: side * 6.2, posZ: -4.5, rotY: HALF_PI, widthM: 3.6, accentColor: side < 0 ? '#2563eb' : '#ea580c', label: 'Phụ tùng & Linh kiện' });
    s.push({ kind: 'GONDOLA', posX: side * 6.2, posZ: 0.5, rotY: HALF_PI, widthM: 3.6, accentColor: side < 0 ? '#0891b2' : '#16a34a', label: 'Vật tư tiêu hao' });
    s.push({ kind: 'DISPLAY_CABINET', posX: side * 4, posZ: -2, rotY: side < 0 ? HALF_PI : -HALF_PI });
    s.push({ kind: 'PLANT_PALM', posX: side * 3.3, posZ: halfD - 2.2 });
  }
  // Kệ áp tường cuối sảnh hai góc
  s.push({ kind: 'WALL_SHELF', posX: -halfW + 4.2, posZ: -halfD + 0.4, widthM: 3, variant: 'wood', color: '#a47148' });
  s.push({ kind: 'WALL_SHELF', posX: halfW - 4.2, posZ: -halfD + 0.4, widthM: 3, variant: 'wood', color: '#a47148' });
  return finalize(s);
}

export function cafeTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  // Quầy bar pha chế dọc tường sau (trái), máy espresso trên quầy, tủ bánh + menu
  const barX = -halfW + 3.6;
  const barZ = -halfD + 1.4;
  s.push({ kind: 'BAR_COUNTER', posX: barX, posZ: barZ, widthM: 4.4, variant: 'marble' });
  s.push({ kind: 'ESPRESSO_MACHINE', posX: barX - 0.9, posZ: barZ - 0.05, posY: 1.1, color: '#d1d5db' });
  s.push({ kind: 'PASTRY_CASE', posX: barX + 2.9, posZ: barZ + 0.05 });
  s.push({ kind: 'MENU_BOARD', posX: barX, posZ: -halfD + 0.12, label: 'Menu' });
  for (let i = 0; i < 4; i++) s.push({ kind: 'BAR_STOOL', posX: barX - 1.5 + i * 0.95, posZ: barZ + 1.0, color: '#1f2937' });
  for (let i = 0; i < 3; i++) s.push({ kind: 'PENDANT_LIGHT', posX: barX - 1.4 + i * 1.4, posZ: barZ + 0.1, color: '#b45309' });
  // Quầy order cạnh lối vào (phải), không chắn cửa giữa
  s.push({ kind: 'CHECKOUT', posX: halfW - 2.2, posZ: halfD - 2.6, rotY: -HALF_PI, color: '#6b4226' });
  s.push({ kind: 'PLANT_SNAKE', posX: halfW - 0.6, posZ: halfD - 0.8 });
  // Khu bàn
  const cols = Math.max(2, Math.floor((w - 6) / 3));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) {
      const x = -halfW + 3 + c * ((w - 6) / Math.max(1, cols - 1));
      const z = -halfD + 5 + r * 3.2;
      if (x > halfW - 4 && r === 1) continue;
      s.push(...tableSet(x, z, (c + r) % 2 === 0 ? 2 : 4, (c + r) % 2 === 0));
      s.push({ kind: 'PENDANT_LIGHT', posX: x, posZ: z, color: '#111827' });
    }
  }
  // Góc sofa ấm cúng (trái, gần cửa kính)
  s.push({ kind: 'RUG', posX: -halfW + 2.6, posZ: halfD - 2.4, widthM: 3, depthM: 2.2, color: '#7f1d1d' });
  s.push({ kind: 'SOFA', posX: -halfW + 2.4, posZ: halfD - 3.2, color: '#166534' });
  s.push({ kind: 'COFFEE_TABLE', posX: -halfW + 2.4, posZ: halfD - 2.1, widthM: 0.9 });
  s.push({ kind: 'ARMCHAIR', posX: -halfW + 4.3, posZ: halfD - 2.2, rotY: -HALF_PI, color: '#b45309' });
  s.push({ kind: 'FLOOR_LAMP', posX: -halfW + 0.6, posZ: halfD - 3.6 });
  // Cây & tranh
  s.push({ kind: 'PLANT_MONSTERA', posX: halfW - 0.8, posZ: -halfD + 0.9 });
  s.push({ kind: 'PLANT_FIDDLE', posX: -halfW + 0.7, posZ: -halfD + 4 });
  s.push({ kind: 'WALL_ART', posX: halfW - 3, posZ: -halfD + 0.06, color: '#b45309' });
  s.push({ kind: 'WALL_SHELF', posX: halfW - 5.5, posZ: -halfD + 0.3, widthM: 2.4, variant: 'wood', color: '#a47148' });
  return finalize(s);
}

export function officeTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  // Lễ tân cạnh cửa (phải) + ghế chờ (trái)
  s.push({ kind: 'RECEPTION_DESK', posX: halfW - 3, posZ: halfD - 3.2, rotY: -0.5, label: 'Lễ tân' });
  s.push({ kind: 'SOFA', posX: -halfW + 2.6, posZ: halfD - 2.2, rotY: HALF_PI, color: '#334155' });
  s.push({ kind: 'COFFEE_TABLE', posX: -halfW + 3.8, posZ: halfD - 2.2, rotY: HALF_PI });
  s.push({ kind: 'PLANT_PALM', posX: -halfW + 1, posZ: halfD - 0.8 });
  // Phòng họp vách kính góc sau phải
  const mx = halfW - 4;
  const mz = -halfD + 3.2;
  s.push({ kind: 'GLASS_WALL', posX: mx - 3.5, posZ: mz, rotY: HALF_PI, widthM: 6.4, heightM: 3 });
  s.push({ kind: 'GLASS_WALL', posX: mx + 0.8, posZ: mz + 3.2, widthM: 5.4, heightM: 3 });
  s.push({ kind: 'DOOR', posX: mx - 2.5, posZ: mz + 3.2, color: '#a47148' });
  s.push({ kind: 'MEETING_TABLE', posX: mx, posZ: mz, widthM: 3.2 });
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) s.push({ kind: 'OFFICE_CHAIR', posX: mx - 1 + i, posZ: mz + side * 0.95, rotY: side > 0 ? Math.PI : 0, color: '#1e3a8a' });
  }
  s.push({ kind: 'WALL_ART', posX: mx, posZ: -halfD + 0.06, color: '#2563eb' });
  // Cụm bàn làm việc theo phòng ban (2 dãy đối diện + vách ngăn)
  const clusters = Math.max(2, Math.floor((w - 10) / 4.2));
  for (let c = 0; c < clusters; c++) {
    const cx = -halfW + 3 + c * 4.2;
    for (const row of [0, 1]) {
      const cz = -halfD + 4 + row * 5;
      for (let i = 0; i < 2; i++) {
        const x = cx - 0.75 + i * 1.5;
        s.push({ kind: 'DESK', posX: x, posZ: cz - 0.38, rotY: Math.PI });
        s.push({ kind: 'OFFICE_CHAIR', posX: x, posZ: cz - 1.15, color: '#1f2937' });
        s.push({ kind: 'DESK', posX: x, posZ: cz + 0.38 });
        s.push({ kind: 'OFFICE_CHAIR', posX: x, posZ: cz + 1.15, rotY: Math.PI, color: '#1f2937' });
      }
      s.push({ kind: 'PARTITION', posX: cx, posZ: cz, widthM: 3, heightM: 1.1, color: '#64748b' });
    }
  }
  // Tủ hồ sơ dọc tường sau
  for (let i = 0; i < 4; i++) s.push({ kind: 'FILE_CABINET', posX: -halfW + 1 + i * 1, posZ: -halfD + 0.35 });
  s.push({ kind: 'PLANT_FIDDLE', posX: -halfW + 5.2, posZ: -halfD + 0.6 });
  s.push({ kind: 'PLANT_SNAKE', posX: halfW - 0.6, posZ: 0 });
  return finalize(s);
}

export function warehouseTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  const rows = Math.max(2, Math.floor((d - 8) / 4.5));
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const code = `${side < 0 ? 'A' : 'B'}${r + 1}`;
      s.push({
        kind: 'RACK',
        posX: side * (halfW / 2 + 0.5),
        posZ: -halfD + 4 + r * 4.5,
        widthM: Math.min(10, halfW - 4),
        label: `DÃY ${side < 0 ? 'A' : 'B'} · KỆ 0${r + 1}`,
        aisleCode: code,
        accentColor: side < 0 ? '#2563eb' : '#0891b2',
      });
    }
  }
  // Khu nhận/xuất hàng gần cửa: chồng pallet, thùng carton, xe nâng
  for (let i = 0; i < 4; i++) s.push({ kind: 'PALLET_STACK', posX: -halfW + 2 + i * 1.6, posZ: halfD - 2.5 });
  for (let i = 0; i < 3; i++) s.push({ kind: 'CARTON_STACK', posX: halfW - 2 - i * 1.1, posZ: halfD - 2.2 });
  s.push({ kind: 'FORKLIFT', posX: 1.8, posZ: halfD - 4.5, rotY: Math.PI * 0.8 });
  // Góc văn phòng kho
  s.push({ kind: 'DESK', posX: halfW - 2.2, posZ: -halfD + 1.2 });
  s.push({ kind: 'OFFICE_CHAIR', posX: halfW - 2.2, posZ: -halfD + 2, rotY: Math.PI });
  s.push({ kind: 'FILE_CABINET', posX: halfW - 0.6, posZ: -halfD + 1.2, rotY: -HALF_PI });
  return finalize(s);
}

export function templateFor(kind: SpaceSceneKind, ctx: TemplateCtx): SpaceObject[] {
  switch (kind) {
    case 'CAFE':
      return cafeTemplate(ctx);
    case 'OFFICE':
      return officeTemplate(ctx);
    case 'WAREHOUSE':
      return warehouseTemplate(ctx);
    default:
      return showroomTemplate(ctx);
  }
}

/** Kích thước mặt bằng mặc định theo loại không gian */
export const DEFAULT_SCENE_SIZE: Record<SpaceSceneKind, { widthM: number; depthM: number }> = {
  SHOWROOM: { widthM: 36, depthM: 28 },
  WAREHOUSE: { widthM: 36, depthM: 28 },
  CAFE: { widthM: 16, depthM: 14 },
  OFFICE: { widthM: 26, depthM: 20 },
};

const LEGACY_KINDS = new Set(['BOOTH', 'RACK', 'PODIUM']);

/**
 * Nâng cấp 1 lần bố cục cũ (chỉ có gian hàng/kệ/bục): bổ sung vật thể từ bố cục mẫu
 * (lễ tân, vách thương hiệu, ghế chờ, kệ hàng, cây…) mà KHÔNG chồng lấn vật thể sẵn có.
 * Trả về null nếu bố cục đã từng được thiết kế (có vật thể kiểu mới) → không đụng vào.
 */
export function upgradeLegacyLayout(kind: SpaceSceneKind, objects: SpaceObject[], ctx: TemplateCtx): SpaceObject[] | null {
  if (objects.some((o) => !LEGACY_KINDS.has(o.kind))) return null;
  if (kind !== 'SHOWROOM' && kind !== 'WAREHOUSE') return null;
  const template = templateFor(kind, ctx).filter((t) => !LEGACY_KINDS.has(t.kind));
  const result = [...objects];
  const ids = new Set(objects.map((o) => o.id));
  const fp = (o: SpaceObject) => {
    const c = Math.abs(Math.cos(o.rotY));
    const s = Math.abs(Math.sin(o.rotY));
    const hw = (o.widthM * c + o.depthM * s) / 2;
    const hd = (o.widthM * s + o.depthM * c) / 2;
    return { minX: o.posX - hw, maxX: o.posX + hw, minZ: o.posZ - hd, maxZ: o.posZ + hd };
  };
  const hit = (a: ReturnType<typeof fp>, b: ReturnType<typeof fp>) =>
    a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  for (const t of template) {
    const tf = fp(t);
    if (t.kind !== 'RUG' && result.some((o) => o.kind !== 'RUG' && hit(tf, fp(o)))) continue;
    let id = t.id;
    let n = 2;
    while (ids.has(id)) id = `${t.id}-${n++}`;
    ids.add(id);
    result.push({ ...t, id });
  }
  return result;
}
