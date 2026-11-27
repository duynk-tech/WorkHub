/**
 * Bố cục mẫu cho 4 loại không gian. Lối vào luôn ở phía +Z; đại lộ giữa được chừa trống.
 * Quầy lễ tân / quầy order đặt LỆCH sang bên cạnh lối vào (không chắn cửa, không chắn đại lộ).
 */
import type { SpaceSceneKind } from './space-3d-catalog';
import { clampInside } from './space-3d-layout';
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

/** Ghế nhân viên đặt phía sau quầy (−Z cục bộ), quay cùng hướng quầy (nhìn ra khách) */
function staffSeatBehind(counter: Seed, kind: 'BAR_STOOL' | 'OFFICE_CHAIR', gap = 0.5, depthOverride?: number): Seed {
  const rot = counter.rotY ?? 0;
  const d = depthOverride ?? counter.depthM ?? 0.9;
  const back = d / 2 + gap;
  return {
    kind,
    posX: counter.posX - Math.sin(rot) * back,
    posZ: counter.posZ - Math.cos(rot) * back,
    rotY: rot,
    color: kind === 'BAR_STOOL' ? '#1f2937' : '#1e3a8a',
  };
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
  const reception: Seed = { kind: 'RECEPTION_DESK', posX: Math.min(6.5, halfW - 3), posZ: halfD - 5, rotY: -0.55, label: 'Lễ tân' };
  s.push(reception, staffSeatBehind(reception, 'OFFICE_CHAIR', 0.1, 1.8));
  s.push({ kind: 'PLANT_FIDDLE', posX: Math.min(9.3, halfW - 1.2), posZ: halfD - 7.8 });
  // Quầy thu ngân sau lễ tân
  const checkout: Seed = { kind: 'CHECKOUT', posX: Math.min(6.4, halfW - 3.5), posZ: halfD - 8.6, rotY: -HALF_PI };
  s.push(checkout, staffSeatBehind(checkout, 'BAR_STOOL', 0.4, 0.7));
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
      const counter: Seed = {
        kind: 'DISPLAY_COUNTER',
        posX: side * rowX,
        posZ: z,
        rotY: side < 0 ? HALF_PI : -HALF_PI,
        widthM: 3.2,
        label: SHOWROOM_COUNTER_NAMES[idx % SHOWROOM_COUNTER_NAMES.length],
        accentColor: ACCENTS[idx % ACCENTS.length],
        variant: idx % 3 === 2 ? 'dark' : 'wood',
      };
      // Quầy áp tường: nhân viên đứng tư vấn phía trước cùng khách (không đặt ghế phía sau — vô nghĩa)
      s.push(counter);
      idx++;
    }
  }
  // Khu giữa: kệ gondola phụ tùng & vật tư + tủ kính linh kiện (chừa đại lộ thảm 4.8m)
  for (const side of [-1, 1]) {
    if (side < 0) s.push({ kind: 'GONDOLA', posX: side * 6.2, posZ: -4.5, rotY: HALF_PI, widthM: 3.6, accentColor: '#2563eb', label: 'Phụ tùng & Linh kiện' });
    // Phải: khu máy làm kem — tủ kem gelato kính cong quay ra lối giữa
    else s.push({ kind: 'GELATO_CASE', posX: 6.2, posZ: -4.5, rotY: -HALF_PI, widthM: 2.4, label: 'Gelato · Kem tươi' });
    s.push({ kind: 'GONDOLA', posX: side * 6.2, posZ: 0.5, rotY: HALF_PI, widthM: 3.6, accentColor: side < 0 ? '#0891b2' : '#16a34a', label: 'Vật tư tiêu hao' });
    s.push({ kind: 'DISPLAY_CABINET', posX: side * 4, posZ: -2, rotY: side < 0 ? HALF_PI : -HALF_PI });
    s.push({ kind: 'PLANT_PALM', posX: side * 3.3, posZ: halfD - 2.2 });
  }
  // Cuối sảnh giữa: QUẦY PHA THỬ MÁY — nhân viên đứng sau pha cho khách, khách ngồi ghế bar phía trước xem & thử
  const demoZ = -halfD + 5;
  s.push({ kind: 'DEMO_BAR', posX: 0, posZ: demoZ, widthM: 4, label: 'Quầy pha thử máy' });
  for (let i = 0; i < 4; i++) s.push({ kind: 'BAR_STOOL', posX: -1.5 + i, posZ: demoZ + 1.0, rotY: Math.PI, color: '#1f2937' });
  // Góc sau phải: 2 tủ mát đứng (sữa, nước, topping) cạnh khu kem
  s.push({ kind: 'DISPLAY_CHILLER', posX: Math.min(10.6, halfW - 7.4), posZ: -halfD + 0.45, label: 'Tủ mát' });
  s.push({ kind: 'DISPLAY_CHILLER', posX: Math.min(9.25, halfW - 8.75), posZ: -halfD + 0.45, label: 'Sữa · Topping' });
  // Kệ áp tường cuối sảnh hai góc
  s.push({ kind: 'WALL_SHELF', posX: -halfW + 4.2, posZ: -halfD + 0.4, widthM: 3, variant: 'wood', color: '#a47148' });
  s.push({ kind: 'WALL_SHELF', posX: halfW - 4.2, posZ: -halfD + 0.4, widthM: 3, variant: 'wood', color: '#a47148' });
  return finalize(s);
}

