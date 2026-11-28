import { describe, expect, it } from 'vitest';
import { FORKLIFT_LIFT_MAX, FORKLIFT_MAX_FWD, FORKLIFT_MAX_REV, forkliftSeat, stepForklift, type ForkliftState } from '@/lib/space-3d-forklift';

const start: ForkliftState = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0, lift: 0 };
const run = (s: ForkliftState, input: { throttle: number; steer: number; lift: number }, secs: number) => {
  let st = s;
  for (let t = 0; t < secs; t += 1 / 60) st = stepForklift(st, input, 1 / 60);
  return st;
};

describe('xe nâng lái được', () => {
  it('ga tăng tốc tới giới hạn, đi về phía càng (+Z); lùi chậm hơn', () => {
    const f = run(start, { throttle: 1, steer: 0, lift: 0 }, 4);
    expect(f.speed).toBeCloseTo(FORKLIFT_MAX_FWD, 5);
    expect(f.z).toBeGreaterThan(5);
    expect(Math.abs(f.x)).toBeLessThan(1e-6);
    const r = run(start, { throttle: -1, steer: 0, lift: 0 }, 4);
    expect(r.speed).toBeCloseTo(-FORKLIFT_MAX_REV, 5);
    expect(r.z).toBeLessThan(0);
  });
  it('nhả ga thì xe trôi rồi dừng hẳn; đứng yên đánh lái không quay xe', () => {
    const moving = run(start, { throttle: 1, steer: 0, lift: 0 }, 2);
    const stopped = run(moving, { throttle: 0, steer: 0, lift: 0 }, 3);
    expect(stopped.speed).toBe(0);
    const spin = run(start, { throttle: 0, steer: 1, lift: 0 }, 2);
    expect(spin.rotY).toBe(0);
  });
  it('đánh lái phải khi tiến → rẽ phải (về phía -X khi nhìn theo +Z)', () => {
    const f = run(start, { throttle: 1, steer: 1, lift: 0 }, 1.5);
    expect(f.x).toBeLessThan(-0.1);
    expect(f.rotY).toBeLessThan(0);
  });
  it('càng nâng trong giới hạn; ghế lái nằm sau tâm xe', () => {
    expect(run(start, { throttle: 0, steer: 0, lift: 1 }, 10).lift).toBe(FORKLIFT_LIFT_MAX);
    expect(run(start, { throttle: 0, steer: 0, lift: -1 }, 2).lift).toBe(0);
    expect(forkliftSeat(start, 2.4).z).toBeLessThan(0);
  });
});

describe('xúc & cất pallet', async () => {
  const { canPickPallet, forkCenter, palletLanding } = await import('@/lib/space-3d-forklift');
  const s = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0, lift: 0 };
  it('pallet ngay trước càng, càng hạ thấp → xúc được; lệch xa hoặc lệch tầng → không', () => {
    const c = forkCenter(s, 2.4);
    expect(canPickPallet(s, 2.4, { x: c.x, z: c.z, y: 0 })).toBe(true);
    expect(canPickPallet(s, 2.4, { x: c.x + 0.8, z: c.z, y: 0 })).toBe(false);
    expect(canPickPallet(s, 2.4, { x: c.x, z: c.z, y: 1.2 })).toBe(false);
    expect(canPickPallet({ ...s, lift: 1.15 }, 2.4, { x: c.x, z: c.z, y: 1.2 })).toBe(true);
  });
  it('hạ pallet: chạm sàn hoặc đúng tầng kệ bên dưới thì đặt, còn lơ lửng thì chưa', () => {
    expect(palletLanding(0.01, [])).toBe(0);
    expect(palletLanding(0.5, [])).toBeNull();
    expect(palletLanding(1.205, [0.18, 1.2, 2.2])).toBe(1.2);
    expect(palletLanding(1.6, [0.18, 1.2, 2.2])).toBeNull();
  });
});
