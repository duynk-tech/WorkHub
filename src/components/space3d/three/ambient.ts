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