/**
 * Quán cà phê SÂN VƯỜN miền Tây (mặt tiền +Z): cổng gỗ bảng hiệu, lối cỏ đá bước với xuồng ba lá & chuối,
 * cây đa giăng lưới đèn dây trên 3 bàn gỗ nguyên tấm, nhà kính quầy pha chế, quầy bánh quê, xe đò, ao rau muống.
 * Toạ độ thiết kế cho mặt bằng 30×24m rồi co giãn theo kích thước thật.
 */
export function cafeTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const kx = w / 30;
  const kz = d / 24;
  const at = (x: number, z: number) => ({ posX: x * kx, posZ: z * kz });
  const halfD = d / 2;

  // Cổng chào gỗ + bảng hiệu (giữa mặt tiền), bảng logo đón khách ngay sau cổng
  s.push({ kind: 'GARDEN_GATE', posX: 0, posZ: halfD - 0.45, label: 'Xởi Lởi', subLabel: 'Xởi lởi trời cho' });
  s.push({ kind: 'LOGO_STANDEE', ...at(3.4, 9.4), rotY: -0.35 });
  s.push({ kind: 'PLANT_PALM', ...at(-3.8, 10.4), color: '#b45309' });
  s.push({ kind: 'PLANT_PALM', ...at(5, 10.6), color: '#b45309' });
  // Xe đò Xởi Lởi đậu ngay khu lối vào (cuối lối cỏ đá bước), xe đẩy bánh quê đứng trước xe — như ảnh thật
  s.push({ kind: 'FOOD_VAN', ...at(-8.4, 10.3), label: 'Xởi Lởi', subLabel: 'Sài Gòn - Sa Đéc' });
  s.push({ kind: 'FOOD_CART', ...at(-4.6, 9.4), rotY: -0.3, label: 'Bánh Quê' });
  s.push({ kind: 'CLAY_JAR', ...at(-5.6, 7.9) });

  // Trái: nền sỏi xám, lối cỏ đá bước, hàng 4 xuồng ba lá trước bụi chuối
  s.push({ kind: 'GRAVEL_BED', ...at(-10.6, 4.2), widthM: 8.4 * kx, depthM: 15 * kz, variant: 'gravel' });
  s.push({ kind: 'STEPPING_PATH', ...at(-7.8, 3.4), widthM: 1.7, depthM: 10 * kz });
  for (const z of [7.2, 3.8, 0.4, -3]) s.push({ kind: 'SAMPAN_BOAT', ...at(-13.2, z), rotY: HALF_PI });
  for (const z of [10.8, 7.6, 4.2, 0.8, -2.6]) s.push({ kind: 'BANANA_PLANT', ...at(-14.3, z) });
  for (const [x, z, sz] of [[-6.2, 6.4, 0.9], [-9.3, 1.2, 0.6], [-6.6, 3.2, 0.75], [-9.3, 6.8, 0.5], [-6.5, -0.6, 0.55]] as [number, number, number][]) {
    s.push({ kind: 'BOULDER', ...at(x, z), widthM: sz * 1.3, depthM: sz * 1.1, heightM: sz });
  }

  // Phải trước: dù che nâu + bàn gỗ ghế gỗ
  for (const z of [8.2, 3.8]) {
    const p = at(9.6, z);
    s.push({ kind: 'PATIO_UMBRELLA', ...p, color: '#8a6a55' });
    s.push(...tableSet(p.posX, p.posZ, 4, false, '#8a5a35'));
  }
  s.push({ kind: 'PLANT_MONSTERA', ...at(14.2, 10.6), color: '#1f2937' });

  // Giữa sau: cây đa cổ thụ phủ lưới & đèn dây, 3 bàn gỗ nguyên tấm DÀI 7m trên ô sỏi đen bó vỉa, ghế nhựa đen 2 bên
  s.push({ kind: 'SHADE_NET', ...at(0.5, -6.8), widthM: 16.5 * kx, depthM: 9.4 * kz, heightM: 4.8 });
  s.push({ kind: 'BANYAN_TREE', ...at(4.8, -8.4), widthM: 2.6, depthM: 2.6, heightM: 9.5 });
  const slabs: [number, number][] = [[-2.2, -9.7], [-2.2, -6.7], [1.2, -3.7]];
  for (const [x, z] of slabs) {
    const p = at(x, z);
    s.push({ kind: 'GRAVEL_BED', ...p, widthM: 7.6, depthM: 1.5, variant: 'pebble' });
    s.push({ kind: 'LIVE_EDGE_TABLE', ...p, widthM: 7, depthM: 1.2 });
    for (let i = 0; i < 10; i++) {
      const cx = p.posX - 2.95 + i * 0.655;
      s.push({ kind: 'STACK_CHAIR', posX: cx, posZ: p.posZ + 0.92, rotY: Math.PI });
      s.push({ kind: 'STACK_CHAIR', posX: cx, posZ: p.posZ - 0.92, rotY: 0 });
    }
  }

  // Trái sau: nhà kính mái tôn — quầy pha chế, máy espresso, tủ bánh, ghế bar
  const pv = at(-11, -9.5);
  s.push({ kind: 'METAL_ROOF', ...pv, widthM: 8 * kx, depthM: 5 * kz, heightM: 3.4 });
  const frontZ = pv.posZ + (5 * kz) / 2;
  const left = -w / 2;
  const right = pv.posX + (8 * kx) / 2;
  const doorX = pv.posX + 0.4;
  s.push({ kind: 'GLASS_WALL', posX: (left + doorX - 0.75) / 2, posZ: frontZ, widthM: doorX - 0.75 - left, heightM: 3 });
  s.push({ kind: 'GLASS_WALL', posX: (doorX + 0.75 + right) / 2, posZ: frontZ, widthM: right - doorX - 0.75, heightM: 3 });
  s.push({ kind: 'DOOR', posX: doorX, posZ: frontZ, color: '#3f3f46', widthM: 1.4, variant: 'slide' });
  s.push({ kind: 'ROOM_ZONE', ...pv, widthM: 8 * kx - 0.2, depthM: 5 * kz - 0.2, heightM: 3.4, label: 'Quầy pha chế' });
  s.push({ kind: 'GLASS_WALL', posX: right, posZ: pv.posZ, rotY: HALF_PI, widthM: 5 * kz, heightM: 3 });
  const barZ = -halfD + 1.1;
  s.push({ kind: 'BAR_COUNTER', posX: pv.posX, posZ: barZ, widthM: 4.4, variant: 'wood', color: '#6b4226' });
  s.push({ kind: 'ESPRESSO_MACHINE', posX: pv.posX - 1, posZ: barZ - 0.05, posY: 1.1, color: '#d1d5db' });
  s.push({ kind: 'PASTRY_CASE', posX: pv.posX + 2.9, posZ: barZ + 0.05 });
  s.push({ kind: 'MENU_BOARD', posX: pv.posX, posZ: -halfD + 0.15, label: 'Menu' });
  for (let i = 0; i < 3; i++) s.push({ kind: 'BAR_STOOL', posX: pv.posX - 1.2 + i * 1.1, posZ: barZ + 1.0, rotY: Math.PI, color: '#1f2937' });
  for (let i = 0; i < 2; i++) s.push({ kind: 'PENDANT_LIGHT', posX: pv.posX - 0.8 + i * 1.6, posZ: barZ + 0.1, color: '#b45309' });

  // Phải sau: quầy bánh quê (chum sành bên cạnh), xe đò + xe đẩy bánh quê, ao rau muống có lan can dây leo
  s.push({ kind: 'BANH_QUE_KIOSK', ...at(11.4, -10), label: 'Bánh Quê Xởi Lởi', subLabel: 'Một chút tình người Nam Bộ' });
  s.push({ kind: 'CLAY_JAR', ...at(8.7, -10.9), color: '#b7791f' });
  s.push({ kind: 'PLANT_MONSTERA', ...at(14.3, -7.6), color: '#e7e5e4' });
  s.push({ kind: 'BANANA_PLANT', ...at(14.2, -5.9) });
  s.push({ kind: 'BANANA_PLANT', ...at(14.1, -2.6) });
  s.push({ kind: 'BANANA_PLANT', ...at(13.6, 0.4) });
  s.push({ kind: 'POND', ...at(6.6, 0.2), widthM: 5 * kx, depthM: 3 * kz });
  s.push({ kind: 'VINE_RAILING', posX: 6.6 * kx, posZ: 0.2 * kz - (3 * kz) / 2 - 0.15, widthM: 5 * kx });
  s.push({ kind: 'BOULDER', ...at(3.6, 1.6), widthM: 1, depthM: 0.8, heightM: 0.6 });
  s.push({ kind: 'BOULDER', ...at(9.6, 2), widthM: 0.7, depthM: 0.6, heightM: 0.45 });
  // Mặt bằng nhỏ hơn mẫu → kẹp vật thể vào trong (không lọt ra ngoài hàng rào)
  return finalize(s).map((o) => clampInside(o, w, d));
}

