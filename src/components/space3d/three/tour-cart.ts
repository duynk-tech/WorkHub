import * as THREE from 'three';
import { pathLengths, samplePath, showroomRing, tourPath, type ShowroomRing } from '@/lib/space-3d-tour';
import { M, box, cyl } from './props/kit';
import { sharedMat } from './materials';
import { createChibiAvatar, poseSit, type AnimatedAvatar } from './avatars';

/**
 * Xe điện chở khách tham quan khuôn viên showroom: đỗ ở trạm trước cửa ~20s, rồi chạy 1 vòng đường nội bộ
 * quanh nhà xưởng (giảm tốc khi vào cua) và quay về trạm. Khách lên/xuống khi xe đỗ ở trạm (phím F).
 * Chạy cục bộ ở mỗi máy.
 */
const WAIT_S = 20;
const CRUISE = 4.2;

function buildCart(): THREE.Group {
  const g = new THREE.Group();
  const white = sharedMat('cart:body', () => new THREE.MeshPhysicalMaterial({ color: '#f8fafc', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  const navy = sharedMat('cart:roof', () => new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.5 }));
  const dark = M.paint('#1f2328', 0.55);
  const seatMat = M.leather('#d6c7a8');
  // Khung gầm + thân (dài 3.4m, rộng 1.3m), mũi xe bo
  g.add(box(1.3, 0.28, 3.3, white, 0, 0.42, 0, 0.08));
  g.add(box(1.24, 0.5, 0.7, white, 0, 0.78, 1.3, 0.12)); // mũi xe / khoang đầu
  g.add(box(1.3, 0.06, 3.3, dark, 0, 0.27, 0)); // sườn đen
  // 3 hàng ghế: tài xế + 2 hàng khách
  for (const z of [0.75, -0.25, -1.2]) {
    g.add(box(1.16, 0.12, 0.55, seatMat, 0, 0.72, z, 0.04));
    g.add(box(1.16, 0.5, 0.1, seatMat, 0, 1.0, z - 0.27, 0.04));
  }
  // Vô lăng
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 20), dark);
  wheel.position.set(-0.3, 1.18, 1.05);
  wheel.rotation.x = -1.0;
  g.add(wheel);
  // Cột + mái che + kính chắn gió
  for (const sx of [-1, 1]) for (const z of [1.05, -1.5]) g.add(cyl(0.025, 0.025, 1.55, dark, sx * 0.6, 1.35, z, 8));
  g.add(box(1.4, 0.08, 2.85, navy, 0, 2.15, -0.22, 0.03));
  const glass = sharedMat('cart:glass', () => new THREE.MeshStandardMaterial({ color: '#cfe3f3', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
  const ws = box(1.2, 0.8, 0.02, glass, 0, 1.68, 1.08);
  ws.rotation.x = 0.12;
  g.add(ws);
  // Bánh xe nhỏ
  for (const sx of [-1, 1]) {
    for (const z of [1.15, -1.15]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 18), M.paint('#141414', 0.85));
      t.rotation.y = Math.PI / 2;
      t.position.set(sx * 0.62, 0.24, z);
      g.add(t);
      const hub = cyl(0.1, 0.1, 0.08, M.metal('#b8bec7', 0.3), sx * 0.62, 0.24, z, 14);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
    }
  }
  // Đèn pha + đèn hậu
  for (const sx of [-0.42, 0.42]) {
    g.add(box(0.16, 0.08, 0.03, M.glow('#fffbe6', 0.5, 1.8), sx, 0.82, 1.66, 0.02));
    g.add(box(0.12, 0.06, 0.03, M.glow('#ff3b30', 0.5, 1.6), sx, 0.5, -1.66, 0.02));
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

export class TourCart {
  readonly group = new THREE.Group();
  readonly ring: ShowroomRing;
  private pts: { x: number; z: number }[];
  private lens: number[];
  private total: number;
  /** Quãng đường đã chạy trong vòng hiện tại */
  private s = 0;
  private speed = 0;
  private waitLeft = WAIT_S;
  private driver: AnimatedAvatar;
  riding = false;

  constructor(widthM: number, depthM: number) {
    this.ring = showroomRing(widthM, depthM);
    this.pts = tourPath(this.ring);
    this.lens = pathLengths(this.pts);
    this.total = this.lens[this.lens.length - 1];
    this.group.add(buildCart());
    this.driver = createChibiAvatar({
      name: 'Anh Bình · Tài xế xe điện',
      config: { outfitStyle: 'polo', outfitColor: '#1e3a8a', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#111111', skinTone: '#d9a77f', hasGlasses: false },
      isStaff: true,
      npc: true,
    });
    this.driver.group.position.set(-0.3, 0, 0.72);
    this.group.add(this.driver.group);
    const p0 = samplePath(this.pts, this.lens, 0);
    this.group.rotation.y = p0.rotY;
    this.place();
  }

  /** Đang đỗ ở trạm (khách lên/xuống được) */
  get atStop(): boolean {
    return this.waitLeft > 0;
  }

  /** Giây còn lại trước khi xe chạy (đang đỗ) */
  get departIn(): number {
    return Math.ceil(this.waitLeft);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.group.position.x - x, this.group.position.z - z);
  }

  /** Điểm ngồi của khách (hàng ghế giữa, bên phải) — toạ độ thế giới */
  seatWorld(): { x: number; z: number; y: number; rotY: number } {
    const p = new THREE.Vector3(0.3, 0, -0.32).applyMatrix4(this.group.matrixWorld);
    return { x: p.x, z: p.z, y: 0.74, rotY: this.group.rotation.y };
  }

  /** Điểm xuống xe: lề đường phía nhà xưởng cạnh trạm */
  alightPoint(): { x: number; z: number } {
    return { x: this.ring.stop.x, z: this.ring.stop.z - this.ring.roadW / 2 - 0.9 };
  }

  private place() {
    const p = samplePath(this.pts, this.lens, this.s);
    this.group.position.set(p.x, 0, p.z);
    // Xoay mượt theo hướng đường
    const d = Math.atan2(Math.sin(p.rotY - this.group.rotation.y), Math.cos(p.rotY - this.group.rotation.y));
    this.group.rotation.y += d * 0.25;
    this.group.updateMatrixWorld(true);
  }

  /** Trả về độ dời (dx, dz) để camera của khách đang ngồi đi theo */
  update(dt: number, now: number): { dx: number; dz: number } {
    const bx = this.group.position.x;
    const bz = this.group.position.z;
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      this.speed = 0;
    } else {
      // Giảm tốc ở góc cua (đoạn cong) & khi sắp về trạm
      const ahead = samplePath(this.pts, this.lens, this.s + 4);
      const here = samplePath(this.pts, this.lens, this.s);
      const turn = Math.abs(Math.atan2(Math.sin(ahead.rotY - here.rotY), Math.cos(ahead.rotY - here.rotY)));
      const left = this.total - this.s;
      const target = Math.min(CRUISE * (turn > 0.2 ? 0.55 : 1), Math.max(0.8, left * 0.6));
      this.speed += (target - this.speed) * Math.min(1, dt * 1.6);
      this.s += this.speed * dt;
      if (this.s >= this.total) {
        this.s = 0;
        this.waitLeft = WAIT_S;
        this.speed = 0;
      }
    }
    this.place();
    // Tài xế ngồi cầm lái
    poseSit(this.driver, 0.74);
    this.driver.leftArm.rotation.x = -0.9;
    this.driver.rightArm.rotation.x = -0.9;
    this.driver.leftElbow.rotation.x = -0.5;
    this.driver.rightElbow.rotation.x = -0.5;
    void now;
    return { dx: this.group.position.x - bx, dz: this.group.position.z - bz };
  }
}
