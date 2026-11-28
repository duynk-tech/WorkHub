import * as THREE from 'three';
import type { SpaceStructure } from '@/lib/space-3d-types';
import { canPickPallet, forkCenter, forkliftCorners, FORKLIFT_LIFT_MAX, forkliftSeat, palletLanding, stepForklift, type ForkliftState } from '@/lib/space-3d-forklift';

/**
 * Lái xe nâng trong kho: đứng cạnh xe bấm F để ngồi vào ghế lái, W/S ga – lùi, A/D đánh lái (bánh sau),
 * R/Q nâng – hạ càng, F xuống xe. Luồn càng dưới chồng pallet rồi nâng (R) để xúc; hạ (Q) xuống sàn hoặc
 * đúng tầng kệ để cất hàng. Chạy cục bộ ở máy người lái (vị trí xe/pallet giữ trong phiên chơi).
 */
export interface ForkliftEntry {
  id: string;
  root: THREE.Object3D;
  carriage: THREE.Object3D | null;
  obj: SpaceStructure;
}
export interface PalletEntry {
  id: string;
  root: THREE.Object3D;
  obj: SpaceStructure;
}
/** Tầng kệ: hộp lòng kệ (toạ độ thế giới, xoay) + các độ cao mặt tầng */
export interface RackBay {
  x: number;
  z: number;
  rotY: number;
  hw: number;
  hd: number;
  levels: number[];
}
export type ForkHint = 'near' | 'driving' | 'pick' | 'carry' | null;

