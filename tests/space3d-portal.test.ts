import { describe, expect, it } from 'vitest';
import { clearPortalPath, inPortalZone, portalFor, portalLocal, portalSpawn } from '@/lib/space-3d-portals';
import { templateFor } from '@/lib/space-3d-templates';

describe('cổng đi bộ Quán cà phê ⇄ Showroom', () => {
  it('mỗi cảnh trỏ sang cảnh còn lại; cảnh khác không có cổng', () => {
    expect(portalFor('CAFE', 30, 24)?.target).toBe('SHOWROOM');
    expect(portalFor('SHOWROOM', 36, 28)?.target).toBe('CAFE');
    expect(portalFor('OFFICE', 20, 16)).toBeNull();
  });

  for (const [kind, w, d] of [['CAFE', 30, 24], ['SHOWROOM', 36, 28]] as const) {
    it(`${kind}: tới được vùng kích hoạt trong giới hạn sàn, điểm xuất hiện nằm ngoài vùng`, () => {
      const p = portalFor(kind, w, d)!;
      // Điểm sát mép sàn mà nhân vật đi tới được (giới hạn = cạnh sàn - 0.4m)
      const hw = w / 2 - 0.4;
      const edgeX = p.x > 0 ? hw : -hw;
      expect(inPortalZone(p, edgeX, p.z)).toBe(true);
      expect(inPortalZone(p, edgeX, p.z + p.width)).toBe(false);
      const sp = portalSpawn(p);
      expect(inPortalZone(p, sp.x, sp.z)).toBe(false);
      expect(Math.abs(sp.x)).toBeLessThanOrEqual(hw);
      // Xuất hiện quay mặt vào trong cảnh
      expect(portalLocal(p, sp.x + Math.sin(sp.rotY), sp.z + Math.cos(sp.rotY)).depth).toBeGreaterThan(portalLocal(p, sp.x, sp.z).depth);
    });
  }

  const lanePoles = (objs: { kind: string; posX: number; posZ: number; rotY: number; widthM: number }[], p: NonNullable<ReturnType<typeof portalFor>>) =>
    objs
      .filter((o) => o.kind === 'STRING_LIGHTS')
      .flatMap((o) => [1, -1].map((sg) => [o.posX + sg * Math.cos(o.rotY) * (o.widthM / 2), o.posZ - sg * Math.sin(o.rotY) * (o.widthM / 2)]))
      .filter(([x, z]) => {
        const l = portalLocal(p, x, z);
        return l.depth > -0.5 && l.depth < 9 && Math.abs(l.side) < p.width / 2 + 0.8;
      });

  it('Quán cà phê: không còn cột dây đèn cắm giữa lối đi sang Showroom', () => {
    const p = portalFor('CAFE', 30, 24)!;
    const tpl = templateFor('CAFE', { widthM: 30, depthM: 24, departments: [] });
    expect(lanePoles(tpl, p)).toHaveLength(0);
    // Bố cục cũ đã lưu (dây 18m tâm (4, 6)) → khi dựng tự dời khỏi lối
    const legacy = [...tpl.filter((o) => o.kind !== 'STRING_LIGHTS'), { ...tpl.find((o) => o.kind === 'STRING_LIGHTS')!, posX: 4, posZ: 6, widthM: 18 }];
    expect(lanePoles(legacy, p)).toHaveLength(1);
    const fixed = clearPortalPath(legacy, p, 30, 24);
    expect(lanePoles(fixed, p)).toHaveLength(0);
    expect(fixed.filter((o, i) => o !== legacy[i])).toHaveLength(1);
  });
});
