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
