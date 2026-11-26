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

export function showroomTemplate({ widthM: w, depthM: d, departments = [] }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  // Vách thương hiệu LED cuối sảnh (thay vị trí cổng cũ)
  s.push({ kind: 'BRAND_WALL', posX: 0, posZ: -halfD + 0.8, widthM: Math.min(10, w * 0.35), heightM: 3.6 });
  s.push({ kind: 'PLANTER_BOX', posX: -Math.min(6, w * 0.22), posZ: -halfD + 1.4, widthM: 1.8 });
  s.push({ kind: 'PLANTER_BOX', posX: Math.min(6, w * 0.22), posZ: -halfD + 1.4, widthM: 1.8 });
  // Lễ tân lệch phải ngay sau cổng, xoay chéo về phía khách đi vào
  s.push({ kind: 'RECEPTION_DESK', posX: Math.min(6.5, halfW - 3), posZ: halfD - 5, rotY: -0.55, label: 'Lễ tân' });
  s.push({ kind: 'PLANT_FIDDLE', posX: Math.min(8.6, halfW - 1.2), posZ: halfD - 6.8 });
  // Khu ghế chờ đối diện bên trái lối vào
  const lx = -Math.min(6.5, halfW - 3.2);
  const lz = halfD - 5;
  s.push({ kind: 'RUG', posX: lx, posZ: lz, widthM: 3.4, depthM: 2.6, color: '#d6c7b0' });
  s.push({ kind: 'SOFA', posX: lx - 0.2, posZ: lz - 0.9, color: '#64748b' });
  s.push({ kind: 'ARMCHAIR', posX: lx + 1.4, posZ: lz + 0.3, rotY: -HALF_PI, color: '#b45309' });
  s.push({ kind: 'COFFEE_TABLE', posX: lx - 0.2, posZ: lz + 0.1 });
  s.push({ kind: 'PLANT_MONSTERA', posX: lx - 1.9, posZ: lz - 1.1 });
  s.push({ kind: 'FLOOR_LAMP', posX: lx + 1.5, posZ: lz - 1.1 });
  // Gian hàng phòng ban 2 bên đại lộ, quay mặt vào giữa
  const depts = departments.length ? departments : [
    { id: 0, code: 'SALES', name: 'Phòng Kinh doanh' },
    { id: 0, code: 'TECH', name: 'Phòng Kỹ thuật' },
    { id: 0, code: 'WH', name: 'Kho vận & Giao nhận' },
    { id: 0, code: 'CS', name: 'Chăm sóc Khách hàng' },
  ];
  const perSide = Math.ceil(Math.min(depts.length, 8) / 2);
  const span = d - 14;
  depts.slice(0, 8).forEach((dep, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2);
    const z = -halfD + 4.5 + (perSide > 1 ? (span / Math.max(1, perSide - 1)) * k : span / 2) * 0.85;
    s.push({
      kind: 'BOOTH',
      posX: side * (halfW - 3.2),
      posZ: z,
      rotY: side < 0 ? HALF_PI : -HALF_PI,
      widthM: 5.2,
      depthM: 3.4,
      label: dep.name.toUpperCase(),
      subLabel: `QUẦY ${dep.code}`,
      departmentId: dep.id || null,
      accentColor: ACCENTS[i % ACCENTS.length],
    });
  });
  // Kệ gondola trưng bày hàng hoá + tủ kính dọc 2 bên mép đại lộ (chừa 4.8m giữa)
  for (const side of [-1, 1]) {
    s.push({ kind: 'GONDOLA', posX: side * 4.4, posZ: -2, rotY: HALF_PI, widthM: 3.6, accentColor: side < 0 ? '#2563eb' : '#ea580c' });
    s.push({ kind: 'DISPLAY_CABINET', posX: side * 4.2, posZ: 2.6, rotY: side < 0 ? HALF_PI : -HALF_PI });
    s.push({ kind: 'PLANT_PALM', posX: side * 3.4, posZ: halfD - 2.2 });
  }
  // Quầy thu ngân cạnh lối ra (bên phải, sau lễ tân)
  s.push({ kind: 'CHECKOUT', posX: Math.min(6.2, halfW - 3.5), posZ: halfD - 9, rotY: -HALF_PI });
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