export function officeTemplate({ widthM: w, depthM: d }: TemplateCtx): SpaceObject[] {
  const s: Seed[] = [];
  const halfW = w / 2;
  const halfD = d / 2;
  // Lễ tân cạnh cửa (phải) + ghế chờ (trái)
  const reception: Seed = { kind: 'RECEPTION_DESK', posX: halfW - 3, posZ: halfD - 3.2, rotY: -0.5, label: 'Lễ tân' };
  s.push(reception, staffSeatBehind(reception, 'OFFICE_CHAIR', 0.1, 1.8));
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
  // TV trình chiếu cuối phòng họp + vùng phòng (camera tự chuyển vào khi bước vào)
  s.push({ kind: 'MEETING_TV', posX: mx, posZ: -halfD + 0.5 });
  const roomL = mx - 3.5;
  const roomFront = mz + 3.2;
  s.push({ kind: 'ROOM_ZONE', posX: (roomL + halfW) / 2, posZ: (-halfD + roomFront) / 2, widthM: halfW - roomL - 0.1, depthM: roomFront + halfD - 0.1, heightM: 3, label: 'Phòng họp' });
  // Góc pantry dọc tường phải (giữa phòng họp và lễ tân): quầy bếp, bình nước, tủ lạnh, bàn đứng
  const pz = Math.min(0.5, halfD - 7);
  s.push({ kind: 'PANTRY_COUNTER', posX: halfW - 0.35, posZ: pz, rotY: -HALF_PI });
  s.push({ kind: 'WATER_DISPENSER', posX: halfW - 0.3, posZ: pz - 1.8, rotY: -HALF_PI });
  s.push({ kind: 'FRIDGE', posX: halfW - 0.4, posZ: pz + 1.75, rotY: -HALF_PI });
  s.push({ kind: 'TABLE_ROUND', posX: halfW - 2.3, posZ: pz, widthM: 0.7, depthM: 0.7, heightM: 1.05, color: '#e8d5b7' });
  s.push({ kind: 'BAR_STOOL', posX: halfW - 2.3, posZ: pz - 0.65, color: '#1f2937' });
  s.push({ kind: 'BAR_STOOL', posX: halfW - 2.3, posZ: pz + 0.65, rotY: Math.PI, color: '#1f2937' });
  s.push({ kind: 'ROOM_ZONE', posX: halfW - 1.7, posZ: pz, widthM: 3.4, depthM: 5, heightM: 3, label: 'Pantry' });
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
  CAFE: { widthM: 30, depthM: 24 },
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
