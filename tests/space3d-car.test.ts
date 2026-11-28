import { describe, expect, it } from 'vitest';
import { CAR_MAX_FWD, stepCar, type CarState } from '@/lib/space-3d-car';
import { campusFree, campusLayout, campusRoute, campusWalk } from '@/lib/space-3d-tour';

const run = (s: CarState, input: { throttle: number; steer: number; handbrake: boolean }, secs: number) => {
  let st = s;
  for (let t = 0; t < secs; t += 1 / 60) st = stepCar(st, input, 1 / 60);
  return st;
};
const start: CarState = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0 };

describe('ô tô lái được', () => {
  it('ga tăng tốc nhưng không vượt tốc tối đa; nhả ga thì trôi chậm lại; phanh tay dừng nhanh', () => {
    const f = run(start, { throttle: 1, steer: 0, handbrake: false }, 12);
    expect(f.speed).toBeLessThanOrEqual(CAR_MAX_FWD);
    expect(f.speed).toBeGreaterThan(10);
    const coast = run(f, { throttle: 0, steer: 0, handbrake: false }, 1);
    expect(coast.speed).toBeLessThan(f.speed);
    expect(coast.speed).toBeGreaterThan(0);
    expect(run(f, { throttle: 0, steer: 0, handbrake: true }, 1.5).speed).toBe(0);
  });
  it('S khi đang chạy là phanh, dừng rồi mới lùi', () => {
    const f = run(start, { throttle: 1, steer: 0, handbrake: false }, 2);
    const b = run(f, { throttle: -1, steer: 0, handbrake: false }, 0.3);
    expect(b.speed).toBeGreaterThanOrEqual(0);
    expect(run(f, { throttle: -1, steer: 0, handbrake: false }, 4).speed).toBeLessThan(0);
  });
  it('rẽ phải khi tiến; chạy nhanh thì cua rộng hơn (góc lái giảm)', () => {
    const slow = run({ ...start, speed: 4 }, { throttle: 0.2, steer: 1, handbrake: false }, 1);
    expect(slow.rotY).toBeLessThan(0);
    const fast = run({ ...start, speed: 14 }, { throttle: 0.2, steer: 1, handbrake: false }, 0.3);
    const slow2 = run({ ...start, speed: 4 }, { throttle: 0.2, steer: 1, handbrake: false }, 0.3 * (14 / 4));
    expect(Math.abs(fast.rotY)).toBeLessThan(Math.abs(slow2.rotY));
  });
});

describe('phanh tay drift', () => {
  it('kéo phanh tay khi cua: xe xoay gắt hơn so với chỉ nhả ga', () => {
    const base = { ...start, speed: 12, steer: 1 };
    const hb = run(base, { throttle: 0, steer: 1, handbrake: true }, 0.4);
    const no = run(base, { throttle: 0, steer: 1, handbrake: false }, 0.4);
    expect(Math.abs(hb.rotY)).toBeGreaterThan(Math.abs(no.rotY));
  });
});

describe('đi bộ & lái xe khắp khuôn viên showroom', () => {
  const c = campusLayout(36, 32);
  it('chỗ đậu ô tô nằm ngoài nhà xưởng, trong khuôn viên', () => {
    for (const p of c.parking) expect(campusFree(c, p.x, p.z, 0.9)).toBe(true);
  });
  it('trong nhà không xuyên tường ra ngoài; qua cửa chính thì được', () => {
    expect(campusWalk(c, 10, 15.8, 10, 16.6)).toEqual({ x: 10, z: 15.8 });
    const p = campusWalk(c, 0, 15.8, 0, 16.6);
    expect(p.z).toBeCloseTo(16.6, 5);
  });
  it('ngoài trời không đi xuyên nhà xưởng / xưởng lân cận; bấm đi từ trong ra ngoài thì vòng qua cửa', () => {
    expect(campusWalk(c, -21, 0, -18.5, 0).x).toBe(-21);
    const r = campusRoute(c, 5, 0, -21, -5);
    expect(r.length).toBe(3);
    expect(Math.abs(r[0].x)).toBeLessThanOrEqual(1.2);
    expect(r[2]).toEqual({ x: -21, z: -5 });
  });
  it('gốc cây & cột đèn ven đường chặn xe/người; tim đường vòng thông thoáng', () => {
    expect(c.trees.length).toBeGreaterThan(10);
    expect(c.lamps.length).toBeGreaterThan(4);
    for (const t of c.trees) expect(campusFree(c, t.x, t.z)).toBe(false);
    for (const l of c.lamps) {
      expect(campusFree(c, l.x, l.z)).toBe(false);
      expect(campusFree(c, l.x + 0.4, l.z + 0.4)).toBe(true);
    }
  });
});
