import { describe, expect, it } from 'vitest';
import { pathLengths, samplePath, showroomRing, tourPath } from '@/lib/space-3d-tour';
import { constrainWalk, showroomFrontYard } from '@/lib/space-3d-yard';

describe('xe điện tham quan khuôn viên showroom', () => {
  const r = showroomRing(36, 32);
  const pts = tourPath(r);
  const lens = pathLengths(pts);
  it('vòng đường nằm ngoài nhà xưởng (cách tường ≥ 4m) và khép kín về trạm', () => {
    expect(r.x1).toBeGreaterThan(36 / 2 + 1 + 4);
    expect(r.z1).toBeGreaterThan(32 / 2 + 2 + 4);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    for (const p of pts) expect(Math.abs(p.x) > 36 / 2 + 3 || Math.abs(p.z) > 32 / 2 + 4).toBe(true);
  });
  it('lấy vị trí theo quãng đường: đầu vòng ở trạm, lặp lại sau 1 vòng', () => {
    const total = lens[lens.length - 1];
    const a = samplePath(pts, lens, 0);
    expect(a.x).toBeCloseTo(r.stop.x, 5);
    const b = samplePath(pts, lens, total + 3);
    const c = samplePath(pts, lens, 3);
    expect(b.x).toBeCloseTo(c.x, 5);
    expect(b.z).toBeCloseTo(c.z, 5);
  });
  it('đi bộ ra sân chỉ qua cửa kính giữa mặt tiền', () => {
    const y = showroomFrontYard(36, 32);
    expect(constrainWalk(y, 36, 32, 0, 15.5, 0, 19).z).toBeCloseTo(19, 5);
    expect(constrainWalk(y, 36, 32, 6, 16.5, 6, 19).z).toBeLessThan(18);
  });
});
