import { describe, expect, it } from 'vitest';
import { inPortalZone, portalFor, portalLocal, portalSpawn } from '@/components/space3d/three/portals';

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
});
