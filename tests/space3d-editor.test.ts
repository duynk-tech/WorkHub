import { describe, expect, it } from 'vitest';
import { SPACE_OBJECT_DEFS } from '@/lib/space-3d-catalog';
import { normalizeSpaceObject, normalizeSpaceObjects } from '@/lib/space-3d-types';
import {
  clampInside,
  createObject,
  duplicateObject,
  findCollisions,
  footprintOf,
  historyInit,
  historyPush,
  historyRedo,
  historyUndo,
  snap,
  snapAngle,
  SEATABLE_KINDS,
  seatsFor,
  counterBehind,
  isStaffSeat,
  seatActivity,
} from '@/lib/space-3d-layout';
import { choosePackKind, packSize, resolveMerchItems } from '@/lib/space-3d-merch';
import { cafeTemplate, officeTemplate, showroomTemplate, upgradeLegacyLayout, warehouseTemplate } from '@/lib/space-3d-templates';

describe('normalizeSpaceObject', () => {
  it('giữ tương thích dữ liệu BOOTH cũ', () => {
    const o = normalizeSpaceObject({ id: 'booth-left-1', kind: 'BOOTH', label: 'KINH DOANH', posX: -10, posZ: -9, rotY: 1.57, widthM: 5.2, depthM: 3.4, heightM: 3.2, accentColor: '#7c3aed' });
    expect(o).not.toBeNull();
    expect(o!.kind).toBe('BOOTH');
    expect(o!.accentColor).toBe('#7c3aed');
    expect(o!.posY).toBe(0);
  });

  it('loại bỏ kind lạ, id rỗng và kẹp kích thước theo giới hạn', () => {
    expect(normalizeSpaceObject({ id: 'x', kind: 'SPACESHIP' })).toBeNull();
    expect(normalizeSpaceObject({ kind: 'CHAIR' })).toBeNull();
    const chair = normalizeSpaceObject({ id: 'c', kind: 'CHAIR', widthM: 99, heightM: -5, color: 'red' })!;
    expect(chair.widthM).toBe(0.6);
    expect(chair.heightM).toBe(0.75);
    expect(chair.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('kệ có merch mặc định AUTO, lọc id không hợp lệ', () => {
    const g = normalizeSpaceObject({ id: 'g', kind: 'GONDOLA', merch: { mode: 'MANUAL', itemIds: [1, -2, 'a', 3.5, 4] } })!;
    expect(g.merch).toEqual({ mode: 'MANUAL', itemIds: [1, 4] });
    expect(normalizeSpaceObject({ id: 'g2', kind: 'GONDOLA' })!.merch).toEqual({ mode: 'AUTO', itemIds: [] });
    expect(normalizeSpaceObject({ id: 'c', kind: 'CHAIR', merch: { mode: 'AUTO', itemIds: [] } })!.merch).toBeUndefined();
  });

  it('bỏ id trùng khi chuẩn hoá danh sách', () => {
    const list = normalizeSpaceObjects([{ id: 'a', kind: 'CHAIR' }, { id: 'a', kind: 'SOFA' }, null, 'x']);
    expect(list).toHaveLength(1);
  });

  it('mọi vật thể trong danh mục đều tạo được với kích thước mặc định', () => {
    for (const d of SPACE_OBJECT_DEFS) {
      const o = createObject(d.kind, 0, 0, []);
      expect(o, d.kind).not.toBeNull();
      expect(o!.widthM).toBeCloseTo(d.size[0]);
    }
  });
});

describe('snap / xoay / va chạm', () => {
  it('snap lưới 0.25m và góc 15°', () => {
    expect(snap(1.13)).toBe(1.25);
    expect(snap(-0.12)).toBe(-0);
    expect(snapAngle(0.3)).toBeCloseTo(Math.PI / 12);
    expect(snapAngle(-Math.PI / 12)).toBeCloseTo((23 * Math.PI) / 12);
  });

  it('footprint hoán đổi rộng/sâu khi xoay 90°', () => {
    const fp = footprintOf({ posX: 0, posZ: 0, widthM: 4, depthM: 1, rotY: Math.PI / 2 });
    expect(fp.maxX - fp.minX).toBeCloseTo(1);
    expect(fp.maxZ - fp.minZ).toBeCloseTo(4);
  });

  it('phát hiện chồng lấn, bỏ qua thảm', () => {
    const a = createObject('SOFA', 0, 0, [])!;
    const b = { ...createObject('ARMCHAIR', 0.5, 0, [a.id])!, id: 'b' };
    const rug = { ...createObject('RUG', 0, 0, [])!, id: 'rug' };
    const far = { ...createObject('CHAIR', 10, 10, [])!, id: 'far' };
    const list = [a, b, rug, far];
    expect(findCollisions(list, a.id)).toEqual(['b']);
    expect(findCollisions(list, 'rug')).toEqual([]);
    expect(findCollisions(list, 'far')).toEqual([]);
  });

  it('vật thể đặt trên mặt quầy (posY khác) không tính va chạm', () => {
    const bar = createObject('BAR_COUNTER', 0, 0, [])!;
    const machine = { ...createObject('ESPRESSO_MACHINE', 0, 0, [bar.id])!, posY: 1.1 };
    expect(findCollisions([bar, machine], machine.id)).toEqual([]);
  });

  it('kẹp vật thể trong mặt bằng', () => {
    const o = createObject('SOFA', 50, -50, [])!;
    const c = clampInside(o, 20, 10);
    expect(c.posX).toBeCloseTo(10 - 1);
    expect(c.posZ).toBeCloseTo(-5 + 0.425);
  });

  it('nhân bản tạo id mới và lệch vị trí', () => {
    const o = createObject('CHAIR', 0, 0, [])!;
    const d = duplicateObject(o, [o.id]);
    expect(d.id).not.toBe(o.id);
    expect(d.posX).toBeGreaterThan(o.posX);
  });
});

describe('lịch sử hoàn tác', () => {
  it('undo / redo / push xoá nhánh redo', () => {
    const a = [createObject('CHAIR', 0, 0, [])!];
    let h = historyInit(a);
    const b = [...a, createObject('SOFA', 3, 3, [a[0].id])!];
    h = historyPush(h, b);
    expect(h.present).toBe(b);
    h = historyUndo(h);
    expect(h.present).toBe(a);
    h = historyRedo(h);
    expect(h.present).toBe(b);
    h = historyUndo(h);
    h = historyPush(h, []);
    expect(h.future).toHaveLength(0);
    expect(historyUndo(historyInit(a)).present).toBe(a);
  });
});

describe('hàng hoá trên kệ', () => {
  it('chọn kiểu bao bì theo tên / danh mục', () => {
    expect(choosePackKind({ name: 'Siro Monin Caramel 700ml', category: 'INGREDIENT' })).toBe('bottle');
    expect(choosePackKind({ name: 'Cà phê hạt Arabica 1kg', category: 'INGREDIENT' })).toBe('bag');
    expect(choosePackKind({ name: 'Bột Matcha Nhật', category: 'INGREDIENT' })).toBe('pouch');
    expect(choosePackKind({ name: 'Máy pha cà phê 2 group', category: 'MACHINE' })).toBe('appliance');
    expect(choosePackKind({ name: 'Gioăng group head', category: 'SPARE_PART' })).toBe('box');
  });

  it('thu nhỏ bao bì khi tầng kệ thấp', () => {
    const [, h] = packSize('bottle', 0.2);
    expect(h).toBeLessThanOrEqual(0.18 + 1e-9);
    expect(packSize('can', 1)[1]).toBeCloseTo(0.12);
  });

  it('MANUAL chỉ lấy SP đã chọn theo thứ tự, AUTO lấy toàn bộ', () => {
    const pool = [1, 2, 3].map((id) => ({ id, name: `SP${id}`, category: 'X', manufacturer: null, imageUrl: null, sellingPrice: null }));
    expect(resolveMerchItems({ mode: 'MANUAL', itemIds: [3, 1, 9] }, pool).map((p) => p.id)).toEqual([3, 1]);
    expect(resolveMerchItems({ mode: 'AUTO', itemIds: [] }, pool)).toHaveLength(3);
    expect(resolveMerchItems(undefined, pool)).toHaveLength(3);
  });
});

describe('bố cục mẫu', () => {
  const lobbyClear = (objs: ReturnType<typeof showroomTemplate>) =>
    objs.filter((o) => o.kind !== 'RUG' && o.kind !== 'PENDANT_LIGHT').every((o) => {
      const fp = footprintOf(o);
      // Đại lộ thảm giữa (rộng 4.8m) không bị chắn bởi vật thể đứng
      // Cuối đại lộ: vách thương hiệu + quầy pha thử máy (điểm nhấn) & ghế khách trước quầy
      const backFocal = (o.kind === 'DEMO_BAR' || o.kind === 'BAR_STOOL') && o.posZ < -14 + 7;
      return fp.maxX <= -2.4 || fp.minX >= 2.4 || o.kind === 'BRAND_WALL' || o.kind === 'PLANTER_BOX' || backFocal;
    });

  it('showroom: lễ tân lệch khỏi đại lộ, gần lối vào', () => {
    const objs = showroomTemplate({ widthM: 36, depthM: 28 });
    const reception = objs.find((o) => o.kind === 'RECEPTION_DESK')!;
    expect(Math.abs(reception.posX)).toBeGreaterThan(4);
    expect(reception.posZ).toBeGreaterThan(5);
    expect(lobbyClear(objs)).toBe(true);
  });

  it('showroom như cửa hàng thật: không gian hàng, có quầy trưng bày đặt tên, không chồng lấn', async () => {
    for (const [w, d] of [[36, 28], [36, 32]] as const) {
      const objs = showroomTemplate({ widthM: w, depthM: d });
      expect(objs.some((o) => o.kind === 'BOOTH')).toBe(false);
      const counters = objs.filter((o) => o.kind === 'DISPLAY_COUNTER');
      expect(counters.length).toBeGreaterThanOrEqual(4);
      expect(counters.every((c) => c.label && c.label !== 'Quầy trưng bày sản phẩm')).toBe(true);
      // Ghế nhân viên sát sau quầy được phép chạm hộp bao (hộp bao thẳng trục của quầy xoay chéo phình to)
      const pairOk = (a: string, b: string) => {
        const A = objs.find((o) => o.id === a)!;
        const B = objs.find((o) => o.id === b)!;
        const seat = SEATABLE_KINDS.has(A.kind) ? A : SEATABLE_KINDS.has(B.kind) ? B : null;
        const counter = seat === A ? B : A;
        return Boolean(seat && counterBehind(seat, [counter]));
      };
      for (const o of objs) {
        if (o.kind === 'RUG') continue;
        expect(findCollisions(objs, o.id).filter((c) => !pairOk(o.id, c)), `${w}x${d} ${o.id}`).toEqual([]);
      }
      // Quầy áp tường không đặt ghế phía sau (nhân viên đứng tư vấn); lễ tân vẫn có ghế nhân viên
      for (const c of counters) expect(objs.some((o) => SEATABLE_KINDS.has(o.kind) && counterBehind(o, [c])), `ghế sau ${c.id}`).toBe(false);
      const reception = objs.find((o) => o.kind === 'RECEPTION_DESK')!;
      const recSeat = objs.find((o) => SEATABLE_KINDS.has(o.kind) && counterBehind(o, [reception]));
      expect(recSeat && isStaffSeat(recSeat, objs)).toBe(true);
      // Ghế bar trước quầy pha thử là ghế khách
      const demoStools = objs.filter((o) => o.kind === 'BAR_STOOL' && o.posZ < 0 && Math.abs(o.posX) < 2.5);
      expect(demoStools.length).toBe(4);
      expect(demoStools.every((o) => !isStaffSeat(o, objs))).toBe(true);
      // Quầy kem & sinh tố bày đúng loại máy
      const { demoProductsForCounter } = await import('@/lib/space-3d-demo-products');
      expect(demoProductsForCounter('Máy làm kem & Socola')[0].demoKind).toBe('softserve');
      expect(demoProductsForCounter('Máy xay sinh tố & Pha chế')[0].demoKind).toBe('blender');
      expect(demoProductsForCounter('Máy xay cà phê')[0].demoKind).toBe('grinder');
      expect(demoProductsForCounter('Thiết bị bếp & Bánh')[0].demoKind).toBe('oven');
      // Sofa khu chờ không phải ghế nhân viên
      const sofa = objs.find((o) => o.kind === 'SOFA')!;
      expect(isStaffSeat(sofa, objs)).toBe(false);
      expect(isStaffSeat({ ...sofa, seatAccess: 'staff' }, objs)).toBe(true);
    }
  });

  it('hoạt động khi ngồi: ghế trước bàn làm việc → gõ phím, quanh bàn họp → họp', () => {
    const objs = officeTemplate({ widthM: 26, depthM: 20 });
    const deskChair = objs.find((o) => o.kind === 'OFFICE_CHAIR' && seatActivity(seatsFor(o)[0], objs).activity === 'type');
    expect(deskChair).toBeTruthy();
    const meetChairs = objs.filter((o) => o.kind === 'OFFICE_CHAIR' && seatActivity(seatsFor(o)[0], objs).activity === 'meeting');
    expect(meetChairs.length).toBeGreaterThanOrEqual(4);
    const sofa = objs.find((o) => o.kind === 'SOFA')!;
    expect(seatActivity(seatsFor(sofa)[0], objs).activity).toBe('rest');
  });

  it('mọi mẫu: id duy nhất, nằm trong mặt bằng', () => {
    for (const [fn, w, d] of [[showroomTemplate, 36, 28], [cafeTemplate, 16, 14], [officeTemplate, 26, 20], [warehouseTemplate, 36, 28]] as const) {
      const objs = fn({ widthM: w, depthM: d });
      expect(new Set(objs.map((o) => o.id)).size).toBe(objs.length);
      for (const o of objs) {
        const fp = footprintOf(o);
        expect(fp.minX, `${o.id}`).toBeGreaterThanOrEqual(-w / 2 - 0.05);
        expect(fp.maxX, `${o.id}`).toBeLessThanOrEqual(w / 2 + 0.05);
        expect(fp.minZ, `${o.id}`).toBeGreaterThanOrEqual(-d / 2 - 0.05);
        expect(fp.maxZ, `${o.id}`).toBeLessThanOrEqual(d / 2 + 0.05);
      }
    }
  });

  it('nâng cấp bố cục cũ chỉ thêm vật thể không chồng lấn, không đụng bố cục đã thiết kế', () => {
    const legacy = normalizeSpaceObjects([
      { id: 'booth-left-1', kind: 'BOOTH', posX: -10, posZ: -9, rotY: Math.PI / 2, widthM: 5.2, depthM: 3.4, heightM: 3.2 },
      { id: 'booth-right-1', kind: 'BOOTH', posX: 10, posZ: -9, rotY: -Math.PI / 2, widthM: 5.2, depthM: 3.4, heightM: 3.2 },
    ]);
    const up = upgradeLegacyLayout('SHOWROOM', legacy, { widthM: 36, depthM: 32 })!;
    expect(up.length).toBeGreaterThan(legacy.length);
    expect(up.some((o) => o.kind === 'RECEPTION_DESK')).toBe(true);
    const added = up.slice(legacy.length).filter((o) => o.kind !== 'RUG');
    for (const o of added) expect(findCollisions([...legacy, o], o.id)).toEqual([]);
    expect(upgradeLegacyLayout('SHOWROOM', up, { widthM: 36, depthM: 32 })).toBeNull();
    expect(upgradeLegacyLayout('CAFE', legacy, { widthM: 16, depthM: 14 })).toBeNull();
  });
});

describe('chỗ ngồi', () => {
  it('ghế có 1 chỗ, sofa 3 chỗ quay cùng hướng sofa; chọn chỗ trống gần nhất', async () => {
    const { seatsFor, pickSeat } = await import('@/lib/space-3d-layout');
    const chair = createObject('CHAIR', 2, 3, [])!;
    expect(seatsFor(chair)).toHaveLength(1);
    expect(seatsFor(chair)[0].y).toBeCloseTo(0.48);
    const sofa = { ...createObject('SOFA', 0, 0, [])!, widthM: 2.6, rotY: Math.PI / 2 };
    const seats = seatsFor(sofa);
    expect(seats).toHaveLength(3);
    expect(seats.every((x) => x.rotY === Math.PI / 2)).toBe(true);
    const picked = pickSeat(seats, seats[2].x, seats[2].z, [{ x: seats[2].x, z: seats[2].z }]);
    expect(picked).not.toBeNull();
    expect(picked).not.toEqual(seats[2]);
    expect(seatsFor(createObject('TABLE_ROUND', 0, 0, [])!)).toHaveLength(0);
  });
});

describe('đồng phục nhân viên', () => {
  it('mặc định là đồng phục áo trắng + quần tây xanh đậm', async () => {
    const { normalizeAvatar3DConfig, UNIFORM_WHITE, UNIFORM_BOTTOM_NAVY } = await import('@/lib/space-3d-types');
    const c = normalizeAvatar3DConfig(null);
    expect(c.outfitStyle).toBe('uniform');
    expect(c.outfitColor).toBe(UNIFORM_WHITE);
    expect(c.pantsColor).toBe(UNIFORM_BOTTOM_NAVY);
    expect(c.bottomStyle).toBe('pants');
  });
  it('giữ chân váy, cấu hình cũ không có bottomStyle → quần tây', async () => {
    const { normalizeAvatar3DConfig } = await import('@/lib/space-3d-types');
    expect(normalizeAvatar3DConfig({ outfitStyle: 'uniform', bottomStyle: 'skirt' }).bottomStyle).toBe('skirt');
    const old = normalizeAvatar3DConfig({ outfitStyle: 'dress', outfitColor: '#1e3a8a' });
    expect(old.outfitStyle).toBe('dress');
    expect(old.bottomStyle).toBe('pants');
  });
});
