import * as THREE from 'three';
import type { SpaceStructure } from '@/lib/space-3d-types';
import { forkliftCorners, FORKLIFT_LIFT_MAX, forkliftSeat, stepForklift, type ForkliftState } from '@/lib/space-3d-forklift';

/**
 * Lái xe nâng trong kho: đứng cạnh xe bấm F để ngồi vào ghế lái, W/S ga – lùi, A/D đánh lái (bánh sau),
 * R/Q nâng – hạ càng, F xuống xe. Chạy cục bộ ở máy người lái (vị trí xe không lưu vào bố cục).
 */
export interface ForkliftEntry {
  id: string;
  root: THREE.Object3D;
  carriage: THREE.Object3D | null;
  obj: SpaceStructure;
}

export class ForkliftDriver {
  active: ForkliftEntry | null = null;
  state: ForkliftState = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0, lift: 0 };
  /** Vị trí đã lái tới (giữ lại khi xuống xe, dựng lại cảnh không kéo xe về chỗ cũ trong phiên chơi) */
  private parked = new Map<string, { x: number; z: number; rotY: number; lift: number }>();

  /** Xe nâng gần người chơi nhất (≤ 2.4m tính từ tâm xe) */
  nearest(list: ForkliftEntry[], px: number, pz: number): ForkliftEntry | null {
    let best: ForkliftEntry | null = null;
    let bd = 2.4;
    for (const f of list) {
      const d = Math.hypot(f.root.position.x - px, f.root.position.z - pz);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Áp lại vị trí đã lái (sau khi cảnh dựng lại) */
  restore(list: ForkliftEntry[]) {
    for (const f of list) {
      const p = this.parked.get(f.id);
      if (!p) continue;
      f.root.position.set(p.x, f.root.position.y, p.z);
      f.root.rotation.y = p.rotY;
      if (f.carriage) f.carriage.position.y = p.lift;
      f.root.updateMatrixWorld(true);
    }
    if (this.active) {
      const again = list.find((f) => f.id === this.active!.id);
      this.active = again ?? null;
    }
  }

  enter(f: ForkliftEntry) {
    this.active = f;
    this.state = { x: f.root.position.x, z: f.root.position.z, rotY: f.root.rotation.y, speed: 0, steer: 0, lift: f.carriage?.position.y ?? 0 };
  }

  /** Xuống xe: điểm đứng bên trái ghế lái */
  exit(): { x: number; z: number; rotY: number } | null {
    const f = this.active;
    if (!f) return null;
    this.parked.set(f.id, { x: this.state.x, z: this.state.z, rotY: this.state.rotY, lift: this.state.lift });
    this.active = null;
    const side = -(f.obj.widthM / 2 + 0.55);
    const c = Math.cos(this.state.rotY);
    const s = Math.sin(this.state.rotY);
    return { x: this.state.x + side * c, z: this.state.z - side * s, rotY: this.state.rotY };
  }

  /**
   * Cập nhật 1 khung hình. Trả về độ dời (dx, dz) để camera đi theo và điểm ghế lái để đặt người chơi.
   * `blocked(x, z)` = điểm đó có vướng vật thể/tường không.
   */
  update(
    dt: number,
    input: { throttle: number; steer: number; lift: number },
    blocked: (x: number, z: number) => boolean,
  ): { dx: number; dz: number; seat: { x: number; z: number; y: number; rotY: number } } | null {
    const f = this.active;
    if (!f) return null;
    const prev = this.state;
    let next = stepForklift(prev, input, dt);
    const hit = forkliftCorners(next, f.obj.widthM, f.obj.depthM).some(([x, z]) => blocked(x, z));
    if (hit) {
      // Va chạm: đứng lại (giữ góc lái & càng), không đi xuyên
      next = { ...prev, speed: 0, steer: next.steer, lift: next.lift };
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    this.state = next;
    f.root.position.x = next.x;
    f.root.position.z = next.z;
    f.root.rotation.y = next.rotY;
    if (f.carriage) f.carriage.position.y = next.lift;
    return { dx, dz, seat: forkliftSeat(next, f.obj.depthM) };
  }

  get liftMax() {
    return FORKLIFT_LIFT_MAX;
  }
}
