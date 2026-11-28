import { describe, expect, it } from 'vitest';
import { DEFAULT_CAFE_MENU, findServeSpot, isFoodItem, MAX_ORDER_QTY, normalizeCafeMenu, orderSummary, orderTotal, validateOrderLines } from '@/lib/space-3d-cafe-menu';
import { bubbleTtlMs, clipBubbleText, isSpaceEmote, talkDurationMs } from '@/lib/space-3d-chat';
import { pushBubble } from '@/components/space3d/use-space-realtime';
import type { RemoteBubble } from '@/lib/space-3d-types';

describe('menu quán cà phê', () => {
  it('setting không hợp lệ → menu mặc định', () => {
    expect(normalizeCafeMenu(null)).toBe(DEFAULT_CAFE_MENU);
    expect(normalizeCafeMenu([{ foo: 1 }])).toBe(DEFAULT_CAFE_MENU);
  });
  it('chuẩn hoá menu tuỳ chỉnh: mã in hoa, bỏ trùng, kiểu ly lạ → mug', () => {
    const m = normalizeCafeMenu([
      { code: 'abc', name: 'Món A', price: 12000.4, cupKind: 'xyz', liquid: 'red' },
      { code: 'ABC', name: 'Trùng', price: 1 },
    ]);
    // 1 món tuỳ chỉnh + 2 món bánh luôn được bổ sung
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ code: 'ABC', price: 12000, cupKind: 'mug', liquid: '#8a5a3b' });
    expect(m.slice(1).map((x) => x.cupKind)).toEqual(['banh_tet', 'banh_it']);
  });
  it('món bánh có trong menu mặc định, không trùng khi menu tuỳ chỉnh đã có sẵn', () => {
    expect(DEFAULT_CAFE_MENU.filter((x) => isFoodItem(x)).map((x) => x.code)).toEqual(['BANHTET', 'BANHIT']);
    const m = normalizeCafeMenu([{ code: 'BANHIT', name: 'Bánh ít nhà làm', price: 18000, cupKind: 'banh_it' }]);
    expect(m.filter((x) => x.code === 'BANHIT')).toHaveLength(1);
    expect(m.find((x) => x.code === 'BANHIT')!.name).toBe('Bánh ít nhà làm');
  });
});

describe('kiểm tra đơn gọi món', () => {
  const menu = DEFAULT_CAFE_MENU;
  it('gộp dòng trùng mã, tính tổng tiền', () => {
    const v = validateOrderLines([{ code: 'esp', qty: 1 }, { code: 'ESP', qty: 1 }, { code: 'LATTE', qty: 1 }], menu);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.lines).toEqual([{ code: 'ESP', qty: 2 }, { code: 'LATTE', qty: 1 }]);
    expect(orderTotal(v.lines, menu)).toBe(35000 * 2 + 49000);
    expect(orderSummary(v.lines, menu)).toBe('2 Espresso, 1 Latte');
  });
  it('từ chối món lạ, số lượng sai, quá 5 ly, đơn rỗng', () => {
    expect(validateOrderLines([{ code: 'NOPE', qty: 1 }], menu).ok).toBe(false);
    expect(validateOrderLines([{ code: 'ESP', qty: 0 }], menu).ok).toBe(false);
    expect(validateOrderLines([{ code: 'ESP', qty: MAX_ORDER_QTY + 1 }], menu).ok).toBe(false);
    expect(validateOrderLines([], menu).ok).toBe(false);
    expect(validateOrderLines('x', menu).ok).toBe(false);
  });
});

describe('chọn chỗ đặt ly', () => {
  const table = { id: 't1', kind: 'TABLE_ROUND', posX: 0, posZ: 0, rotY: 0, widthM: 0.8, depthM: 0.8, heightM: 0.75 };
  it('đặt trên mặt bàn gần nhất, lệch về phía khách', () => {
    const s = findServeSpot([table], 0, 1.0);
    expect(s).not.toBeNull();
    expect(s!.objectId).toBe('t1');
    expect(s!.y).toBeCloseTo(0.75);
    expect(s!.z).toBeCloseTo(0.4 - 0.12);
    expect(s!.x).toBeCloseTo(0);
  });
  it('khách xa bàn (> 1.2m) hoặc vật thể không phải bàn → null', () => {
    expect(findServeSpot([table], 0, 2.0)).toBeNull();
    expect(findServeSpot([{ ...table, kind: 'CHAIR' }], 0, 0.5)).toBeNull();
  });
  it('bàn xoay 90°: vẫn nằm trong mặt bàn', () => {
    const rect = { ...table, id: 't2', kind: 'TABLE_RECT', widthM: 1.2, depthM: 0.6, rotY: Math.PI / 2 };
    const s = findServeSpot([rect], 1.0, 0)!;
    expect(s.objectId).toBe('t2');
    expect(s.x).toBeCloseTo(0.3 - 0.12);
    expect(Math.abs(s.z)).toBeLessThan(0.6);
  });
});

