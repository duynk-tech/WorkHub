import { describe, expect, it } from 'vitest';
import { cafeFrontYard, constrainWalk, crossesFence } from '@/lib/space-3d-yard';

const W = 30;
const D = 24;
const y = cafeFrontYard(W, D, { posX: 0, posZ: D / 2 - 0.45, widthM: 5.4 });

describe('sân trước quán cà phê', () => {
  it('đi thẳng ra qua cổng được', () => {
    const p = constrainWalk(y, W, D, 0, D / 2 - 0.1, 0, D / 2 + 0.3);
    expect(p.z).toBeCloseTo(D / 2 + 0.3, 5);
  });
  it('không xuyên hàng rào ngoài khoảng cổng (cả 2 chiều)', () => {
    expect(constrainWalk(y, W, D, 8, D / 2 - 0.1, 8, D / 2 + 0.3).z).toBeLessThanOrEqual(D / 2);
    expect(constrainWalk(y, W, D, -8, D / 2 + 0.1, -8, D / 2 - 0.3).z).toBeGreaterThan(D / 2);
    expect(crossesFence(y, 8, 0, 8, D / 2 + 3)).toBe(true);
    expect(crossesFence(y, 0, 0, 0, D / 2 + 3)).toBe(false);
  });
  it('ngoài sân trước đi dọc vỉa hè rộng hơn mặt quán, có giới hạn; không xuyên gốc cây', () => {
    const p = constrainWalk(y, W, D, 14, D / 2 + 3, 20, D / 2 + 3);
    expect(p.x).toBeCloseTo(W / 2 + 3, 5);
    expect(constrainWalk(y, W, D, 0, D / 2 + 11, 0, D / 2 + 20).z).toBeCloseTo(D / 2 + 12, 5);
    const t = y.trees[0];
    const q = constrainWalk(y, W, D, t.x + 1, t.z, t.x + 0.1, t.z);
    expect(Math.hypot(q.x - t.x, q.z - t.z)).toBeGreaterThanOrEqual(t.r - 1e-6);
  });
  it('không có sân trước → kẹp trong mặt bằng như cũ', () => {
    expect(constrainWalk(null, W, D, 0, D / 2 - 0.1, 0, D / 2 + 2).z).toBe(D / 2);
  });
});
