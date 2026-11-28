import * as THREE from 'three';
import { carCorners, stepCar, type CarInput, type CarState } from '@/lib/space-3d-car';
import { M, box, cyl } from './props/kit';
import { registerEmissive, sharedMat } from './materials';

/**
 * Ô tô lái được trong khuôn viên showroom (kiểu game thế giới mở): đứng cạnh xe bấm F để vào ghế lái,
 * W ga · S phanh/lùi · A/D lái · Space phanh tay · F xuống xe (khi xe gần dừng). Va chạm dội nhẹ.
 * Chạy cục bộ ở máy người lái.
 */
export const CAR_W = 1.82;
export const CAR_L = 4.5;

interface CarRig {
  root: THREE.Group;
  /** Thân xe (chúi/nghiêng theo gia tốc — lốp đứng yên trên mặt đất) */
  body: THREE.Group;
  wheels: { spin: THREE.Object3D; steer: THREE.Object3D | null }[];
  brake: THREE.MeshStandardMaterial;
}

function buildCar(color: string): CarRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const paint = sharedMat(`car:paint:${color}`, () => {
    // Sơn sáng màu: ít kim loại hơn để không bị loá dưới nắng / bloom
    const light = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.7;
    return new THREE.MeshPhysicalMaterial({ color, roughness: light ? 0.32 : 0.22, metalness: light ? 0.1 : 0.45, clearcoat: light ? 0.6 : 1, clearcoatRoughness: 0.08 });
  });
  const trim = M.paint('#16181c', 0.5);
  const glass = sharedMat('car:glass', () => new THREE.MeshPhysicalMaterial({ color: '#1d2733', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.72, clearcoat: 1 }));
  // Thân dưới bo tròn + cản trước/sau
  body.add(box(CAR_W, 0.55, CAR_L, paint, 0, 0.62, 0, 0.16));
  body.add(box(CAR_W - 0.06, 0.18, 0.2, trim, 0, 0.42, CAR_L / 2 - 0.02, 0.06));
  body.add(box(CAR_W - 0.06, 0.18, 0.2, trim, 0, 0.42, -CAR_L / 2 + 0.02, 0.06));
  // Nắp capo vát + cốp sau
  const hood = box(CAR_W - 0.1, 0.12, 1.25, paint, 0, 0.9, 1.55, 0.08);
  hood.rotation.x = 0.07;
  body.add(hood);
  body.add(box(CAR_W - 0.1, 0.14, 0.9, paint, 0, 0.92, -1.75, 0.08));
  // Khoang cabin: kính quanh + mui
  const cabin = box(CAR_W - 0.22, 0.5, 2.1, glass, 0, 1.15, -0.25, 0.12);
  body.add(cabin);
  body.add(box(CAR_W - 0.24, 0.07, 1.55, paint, 0, 1.43, -0.3, 0.05)); // mui
  for (const sx of [-1, 1]) {
    // Cột A (nghiêng) + cột B + cột C
    const a = box(0.06, 0.6, 0.08, paint, sx * (CAR_W / 2 - 0.13), 1.14, 0.72);
    a.rotation.x = -0.55;
    body.add(a);
    body.add(box(0.06, 0.5, 0.08, trim, sx * (CAR_W / 2 - 0.12), 1.15, -0.2));
    const c = box(0.06, 0.55, 0.08, paint, sx * (CAR_W / 2 - 0.13), 1.14, -1.2);
    c.rotation.x = 0.5;
    body.add(c);
    // Gương chiếu hậu + tay nắm cửa
    body.add(box(0.12, 0.08, 0.14, paint, sx * (CAR_W / 2 + 0.06), 1.02, 0.62, 0.03));
    for (const z of [0.25, -0.75]) body.add(box(0.02, 0.03, 0.16, M.chrome(), sx * (CAR_W / 2 + 0.005), 0.82, z));
    // Viền kính hông (đường gân)
    body.add(box(0.012, 0.025, CAR_L - 0.5, M.chrome(), sx * (CAR_W / 2 + 0.003), 0.9, 0));
  }
  // Đèn pha + lưới tản nhiệt + đèn hậu (sáng hơn khi phanh)
  const head = M.glow('#fffaf0', 0.8, 2.4);
  for (const sx of [-1, 1]) body.add(box(0.42, 0.11, 0.05, head, sx * 0.58, 0.74, CAR_L / 2 - 0.01, 0.03));
  body.add(box(0.6, 0.12, 0.04, trim, 0, 0.66, CAR_L / 2 + 0.005, 0.02));
  const brake = new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ff2d2d', emissiveIntensity: 0.5, roughness: 0.4 });
  registerEmissive({ mat: brake, day: 0.5, night: 1.2, mode: 'emissive' });
  for (const sx of [-1, 1]) body.add(box(0.44, 0.1, 0.05, brake, sx * 0.6, 0.8, -CAR_L / 2 + 0.01, 0.03));
  // Biển số
  for (const z of [CAR_L / 2 + 0.03, -CAR_L / 2 - 0.03]) body.add(box(0.52, 0.12, 0.01, M.paint('#f4f4f5', 0.5), 0, 0.5, z));
  root.add(body);
  // Bánh xe: lốp + mâm; bánh trước có khớp lái
  const wheels: CarRig['wheels'] = [];
  const tireMat = M.paint('#121212', 0.85);
  const rimMat = M.metal('#c0c6ce', 0.3);
  for (const [sx, z, front] of [[-1, 1.42, true], [1, 1.42, true], [-1, -1.38, false], [1, -1.38, false]] as [number, number, boolean][]) {
    const steer = new THREE.Group();
    steer.position.set(sx * (CAR_W / 2 - 0.12), 0.34, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 10, 24), tireMat);
    tire.rotation.y = Math.PI / 2;
    spin.add(tire);
    const rim = cyl(0.2, 0.2, 0.16, rimMat, 0, 0, 0, 20);
    rim.rotation.z = Math.PI / 2;
    spin.add(rim);
    for (let i = 0; i < 5; i++) {
      const sp = box(0.17, 0.035, 0.24, M.paint('#3b4048', 0.5), 0, 0, 0);
      sp.rotation.x = (i / 5) * Math.PI;
      spin.add(sp);
    }
    steer.add(spin);
    root.add(steer);
    wheels.push({ spin, steer: front ? steer : null });
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  // Vệt sáng đèn pha trên mặt đường (chỉ hiện ban đêm — độ mờ theo ngày/đêm, không tốn đèn thật)
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7), headPoolMat());
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.02, CAR_L / 2 + 3.4);
  pool.renderOrder = 2;
  root.add(pool);
  // Bóng mềm dưới gầm (ăn khớp xe với mặt đất cả khi bóng đổ thưa)
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W + 0.5, CAR_L + 0.5), underShadowMat());
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.012;
  root.add(ao);
  return { root, body, wheels, brake };
}

