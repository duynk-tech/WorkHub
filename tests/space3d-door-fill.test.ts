import { describe, expect, it } from 'vitest';
import { doorWallFillers } from '@/lib/space-3d-door-fill';
import { templateFor } from '@/lib/space-3d-templates';

describe('lấp khe cửa trên vách kính', () => {
  it('phòng họp văn phòng: có ô thoáng trên cửa và tấm lấp bên trái tới vách hông', () => {
    const objs = templateFor('OFFICE', { widthM: 30, depthM: 22, departments: [] });
    const fills = doorWallFillers(objs);
    const door = objs.find((o) => o.kind === 'DOOR')!;
    const top = fills.find((f) => f.id.endsWith('fill-top'));
    expect(top).toBeDefined();
    expect(top!.posY).toBeCloseTo(door.heightM + 0.06, 5);
    expect(top!.posY! + top!.heightM).toBeCloseTo(3, 5);
    const left = fills.find((f) => f.id.endsWith('fill-l'));
    expect(left).toBeDefined();
    // Lấp kín từ mặt vách hông tới khung cửa
    const side = objs.find((o) => o.kind === 'GLASS_WALL' && Math.abs(Math.sin(o.rotY)) > 0.99)!;
    expect(left!.posX - left!.widthM / 2).toBeCloseTo(side.posX + side.depthM / 2, 3);
    expect(left!.posX + left!.widthM / 2).toBeCloseTo(door.posX - door.widthM / 2 - 0.06, 3);
  });
  it('cửa đứng riêng (không có vách cạnh) → không sinh gì', () => {
    expect(doorWallFillers([{ id: 'd', kind: 'DOOR', posX: 0, posZ: 0, rotY: 0, widthM: 1, depthM: 0.12, heightM: 2.15 }])).toHaveLength(0);
  });
});