export class ForkliftDriver {
  active: ForkliftEntry | null = null;
  state: ForkliftState = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0, lift: 0 };
  /** Vị trí đã lái tới (giữ lại khi xuống xe, dựng lại cảnh không kéo xe về chỗ cũ trong phiên chơi) */
  private parked = new Map<string, { x: number; z: number; rotY: number; lift: number }>();
  /** Pallet đã dời: id → vị trí mới */
  readonly movedPallets = new Map<string, { x: number; y: number; z: number; rotY: number }>();
  private pallets: PalletEntry[] = [];
  private bays: RackBay[] = [];
  carrying: PalletEntry | null = null;
  /** Pallet đang nằm trong vùng càng, xúc được */
  pickable: PalletEntry | null = null;

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

  /** Áp lại vị trí xe & pallet đã dời (sau khi cảnh dựng lại) */
  restore(list: ForkliftEntry[], pallets: PalletEntry[], bays: RackBay[]) {
    // Cảnh dựng lại khi đang chở → trả pallet về nhóm vật thể (giữ vị trí thế giới) rồi để lại trên sàn
    if (this.carrying && this.active?.root.parent) {
      const p = this.carrying;
      this.active.root.parent.attach(p.root);
      p.root.position.y = 0;
      this.movedPallets.set(p.id, { x: p.root.position.x, y: 0, z: p.root.position.z, rotY: p.root.rotation.y });
    }
    this.pallets = pallets;
    this.bays = bays;
    this.carrying = null;
    this.pickable = null;
    for (const f of list) {
      const p = this.parked.get(f.id);
      if (!p) continue;
      f.root.position.set(p.x, f.root.position.y, p.z);
      f.root.rotation.y = p.rotY;
      if (f.carriage) f.carriage.position.y = p.lift;
      f.root.updateMatrixWorld(true);
    }
    for (const pl of pallets) {
      const m = this.movedPallets.get(pl.id);
      if (!m) continue;
      pl.root.position.set(m.x, m.y, m.z);
      pl.root.rotation.y = m.rotY;
      pl.root.updateMatrixWorld(true);
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

  /** Xuống xe: điểm đứng bên trái ghế lái (pallet đang chở giữ nguyên trên càng) */
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

  private bayAt(x: number, z: number): RackBay | null {
    for (const b of this.bays) {
      const c = Math.cos(b.rotY);
      const s = Math.sin(b.rotY);
      const lx = (x - b.x) * c - (z - b.z) * s;
      const lz = (x - b.x) * s + (z - b.z) * c;
      if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) return b;
    }
    return null;
  }

  /**
   * Cập nhật 1 khung hình. Trả về độ dời (dx, dz) để camera đi theo và điểm ghế lái để đặt người chơi.
   * `blocked(x, z, forkTip)` = điểm đó có vướng vật thể/tường không (mũi càng được luồn dưới pallet / vào lòng kệ).
   */
  update(
    dt: number,
    input: { throttle: number; steer: number; lift: number },
    blocked: (x: number, z: number, forkTip: boolean, lift: number) => boolean,
  ): { dx: number; dz: number; seat: { x: number; z: number; y: number; rotY: number } } | null {
    const f = this.active;
    if (!f) return null;
    const prev = this.state;
    let next = stepForklift(prev, input, dt);
    const pts = forkliftCorners(next, f.obj.widthM, f.obj.depthM);
    const hit = pts.some(([x, z], i) => blocked(x, z, i === 4 || i === 5, next.lift));
    if (hit) next = { ...prev, speed: 0, steer: next.steer, lift: next.lift };
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    this.state = next;
    f.root.position.x = next.x;
    f.root.position.z = next.z;
    f.root.rotation.y = next.rotY;
    if (f.carriage) f.carriage.position.y = next.lift;
    f.root.updateMatrixWorld(true);
    this.handlePallets(f, input.lift);
    return { dx, dz, seat: forkliftSeat(next, f.obj.depthM) };
  }

  private handlePallets(f: ForkliftEntry, liftIn: number) {
    const s = this.state;
    if (!this.carrying) {
      // Tìm pallet trong vùng càng, ngang tầm càng
      this.pickable = null;
      for (const p of this.pallets) {
        const w = p.root.position;
        if (canPickPallet(s, f.obj.depthM, { x: w.x, z: w.z, y: w.y })) {
          this.pickable = p;
          break;
        }
      }
      // Đang nâng càng lên khi có pallet trong vùng càng → xúc (gắn pallet vào giá càng, giữ nguyên vị trí thế giới)
      if (this.pickable && liftIn > 0 && f.carriage) {
        const p = this.pickable;
        // Nắn pallet thẳng theo hướng xe & vào giữa càng cho gọn
        const c = forkCenter(s, f.obj.depthM);
        p.root.position.set(c.x, p.root.position.y, c.z);
        p.root.rotation.y = s.rotY;
        p.root.updateMatrixWorld(true);
        f.carriage.attach(p.root);
        p.root.matrixAutoUpdate = true;
        p.root.matrixWorldAutoUpdate = true;
        this.carrying = p;
        this.pickable = null;
      }
      return;
    }
    // Đang chở: hạ càng → chạm sàn / tầng kệ thì nhả pallet ra
    if (liftIn < 0) {
      const p = this.carrying;
      const wp = new THREE.Vector3();
      p.root.getWorldPosition(wp);
      const bay = this.bayAt(wp.x, wp.z);
      const land = palletLanding(wp.y, bay ? bay.levels : []);
      if (land !== null) {
        const parent = f.root.parent;
        if (parent) parent.attach(p.root);
        p.root.position.y = land;
        p.root.rotation.x = 0;
        p.root.rotation.z = 0;
        p.root.updateMatrixWorld(true);
        this.movedPallets.set(p.id, { x: p.root.position.x, y: land, z: p.root.position.z, rotY: p.root.rotation.y });
        this.carrying = null;
      }
    }
  }

  /** Hướng dẫn trên giao diện */
  get hint(): ForkHint {
    if (!this.active) return null;
    if (this.carrying) return 'carry';
    if (this.pickable) return 'pick';
    return 'driving';
  }

  get liftMax() {
    return FORKLIFT_LIFT_MAX;
  }
}