function radialTex(key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 128, h = 256): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.name = key;
  return t;
}

function headPoolMat(): THREE.MeshBasicMaterial {
  return sharedMat('car:headPool', () => {
    const tex = radialTex('car:headPool', (g, w, h) => {
      // Hai chùm đèn hình nón loe ra phía trước (gốc ở cạnh dưới ảnh = mũi xe)
      for (const cx of [w * 0.3, w * 0.7]) {
        const gr = g.createRadialGradient(cx, h, 4, cx, h * 0.55, h * 0.6);
        gr.addColorStop(0, 'rgba(255,240,200,0.95)');
        gr.addColorStop(0.5, 'rgba(255,232,180,0.35)');
        gr.addColorStop(1, 'rgba(255,230,170,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    registerEmissive({ mat: m, day: 0, night: 0.75, mode: 'opacity' });
    return m;
  });
}

function underShadowMat(): THREE.MeshBasicMaterial {
  return sharedMat('car:under', () => {
    const tex = radialTex(
      'car:under',
      (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0.75)');
        gr.addColorStop(0.6, 'rgba(0,0,0,0.45)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      },
      64,
      128,
    );
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 });
  });
}

/** Vệt lốp khi phanh gấp / phanh tay / cua gắt: 1 InstancedMesh vòng tròn (tối đa 240 vệt, cũ nhất bị ghi đè) */
class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly scl = new THREE.Vector3(1, 1, 1);
  private readonly pos = new THREE.Vector3();
  constructor(readonly max = 240) {
    const geo = new THREE.PlaneGeometry(0.2, 0.5);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#111111', transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }
  add(x: number, z: number, rotY: number) {
    this.q.setFromAxisAngle(this.up, rotY);
    this.pos.set(x, 0.006, z);
    this.m.compose(this.pos, this.q, this.scl);
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface CarEntry {
  rig: CarRig;
  state: CarState;
  /** Chúi (gia tốc dọc) & nghiêng (gia tốc ngang) thân xe — làm mượt */
  pitch: number;
  roll: number;
}

export class CarDriver {
  readonly group = new THREE.Group();
  readonly cars: CarEntry[] = [];
  active: CarEntry | null = null;
  private skids = new SkidMarks();
  private skidAcc = 0;
  /** Đang trượt lốp (để phát tiếng rít) */
  skidding = false;

  constructor(spots: { x: number; z: number; rotY: number; color: string }[]) {
    for (const s of spots) {
      const rig = buildCar(s.color);
      const state: CarState = { x: s.x, z: s.z, rotY: s.rotY, speed: 0, steer: 0 };
      const entry = { rig, state, pitch: 0, roll: 0 };
      this.cars.push(entry);
      this.group.add(rig.root);
      this.apply(entry, 0, false);
    }
    this.group.add(this.skids.mesh);
  }

  nearest(px: number, pz: number): CarEntry | null {
    let best: CarEntry | null = null;
    let bd = 3.2;
    for (const c of this.cars) {
      const d = Math.hypot(c.state.x - px, c.state.z - pz);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  enter(c: CarEntry) {
    this.active = c;
  }

  /** Xuống xe khi gần dừng: điểm đứng cạnh cửa tài xế (bên trái) */
  exit(): { x: number; z: number; rotY: number } | null {
    const c = this.active;
    if (!c || Math.abs(c.state.speed) > 1.2) return null;
    c.state.speed = 0;
    c.pitch = 0;
    c.roll = 0;
    c.rig.body.rotation.set(0, 0, 0);
    c.rig.body.position.y = 0;
    this.active = null;
    this.skidding = false;
    this.apply(c, 0, false);
    const side = -(CAR_W / 2 + 0.6);
    const cs = Math.cos(c.state.rotY);
    const sn = Math.sin(c.state.rotY);
    return { x: c.state.x + side * cs + 0.3 * sn, z: c.state.z - side * sn + 0.3 * cs, rotY: c.state.rotY };
  }

  /** Ghế tài xế (bên trái, hơi lùi sau tâm xe) */
  seat(c: CarEntry): { x: number; z: number; y: number; rotY: number } {
    const lx = -0.38;
    const lz = -0.25;
    const cs = Math.cos(c.state.rotY);
    const sn = Math.sin(c.state.rotY);
    return { x: c.state.x + lx * cs + lz * sn, z: c.state.z - lx * sn + lz * cs, y: 0.55, rotY: c.state.rotY };
  }

  private apply(c: CarEntry, dt: number, braking: boolean) {
    c.rig.root.position.set(c.state.x, 0, c.state.z);
    c.rig.root.rotation.y = c.state.rotY;
    for (const w of c.rig.wheels) {
      w.spin.rotation.x += (c.state.speed * dt) / 0.36;
      if (w.steer) w.steer.rotation.y = -c.state.steer * 0.5;
    }
    c.rig.brake.emissiveIntensity = braking ? 2.6 : 0.5;
  }

  /**
   * Lái 1 khung hình. `free(x, z)` = điểm còn trong vùng lái được (ngoài nhà xưởng, trong khuôn viên).
   * Trả về độ dời để camera đi theo + ghế tài xế.
   */
  update(
    dt: number,
    input: CarInput,
    free: (x: number, z: number) => boolean,
  ): { dx: number; dz: number; seat: { x: number; z: number; y: number; rotY: number }; speed: number; hit: boolean; throttle: number } | null {
    const c = this.active;
    if (!c) return null;
    const prev = c.state;
    let next = stepCar(prev, input, dt);
    let hit = false;
    if (carCorners(next, CAR_W, CAR_L).some(([x, z]) => !free(x, z))) {
      // Va chạm: dội ngược nhẹ, mất đà
      next = { ...prev, speed: -prev.speed * 0.25, steer: next.steer };
      hit = Math.abs(prev.speed) > 2.5;
    }
    c.state = next;
    const braking = input.handbrake || (input.throttle < 0 && prev.speed > 0.3) || next.speed < -0.1;
    // Thân xe chúi khi phanh / ngửa khi tăng tốc, nghiêng ra ngoài khi cua (gia tốc ngang = v·ω)
    if (dt > 0) {
      const ax = (next.speed - prev.speed) / dt;
      const yaw = Math.atan2(Math.sin(next.rotY - prev.rotY), Math.cos(next.rotY - prev.rotY)) / dt;
      const lat = next.speed * yaw;
      const k = 1 - Math.exp(-dt * 7);
      c.pitch += (Math.max(-0.05, Math.min(0.05, ax * 0.006)) - c.pitch) * k;
      c.roll += (Math.max(-0.06, Math.min(0.06, lat * 0.004)) - c.roll) * k;
      if (hit) c.pitch = Math.sign(prev.speed) * 0.07;
      c.rig.body.rotation.x = -c.pitch;
      c.rig.body.rotation.z = -c.roll;
      c.rig.body.position.y = -Math.abs(c.pitch) * 0.6;
    }
    // Vệt lốp: phanh tay / phanh gấp / cua gắt ở tốc độ cao → in vệt ở 2 bánh sau
    const v = Math.abs(next.speed);
    const slide = v > 3.5 && (input.handbrake || (braking && v > 8 && input.throttle < 0) || Math.abs(next.steer) > 0.75 && v > 10);
    this.skidding = slide;
    if (slide) {
      this.skidAcc += v * dt;
      if (this.skidAcc > 0.42) {
        this.skidAcc = 0;
        const cs = Math.cos(next.rotY);
        const sn = Math.sin(next.rotY);
        for (const lx of [-(CAR_W / 2 - 0.12), CAR_W / 2 - 0.12]) {
          const lz = -1.38;
          this.skids.add(next.x + lx * cs + lz * sn, next.z - lx * sn + lz * cs, next.rotY);
        }
      }
    }
    this.apply(c, dt, braking);
    return { dx: next.x - prev.x, dz: next.z - prev.z, seat: this.seat(c), speed: next.speed, hit, throttle: input.throttle };
  }
}
