import { describe, expect, it } from 'vitest';
import { DEFAULT_CAFE_MENU, findServeSpot, MAX_ORDER_QTY, normalizeCafeMenu, orderSummary, orderTotal, validateOrderLines } from '@/lib/space-3d-cafe-menu';
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
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ code: 'ABC', price: 12000, cupKind: 'mug', liquid: '#8a5a3b' });
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