describe('hội thoại trên đầu nhân vật', () => {
  it('thời gian hiển thị 4–10s theo độ dài câu', () => {
    expect(bubbleTtlMs('Chào')).toBe(4000);
    expect(bubbleTtlMs('x'.repeat(500))).toBe(10_000);
    expect(talkDurationMs('x'.repeat(10))).toBeLessThan(bubbleTtlMs('x'.repeat(10)));
  });
  it('cắt câu dài theo từ, thêm dấu …', () => {
    const t = clipBubbleText('xin chào '.repeat(30));
    expect(t.length).toBeLessThanOrEqual(121);
    expect(t.endsWith('…')).toBe(true);
    expect(clipBubbleText('  ngắn   gọn ')).toBe('ngắn gọn');
  });
  it('câu mới giữ câu trước làm dòng phụ', () => {
    const m = new Map<number, RemoteBubble>();
    pushBubble(m, 5, 'Câu một', 1000);
    pushBubble(m, 5, 'Câu hai', 2000);
    expect(m.get(5)).toMatchObject({ text: 'Câu hai', prev: 'Câu một', startedAt: 2000 });
    pushBubble(m, 5, 'Câu ba', 60_000); // câu trước đã hết hạn
    expect(m.get(5)?.prev).toBeUndefined();
  });
  it('chỉ nhận biểu cảm hợp lệ', () => {
    expect(isSpaceEmote('wave')).toBe(true);
    expect(isSpaceEmote('dance')).toBe(false);
  });
});

describe('NPC quán cà phê', () => {
  it('tìm đủ vị trí barista, chị bán bánh, phục vụ, bảo vệ theo mẫu quán vườn', async () => {
    const { cafeTemplate } = await import('@/lib/space-3d-templates');
    const { findNpcSpots } = await import('@/lib/space-3d-npc');
    const objs = cafeTemplate({ widthM: 30, depthM: 24 });
    const spots = findNpcSpots(objs);
    expect(Object.keys(spots).sort()).toEqual(['barista', 'guard', 'vendor', 'waiter']);
    const bar = objs.find((o) => o.kind === 'BAR_COUNTER')!;
    // Barista đứng SAU quầy (phía -Z cục bộ, quầy rotY = 0 → z nhỏ hơn)
    expect(spots.barista!.z).toBeLessThan(bar.posZ - bar.depthM / 2);
    const gate = objs.find((o) => o.kind === 'GARDEN_GATE')!;
    // Bảo vệ đứng phía trong cổng, gần cổng
    expect(spots.guard!.z).toBeLessThan(gate.posZ);
    expect(Math.hypot(spots.guard!.x - gate.posX, spots.guard!.z - gate.posZ)).toBeLessThan(5);
    // Mọi vị trí nằm trong mặt bằng
    for (const sp of Object.values(spots)) {
      expect(Math.abs(sp!.x)).toBeLessThanOrEqual(15);
      expect(Math.abs(sp!.z)).toBeLessThanOrEqual(12);
    }
  });
  it('quán không có quầy bánh / cổng → không có NPC tương ứng', async () => {
    const { findNpcSpots } = await import('@/lib/space-3d-npc');
    const spots = findNpcSpots([{ kind: 'BAR_COUNTER', posX: 0, posZ: 0, rotY: 0, widthM: 3, depthM: 0.8 }]);
    expect(spots.barista).toBeTruthy();
    expect(spots.vendor).toBeUndefined();
    expect(spots.guard).toBeUndefined();
  });
  it('đường phục vụ kết thúc cạnh bàn, lệch khỏi mặt khách', async () => {
    const { serveRoute } = await import('@/lib/space-3d-npc');
    const spot = { x: 0, z: 0 };
    const customer = { x: 0, z: 1 };
    const route = serveRoute({ x: -5, z: -6 }, spot, customer);
    const end = route[route.length - 1];
    expect(Math.hypot(end.x - spot.x, end.z - spot.z)).toBeLessThan(1);
    expect(Math.abs(end.x)).toBeGreaterThan(0.5); // đứng bên cạnh, không chắn trước mặt khách
  });
});

describe('khách NPC ngồi quán', () => {
  it('chọn 2 cặp + 1 người lẻ ở ghế khách sát bàn, ổn định theo hạt giống', async () => {
    const { cafeTemplate, DEFAULT_SCENE_SIZE } = await import('@/lib/space-3d-templates');
    const { pickPatronSeats } = await import('@/lib/space-3d-npc');
    const objs = cafeTemplate(DEFAULT_SCENE_SIZE.CAFE).map((o, i) => ({ ...o, id: o.id ?? `o${i}` }));
    const a = pickPatronSeats(objs as never, 42);
    const b = pickPatronSeats(objs as never, 42);
    expect(a).toEqual(b);
    expect(a.length).toBe(5);
    expect(a.filter((p) => p.partner !== null).length).toBe(4);
    for (const [i, p] of a.entries()) {
      if (p.partner !== null) expect(a[p.partner].partner).toBe(i);
      // ly đặt gần chỗ ngồi
      expect(Math.hypot(p.cup.x - p.seat.x, p.cup.z - p.seat.z)).toBeLessThan(1.4);
    }
    // không có 2 khách cùng 1 ghế
    const keys = new Set(a.map((p) => `${p.seat.x.toFixed(2)},${p.seat.z.toFixed(2)}`));
    expect(keys.size).toBe(a.length);
  });
});
