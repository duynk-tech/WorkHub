import * as THREE from 'three';
import { sharedMat } from './materials';

/**
 * Lá vàng rơi lả tả quanh cây đa (quán cà phê sân vườn): InstancedMesh ~40 lá, rơi chao lượn,
 * nằm trên nền vài giây rồi tái sinh trên tán. Rất nhẹ (1 draw call, cập nhật ma trận mỗi khung hình).
 */
function leafMaterial() {
  return sharedMat('amb:fallLeaf', () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, '#d9a441');
    g.addColorStop(1, '#a86b1f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 32, 14, 28, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,10,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(40, 6);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  });
}

interface Leaf {
  x: number;
  y: number;
  z: number;
  vy: number;
  phase: number;
  spin: number;
  rest: number;
}

export class FallingLeaves {
  readonly mesh: THREE.InstancedMesh;
  private leaves: Leaf[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(0.13, 0.13, 0.13);

  constructor(private cx: number, private cz: number, private radius: number, private top: number, count = 40) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMaterial(), count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < count; i++) this.leaves.push(this.spawn(Math.random() * top));
  }

  private spawn(y = this.top - Math.random() * 1.5): Leaf {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.radius;
    return { x: this.cx + Math.cos(a) * r, y, z: this.cz + Math.sin(a) * r, vy: 0.25 + Math.random() * 0.25, phase: Math.random() * 10, spin: 1 + Math.random() * 2, rest: 0 };
  }

  update(dt: number, t: number) {
    for (let i = 0; i < this.leaves.length; i++) {
      let L = this.leaves[i];
      if (L.y <= 0.015) {
        // Nằm trên nền một lúc rồi tái sinh trên tán
        L.rest += dt;
        if (L.rest > 6 + (i % 5)) L = this.leaves[i] = this.spawn();
        this.e.set(-Math.PI / 2, L.phase, 0);
      } else {
        L.y -= L.vy * dt;
        L.x += Math.sin(t * 1.3 + L.phase) * 0.35 * dt;
        L.z += Math.cos(t * 1.1 + L.phase) * 0.25 * dt;
        if (L.y < 0.015) L.y = 0.015;
        this.e.set(Math.sin(t * L.spin + L.phase) * 1.2, t * 0.8 + L.phase, Math.cos(t * L.spin) * 0.8);
      }
      this.q.setFromEuler(this.e);
      this.p.set(L.x, L.y, L.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

// ───────────── Hơi nóng bốc lên (ly nóng, chảo bánh, máy pha) ─────────────
let steamTex: THREE.CanvasTexture | null = null;
function steamTexture() {
  if (steamTex) return steamTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  steamTex = new THREE.CanvasTexture(c);
  return steamTex;
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  ox: number;
  oz: number;
}

/** Hơi nóng: mỗi điểm phát vài làn khói mỏng bay lên, nở dần rồi tan. Sprite mờ, rất nhẹ. */
export class SteamSystem {
  readonly group = new THREE.Group();
  private emitters: { x: number; y: number; z: number; size: number; puffs: Puff[] }[] = [];
  private mat = new THREE.SpriteMaterial({ map: steamTexture(), transparent: true, depthWrite: false, opacity: 0.5 });

  setEmitters(points: { x: number; y: number; z: number; size?: number }[]) {
    // Giữ nguyên emitter trùng vị trí để khói không nhảy lại từ đầu
    const next: typeof this.emitters = [];
    for (const p of points.slice(0, 24)) {
      const found = this.emitters.find((e) => Math.abs(e.x - p.x) < 0.01 && Math.abs(e.z - p.z) < 0.01);
      if (found) next.push(found);
      else {
        const size = p.size ?? 0.07;
        const puffs: Puff[] = [];
        for (let i = 0; i < 4; i++) {
          const sprite = new THREE.Sprite(this.mat.clone());
          sprite.scale.setScalar(size);
          this.group.add(sprite);
          puffs.push({ sprite, age: (i / 4) * 2.2, life: 2.2, ox: 0, oz: 0 });
        }
        next.push({ x: p.x, y: p.y, z: p.z, size, puffs });
      }
    }
    for (const e of this.emitters) {
      if (next.includes(e)) continue;
      for (const pf of e.puffs) {
        this.group.remove(pf.sprite);
        pf.sprite.material.dispose();
      }
    }
    this.emitters = next;
  }

  update(dt: number) {
    for (const e of this.emitters) {
      for (const pf of e.puffs) {
        pf.age += dt;
        if (pf.age > pf.life) {
          pf.age -= pf.life;
          pf.ox = (Math.random() - 0.5) * e.size * 0.6;
          pf.oz = (Math.random() - 0.5) * e.size * 0.6;
        }
        const t = pf.age / pf.life;
        pf.sprite.position.set(e.x + pf.ox + Math.sin(t * 6 + pf.oz * 40) * e.size * 0.4, e.y + t * e.size * 4.5, e.z + pf.oz);
        pf.sprite.scale.setScalar(e.size * (0.6 + t * 1.8));
        (pf.sprite.material as THREE.SpriteMaterial).opacity = 0.42 * Math.sin(Math.PI * t);
      }
    }
  }

  dispose() {
    this.setEmitters([]);
    this.mat.dispose();
  }
}

// ───────────── Lá khô rải trên nền quanh gốc cây ─────────────
export function buildGroundLeaves(cx: number, cz: number, radius: number, count = 140): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMaterial(), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.7) * radius;
    e.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * Math.PI * 2);
    q.setFromEuler(e);
    const s = 0.1 + Math.random() * 0.07;
    m.compose(new THREE.Vector3(cx + Math.cos(a) * r, 0.012 + Math.random() * 0.004, cz + Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  }
  mesh.receiveShadow = true;
  return mesh;
}

// ───────────── Đàn chim bay ngang trời ─────────────
export class Birds {
  readonly group = new THREE.Group();
  private birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; phase: number; off: THREE.Vector3 }[] = [];
  private t0 = Math.random() * 30;

  constructor(private span: number, count = 6) {
    const mat = new THREE.MeshBasicMaterial({ color: '#1f2937', side: THREE.DoubleSide });
    const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0.32, 0.02, -0.04), new THREE.Vector3(0, 0, -0.08)]);
    wing.computeVertexNormals();
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat);
      body.scale.set(0.7, 0.6, 1.6);
      const wl = new THREE.Mesh(wing, mat);
      const wr = new THREE.Mesh(wing, mat);
      wr.scale.x = -1;
      g.add(body, wl, wr);
      this.group.add(g);
      // Đội hình chữ V
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      this.birds.push({ g, wl, wr, phase: Math.random() * 6, off: new THREE.Vector3(k * 0.9, Math.random() * 0.4, Math.abs(k) * 0.9) });
    }
  }

  /** Mỗi ~40s bay qua 1 lần (vòng cung cao ~14m), giữa các lượt thì ẩn */
  update(dt: number, t: number) {
    const period = 40;
    const tt = (t + this.t0) % period;
    const flying = tt < 14;
    this.group.visible = flying;
    if (!flying) return;
    const u = tt / 14;
    const x = -this.span + u * this.span * 2;
    const z = -this.span * 0.3 + Math.sin(u * Math.PI) * this.span * 0.2;
    for (const b of this.birds) {
      b.g.position.set(x + b.off.x, 13 + Math.sin(u * Math.PI) * 2 + b.off.y, z + b.off.z);
      b.g.rotation.y = Math.PI / 2;
      const flap = Math.sin(t * 14 + b.phase) * 0.7;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
    }
    void dt;
  }
}
