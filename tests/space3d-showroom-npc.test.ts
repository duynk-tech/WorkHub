import { describe, expect, it } from 'vitest';
import { consultantPatrol, findNpcSpots } from '@/lib/space-3d-npc';
import { templateFor } from '@/lib/space-3d-templates';

describe('NPC showroom', () => {
  const objs = templateFor('SHOWROOM', { widthM: 36, depthM: 32, departments: [] });
  const spots = findNpcSpots(objs);
  const inside = (p: { x: number; z: number }) => Math.abs(p.x) < 18 && Math.abs(p.z) < 16;

  it('có lễ tân, barista trình diễn, tư vấn viên, kỹ thuật viên Lab — không có NPC quán cà phê', () => {
    for (const r of ['receptionist', 'demo', 'consultant', 'labtech'] as const) {
      expect(spots[r]).toBeDefined();
      expect(inside(spots[r]!)).toBe(true);
    }
    expect(spots.barista).toBeUndefined();
    expect(spots.waiter).toBeUndefined();
  });

  it('lễ tân & barista đứng phía sau quầy (ngược hướng mặt quầy)', () => {
    for (const [role, kind] of [['receptionist', 'RECEPTION_DESK'], ['demo', 'DEMO_BAR']] as const) {
      const o = objs.find((x) => x.kind === kind)!;
      const p = spots[role]!;
      const front = (p.x - o.posX) * Math.sin(o.rotY) + (p.z - o.posZ) * Math.cos(o.rotY);
      expect(front).toBeLessThan(0);
    }
  });

  it('kỹ thuật viên ở trong phòng Lab; tư vấn viên đi tuần trước các quầy cùng dãy', () => {
    const lab = objs.find((x) => x.kind === 'ROOM_ZONE')!;
    const t = spots.labtech!;
    expect(Math.abs(t.x - lab.posX)).toBeLessThan(lab.widthM / 2);
    expect(Math.abs(t.z - lab.posZ)).toBeLessThan(lab.depthM / 2);
    const patrol = consultantPatrol(objs, spots.consultant!);
    expect(patrol.length).toBeGreaterThan(0);
    for (const p of patrol) {
      expect(Math.abs(p.x - spots.consultant!.x)).toBeLessThan(1.2);
      expect(inside(p)).toBe(true);
    }
  });
});

describe('NPC kho hàng', () => {
  const objs = templateFor('WAREHOUSE', { widthM: 40, depthM: 30, departments: [] });
  const spots = findNpcSpots(objs);
  it('có thủ kho, soạn hàng, bốc xếp trong mặt bằng; không có NPC showroom/quán', () => {
    for (const r of ['storekeeper', 'picker', 'loader'] as const) {
      expect(spots[r]).toBeDefined();
      expect(Math.abs(spots[r]!.x)).toBeLessThan(20);
      expect(Math.abs(spots[r]!.z)).toBeLessThan(15);
    }
    expect(spots.receptionist).toBeUndefined();
    expect(spots.barista).toBeUndefined();
  });
  it('soạn hàng đi tuần trước các kệ cùng dãy, không đứng trong thân kệ', async () => {
    const { pickerPatrol } = await import('@/lib/space-3d-npc');
    const patrol = pickerPatrol(objs, spots.picker!);
    expect(patrol.length).toBeGreaterThan(0);
    const racks = objs.filter((o) => o.kind === 'RACK');
    for (const p of [...patrol, spots.picker!]) {
      for (const r of racks) {
        const inside = Math.abs(p.x - r.posX) < r.widthM / 2 && Math.abs(p.z - r.posZ) < r.depthM / 2;
        expect(inside).toBe(false);
      }
    }
  });
});
