/**
 * Động học xe nâng (thuần TS, test được): xe nâng đánh lái bánh SAU → đuôi xe quét rộng khi cua,
 * tăng/giảm tốc mượt, phanh khi nhả ga, càng nâng có giới hạn.
 * Mặt trước xe (phía càng) = +Z cục bộ; rotY theo quy ước three.js (hướng = (sin rotY, cos rotY)).
 */
export interface ForkliftState {
  x: number;
  z: number;
  rotY: number;
  /** m/s, âm = lùi */
  speed: number;
  /** góc lái hiện tại (-1…1) */
  steer: number;
  /** độ cao càng (m) */
  lift: number;
}

export const FORKLIFT_MAX_FWD = 3.2;
export const FORKLIFT_MAX_REV = 1.6;
export const FORKLIFT_LIFT_MAX = 1.8;
const ACCEL = 2.4;
const BRAKE = 4.5;
const COAST = 2.2;
const WHEELBASE = 1.25;
const MAX_STEER_RAD = 0.75;

export function stepForklift(s: ForkliftState, input: { throttle: number; steer: number; lift: number }, dt: number): ForkliftState {
  const t = Math.max(-1, Math.min(1, input.throttle));
  let speed = s.speed;
  if (t > 0) speed = speed < 0 ? Math.min(0, speed + BRAKE * dt) : Math.min(FORKLIFT_MAX_FWD, speed + ACCEL * t * dt);
  else if (t < 0) speed = speed > 0 ? Math.max(0, speed - BRAKE * dt) : Math.max(-FORKLIFT_MAX_REV, speed + ACCEL * t * dt);
  else speed = speed > 0 ? Math.max(0, speed - COAST * dt) : Math.min(0, speed + COAST * dt);
  // Vô lăng quay về giữa khi nhả phím
  const want = Math.max(-1, Math.min(1, input.steer));
  const steer = s.steer + (want - s.steer) * Math.min(1, dt * (want === 0 ? 5 : 3.5));
  // Mô hình xe đạp: tốc độ quay = v·tan(δ)/L. Bánh lái ở sau → cùng chiều phím, lùi thì đảo
  const yawRate = (speed * Math.tan(steer * MAX_STEER_RAD)) / WHEELBASE;
  const rotY = s.rotY - yawRate * dt;
  const x = s.x + Math.sin(rotY) * speed * dt;
  const z = s.z + Math.cos(rotY) * speed * dt;
  const lift = Math.max(0, Math.min(FORKLIFT_LIFT_MAX, s.lift + Math.max(-1, Math.min(1, input.lift)) * 0.55 * dt));
  return { x, z, rotY, speed, steer, lift };
}

/** Các điểm kiểm tra va chạm: 4 góc thân + 2 mũi càng */
export function forkliftCorners(s: ForkliftState, widthM: number, depthM: number): [number, number][] {
  const c = Math.cos(s.rotY);
  const sn = Math.sin(s.rotY);
  const w = (lx: number, lz: number): [number, number] => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
  const hw = widthM / 2;
  const back = -depthM * 0.48;
  const front = depthM * 0.3;
  const forkTip = depthM * 0.28 + 1.0;
  return [w(-hw, back), w(hw, back), w(-hw, front), w(hw, front), w(-0.25, forkTip), w(0.25, forkTip), w(0, back)];
}

/** Điểm ngồi của tài xế (hông) trên ghế xe */
export function forkliftSeat(s: ForkliftState, depthM: number): { x: number; z: number; y: number; rotY: number } {
  const lz = -depthM * 0.2;
  return { x: s.x + Math.sin(s.rotY) * lz, z: s.z + Math.cos(s.rotY) * lz, y: 1.0, rotY: s.rotY };
}

/** Tâm vùng càng (giữa 2 càng, cách cột nâng ~0.5m) — điểm xúc pallet */
export function forkCenter(s: ForkliftState, depthM: number): { x: number; z: number } {
  const lz = depthM * 0.28 + 0.5;
  return { x: s.x + Math.sin(s.rotY) * lz, z: s.z + Math.cos(s.rotY) * lz };
}

/** Pallet nằm trong vùng càng và ngang tầm càng (sai lệch ≤ 0.45m ngang, ≤ 0.2m cao) → xúc được */
export function canPickPallet(s: ForkliftState, depthM: number, pallet: { x: number; z: number; y: number }): boolean {
  const c = forkCenter(s, depthM);
  return Math.hypot(pallet.x - c.x, pallet.z - c.z) <= 0.45 && Math.abs(pallet.y - s.lift) <= 0.2;
}

/**
 * Hạ pallet đang chở: độ cao đáy pallet `bottomY`, điểm (x, z); `levels` = các tầng kệ (độ cao) có lòng kệ chứa (x, z).
 * Trả về độ cao đặt pallet khi vừa chạm (sàn = 0 hoặc tầng kệ), null nếu còn đang lơ lửng.
 */
export function palletLanding(bottomY: number, levels: number[]): number | null {
  const below = levels.filter((y) => y <= bottomY + 0.015).sort((a, b) => b - a)[0];
  const floor = below ?? 0;
  return bottomY <= floor + 0.015 ? floor : null;
}
