/**
 * Động học ô tô (thuần TS, test được) — mô hình xe đạp, lái bánh trước: tăng tốc/phanh/trôi mượt,
 * góc lái giảm dần khi chạy nhanh, phanh tay. Mặt trước = +Z cục bộ; hướng = (sin rotY, cos rotY).
 */
export interface CarState {
  x: number;
  z: number;
  rotY: number;
  /** m/s, âm = lùi */
  speed: number;
  /** góc lái hiện tại (-1…1, dương = rẽ phải) */
  steer: number;
}
export interface CarInput {
  /** 1 = ga, -1 = phanh / lùi */
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export const CAR_MAX_FWD = 16; // ~58 km/h trong khuôn viên
export const CAR_MAX_REV = 5;
const ACCEL = 5;
const BRAKE = 10;
const COAST = 1.6;
const HANDBRAKE = 11;
const WHEELBASE = 2.7;
const MAX_STEER = 0.6;

export function stepCar(s: CarState, input: CarInput, dt: number): CarState {
  const t = Math.max(-1, Math.min(1, input.throttle));
  let v = s.speed;
  if (input.handbrake) v = v > 0 ? Math.max(0, v - HANDBRAKE * dt) : Math.min(0, v + HANDBRAKE * dt);
  else if (t > 0) v = v < 0 ? Math.min(0, v + BRAKE * dt) : Math.min(CAR_MAX_FWD, v + ACCEL * t * dt * (1 - v / (CAR_MAX_FWD * 1.4)));
  else if (t < 0) v = v > 0.05 ? Math.max(0, v - BRAKE * dt) : Math.max(-CAR_MAX_REV, v + ACCEL * 0.6 * t * dt);
  else v = v > 0 ? Math.max(0, v - COAST * dt) : Math.min(0, v + COAST * dt);
  const want = Math.max(-1, Math.min(1, input.steer));
  const steer = s.steer + (want - s.steer) * Math.min(1, dt * (want === 0 ? 6 : 4));
  // Chạy nhanh → góc lái tối đa nhỏ lại (ổn định như xe thật)
  const maxA = MAX_STEER / (1 + Math.abs(v) * 0.09);
  // Phanh tay khi đang chạy: bánh sau trượt → xe xoay gắt hơn (drift nhẹ)
  const drift = input.handbrake && Math.abs(v) > 3 ? 1.8 : 1;
  const yaw = ((v * Math.tan(steer * maxA)) / WHEELBASE) * drift;
  const rotY = s.rotY - yaw * dt;
  return { x: s.x + Math.sin(rotY) * v * dt, z: s.z + Math.cos(rotY) * v * dt, rotY, speed: v, steer };
}

/** Điểm kiểm tra va chạm thân xe (4 góc + giữa mũi + giữa đuôi) */
export function carCorners(s: CarState, widthM: number, lengthM: number): [number, number][] {
  const c = Math.cos(s.rotY);
  const sn = Math.sin(s.rotY);
  const w = (lx: number, lz: number): [number, number] => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
  const hw = widthM / 2;
  const hl = lengthM / 2;
  return [w(-hw, hl), w(hw, hl), w(-hw, -hl), w(hw, -hl), w(0, hl + 0.05), w(0, -hl - 0.05)];
}

/** km/h hiển thị */
export const kmh = (v: number) => Math.round(Math.abs(v) * 3.6);
