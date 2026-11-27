import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpaceObject } from '@/lib/space-3d-types';
import { applyWindSway, registerEmissive, sharedMat } from '../materials';
import { M, box, cyl, hashId, lathe, seeded, sphere } from './kit';

/**
 * Quán cà phê sân vườn miền Tây: cổng gỗ bảng hiệu, cây đa giăng lưới & đèn dây, bàn gỗ nguyên tấm,
 * xuồng ba lá, chuối, lối đá, quầy bánh quê, xe đò, ao rau muống…
 * Mọi vật thể: gốc = tâm đáy, mặt trước = +Z cục bộ.
 */

// ───────────── Texture canvas (cache theo khoá) ─────────────
const texCache = new Map<string, THREE.CanvasTexture>();
function gTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  texCache.set(key, t);
  return t;
}

const SERIF = '"Times New Roman", "Noto Serif", "Georgia", serif';

/** Vân gỗ me tây / gỗ lim đỏ: vòng vân lượn + tối dần về mép */
function slabWoodTex(seed: number, w = 1024, h = 512) {
  return gTex(`slab:${seed}:${w}`, w, h, (ctx) => {
    const r = seeded(seed);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9c4f22');
    g.addColorStop(0.5, '#c46a2e');
    g.addColorStop(1, '#8e4520');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 70; i++) {
      const y0 = r() * h;
      ctx.strokeStyle = `rgba(${70 + r() * 40},${30 + r() * 20},10,${0.12 + r() * 0.2})`;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = y0 + Math.sin(x / (60 + r() * 40) + i) * (8 + r() * 10) + Math.sin(x / 13 + i * 3) * 1.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Mắt gỗ
    for (let k = 0; k < 4; k++) {
      const cx = r() * w;
      const cy = r() * h;
      for (let ring = 1; ring < 9; ring++) {
        ctx.strokeStyle = `rgba(60,25,8,${0.25 - ring * 0.02})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, ring * 7, ring * 3.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(40,15,5,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  });
}

const slabMat = (seed: number) =>
  sharedMat(`g:slab:${seed}`, () => new THREE.MeshPhysicalMaterial({ map: slabWoodTex(seed), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.25 }));
const barkMat = () => sharedMat('g:bark', () => new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 0.95 }));
const timberMat = () =>
  sharedMat('g:timber', () =>
    new THREE.MeshStandardMaterial({
      map: gTex('timber', 128, 512, (ctx, w, h) => {
        ctx.fillStyle = '#7d6c5a';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = `rgba(${40 + Math.random() * 60},${35 + Math.random() * 40},${25 + Math.random() * 30},0.35)`;
          ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h);
        }
      }),
      roughness: 0.95,
    }),
  );
const steelBlack = () => M.metal('#1c1c1c', 0.55);

// ───────────── Thẻ lá instanced (gió lay nhẹ) ─────────────
type CardKind = 'banana' | 'ficus' | 'spinach';
function cardTex(kind: CardKind) {
  return gTex(`card:${kind}`, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (kind === 'banana') {
      // Lá chuối dài, gân sống giữa, mép rách so le
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#3f8a2e');
      g.addColorStop(0.5, '#6cbf45');
      g.addColorStop(1, '#3f8a2e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(128, 255);
      ctx.bezierCurveTo(30, 220, 22, 40, 128, 2);
      ctx.bezierCurveTo(234, 40, 226, 220, 128, 255);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const y = 30 + Math.random() * 200;
        ctx.beginPath();
        ctx.moveTo(i % 2 ? 0 : 256, y);
        ctx.lineTo(128 + (i % 2 ? -14 : 14), y + 18);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(220,240,170,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(128, 255);
      ctx.lineTo(128, 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,70,20,0.25)';
      ctx.lineWidth = 1;
      for (let y = 20; y < 250; y += 7) {
        ctx.beginPath();
        ctx.moveTo(128, y + 6);
        ctx.lineTo(40, y - 8);
        ctx.moveTo(128, y + 6);
        ctx.lineTo(216, y - 8);
        ctx.stroke();
      }
    } else if (kind === 'ficus') {
      // Chùm lá đa nhỏ dày (1 thẻ = cả chùm lá)
      for (let i = 0; i < 70; i++) {
        const x = 30 + Math.random() * 196;
        const y = 30 + Math.random() * 196;
        if ((x - 128) ** 2 + (y - 128) ** 2 > 105 ** 2) continue;
        const tone = 60 + Math.random() * 70;
        ctx.fillStyle = `rgb(${tone * 0.45},${tone + 40},${tone * 0.4})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 + Math.random() * 5, 16 + Math.random() * 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Rau muống: lá mũi mác
      ctx.fillStyle = '#4f9a3a';
      for (let i = 0; i < 9; i++) {
        ctx.save();
        ctx.translate(128, 128);
        ctx.rotate((i / 9) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -60, 16, 58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  });
}
function cardMat(kind: CardKind) {
  return sharedMat(`g:card:${kind}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: cardTex(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
    applyWindSway(m);
    return m;
  });
}
const cardGeo = new Map<string, THREE.BufferGeometry>();
function getCardGeo(kind: CardKind) {
  const hit = cardGeo.get(kind);
  if (hit) return hit;
  const g = new THREE.PlaneGeometry(1, 1, 2, 6);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const x = p.getX(i);
    p.setZ(i, (kind === 'banana' ? -0.22 : -0.05) * y * y + Math.abs(x) * 0.1);
  }
  g.computeVertexNormals();
  cardGeo.set(kind, g);
  return g;
}
interface Card {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll?: number;
  sx: number;
  sy: number;
}
function cards(kind: CardKind, list: Card[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(getCardGeo(kind), cardMat(kind), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  list.forEach((c, i) => {
    e.set(c.pitch, c.yaw, c.roll ?? 0, 'YXZ');
    q.setFromEuler(e);
    m.compose(c.pos, q, new THREE.Vector3(c.sx, c.sy, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  return mesh;
}

// ───────────── Đèn lồng Hội An ─────────────
function lanternMat(color: string) {
  return sharedMat(`g:lantern:${color}`, () => {
    const map = gTex(`lantern:${color}`, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      // Hoa văn: hoa & sóng nước
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = ['#f8fafc', '#fde047', '#1e3a8a', '#16a34a'][i % 4];
        for (let p = 0; p < 5; p++) {
          ctx.beginPath();
          ctx.ellipse(x + Math.cos((p / 5) * 6.28) * 7, y + Math.sin((p / 5) * 6.28) * 7, 5, 3, (p / 5) * 6.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.7, emissive: '#ff9440', emissiveIntensity: 0.15, side: THREE.DoubleSide });
    registerEmissive({ mat: m, day: 0.12, night: 1.4, mode: 'emissive' });
    return m;
  });
}
function lantern(color = '#c2410c', scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = lathe(
    [[0.01, 0], [0.07, 0.02], [0.13, 0.1], [0.15, 0.2], [0.13, 0.3], [0.07, 0.38], [0.01, 0.4]].map(([r, y]) => [r * scale, y * scale]) as [number, number][],
    lanternMat(color),
    18,
  );
  const gold = M.metal('#c9a227', 0.35);
  g.add(body);
  g.add(cyl(0.05 * scale, 0.05 * scale, 0.025 * scale, gold, 0, 0.4 * scale, 0, 12));
  g.add(cyl(0.05 * scale, 0.05 * scale, 0.025 * scale, gold, 0, -0.005, 0, 12));
  g.add(cyl(0.012 * scale, 0.004 * scale, 0.22 * scale, M.paint('#dc2626', 0.7), 0, -0.13 * scale, 0, 6)); // tua rua
  return g;
}

// ───────────── Bảng hiệu gỗ me tây ─────────────
function signTextTex(title: string, sub: string, tagline: string) {
  return gTex(`signtxt2:${title}|${sub}|${tagline}`, 1600, 640, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    /** Chữ sơn tay kiểu bảng hiệu xưa: bóng đổ nâu + viền nâu sẫm ngoài + viền kem trong + ruột màu */
    const painted = (text: string, x: number, y: number, font: string, size: number, fill: string) => {
      ctx.font = font;
      ctx.fillStyle = 'rgba(40,12,2,0.55)';
      ctx.fillText(text, x + size * 0.05, y + size * 0.06);
      ctx.strokeStyle = '#4a1d0a';
      ctx.lineWidth = size * 0.16;
      ctx.strokeText(text, x, y);
      ctx.strokeStyle = '#f6dc95';
      ctx.lineWidth = size * 0.085;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
    };
    // Tên quán: chữ serif đậm cao, giãn chữ nhẹ
    const t = title.toUpperCase();
    let size = 250;
    const fontOf = (sz: number) => `800 ${sz}px ${SERIF}`;
    ctx.font = fontOf(size);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '6px';
    while (ctx.measureText(t).width > w * 0.82 && size > 90) {
      size -= 8;
      ctx.font = fontOf(size);
    }
    painted(t, w / 2, h * 0.33, fontOf(size), size, '#c9302c');
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
    if (sub) {
      painted(sub.toUpperCase(), w / 2, h * 0.63, `800 104px ${SERIF}`, 104, '#2a8068');
      // Hoa văn gió xoáy 2 bên chữ CAFÉ
      ctx.strokeStyle = '#f6dc95';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        const x0 = w / 2 + sgn * 215;
        for (let k = 0; k < 3; k++) {
          const y = h * 0.6 + (k - 1) * 18;
          const len = 70 - k * 12;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + sgn * len, y);
          ctx.arc(x0 + sgn * len, y - 9, 9, Math.PI / 2, sgn > 0 ? -Math.PI / 2 : Math.PI * 1.5, sgn < 0);
          ctx.stroke();
        }
      }
    }
    if (tagline) {
      ctx.font = `italic 700 92px ${SERIF}`;
      const tw = ctx.measureText(tagline).width;
      painted(tagline, w / 2, h * 0.87, `italic 700 92px ${SERIF}`, 92, '#f2c14e');
      // Mũi tên trang trí 2 đầu
      ctx.fillStyle = '#f6dc95';
      for (const sgn of [-1, 1]) {
        const x = w / 2 + sgn * (tw / 2 + 50);
        ctx.beginPath();
        ctx.moveTo(x - sgn * 34, h * 0.87 - 14);
        ctx.lineTo(x + sgn * 6, h * 0.87);
        ctx.lineTo(x - sgn * 34, h * 0.87 + 14);
        ctx.lineTo(x - sgn * 22, h * 0.87);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}
function liveEdgeShape(w: number, h: number, seed: number, wobble = 0.08): THREE.Shape {
  const r = seeded(seed);
  const s = new THREE.Shape();
  const n = 26;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -w / 2 + t * w;
    pts.push(new THREE.Vector2(x, h / 2 + (Math.sin(t * 7 + seed) * 0.5 + (r() - 0.5)) * h * wobble));
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const x = -w / 2 + t * w;
    pts.push(new THREE.Vector2(x, -h / 2 + (Math.sin(t * 5 + seed * 2) * 0.5 + (r() - 0.5)) * h * wobble));
  }
  s.setFromPoints(pts);
  return s;
}
/**
 * Viền "đám mây": khung bầu dục vuông vức (superellipse) + các múi tròn phồng ra đều quanh mép,
 * giữa 2 múi là khe lõm như nét vẽ mây. inset < 1 → đường viền trang trí bên trong.
 */
export function cloudOutline(w: number, h: number, inset = 1, samples = 220): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const lobesTop = 7;
  const a = (w / 2) * 0.9 * inset;
  const b = (h / 2) * 0.8 * inset;
  const amp = Math.min(w, h) * 0.1 * inset;
  for (let i = 0; i < samples; i++) {
    const th = (i / samples) * Math.PI * 2;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // Superellipse n=4 → khung chữ nhật bo tròn
    const x = a * Math.sign(c) * Math.abs(c) ** 0.5;
    const y = b * Math.sign(sn) * Math.abs(sn) ** 0.5;
    // Pháp tuyến gần đúng → đẩy ra theo múi |sin| (múi tròn, khe nhọn)
    const nx = Math.sign(c) * Math.abs(c) ** 0.5 / a;
    const ny = Math.sign(sn) * Math.abs(sn) ** 0.5 / b;
    const nl = Math.hypot(nx, ny) || 1;
    const lobe = Math.abs(Math.sin(th * lobesTop * 2 + 0.4));
    const bump = amp * (0.35 + 0.65 * Math.sqrt(lobe));
    pts.push(new THREE.Vector2(x + (nx / nl) * bump, y + (ny / nl) * bump));
  }
  return pts;
}
function signShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.setFromPoints(cloudOutline(w, h));
  return s;
}
/** Cạnh bảng hiệu riêng (không dùng chung với bàn) để làm mờ bảng mà không ảnh hưởng bàn */
const signEdgeMat = () => sharedMat('g:signEdge', () => new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.9, transparent: true }));
const signWoodMat = (sw: number, sh: number) =>
  sharedMat(`g:signWood:${sw.toFixed(2)}x${sh.toFixed(2)}`, () => {
    const t = gTex(`signWood:${sw.toFixed(2)}x${sh.toFixed(2)}`, 1024, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#c35f22');
      g.addColorStop(0.5, '#d9772f');
      g.addColorStop(1, '#b4521c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Vân xoáy loang (gỗ me tây cắt lát)
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = `rgba(${110 + Math.random() * 40},${40 + Math.random() * 20},10,${0.12 + Math.random() * 0.18})`;
        ctx.lineWidth = 1 + Math.random() * 2.5;
        const y0 = Math.random() * h;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = y0 + Math.sin(x / 90 + i) * 26 + Math.sin(x / 31 + i * 2) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const v = ctx.createRadialGradient(w * 0.55, h * 0.5, h * 0.15, w * 0.5, h * 0.5, w * 0.6);
      v.addColorStop(0, 'rgba(255,190,120,0.18)');
      v.addColorStop(1, 'rgba(60,20,5,0.5)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      // Viền mây trang trí: nét nâu sẫm + nét kem chạy song song mép bảng (toạ độ bảng → pixel theo UV)
      const toPx = (p: THREE.Vector2) => [(p.x / sw + 0.5) * w, (1 - (p.y / sh + 0.5)) * h] as const;
      for (const [inset, color, lw] of [[0.9, '#4a1d0a', 14], [0.9, '#f6dc95', 6], [0.84, '#f6dc95', 3]] as [number, string, number][]) {
        const pts = cloudOutline(sw, sh, inset);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = toPx(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    });
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2, transparent: true });
  });

/** Tấm gỗ cắt mép tự nhiên: mặt trên/dưới vân gỗ, cạnh vỏ cây sẫm. UV mặt khớp kích thước tấm. */
function liveEdgeSlab(w: number, d: number, thick: number, seed: number, wobble = 0.08, sign = false): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(sign ? signShape(w, d) : liveEdgeShape(w, d, seed, wobble), { depth: thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
  // UV mặt phẳng: (x, y) hình → [0..1]
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / d + 0.5);
  const mesh = new THREE.Mesh(geo, [sign ? signWoodMat(w, d) : slabMat(seed % 3), sign ? signEdgeMat() : barkMat()]);
  // Mesh nhiều vật liệu không gộp được → giữ nguyên (mergeStaticGroup bỏ qua mảng vật liệu)
  mesh.userData.noMerge = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Mép dưới bảng hiệu (m) — cao tự nhiên như cổng thật; khi bảng chắn camera → nhân vật thì bảng tự mờ (canvas) */
const SIGN_CLEARANCE = 2.55;

export function buildGardenGate(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const w = o.widthM;
  // Bảng hiệu mây chiếm ~74% bề ngang cổng
  const sw = Math.min(w * 0.74, 4.2);
  const sh = sw * 0.4;
  // Cột đủ cao để treo bảng với mép dưới ≥ 2.55m (người đi qua thoải mái)
  const h = Math.max(o.heightM, SIGN_CLEARANCE + sh + 0.3);
  const timber = timberMat();
  // 2 cột gỗ thô + xà ngang
  for (const s of [-1, 1]) {
    const post = cyl(0.11, 0.14, h, timber, s * (w / 2 - 0.3), h / 2, 0, 9);
    post.rotation.z = s * 0.015;
    g.add(post);
    // Rọ đá gabion 2 bên chân cổng
    const gab = box(0.9, 1.1, 0.9, gabionMat(), s * (w / 2 + 0.25), 0.55, 0);
    g.add(gab);
  }
  // Xà ngang là khúc gỗ thô, đua ra ngoài 2 cột như ảnh thật
  const beam = cyl(0.09, 0.11, w + 1.4, timber, 0, h - 0.25, 0, 9);
  beam.rotation.z = Math.PI / 2 + 0.02;
  g.add(beam);
  // Dây leo xanh quấn 2 cột (thẻ lá chùm nhỏ)
  const vineCards: Card[] = [];
  const vr = seeded(hashId(o.id) + 7);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const y = 0.3 + vr() * (h - 0.6);
      const a = vr() * Math.PI * 2;
      vineCards.push({
        pos: new THREE.Vector3(s * (w / 2 - 0.3) + Math.cos(a) * 0.13, y, Math.sin(a) * 0.13),
        yaw: a,
        pitch: -0.3 - vr() * 0.6,
        sx: 0.35 + vr() * 0.2,
        sy: 0.35 + vr() * 0.2,
      });
    }
  }
  g.add(cards('ficus', vineCards));
  // Bảng hiệu gỗ me tây viền đám mây treo giữa
  const plank = liveEdgeSlab(sw, sh, 0.07, hashId(o.id) % 97, 0.11, true);
  // Tấm dày 0.07 (+ vát 0.008 mỗi mặt) → căn giữa: mặt trước z ≈ +0.043, mặt sau ≈ -0.043
  plank.position.set(0, h - 0.25 - sh / 2 - 0.02, -0.035);
  plank.userData.fadeOnOcclude = true;
  g.add(plank);
  const txtMat = sharedMat(`g:signtxt2:${o.label}|${o.subLabel}`, () =>
    new THREE.MeshStandardMaterial({
      map: signTextTex(o.label || 'Xởi Lởi', 'Café', o.subLabel || 'Xởi lởi trời cho'),
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  for (const side of [1, -1]) {
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(sw * 0.72, sh * 0.72), txtMat);
    txt.position.set(0, plank.position.y, side > 0 ? 0.05 : -0.05);
    if (side < 0) txt.rotation.y = Math.PI;
    txt.userData.noMerge = true;
    txt.userData.fadeOnOcclude = true;
    g.add(txt);
  }
  // Dây thừng buộc bảng vào xà
  const rope = M.paint('#c8b48a', 0.95);
  for (const s of [-1, 1]) {
    const rx = s * sw * 0.42;
    g.add(cyl(0.012, 0.012, 0.22, rope, rx, h - 0.25 - 0.1, 0, 6));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14), rope);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(rx, h - 0.25, 0);
    g.add(coil);
  }
  // Đèn lồng Hội An 2 bên (hoa văn đỏ / nhiều màu)
  for (const s of [-1, 1]) {
    const l = lantern(s < 0 ? '#c2410c' : '#be123c', 1.15);
    l.position.set(s * (w / 2 - 0.55), h - 0.95, 0);
    g.add(l);
    g.add(cyl(0.004, 0.004, 0.45, M.black(), s * (w / 2 - 0.55), h - 0.42, 0, 4));
  }
  return g;
}

function gabionMat() {
  return sharedMat('g:gabion', () =>
    new THREE.MeshStandardMaterial({
      map: gTex('gabion', 256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#6b6a64';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const v = 120 + Math.random() * 90;
          ctx.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
          ctx.beginPath();
          ctx.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 16, 10 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,40,40,0.5)';
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(200,205,210,0.75)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y <= h; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }),
      roughness: 0.9,
    }),
  );
}

export function buildGabion(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  g.add(box(o.widthM, o.heightM, o.depthM, gabionMat(), 0, o.heightM / 2, 0));
  return g;
}

export function buildLantern(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const top = o.heightM;
  const l = lantern(o.color ?? '#c2410c', Math.max(0.6, o.widthM / 0.3));
  l.position.y = top - 0.75;
  g.add(l);
  g.add(cyl(0.004, 0.004, 0.35, M.black(), 0, top - 0.17, 0, 4));
  return g;
}

// ───────────── Bàn gỗ nguyên tấm & ghế nhựa đen ─────────────
export function buildLiveEdgeTable(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const thick = 0.15;
  const slab = liveEdgeSlab(w, d, thick, hashId(o.id) % 97, 0.07);
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = h - thick;
  g.add(slab);
  // Khung sắt đen dạng chân chữ nhật, giằng dọc
  const steel = steelBlack();
  const legX = w / 2 - 0.35;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(box(0.07, h - thick, 0.07, steel, sx * legX, (h - thick) / 2, sz * (d / 2 - 0.22)));
    g.add(box(0.06, 0.06, d - 0.4, steel, sx * legX, h - thick - 0.05, 0));
    g.add(box(0.06, 0.06, d - 0.4, steel, sx * legX, 0.12, 0));
  }
  g.add(box(2 * legX, 0.07, 0.07, steel, 0, h - thick - 0.06, 0));
  // Đồ trên bàn như quán thật: hộp khăn giấy, kệ menu mica, hũ đường — mỗi ~2.3m một bộ (tránh chỗ chậu hoa)
  const tissue = M.paint('#f5f5f4', 0.6);
  const acrylic = sharedMat('g:acrylic', () => new THREE.MeshPhysicalMaterial({ color: '#f8fafc', transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  const menuCard = M.paint('#7c2d12', 0.7);
  const jar = M.glass();
  const sugar = M.paint('#fafaf9', 0.9);
  const sets = Math.max(1, Math.floor(w / 2.3));
  for (let i = 0; i < sets; i++) {
    const x = -w / 2 + (w / sets) * (i + 0.5) + 0.35;
    g.add(box(0.13, 0.06, 0.09, tissue, x, h + 0.03, -0.05, 0.008));
    g.add(box(0.02, 0.005, 0.05, M.paint('#d6d3d1', 0.6), x, h + 0.062, -0.05)); // khe rút khăn
    const stand = box(0.09, 0.13, 0.008, acrylic, x + 0.15, h + 0.065, 0.02);
    stand.rotation.x = -0.18;
    g.add(stand);
    const card = box(0.08, 0.11, 0.004, menuCard, x + 0.15, h + 0.065, 0.026);
    card.rotation.x = -0.18;
    g.add(card);
    g.add(cyl(0.028, 0.028, 0.07, jar, x - 0.14, h + 0.035, 0.03, 12));
    g.add(cyl(0.025, 0.025, 0.04, sugar, x - 0.14, h + 0.022, 0.03, 12));
    g.add(cyl(0.03, 0.03, 0.012, M.metal('#a8a29e', 0.3), x - 0.14, h + 0.074, 0.03, 12));
  }
  // Chậu hoa hồng môn trang trí giữa bàn (bàn dài ≥ 3m)
  if (w >= 3) {
    const spots = w >= 6 ? [-w * 0.25, w * 0.25] : [0];
    for (const [i, x] of spots.entries()) {
      const pot = buildAnthuriumPot(hashId(o.id) + i);
      pot.position.set(x, h, 0);
      g.add(pot);
    }
  }
  return g;
}

// ───────────── Chậu hồng môn để bàn ─────────────
/** Phiến hình tim (lá / mo hoa): khía ở gốc toạ độ, phiến kéo dài theo +Y, cong lòng máng hai mép & rủ đầu chóp */
function heartBlade(len: number, wid: number, cup: number, droop: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const hw = wid / 2;
  sh.moveTo(0, 0);
  sh.bezierCurveTo(-hw * 0.5, -len * 0.12, -hw * 1.05, len * 0.05, -hw, len * 0.3);
  sh.bezierCurveTo(-hw * 0.9, len * 0.62, -hw * 0.35, len * 0.88, 0, len);
  sh.bezierCurveTo(hw * 0.35, len * 0.88, hw * 0.9, len * 0.62, hw, len * 0.3);
  sh.bezierCurveTo(hw * 1.05, len * 0.05, hw * 0.5, len * 0.12, 0, 0);
  const geo = new THREE.ShapeGeometry(sh, 10);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, -cup * (x / hw) ** 2 * wid + droop * (y / len) ** 2 * len);
  }
  geo.computeVertexNormals();
  return geo;
}
let anthGeo: { leaf: THREE.BufferGeometry; spathe: THREE.BufferGeometry; spadix: THREE.BufferGeometry; stem: THREE.BufferGeometry } | null = null;
function anthuriumGeo() {
  anthGeo ??= {
    leaf: heartBlade(0.12, 0.075, 0.12, 0.18),
    spathe: heartBlade(0.075, 0.062, 0.05, 0.06),
    spadix: new THREE.ConeGeometry(0.006, 0.05, 8).translate(0, 0.025, 0),
    stem: new THREE.CylinderGeometry(0.0028, 0.0035, 1, 5).translate(0, 0.5, 0),
  };
  return anthGeo;
}
/** Chậu sứ hồng môn: vành chậu, đất, lá tim xanh bóng trên cuống, hoa mo đỏ + nhụy vàng. Gốc = đáy chậu. */
function buildAnthuriumPot(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(seed);
  const G = anthuriumGeo();
  const potH = 0.12;
  // Chậu sứ men trắng ngà, thành hơi loe, gờ miệng tròn
  const pot = lathe(
    [
      [0.001, 0],
      [0.05, 0],
      [0.054, 0.006],
      [0.064, potH - 0.012],
      [0.07, potH - 0.006],
      [0.071, potH],
      [0.066, potH + 0.004],
      [0.062, potH - 0.004],
    ],
    M.ceramic('#ece6da'),
    28,
  );
  g.add(pot);
  const soil = cyl(0.061, 0.061, 0.006, sharedMat('g:potSoil', () => new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 })), 0, potH - 0.01, 0, 20);
  soil.castShadow = false;
  g.add(soil);
  const leafMat = sharedMat('g:anthLeaf2', () => new THREE.MeshPhysicalMaterial({ color: '#1f5a26', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.4, side: THREE.DoubleSide }));
  const spatheMat = sharedMat('g:anthSpathe', () => new THREE.MeshPhysicalMaterial({ color: '#d0102f', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }));
  const spadixMat = sharedMat('g:anthSpadix', () => new THREE.MeshStandardMaterial({ color: '#f1d88a', roughness: 0.7 }));
  const stemMat = sharedMat('g:anthStem', () => new THREE.MeshStandardMaterial({ color: '#3f7a35', roughness: 0.6 }));
  const up = new THREE.Vector3(0, 1, 0);
  /** Cuống từ đất tới điểm gắn phiến + phiến hướng ra ngoài theo góc a, ngửa pitch */
  const add = (blade: THREE.BufferGeometry, mat: THREE.Material, a: number, out: number, height: number, pitch: number, flower: boolean) => {
    const base = new THREE.Vector3(Math.cos(a) * 0.012, potH - 0.007, Math.sin(a) * 0.012);
    const tip = new THREE.Vector3(Math.cos(a) * out, potH + height, Math.sin(a) * out);
    const dir = tip.clone().sub(base);
    const stem = new THREE.Mesh(G.stem, stemMat);
    stem.position.copy(base);
    stem.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    stem.scale.set(1, dir.length(), 1);
    g.add(stem);
    const holder = new THREE.Group();
    holder.position.copy(tip);
    holder.rotation.order = 'YXZ';
    holder.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    holder.rotation.x = pitch;
    const m = new THREE.Mesh(blade, mat);
    m.castShadow = true;
    holder.add(m);
    if (flower) {
      const sp = new THREE.Mesh(G.spadix, spadixMat);
      sp.position.set(0, 0.006, 0.003);
      sp.rotation.x = 0.55;
      holder.add(sp);
    }
    g.add(holder);
  };
  const off = r() * Math.PI * 2;
  // 7 lá xoè quanh chậu, cao thấp so le
  for (let i = 0; i < 7; i++) {
    const a = off + (i / 7) * Math.PI * 2 + (r() - 0.5) * 0.4;
    add(G.leaf, leafMat, a, 0.05 + r() * 0.025, 0.07 + r() * 0.07, 0.75 + r() * 0.45, false);
  }
  // 3 hoa vươn cao hơn lá
  for (let i = 0; i < 3; i++) {
    const a = off + 0.45 + (i / 3) * Math.PI * 2 + (r() - 0.5) * 0.5;
    add(G.spathe, spatheMat, a, 0.035 + r() * 0.02, 0.17 + r() * 0.06, 0.5 + r() * 0.35, true);
  }
  return g;
}

export function buildStackChair(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const color = o.color ?? '#1f2022';
  const plastic = sharedMat(`g:plastic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));
  const w = o.widthM;
  const seatY = 0.45;
  g.add(box(w, 0.035, o.depthM * 0.9, plastic, 0, seatY, 0.02, 0.015));
  // Lưng ghế cong có lỗ thoáng (dải ngang)
  for (let i = 0; i < 5; i++) {
    const y = seatY + 0.1 + i * 0.075;
    const bar = box(w * 0.92, 0.045, 0.025, plastic, 0, y, -o.depthM / 2 + 0.02 - i * 0.008, 0.01);
    bar.rotation.x = -0.12;
    g.add(bar);
  }
  for (const sx of [-1, 1]) {
    const back = box(0.035, 0.42, 0.03, plastic, sx * (w / 2 - 0.02), seatY + 0.21, -o.depthM / 2 + 0.01);
    back.rotation.x = -0.12;
    g.add(back);
    for (const sz of [-1, 1]) {
      const leg = box(0.03, seatY, 0.035, plastic, sx * (w / 2 - 0.03), seatY / 2, sz * (o.depthM / 2 - 0.05));
      leg.rotation.z = sx * 0.05;
      leg.rotation.x = -sz * 0.05;
      g.add(leg);
    }
  }
  return g;
}

// ───────────── Cây đa cổ thụ & lưới che + đèn dây ─────────────
export function buildBanyan(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const H = o.heightM;
  const spread = o.widthM * 3.4; // tán rộng hơn nhiều so với gốc (gốc mới là phần chắn đường)
  const bark = sharedMat('g:banyanBark', () => new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.95 }));
  // Thân chính gồm nhiều thân phụ xoắn vào nhau + rễ bạnh
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    const pts = [
      new THREE.Vector3(Math.cos(a) * o.widthM * 0.45, 0, Math.sin(a) * o.widthM * 0.45),
      new THREE.Vector3(Math.cos(a + 0.4) * 0.35, H * 0.25, Math.sin(a + 0.4) * 0.35),
      new THREE.Vector3(Math.cos(a + 0.8) * 0.3, H * 0.45, Math.sin(a + 0.8) * 0.3),
      new THREE.Vector3(Math.cos(a) * spread * 0.18, H * 0.62, Math.sin(a) * spread * 0.18),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.16 + r() * 0.08, 7, false), bark));
  }
  // Cành lớn tỏa ra
  const branchTips: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.5;
    const len = spread * (0.32 + r() * 0.18);
    const y0 = H * (0.5 + r() * 0.1);
    const tip = new THREE.Vector3(Math.cos(a) * len, y0 + 0.6 + r() * 1.2, Math.sin(a) * len);
    branchTips.push(tip);
    const pts = [new THREE.Vector3(0, y0, 0), new THREE.Vector3(Math.cos(a) * len * 0.5, y0 + 0.5, Math.sin(a) * len * 0.5), tip];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.09 + r() * 0.04, 6, false), bark));
  }
  // Rễ phụ buông rủ (đặc trưng cây đa)
  const rootMat = sharedMat('g:aerialRoot', () => new THREE.MeshStandardMaterial({ color: '#7a6a55', roughness: 0.9 }));
  for (let i = 0; i < 120; i++) {
    const tip = branchTips[i % branchTips.length];
    const t = 0.35 + r() * 0.6;
    const x = tip.x * t + (r() - 0.5) * 0.6;
    const z = tip.z * t + (r() - 0.5) * 0.6;
    const top = H * 0.55 + (tip.y - H * 0.55) * t;
    const len = 0.8 + r() * Math.min(3.2, top - 1.9);
    if (len <= 0.2) continue;
    g.add(cyl(0.008 + r() * 0.012, 0.004, len, rootMat, x, top - len / 2, z, 4));
  }
  // Tán lá: thẻ chùm lá nhỏ phân bố trên các nhánh
  const list: Card[] = [];
  for (const tip of branchTips) {
    for (let k = 0; k < 56; k++) {
      const a = r() * Math.PI * 2;
      const rr = r() * spread * 0.22;
      list.push({
        pos: new THREE.Vector3(tip.x * (0.4 + r() * 0.7) + Math.cos(a) * rr, tip.y + (r() - 0.3) * 1.6, tip.z * (0.4 + r() * 0.7) + Math.sin(a) * rr),
        yaw: r() * Math.PI * 2,
        pitch: -0.4 - r() * 1.2,
        roll: r() - 0.5,
        sx: 1.3 + r() * 0.8,
        sy: 1.3 + r() * 0.8,
      });
    }
  }
  g.add(cards('ficus', list));
  return g;
}

function netMat() {
  return sharedMat('g:net', () =>
    new THREE.MeshStandardMaterial({
      map: gTex(
        'net',
        128,
        128,
        (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(240,240,235,0.9)';
          ctx.lineWidth = 1;
          for (let x = 0; x <= w; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = 0; y <= h; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }
        },
        [90, 90],
      ),
      color: '#f5f5f0',
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.9,
    }),
  );
}

/** Lưới che nắng trắng căng võng + dây đèn bóng tròn vàng ấm (đặc trưng sân quán) */
export function buildShadeNet(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const r = seeded(hashId(o.id));
  const geo = new THREE.PlaneGeometry(w, d, 30, 24);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const z = p.getZ(i) / (d / 2);
    const sag = 0.9 * (1 - x * x) * (1 - z * z) * 0.8 + Math.sin(x * 7 + z * 3) * 0.08 + Math.sin(z * 9) * 0.05;
    // Mép lưới buông rủ xuống như rèm (dày nếp gấp) — giống lưới phủ cây đa ngoài đời
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const curtain = edge > 0.86 ? ((edge - 0.86) / 0.14) ** 2 * (1.1 + 0.35 * Math.sin(x * 23 + z * 17)) : 0;
    p.setY(i, h - sag - curtain);
  }
  geo.computeVertexNormals();
  const net = new THREE.Mesh(geo, netMat());
  net.castShadow = false;
  net.userData.noMerge = true;
  g.add(net);
  // Cột sắt ở 4 góc
  const steel = steelBlack();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.035, 0.04, h, steel, sx * (w / 2), h / 2, sz * (d / 2), 8));
  // Dây đèn: võng giữa các góc + 2 đường chéo
  const bulb = M.glow('#ffd58a', 0.9, 4);
  const wire = M.black();
  const runs: [THREE.Vector3, THREE.Vector3][] = [];
  const c = (sx: number, sz: number) => new THREE.Vector3(sx * (w / 2), h - 0.3, sz * (d / 2));
  runs.push([c(-1, -1), c(1, -1)], [c(1, -1), c(1, 1)], [c(1, 1), c(-1, 1)], [c(-1, 1), c(-1, -1)], [c(-1, -1), c(1, 1)], [c(-1, 1), c(1, -1)]);
  for (const [a, b] of runs) {
    const len = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.35 + r() * 0.2;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 4, false), wire));
    const n = Math.floor(len / 0.75);
    for (let i = 1; i < n; i++) {
      const pt = curve.getPoint(i / n);
      g.add(cyl(0.003, 0.003, 0.06, wire, pt.x, pt.y - 0.03, pt.z, 4));
      g.add(sphere(0.032, bulb, pt.x, pt.y - 0.09, pt.z));
    }
  }
  // Nắng xuyên lá loang lổ trên nền dưới lưới (canvas trượt texture chậm → như lá đung đưa)
  const dapple = new THREE.Mesh(new THREE.PlaneGeometry(w, d), dappleMat(w, d));
  dapple.rotation.x = -Math.PI / 2;
  dapple.position.y = 0.018;
  dapple.userData = { noMerge: true, dapple: true };
  g.add(dapple);
  g.userData.noShadowCast = true;
  return g;
}

function dappleMat(w: number, d: number) {
  return sharedMat(`g:dapple:${w.toFixed(1)}x${d.toFixed(1)}`, () => {
    const t = gTex('dapple', 512, 512, (ctx, cw, ch) => {
      ctx.clearRect(0, 0, cw, ch);
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * cw;
        const y = Math.random() * ch;
        const r = 6 + Math.random() * 26;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,236,170,0.55)');
        gr.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }).clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 5, d / 5);
    t.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    // Ban đêm tắt nắng (đèn dây thay thế)
    registerEmissive({ mat: m, day: 1, night: 0, mode: 'color' });
    return m;
  });
}

// ───────────── Xuồng ba lá ─────────────
function hullGeo(L: number, W: number, H: number): THREE.BufferGeometry {
  const N = 28;
  const K = 14;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1;
    const au = Math.abs(u);
    const halfW = (W / 2) * Math.pow(Math.max(0, 1 - au ** 2.2), 0.6);
    const depth = H * (1 - au ** 3) * 0.85 + 0.01;
    const sheer = H + 0.22 * au ** 4; // mũi & lái cong vểnh
    for (let j = 0; j <= K; j++) {
      const th = (j / K) * Math.PI;
      pos.push(u * (L / 2), sheer - depth * Math.sin(th), halfW * Math.cos(th));
      uv.push(i / N * 4, j / K);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < K; j++) {
      const a = i * (K + 1) + j;
      const b = a + K + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function plankMat() {
  return sharedMat('g:boatPlank', () =>
    new THREE.MeshStandardMaterial({
      map: gTex('boatPlank', 512, 128, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#a85a2a');
        g.addColorStop(1, '#c8743a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(70,30,10,0.55)';
        ctx.lineWidth = 2;
        for (let y = 0; y <= h; y += h / 5) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let i = 0; i < 60; i++) {
          ctx.strokeStyle = `rgba(90,40,15,${Math.random() * 0.25})`;
          const y = Math.random() * h;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y + (Math.random() - 0.5) * 6);
          ctx.stroke();
        }
      }),
      roughness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
}
export function buildSampan(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const L = o.widthM;
  const W = o.depthM * 0.85;
  const standH = 0.32;
  const hull = new THREE.Mesh(hullGeo(L, W, o.heightM - standH - 0.1), plankMat());
  hull.position.y = standH;
  g.add(hull);
  const wood = M.wood('#9a5428');
  const hh = o.heightM - standH - 0.1;
  // Đà ngang (chỗ ngồi) + mép mạn
  for (const u of [-0.45, 0, 0.45]) {
    const halfW = (W / 2) * Math.pow(1 - Math.abs(u) ** 2.2, 0.6);
    g.add(box(0.12, 0.03, halfW * 1.9, wood, u * (L / 2), standH + hh * 0.75, 0));
  }
  // Giá đỡ gỗ hình nêm
  const stand = M.wood('#b8753f');
  for (const sx of [-1, 1]) g.add(box(0.22, standH + 0.05, W * 1.1, stand, sx * L * 0.25, (standH + 0.05) / 2, 0, 0.01));
  return g;
}

// ───────────── Chuối, đá, lối đi, sỏi ─────────────
export function buildBanana(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const stemMat = sharedMat('g:bananaStem', () => new THREE.MeshStandardMaterial({ color: '#6f8a3a', roughness: 0.7 }));
  const n = 3 + Math.round(o.widthM * 1.2);
  const list: Card[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * o.widthM * 0.3;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const sh = o.heightM * (0.45 + r() * 0.3);
    g.add(cyl(0.07, 0.11, sh, stemMat, x, sh / 2, z, 8));
    const leavesN = 6 + Math.round(r() * 3);
    for (let k = 0; k < leavesN; k++) {
      const yaw = (k / leavesN) * Math.PI * 2 + r() * 0.5;
      const len = o.heightM * (0.42 + r() * 0.2);
      list.push({ pos: new THREE.Vector3(x, sh - 0.05, z), yaw, pitch: -0.5 - r() * 0.9, roll: (r() - 0.5) * 0.5, sx: len * 0.32, sy: len });
    }
  }
  g.add(cards('banana', list));
  return g;
}

const stoneMat = (tone: number) =>
  sharedMat(`g:stone2:${tone}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.09, 0.05, 0.5 + tone * 0.06), roughness: 0.92, vertexColors: true }));
/**
 * Tảng đá LIỀN KHỐI: đỉnh dùng chung (mergeVertices) nên bóp méo không làm hở mặt;
 * nhấp nhô bằng tổng sóng mượt theo hướng (cùng đỉnh → cùng độ lệch), đáy cắt phẳng để đặt lún xuống đất,
 * màu loang: kẽ lõm tối hơn, mặt trên ngả rêu xanh, lốm đốm hạt khoáng.
 * Gốc toạ độ = mặt đất; đỉnh đá cao ≈ 0.75·size·flat.
 */
function rock(r: () => number, size: number, flat = 1, moss = 0.5): THREE.Mesh {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const a = r() * 10, b = r() * 10, c = r() * 10, e = r() * 10;
  const sx = 0.85 + r() * 0.35;
  const sz = 0.8 + r() * 0.35;
  const sy = (0.62 + r() * 0.2) * flat;
  const lump = new Float32Array(p.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // Khối lớn (mặt vát) + gờ vừa + sần nhỏ
    const n =
      0.16 * Math.sin(2.1 * v.x + a) * Math.sin(1.9 * v.z + b) +
      0.1 * Math.sin(3.7 * v.y + c + 2.3 * v.x) +
      0.06 * Math.sin(6.3 * v.z + e) * Math.sin(5.1 * v.x + a) +
      0.025 * Math.sin(13 * v.x + 11 * v.y + b) * Math.sin(12 * v.z + c);
    lump[i] = n;
    const k = 1 + n;
    let y = v.y * k * sy;
    const floor = -0.18 * sy;
    if (y < floor) y = floor + (y - floor) * 0.12; // đáy gần phẳng
    p.setXYZ(i, v.x * k * sx * size, (y + 0.18 * sy) * size, v.z * k * sz * size);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const mossOn = r() < moss;
  for (let i = 0; i < p.count; i++) {
    // Kẽ lõm (lump âm) tối, gờ lồi sáng; hạt khoáng lốm đốm
    const speck = Math.sin(i * 12.9898 + a * 78.233) * 43758.5453;
    const grain = (speck - Math.floor(speck) - 0.5) * 0.12;
    const l = 0.82 + lump[i] * 1.1 + grain;
    const ny = nrm.getY(i);
    let rr = l, gg = l * 0.99, bb = l * 0.95;
    // Chân đá ẩm, sẫm màu đất
    const h = p.getY(i) / (size * 0.75 * flat + 1e-6);
    if (h < 0.18) {
      const t = 1 - h / 0.18;
      rr *= 1 - 0.3 * t;
      gg *= 1 - 0.32 * t;
      bb *= 1 - 0.36 * t;
    }
    if (mossOn && ny > 0.55) {
      const t = Math.min(1, (ny - 0.55) * 2.6) * (0.55 + grain * 3);
      rr = rr * (1 - t) + 0.36 * t;
      gg = gg * (1 - t) + 0.46 * t;
      bb = bb * (1 - t) + 0.22 * t;
    }
    col[i * 3] = rr;
    col[i * 3 + 1] = gg;
    col[i * 3 + 2] = bb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, stoneMat(Math.floor(r() * 3)));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function buildBoulder(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const n = o.widthM > 0.9 ? 3 : 1;
  // Đá chính + 2 tảng nhỏ tựa sát chân (chồng mép lên nhau, lún nhẹ xuống đất) → cụm đá liền khối
  const main = o.heightM / 0.75;
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? main : main * (0.42 + r() * 0.16);
    const m = rock(r, Math.min(s, o.widthM * 0.55), i === 0 ? 1 : 0.85);
    if (i > 0) {
      const ang = r() * Math.PI * 2;
      const dist = main * 0.62 + s * 0.35;
      m.position.set(Math.cos(ang) * Math.min(dist, o.widthM * 0.5), -0.02, Math.sin(ang) * Math.min(dist, o.depthM * 0.5));
    } else m.position.y = -0.03;
    m.rotation.y = r() * 6;
    g.add(m);
  }
  // Sỏi vụn rải quanh chân đá
  for (let i = 0; i < 6; i++) {
    const ang = r() * Math.PI * 2;
    const m = rock(r, 0.035 + r() * 0.04, 0.7, 0);
    m.castShadow = false;
    m.position.set(Math.cos(ang) * (main * 0.75 + r() * 0.25), -0.005, Math.sin(ang) * (main * 0.7 + r() * 0.25));
    g.add(m);
  }
  return g;
}

function grassMat() {
  return sharedMat('g:grass', () =>
    new THREE.MeshStandardMaterial({
      map: gTex(
        'grassStrip',
        256,
        256,
        (ctx, w, h) => {
          ctx.fillStyle = '#5c8f34';
          ctx.fillRect(0, 0, w, h);
          for (let i = 0; i < 2600; i++) {
            const v = Math.random();
            ctx.strokeStyle = v > 0.97 ? '#e0703a' : `rgba(${60 + v * 70},${110 + v * 80},${30 + v * 30},0.8)`;
            const x = Math.random() * w;
            const y = Math.random() * h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 6);
            ctx.stroke();
          }
        },
        [1, 1],
      ),
      roughness: 0.95,
    }),
  );
}
function gravelMat(w: number, d: number) {
  return sharedMat(`g:gravel:${w}x${d}`, () => {
    const t = gTex('gravel', 256, 256, (ctx, cw, ch) => {
      ctx.fillStyle = '#8b8d90';
      ctx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 2200; i++) {
        const v = 100 + Math.random() * 110;
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * cw, Math.random() * ch, 1.5 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }).clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 1.2, d / 1.2);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  });
}

/** Lối đi cỏ + đá bước chân, viền đá cuội (phẳng, đi qua được) */
export function buildSteppingPath(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(hashId(o.id));
  const { widthM: w, depthM: d } = o;
  const gm = grassMat().clone();
  gm.map = gm.map!.clone();
  gm.map.wrapS = gm.map.wrapT = THREE.RepeatWrapping;
  gm.map.repeat.set(w / 1.5, d / 1.5);
  gm.map.needsUpdate = true;
  gm.userData = {};
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(w, d), gm);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.012;
  g.add(grass);
  const slab = sharedMat('g:stepStone', () => new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.85 }));
  for (let z = -d / 2 + 0.35; z < d / 2 - 0.2; z += 0.62) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26 + r() * 0.06, 0.28, 0.04, 7), slab);
    s.scale.set(1 + r() * 0.3, 1, 0.8 + r() * 0.3);
    s.position.set((r() - 0.5) * 0.12, 0.025, z);
    s.rotation.y = r() * 3;
    g.add(s);
  }
  for (const sx of [-1, 1]) {
    for (let z = -d / 2 + 0.3; z < d / 2; z += 0.9 + r() * 0.8) {
      const m = rock(r, 0.1 + r() * 0.1, 0.8);
      m.position.set(sx * (w / 2 - 0.05), -0.01, z);
      g.add(m);
    }
  }
  return g;
}

function pebbleMat(w: number, d: number) {
  return sharedMat(`g:pebble:${w}x${d}`, () => {
    const t = gTex('pebble', 256, 256, (ctx, cw, ch) => {
      ctx.fillStyle = '#2f2c29';
      ctx.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 900; i++) {
        const v = 55 + Math.random() * 70;
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * cw, Math.random() * ch, 3 + Math.random() * 5, 2.5 + Math.random() * 3.5, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(Math.random() * cw, Math.random() * ch, 2, 1);
      }
    }).clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 1.4, d / 1.4);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  });
}

export function buildGravelBed(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const pebble = o.variant === 'pebble';
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(o.widthM, o.depthM), pebble ? pebbleMat(o.widthM, o.depthM) : gravelMat(o.widthM, o.depthM));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.01;
  g.add(bed);
  // Sỏi 3D nổi trên nền (1 InstancedMesh / nền): ~30 viên/m², tối đa 2000 (texture nền đã có sỏi nhỏ, viên 3D chỉ tạo khối nổi)
  const rr = seeded(hashId(o.id) + 11);
  const n = Math.min(2000, Math.round(o.widthM * o.depthM * (pebble ? 26 : 30)));
  if (n > 0) {
    const stoneGeo = new THREE.IcosahedronGeometry(1, 0);
    const stones = new THREE.InstancedMesh(
      stoneGeo,
      sharedMat(`g:pebble3d:${pebble ? 'd' : 'g'}`, () => new THREE.MeshStandardMaterial({ color: pebble ? '#4a4642' : '#9a9b9c', roughness: 0.75, flatShading: true })),
      n,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const sz = (pebble ? 0.022 : 0.016) + rr() * (pebble ? 0.022 : 0.018);
      e.set(rr() * 3, rr() * 3, rr() * 3);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3((rr() - 0.5) * o.widthM, 0.012 + sz * 0.35, (rr() - 0.5) * o.depthM),
        q,
        new THREE.Vector3(sz * (1 + rr() * 0.5), sz * 0.55, sz * (1 + rr() * 0.4)),
      );
      stones.setMatrixAt(i, m);
      const v = pebble ? 0.22 + rr() * 0.25 : 0.5 + rr() * 0.3;
      stones.setColorAt(i, col.setRGB(v, v * 0.98, v * 0.95));
    }
    stones.receiveShadow = true;
    stones.userData.noMerge = true;
    g.add(stones);
  }
  if (pebble) {
    // Viền bó vỉa bê tông quanh ô sỏi đen (như dưới bàn gỗ cây đa)
    const curb = M.paint('#c9c5bc', 0.85);
    g.add(box(o.widthM + 0.24, 0.04, 0.12, curb, 0, 0.02, o.depthM / 2 + 0.06), box(o.widthM + 0.24, 0.04, 0.12, curb, 0, 0.02, -o.depthM / 2 - 0.06));
    g.add(box(0.12, 0.04, o.depthM, curb, o.widthM / 2 + 0.06, 0.02, 0), box(0.12, 0.04, o.depthM, curb, -o.widthM / 2 - 0.06, 0.02, 0));
  }
  return g;
}

// ───────────── Dù che, hàng rào, mái tôn ─────────────
export function buildPatioUmbrella(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const fabric = sharedMat(`g:umbrella:${o.color}`, () => new THREE.MeshStandardMaterial({ color: o.color ?? '#8a6a55', roughness: 0.85, side: THREE.DoubleSide }));
  g.add(box(0.6, 0.08, 0.6, M.paint('#9ca3af', 0.8), 0, 0.04, 0));
  g.add(cyl(0.03, 0.03, h, M.metal('#2b2b2b', 0.4), 0, h / 2, 0, 10));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(w * 0.71, 0.55, 4, 1, true), fabric);
  canopy.rotation.y = Math.PI / 4;
  canopy.position.y = h - 0.2;
  g.add(canopy);
  // Diềm vải quanh mép
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const flap = box(w, 0.18, 0.01, fabric, Math.sin(a) * (w / 2), h - 0.55, Math.cos(a) * (w / 2));
    flap.rotation.y = a;
    g.add(flap);
  }
  return g;
}

export function buildWoodFence(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const weathered = sharedMat(`g:fence:${o.color}`, () => new THREE.MeshStandardMaterial({ color: o.color ?? '#8f8a80', roughness: 0.92 }));
  const { widthM: w, heightM: h } = o;
  for (const y of [h * 0.25, h * 0.75]) g.add(box(w, 0.06, 0.03, weathered, 0, y, -0.02));
  for (let x = -w / 2 + 0.06; x <= w / 2; x += 0.14) {
    const pk = box(0.09, h - Math.random() * 0.06, 0.02, weathered, x, h / 2, 0.01);
    g.add(pk);
  }
  return g;
}

/** Mái tôn sẫm trên khung sắt (che khu bàn / nhà kính) — đi bên dưới được */
export function buildMetalRoof(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const roofMat = sharedMat('g:roofSheet', () =>
    new THREE.MeshStandardMaterial({
      map: gTex(
        'roofSheet',
        64,
        256,
        (ctx, cw, ch) => {
          for (let x = 0; x < cw; x++) {
            const v = 50 + 25 * Math.sin((x / cw) * Math.PI * 2 * 4);
            ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
            ctx.fillRect(x, 0, 1, ch);
          }
        },
        [w / 0.8, 1],
      ),
      metalness: 0.4,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  const roof = box(w + 0.4, 0.04, d + 0.4, roofMat, 0, h, 0);
  roof.rotation.x = 0.06;
  roof.userData.roof = true;
  g.add(roof);
  const steel = M.metal('#3a3d42', 0.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, h, 0.08, steel, sx * (w / 2), h / 2, sz * (d / 2)));
  for (const sz of [-1, 1]) g.add(box(w, 0.1, 0.08, steel, 0, h - 0.08, sz * (d / 2)));
  // Dây bóng đèn dọc mái hiên trước
  const bulb = M.glow('#ffd58a', 0.8, 3.5);
  for (let x = -w / 2 + 0.4; x < w / 2; x += 0.8) g.add(sphere(0.03, bulb, x, h - 0.28 - Math.sin(((x + w / 2) / w) * Math.PI) * 0.12, d / 2));
  // Giỏ trầu bà treo dọc hiên, dây lá rủ dài
  const rr = seeded(hashId(o.id) + 3);
  const vines: Card[] = [];
  const basket = M.wood('#a8743f');
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.6) {
    const bx = x + 0.4;
    const by = h - 0.7;
    const bz = d / 2 + 0.05;
    g.add(lathe([[0, 0], [0.12, 0.02], [0.16, 0.14], [0, 0.14]], basket, 14)).children.at(-1)!.position.set(bx, by, bz);
    g.add(cyl(0.004, 0.004, 0.5, M.black(), bx, by + 0.4, bz, 4));
    for (let k = 0; k < 8; k++) vines.push({ pos: new THREE.Vector3(bx + (rr() - 0.5) * 0.2, by + 0.14, bz + (rr() - 0.5) * 0.2), yaw: rr() * 6.28, pitch: -0.4 - rr() * 0.5, sx: 0.28, sy: 0.28 });
    for (let strand = 0; strand < 4; strand++) {
      const sx = bx + (rr() - 0.5) * 0.24;
      const len = 0.5 + rr() * 0.8;
      for (let t = 0; t < len; t += 0.14) vines.push({ pos: new THREE.Vector3(sx + Math.sin(t * 6) * 0.02, by - t, bz + (rr() - 0.5) * 0.1), yaw: rr() * 0.6, pitch: 0.2, roll: rr() - 0.5, sx: 0.15, sy: 0.15 });
    }
  }
  if (vines.length) g.add(cards('ficus', vines));
  // Đèn tre bầu dục treo hiên (như dãy nhà kính trong ảnh)
  const bamboo = sharedMat('g:bambooLamp', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#d8b27a', roughness: 0.8, emissive: '#ffb15c', emissiveIntensity: 0.1, side: THREE.DoubleSide });
    registerEmissive({ mat: m, day: 0.1, night: 1.2, mode: 'emissive' });
    return m;
  });
  for (let x = -w / 2 + 1.2; x < w / 2 - 0.6; x += 2.4) {
    const lamp = lathe([[0.01, 0], [0.1, 0.04], [0.14, 0.16], [0.11, 0.3], [0.03, 0.36]], bamboo, 14);
    lamp.position.set(x, h - 0.85, d / 2 - 0.2);
    lamp.rotation.z = Math.PI / 2;
    g.add(lamp);
    g.add(cyl(0.004, 0.004, 0.5, M.black(), x, h - 0.35, d / 2 - 0.2, 4));
  }
  return g;
}

// ───────────── Quầy bánh quê ─────────────
function tileMat() {
  return sharedMat('g:roofTile', () =>
    new THREE.MeshStandardMaterial({
      map: gTex(
        'roofTile',
        256,
        256,
        (ctx, w, h) => {
          ctx.fillStyle = '#9a3f22';
          ctx.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 32) {
            for (let x = 0; x < w; x += 32) {
              const gr = ctx.createLinearGradient(x, y, x, y + 32);
              gr.addColorStop(0, '#b7522c');
              gr.addColorStop(1, '#7a2f18');
              ctx.fillStyle = gr;
              ctx.beginPath();
              ctx.arc(x + 16, y + 6, 16, 0, Math.PI);
              ctx.fill();
            }
          }
        },
        [3, 2],
      ),
      roughness: 0.8,
    }),
  );
}
function charredWoodMat() {
  return sharedMat('g:charred', () =>
    new THREE.MeshStandardMaterial({
      map: gTex('charred', 256, 256, (ctx, w, h) => {
        for (let x = 0; x < w; x += 22) {
          const v = 30 + Math.random() * 22;
          ctx.fillStyle = `rgb(${v + 8},${v},${v - 6})`;
          ctx.fillRect(x, 0, 21, h);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x + 21, 0, 1, h);
          for (let i = 0; i < 18; i++) {
            ctx.fillStyle = `rgba(90,70,50,${Math.random() * 0.3})`;
            ctx.fillRect(x + Math.random() * 20, Math.random() * h, 1, 10 + Math.random() * 30);
          }
        }
      }),
      roughness: 0.85,
    }),
  );
}
function riceFieldTex() {
  return gTex('riceField', 1024, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#cfe3ee');
    sky.addColorStop(1, '#eef3ea');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5b7f3a';
    ctx.fillRect(0, h * 0.52, w, h * 0.06);
    for (let i = 0; i < 26; i++) {
      // Hàng dừa xa
      const x = (i / 26) * w + Math.random() * 20;
      const ty = h * (0.3 + Math.random() * 0.12);
      ctx.strokeStyle = '#4a5a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.55);
      ctx.lineTo(x + 6, ty);
      ctx.stroke();
      ctx.fillStyle = '#3f5f2f';
      for (let f = 0; f < 6; f++) {
        ctx.save();
        ctx.translate(x + 6, ty);
        ctx.rotate((f / 6) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(16, 0, 18, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    const field = ctx.createLinearGradient(0, h * 0.55, 0, h);
    field.addColorStop(0, '#9cbf4a');
    field.addColorStop(1, '#c9d96a');
    ctx.fillStyle = field;
    ctx.fillRect(0, h * 0.56, w, h * 0.44);
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = `rgba(110,150,40,${Math.random() * 0.5})`;
      const x = Math.random() * w;
      const y = h * 0.56 + Math.random() * h * 0.44;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y - 4);
      ctx.stroke();
    }
  });
}
function boardTex(title: string, sub: string) {
  return gTex(`board:${title}|${sub}`, 1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2b2420';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 3);
      ctx.lineTo(w, y + Math.random() * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#efe6d2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 96px ${SERIF}`;
    ctx.fillText(title, w / 2, h * 0.4);
    ctx.font = `600 40px ${SERIF}`;
    ctx.fillText(sub.toUpperCase(), w / 2, h * 0.8);
  });
}
export function buildBanhQueKiosk(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const charred = charredWoodMat();
  const steel = M.metal('#3f4247', 0.5);
  // Sàn gỗ + cột sắt
  g.add(box(w, 0.1, d, charred, 0, 0.05, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, h - 0.3, 0.1, steel, sx * (w / 2 - 0.05), (h - 0.3) / 2, sz * (d / 2 - 0.05)));
  // Mái ngói một mái dốc về trước, đua ra
  const roof = box(w + 0.7, 0.05, d + 0.6, tileMat(), 0, h - 0.15, 0.1);
  roof.rotation.x = 0.16;
  roof.userData.roof = true;
  g.add(roof);
  // Vách sau: tranh đồng lúa + khung mắt cáo tre
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.6), new THREE.MeshStandardMaterial({ map: riceFieldTex(), roughness: 0.9 }));
  back.position.set(0, (h - 0.6) / 2 + 0.1, -d / 2 + 0.08);
  g.add(back);
  const bamboo = M.wood('#7a5a3a');
  for (let i = -3; i <= 3; i++) {
    for (const s of [-1, 1]) {
      const bar = box(0.035, (h - 0.6) * 1.15, 0.03, bamboo, i * (w / 7), (h - 0.6) / 2 + 0.1, -d / 2 + 0.11);
      bar.rotation.z = s * 0.5;
      g.add(bar);
    }
  }
  // Quầy gỗ cháy phía trước + đồ nghề
  const counterH = 1.0;
  g.add(box(w * 0.7, counterH, 0.6, charred, -w * 0.1, counterH / 2 + 0.1, d / 2 - 0.45));
  g.add(box(w * 0.72, 0.04, 0.66, M.paint('#1f1f1f', 0.4), -w * 0.1, counterH + 0.12, d / 2 - 0.45));
  const chrome = M.chrome();
  for (let i = 0; i < 5; i++) g.add(cyl(0.07, 0.06, 0.05, M.ceramic(i % 2 ? '#f5f5f4' : '#1f2937'), -w * 0.38 + i * 0.32, counterH + 0.165, d / 2 - 0.45, 14));
  g.add(cyl(0.18, 0.16, 0.22, chrome, w * 0.3, 1.0, -d / 2 + 0.6, 18)); // nồi hấp inox
  g.add(cyl(0.18, 0.18, 0.18, chrome, w * 0.3, 1.21, -d / 2 + 0.6, 18));
  // Cối đá xay bột
  const stone = M.paint('#b5b0a3', 0.9);
  g.add(cyl(0.22, 0.26, 0.2, stone, -w / 2 + 0.35, counterH + 0.22, d / 2 - 0.45, 16));
  g.add(cyl(0.18, 0.2, 0.14, stone, -w / 2 + 0.35, counterH + 0.39, d / 2 - 0.45, 16));
  // Bảng tên quầy treo dưới mái
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(2.4, w * 0.6), Math.min(2.4, w * 0.6) * 0.25),
    sharedMat(`g:board:${o.label}|${o.subLabel}`, () => new THREE.MeshStandardMaterial({ map: boardTex(o.label || 'Bánh Quê', o.subLabel || 'Một chút tình người Nam Bộ'), roughness: 0.7 })),
  );
  board.position.set(0, h - 0.62, d / 2 - 0.02);
  g.add(board);
  // Đèn mây treo + dây bóng
  const rattan = M.wood('#c8a26a');
  for (const x of [-w * 0.3, w * 0.25]) {
    g.add(lathe([[0.02, 0], [0.12, 0.05], [0.14, 0.14], [0.05, 0.22], [0.01, 0.23]], rattan, 12)).children.at(-1)!.position.set(x, h - 0.85, 0);
  }
  const bulb = M.glow('#ffd58a', 0.8, 3.5);
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.55) g.add(sphere(0.028, bulb, x, h - 0.32, d / 2 - 0.05));
  return g;
}

// ───────────── Xe đò Sài Gòn – Sa Đéc ─────────────
/** Chữ hông xe đò như xe thật: dòng 1 "XE ĐÒ" đen nhỏ + "XỞI LỞI" đỏ to; dòng 2 "SÀI GÒN - SA ĐÉC" đen to */
function vanSideTex(title: string, route: string) {
  return gTex(`vanSide2:${title}|${route}`, 1400, 520, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Dòng 1
    ctx.font = `800 92px ${SERIF}`;
    const xeDo = 'XE ĐÒ  ';
    const xw = ctx.measureText(xeDo).width;
    ctx.font = `800 150px ${SERIF}`;
    const tw = ctx.measureText(title.toUpperCase()).width;
    let x = (w - xw - tw) / 2;
    ctx.font = `800 92px ${SERIF}`;
    ctx.fillStyle = '#1f2937';
    ctx.fillText(xeDo, x, h * 0.3 + 10);
    x += xw;
    ctx.font = `800 150px ${SERIF}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#7f1d1d';
    ctx.strokeText(title.toUpperCase(), x, h * 0.3);
    ctx.fillStyle = '#d6332a';
    ctx.fillText(title.toUpperCase(), x, h * 0.3);
    // Dòng 2
    ctx.textAlign = 'center';
    let size = 140;
    ctx.font = `800 ${size}px ${SERIF}`;
    while (ctx.measureText(route.toUpperCase()).width > w * 0.94 && size > 60) {
      size -= 6;
      ctx.font = `800 ${size}px ${SERIF}`;
    }
    ctx.fillStyle = '#1f2937';
    ctx.fillText(route.toUpperCase(), w / 2, h * 0.74);
  });
}
function vanRearTex(title: string) {
  return gTex(`vanRear:${title}`, 512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#efe6cf';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2f7a5b';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 78px ${SERIF}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f2c14e';
    ctx.strokeText(title.toUpperCase(), w / 2, h * 0.4);
    ctx.fillStyle = '#c8352b';
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.4);
    ctx.font = `700 34px ${SERIF}`;
    ctx.fillStyle = '#2f7a5b';
    ctx.fillText('CAFÉ', w / 2, h * 0.53);
  });
}

/** Xe đò Sài Gòn – Sa Đéc (van mui cao kiểu Sprinter): thân kem, dải dưới xanh nhạt, hông kín in chữ, đèn hậu đỏ dọc */
export function buildFoodVan(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: L, depthM: W, heightM: H } = o;
  const cream = M.gloss('#efe6cf');
  const blue = M.gloss('#9fd0de');
  const dark = M.paint('#1f2328', 0.5);
  const glass = M.paint('#1c2733', 0.12);
  const wheelR = 0.34;
  const floorY = wheelR + 0.12;
  const bodyH = H - floorY;
  const cabL = L * 0.2; // phần đầu xe (nắp ca-pô + kính lái)
  const boxL = L - cabL;
  const boxX = -L / 2 + boxL / 2;
  // Khoang thùng mui cao bo tròn
  g.add(box(boxL, bodyH, W, cream, boxX, floorY + bodyH / 2, 0, 0.16));
  // Dải xanh phía dưới (~32% chiều cao) + chỉ xanh đậm phân cách
  g.add(box(L - 0.06, bodyH * 0.32, W + 0.01, blue, -0.03, floorY + bodyH * 0.16, 0, 0.08));
  g.add(box(L - 0.1, 0.03, W + 0.02, M.gloss('#5aa5bd'), -0.03, floorY + bodyH * 0.325, 0));
  // Đầu xe: ca-pô thấp + kính lái nghiêng + cửa ca-bin có kính
  const hoodH = bodyH * 0.42;
  g.add(box(cabL, hoodH, W * 0.98, cream, L / 2 - cabL / 2, floorY + hoodH / 2, 0, 0.12));
  const shield = box(0.04, bodyH * 0.42, W * 0.86, glass, L / 2 - cabL * 0.55, floorY + hoodH + bodyH * 0.19, 0);
  shield.rotation.z = 0.5;
  g.add(shield);
  const cabTop = box(cabL * 0.55, bodyH - hoodH, W * 0.98, cream, boxX + boxL / 2 + cabL * 0.2, floorY + hoodH + (bodyH - hoodH) / 2, 0, 0.12);
  g.add(cabTop);
  for (const s of [-1, 1]) {
    // Kính cửa ca-bin 2 bên
    g.add(box(cabL * 0.55, bodyH * 0.25, 0.02, glass, boxX + boxL / 2 + cabL * 0.15, floorY + bodyH * 0.66, s * (W / 2 + 0.005)));
    // Đường cửa lùa thân xe
    g.add(box(0.02, bodyH * 0.62, 0.012, dark, boxX + boxL * 0.18, floorY + bodyH * 0.55, s * (W / 2 + 0.004)));
  }
  // Lưới tản nhiệt + đèn pha + cản
  g.add(box(0.03, hoodH * 0.45, W * 0.55, dark, L / 2 + 0.005, floorY + hoodH * 0.55, 0, 0.02));
  const lamp = M.glow('#fff7d6', 0.6, 2);
  for (const s of [-1, 1]) g.add(box(0.04, 0.12, 0.26, lamp, L / 2 + 0.01, floorY + hoodH * 0.62, s * W * 0.34, 0.03));
  g.add(box(0.12, 0.14, W + 0.04, dark, L / 2 + 0.03, floorY + 0.05, 0, 0.03));
  g.add(box(0.12, 0.14, W + 0.04, dark, -L / 2 - 0.03, floorY + 0.05, 0, 0.03));
  // Đuôi xe: 2 cánh cửa + logo + đèn hậu đỏ dọc
  g.add(box(0.012, bodyH * 0.8, 0.02, dark, -L / 2 - 0.004, floorY + bodyH * 0.5, 0));
  const tail = M.glow('#dc2626', 0.5, 1.8);
  for (const s of [-1, 1]) g.add(box(0.05, bodyH * 0.32, 0.1, tail, -L / 2 - 0.01, floorY + bodyH * 0.35, s * (W / 2 - 0.08), 0.02));
  const rear = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.55, W * 0.55),
    sharedMat(`g:vanRear:${o.label}`, () => new THREE.MeshStandardMaterial({ map: vanRearTex(o.label || 'Xởi Lởi'), transparent: true, alphaTest: 0.05, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  rear.position.set(-L / 2 - 0.012, floorY + bodyH * 0.62, 0);
  rear.rotation.y = -Math.PI / 2;
  rear.userData.noMerge = true;
  g.add(rear);
  // Chữ hông 2 bên (phần kem phía trên dải xanh)
  const txtMat = sharedMat(`g:vanTxt2:${o.label}|${o.subLabel}`, () =>
    new THREE.MeshStandardMaterial({ map: vanSideTex(o.label || 'Xởi Lởi', o.subLabel || 'Sài Gòn - Sa Đéc'), transparent: true, alphaTest: 0.05, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  const tw = boxL * 0.86;
  const th = Math.min(bodyH * 0.6, tw * (520 / 1400));
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), txtMat);
    t.position.set(boxX + 0.05, floorY + bodyH * 0.34 + th / 2 + 0.04, s * (W / 2 + 0.012));
    if (s < 0) t.rotation.y = Math.PI;
    t.userData.noMerge = true;
    g.add(t);
  }
  // Bánh xe
  const tire = M.paint('#111111', 0.8);
  const rim = M.chrome();
  for (const x of [-L * 0.32, L * 0.3]) {
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 0.1);
      const wheel = cyl(wheelR, wheelR, 0.24, tire, x, wheelR, z, 20);
      wheel.rotation.x = Math.PI / 2;
      const hub = cyl(wheelR * 0.5, wheelR * 0.5, 0.25, rim, x, wheelR, z, 14);
      hub.rotation.x = Math.PI / 2;
      g.add(wheel, hub);
    }
  }
  // Gương chiếu hậu
  for (const s of [-1, 1]) g.add(box(0.06, 0.16, 0.1, dark, L / 2 - cabL * 0.6, floorY + bodyH * 0.6, s * (W / 2 + 0.08), 0.02));
  return g;
}

// ───────────── Ao rau muống & sàn gỗ ─────────────
export function buildPond(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const r = seeded(hashId(o.id));
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.2, d - 0.2),
    sharedMat('g:water', () => new THREE.MeshPhysicalMaterial({ color: '#3d4a2c', roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.03;
  g.add(water);
  // Bờ gỗ sẫm
  const rim = M.wood('#5a3b26');
  g.add(box(w, 0.16, 0.14, rim, 0, 0.08, d / 2 - 0.07), box(w, 0.16, 0.14, rim, 0, 0.08, -d / 2 + 0.07));
  g.add(box(0.14, 0.16, d, rim, w / 2 - 0.07, 0.08, 0), box(0.14, 0.16, d, rim, -w / 2 + 0.07, 0.08, 0));
  // Đám rau muống / bèo nổi
  const list: Card[] = [];
  for (let i = 0; i < Math.round(w * d * 3); i++) {
    const x = (r() - 0.5) * (w - 0.5);
    const z = (r() - 0.5) * (d - 0.5);
    if (Math.sin(x * 1.3) + Math.cos(z * 1.7) < 0.2) continue;
    list.push({ pos: new THREE.Vector3(x, 0.05, z), yaw: r() * 6.28, pitch: -Math.PI / 2 + 0.2, sx: 0.4 + r() * 0.3, sy: 0.4 + r() * 0.3 });
  }
  if (list.length) g.add(cards('spinach', list));
  // Lá súng nổi (đĩa xanh có khe) + vài bông súng hồng
  const pad = sharedMat('g:lilyPad', () => new THREE.MeshStandardMaterial({ color: '#3f7d34', roughness: 0.5, side: THREE.DoubleSide }));
  const lotus = M.paint('#f9a8d4', 0.5);
  for (let i = 0; i < Math.round(w * d * 0.8); i++) {
    const x = (r() - 0.5) * (w - 0.6);
    const z = (r() - 0.5) * (d - 0.6);
    const rad = 0.12 + r() * 0.1;
    const lp = new THREE.Mesh(new THREE.CircleGeometry(rad, 14, 0.3, Math.PI * 2 - 0.3), pad);
    lp.rotation.x = -Math.PI / 2;
    lp.rotation.z = r() * 6.28;
    lp.position.set(x, 0.036, z);
    g.add(lp);
    if (i % 5 === 0) g.add(sphere(0.045, lotus, x + 0.05, 0.07, z));
  }
  // Cá koi lượn dưới mặt nước (canvas cho bơi theo quỹ đạo)
  const school = new THREE.Group();
  const koiCols: [string, string][] = [['#f97316', '#fafaf9'], ['#fafaf9', '#dc2626'], ['#f59e0b', '#f97316'], ['#fafaf9', '#111827'], ['#ea580c', '#fafaf9']];
  koiCols.forEach(([c1, c2], i) => {
    const fish = new THREE.Group();
    const body = sphere(0.06, sharedMat(`g:koi:${c1}`, () => new THREE.MeshStandardMaterial({ color: c1, roughness: 0.35 })), 0, 0, 0);
    body.scale.set(0.8, 0.55, 2.4);
    const patch = sphere(0.045, sharedMat(`g:koi:${c2}`, () => new THREE.MeshStandardMaterial({ color: c2, roughness: 0.35 })), 0, 0.018, 0.03);
    patch.scale.set(0.8, 0.4, 1.4);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), body.material as THREE.Material);
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(1, 1, 0.25);
    tail.position.z = -0.17;
    tail.userData.tail = true;
    fish.add(body, patch, tail);
    fish.userData = { phase: i * 1.3 + r(), speed: 0.25 + r() * 0.2, rx: 0.25 + r() * 0.15, rz: 0.2 + r() * 0.15 };
    school.add(fish);
  });
  school.position.y = 0.0;
  school.userData = { noMerge: true, dynamic: true, koi: { w: w - 0.6, d: d - 0.6 } };
  g.add(school);
  return g;
}

// ───────────── Xe đẩy bánh quê, chum sành, lan can dây leo, bảng logo ─────────────
function cartDecalTex(title: string) {
  return gTex(`cartDecal:${title}`, 512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fef3c7');
    g.addColorStop(1, '#fde68a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, h - 34, w, 34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 96px ${SERIF}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#7c2d12';
    ctx.strokeText(title.toUpperCase(), w / 2, h * 0.42);
    ctx.fillStyle = '#facc15';
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.42);
    ctx.font = `600 26px ${SERIF}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('Đặc sản miền Tây', w / 2, h - 17);
  });
}
/** Xe đẩy kính bán bánh quê (bên cạnh xe đò) */
export function buildFoodCart(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d, heightM: h } = o;
  const frame = M.metal('#9ca3af', 0.35);
  const bodyH = h * 0.42;
  const decal = sharedMat(`g:cartDecal:${o.label}`, () => new THREE.MeshStandardMaterial({ map: cartDecalTex(o.label || 'Bánh Quê'), roughness: 0.6 }));
  // Thân tủ dưới dán decal 2 mặt
  g.add(box(w, bodyH, d, M.paint('#f8fafc', 0.6), 0, 0.25 + bodyH / 2, 0));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, bodyH * 0.92), decal);
    p.position.set(0, 0.25 + bodyH / 2, s * (d / 2 + 0.004));
    if (s < 0) p.rotation.y = Math.PI;
    p.userData.noMerge = true;
    g.add(p);
  }
  // Tủ kính phía trên + mái che
  const glassH = h * 0.38;
  g.add(box(w, glassH, d, M.glass(), 0, 0.25 + bodyH + glassH / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.025, glassH + 0.25, 0.025, frame, sx * (w / 2), 0.25 + bodyH + (glassH + 0.25) / 2, sz * (d / 2)));
  g.add(box(w + 0.2, 0.04, d + 0.2, M.paint('#15803d', 0.6), 0, h, 0));
  // Bánh xe
  const tire = M.paint('#111', 0.8);
  for (const sx of [-1, 1]) {
    const wh = cyl(0.2, 0.2, 0.06, tire, sx * w * 0.32, 0.2, d / 2 + 0.03, 16);
    wh.rotation.x = Math.PI / 2;
    g.add(wh);
  }
  return g;
}

/** Chum sành men vàng nâu (đặt góc quầy / lối đi) */
export function buildClayJar(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const r = o.widthM / 2;
  const h = o.heightM;
  const glaze = sharedMat(`g:jar:${o.color}`, () => new THREE.MeshPhysicalMaterial({ color: o.color ?? '#b7791f', roughness: 0.3, clearcoat: 0.8 }));
  g.add(lathe([[0, 0], [r * 0.55, 0], [r * 0.95, h * 0.35], [r, h * 0.55], [r * 0.7, h * 0.88], [r * 0.5, h * 0.95], [r * 0.52, h], [0, h * 0.96]], glaze, 28));
  return g;
}

/** Lan can kính + bồn cây trên mép, dây trầu bà rủ dài xuống (thềm nhìn ra ao) */
export function buildVineRailing(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const r = seeded(hashId(o.id));
  const frame = M.metal('#4b5563', 0.4);
  g.add(box(w, h - 0.15, 0.02, M.glass(), 0, (h - 0.15) / 2 + 0.05, 0));
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.2) g.add(box(0.04, h, 0.04, frame, x, h / 2, 0));
  g.add(box(w, 0.05, 0.06, frame, 0, h, 0));
  // Bồn cây đen dọc mép
  const potMat = M.paint('#1f2937', 0.7);
  const list: Card[] = [];
  for (let x = -w / 2 + 0.4; x < w / 2; x += 0.9) {
    g.add(box(0.5, 0.32, 0.35, potMat, x, h + 0.18, -0.2));
    // Lá bụi trên bồn + dây leo rủ dài phía trước lan can
    for (let k = 0; k < 6; k++) list.push({ pos: new THREE.Vector3(x + (r() - 0.5) * 0.4, h + 0.32, -0.2 + (r() - 0.5) * 0.2), yaw: r() * 6.28, pitch: -0.3 - r() * 0.5, sx: 0.35, sy: 0.35 });
    const strands = 2 + Math.floor(r() * 3);
    for (let sIdx = 0; sIdx < strands; sIdx++) {
      const sx = x + (r() - 0.5) * 0.5;
      const len = 0.6 + r() * (h + 0.3);
      for (let t = 0; t < len; t += 0.16) {
        list.push({ pos: new THREE.Vector3(sx + Math.sin(t * 5) * 0.03, h + 0.15 - t, 0.06 + t * 0.02), yaw: r() * 0.6 - 0.3, pitch: 0.2, roll: r() - 0.5, sx: 0.16, sy: 0.16 });
      }
    }
  }
  g.add(cards('ficus', list));
  return g;
}

const LOGO_URL = '/brand/xoi-loi-logo.png';
/** Bảng logo tròn trên giá gỗ (dùng logo quán đã tải lên) */
export function buildLogoStandee(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const wood = M.wood('#6b4226');
  const logoMat = sharedMat('g:logoBoard', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.7 });
    if (typeof window !== 'undefined') {
      new THREE.TextureLoader().load(LOGO_URL, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        m.map = t;
        m.color.set('#ffffff');
        m.needsUpdate = true;
      });
    }
    return m;
  });
  // 2 chân giá + bảng vuông khung gỗ
  for (const s of [-1, 1]) {
    const leg = box(0.05, h, 0.05, wood, s * w * 0.35, h / 2, -0.12);
    leg.rotation.x = 0.08;
    g.add(leg);
  }
  const board = h - w - 0.1;
  g.add(box(w + 0.08, w + 0.08, 0.04, wood, 0, board + w / 2, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, w), logoMat);
  face.position.set(0, board + w / 2, 0.022);
  face.userData.noMerge = true;
  g.add(face);
  return g;
}

/**
 * Hàng cây lớn (bàng, sa kê, me tây) quanh quán: thân + cành ống cong, tán gồm nhiều chùm thẻ lá đung đưa theo gió.
 * Mọi tán lá trong hàng gom vào 1 InstancedMesh (1 draw call) — thay cho cây khối đa giác.
 */
export function buildTreeRow(points: { x: number; z: number; scale: number }[], seed = 7): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(seed);
  const bark = sharedMat('g:treeBark', () => new THREE.MeshStandardMaterial({ color: '#5b4a3a', roughness: 0.95 }));
  const list: Card[] = [];
  for (const p of points) {
    const s = p.scale;
    const H = 4.2 * s;
    // Thân hơi nghiêng & cong
    const lean = new THREE.Vector3((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    const top = new THREE.Vector3(p.x + lean.x, H * 0.62, p.z + lean.z);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x + lean.x * 0.4, H * 0.3, p.z + lean.z * 0.4), top]), 8, 0.16 * s, 7, false), bark));
    // Cành chính tỏa ra → mỗi cành mang 1 chùm lá
    const branches = 5 + Math.floor(r() * 3);
    for (let b = 0; b < branches; b++) {
      const a = (b / branches) * Math.PI * 2 + r() * 0.6;
      const len = (1.4 + r() * 1.2) * s;
      const tip = new THREE.Vector3(top.x + Math.cos(a) * len, top.y + (0.5 + r() * 1.3) * s, top.z + Math.sin(a) * len);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([top, top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.3 * s, 0)), tip]), 5, 0.06 * s, 5, false), bark));
      const rad = (1.0 + r() * 0.6) * s;
      for (let k = 0; k < 24; k++) {
        const u = r() * Math.PI * 2;
        const v = Math.acos(2 * r() - 1);
        list.push({
          pos: new THREE.Vector3(tip.x + Math.sin(v) * Math.cos(u) * rad, tip.y + Math.cos(v) * rad * 0.6, tip.z + Math.sin(v) * Math.sin(u) * rad),
          yaw: r() * Math.PI * 2,
          pitch: -0.3 - r() * 1.2,
          roll: r() - 0.5,
          sx: (1.1 + r() * 0.7) * s,
          sy: (1.1 + r() * 0.7) * s,
        });
      }
    }
    // Chùm lá đỉnh
    for (let k = 0; k < 30; k++) {
      const u = r() * Math.PI * 2;
      const rr = r() * 1.6 * s;
      list.push({ pos: new THREE.Vector3(top.x + Math.cos(u) * rr, top.y + (1.4 + r() * 1.2) * s, top.z + Math.sin(u) * rr), yaw: r() * 6.28, pitch: -0.5 - r(), roll: r() - 0.5, sx: 1.3 * s, sy: 1.3 * s });
    }
  }
  g.add(cards('ficus', list));
  return g;
}

// ───────────── Quạt phun sương, bảng phấn chữ A, xe máy ─────────────
/** Quạt phun sương đứng (quán sân vườn VN): lồng quạt, cánh quay (canvas xoay), bình nước dưới chân */
export function buildMistFan(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const h = o.heightM;
  const body = M.paint(o.color ?? '#e5e7eb', 0.45);
  g.add(cyl(0.22, 0.26, 0.42, body, 0, 0.21, 0, 20)); // bình nước
  g.add(cyl(0.03, 0.035, h - 0.7, M.metal('#9ca3af', 0.35), 0, 0.42 + (h - 0.7) / 2, 0, 10));
  const headY = h - 0.25;
  // Lồng quạt (vòng thép) — hướng thổi +Z
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.008, 6, 32), M.metal('#d1d5db', 0.3));
  cage.position.set(0, headY, 0.08);
  g.add(cage, box(0.16, 0.16, 0.16, body, 0, headY, -0.06, 0.03));
  // Cánh quạt quay: nhóm động (canvas xoay quanh trục Z cục bộ)
  const rotor = new THREE.Group();
  const bladeMat = sharedMat('g:fanBlade', () => new THREE.MeshStandardMaterial({ color: '#93c5fd', transparent: true, opacity: 0.85, roughness: 0.4 }));
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12, 0, Math.PI / 2.4), bladeMat);
    blade.rotation.z = (i / 3) * Math.PI * 2;
    rotor.add(blade);
  }
  rotor.add(new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), M.paint('#1f2937', 0.4)));
  rotor.position.set(0, headY, 0.06);
  rotor.userData = { noMerge: true, dynamic: true, spinner: { axis: 'z', speed: 14 } };
  g.add(rotor);
  // Vòi phun sương trước lồng
  g.add(cyl(0.012, 0.012, 0.05, M.metal('#6b7280', 0.3), 0, headY + 0.2, 0.12, 8).rotateX(Math.PI / 2));
  g.userData.mistAt = { lx: 0, ly: headY + 0.2, lz: 0.18 };
  return g;
}

function chalkTex(title: string, lines: string[]) {
  return gTex(`chalk:${title}|${lines.join('|')}`, 512, 720, (ctx, w, h) => {
    ctx.fillStyle = '#1f2a24';
    ctx.fillRect(0, 0, w, h);
    // Vết phấn mờ
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 2 + Math.random() * 4);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    ctx.font = `italic 700 66px ${SERIF}`;
    ctx.fillText(title, w / 2, 92);
    ctx.strokeStyle = 'rgba(253,230,138,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, 118);
    ctx.quadraticCurveTo(w / 2, 136, w - 90, 118);
    ctx.stroke();
    ctx.font = `600 36px ${SERIF}`;
    lines.slice(0, 8).forEach((ln, i) => {
      ctx.fillStyle = i % 2 ? '#f8fafc' : '#bbf7d0';
      ctx.fillText(ln, w / 2, 190 + i * 62);
    });
    ctx.font = `italic 600 30px ${SERIF}`;
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('♥ Xởi lởi trời cho ♥', w / 2, h - 50);
  });
}
/** Bảng phấn chữ A đặt lối vào: tên quán + vài món & giá viết tay */
export function buildChalkboard(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const wood = M.wood('#8a5a35');
  const lines = ['Cà phê sữa đá · 39k', 'Bạc xỉu · 42k', 'Trà đào cam sả · 45k', 'Matcha latte · 52k', 'Bánh quê nóng · 25k', 'Nước cam ép · 45k'];
  const face = sharedMat(`g:chalk:${o.label}`, () => new THREE.MeshStandardMaterial({ map: chalkTex(o.label || 'Menu hôm nay', lines), roughness: 0.95 }));
  // Bảng chữ A: 2 mặt chụm ở bản lề trên đỉnh, chân xoè ra trước/sau (hình Λ khi nhìn ngang).
  // Mỗi mặt treo từ bản lề → không bao giờ cắt xuyên qua nhau.
  const tilt = 0.2;
  const top = h * Math.cos(tilt);
  for (const s of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0, top, 0);
    if (s < 0) hinge.rotation.y = Math.PI; // mặt sau quay ra phía sau
    const panel = new THREE.Group();
    panel.rotation.x = -tilt; // chân đá ra phía +Z cục bộ (mặt chữ hướng ra ngoài, hơi ngửa lên)
    panel.add(box(w, h, 0.03, wood, 0, -h / 2, 0.015));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.12), face);
    board.position.set(0, -h / 2, 0.032);
    panel.add(board);
    hinge.add(panel);
    g.add(hinge);
  }
  // Bản lề kim loại trên đỉnh
  g.add(box(w * 0.7, 0.025, 0.05, M.metal('#3a3d42', 0.5), 0, top + 0.005, 0));
  return g;
}

/** Xe tay ga đậu (bãi giữ xe trước quán): 2 bánh, thân bầu, yên, tay lái, gương */
export function buildMotorbike(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const L = o.depthM; // dài theo trục Z cục bộ
  const paint = M.gloss(o.color ?? '#dc2626');
  const black = M.paint('#111111', 0.6);
  const chrome = M.chrome();
  for (const z of [-L * 0.36, L * 0.36]) {
    const wheel = cyl(0.25, 0.25, 0.09, black, 0, 0.25, z, 20);
    wheel.rotation.z = Math.PI / 2;
    const hub = cyl(0.12, 0.12, 0.1, chrome, 0, 0.25, z, 14);
    hub.rotation.z = Math.PI / 2;
    g.add(wheel, hub);
  }
  // Thân sau bầu + sàn để chân + yếm trước
  g.add(box(0.3, 0.32, L * 0.42, paint, 0, 0.5, -L * 0.18, 0.1));
  g.add(box(0.26, 0.06, L * 0.3, black, 0, 0.32, L * 0.06, 0.02));
  const apron = box(0.3, 0.6, 0.1, paint, 0, 0.62, L * 0.28, 0.06);
  apron.rotation.x = -0.25;
  g.add(apron);
  g.add(box(0.26, 0.08, L * 0.36, M.leather('#1f1f1f'), 0, 0.7, -L * 0.15, 0.04)); // yên
  // Cổ lái + tay lái + gương
  const stem = cyl(0.03, 0.03, 0.5, chrome, 0, 0.85, L * 0.33, 8);
  stem.rotation.x = -0.3;
  g.add(stem);
  const bar = cyl(0.016, 0.016, 0.62, black, 0, 1.08, L * 0.38, 8);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    g.add(cyl(0.006, 0.006, 0.2, chrome, s * 0.24, 1.18, L * 0.37, 6));
    g.add(sphere(0.04, chrome, s * 0.24, 1.29, L * 0.37));
  }
  g.add(sphere(0.06, M.glow('#fffbe6', 0.4, 1.6), 0, 0.95, L * 0.42)); // đèn pha
  // Chân chống nghiêng nhẹ
  g.rotation.z = 0.05;
  return g;
}


// ───────────── Đèn treo: dây bóng Edison giăng ngang sân, đèn tre treo trên bàn ─────────────
/** Dây bóng Edison giăng giữa 2 cột sắt (dài theo trục X cục bộ), võng tự nhiên; sáng vàng ấm ban đêm */
export function buildStringLights(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, heightM: h } = o;
  const pole = M.metal('#2b2b2b', 0.5);
  for (const sx of [-1, 1]) {
    g.add(cyl(0.04, 0.05, h, pole, sx * (w / 2), h / 2, 0, 8));
    g.add(box(0.3, 0.06, 0.3, M.paint('#6b6a64', 0.9), sx * (w / 2), 0.03, 0));
  }
  const a = new THREE.Vector3(-w / 2, h - 0.12, 0);
  const b = new THREE.Vector3(w / 2, h - 0.12, 0);
  const mid = new THREE.Vector3(0, h - 0.12 - Math.min(0.9, w * 0.06), 0);
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(w * 3)), 0.006, 4, false), M.black()));
  const bulb = M.glow('#ffcf7a', 0.9, 4.5);
  const n = Math.max(3, Math.floor(w / 0.55));
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    g.add(cyl(0.004, 0.004, 0.07, M.black(), p.x, p.y - 0.035, p.z, 4));
    g.add(cyl(0.018, 0.018, 0.03, M.metal('#3f3f46', 0.4), p.x, p.y - 0.08, p.z, 8));
    const bl = sphere(0.04, bulb, p.x, p.y - 0.13, p.z);
    bl.scale.y = 1.25;
    g.add(bl);
  }
  g.userData.noShadowCast = true;
  return g;
}

/** Đèn tre bầu dục treo trên bàn (dây thả từ trên cao xuống), phát sáng ấm */
export function buildBambooPendant(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const top = o.heightM;
  const r = o.widthM / 2;
  const bamboo = sharedMat('g:bambooPendant', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#d8b27a', roughness: 0.8, emissive: '#ffb15c', emissiveIntensity: 0.12, side: THREE.DoubleSide });
    registerEmissive({ mat: m, day: 0.12, night: 1.3, mode: 'emissive' });
    return m;
  });
  const lampY = top - 1.0;
  g.add(lathe([[0.01, 0], [r * 0.7, r * 0.25], [r, r * 0.9], [r * 0.75, r * 1.6], [r * 0.15, r * 1.9], [0.01, r * 1.95]], bamboo, 16)).children.at(-1)!.position.set(0, lampY, 0);
  // Nan tre dọc
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = cyl(0.004, 0.004, r * 1.9, M.wood('#a47148'), Math.cos(a) * r * 0.93, lampY + r * 0.95, Math.sin(a) * r * 0.93, 4);
    g.add(rib);
  }
  g.add(sphere(0.05, M.glow('#ffd58a', 0.6, 3.2), 0, lampY + r * 0.6, 0));
  g.add(cyl(0.004, 0.004, top - (lampY + r * 1.95), M.black(), 0, (top + lampY + r * 1.95) / 2, 0, 4));
  g.userData.noShadowCast = true;
  return g;
}

/**
 * Bàn xuồng: xuồng ba lá kê cao trên giá, mặt kính viền gỗ đặt ngang mạn xuồng làm mặt bàn (cao ~0.76m)
 * — nhìn xuyên kính thấy lòng xuồng & đà ngang. Dài theo trục X cục bộ, ghế đặt dọc 2 bên mạn.
 */
export function buildSampanTable(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const L = o.widthM;
  const W = o.depthM * 0.85;
  const topY = o.heightM;
  const standH = 0.42;
  const hullH = topY - standH - 0.06;
  const hull = new THREE.Mesh(hullGeo(L, W, hullH), plankMat());
  hull.position.y = standH;
  g.add(hull);
  const wood = M.wood('#9a5428');
  for (const u of [-0.4, 0, 0.4]) {
    const halfW = (W / 2) * Math.pow(1 - Math.abs(u) ** 2.2, 0.6);
    g.add(box(0.12, 0.03, halfW * 1.9, wood, u * (L / 2), standH + hullH * 0.7, 0));
  }
  const stand = M.wood('#b8753f');
  for (const sx of [-1, 1]) g.add(box(0.26, standH + 0.05, W * 1.15, stand, sx * L * 0.26, (standH + 0.05) / 2, 0, 0.01));
  // Mặt kính cường lực + viền gỗ, phủ phần giữa xuồng
  const gl = L * 0.64;
  const gw = W * 1.04;
  const glass = sharedMat('g:tableGlass', () => new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.28, roughness: 0.04, clearcoat: 1, depthWrite: false }));
  g.add(box(gl, 0.012, gw, glass, 0, topY - 0.006, 0));
  const rim = M.wood('#6b3d1f');
  g.add(box(gl + 0.06, 0.035, 0.03, rim, 0, topY - 0.017, gw / 2 + 0.015), box(gl + 0.06, 0.035, 0.03, rim, 0, topY - 0.017, -gw / 2 - 0.015));
  g.add(box(0.03, 0.035, gw, rim, gl / 2 + 0.015, topY - 0.017, 0), box(0.03, 0.035, gw, rim, -gl / 2 - 0.015, topY - 0.017, 0));
  // Bình hoa nhỏ giữa bàn
  g.add(cyl(0.035, 0.03, 0.12, M.ceramic('#e7e2d8'), 0, topY + 0.06, 0, 12));
  g.add(sphere(0.045, M.paint('#e11d48', 0.4), 0, topY + 0.15, 0));
  return g;
}


/** Dây leo bám hàng rào + chậu đất nung chân rào (môi trường quán). lines: đoạn rào [x1,z1,x2,z2] */
export function buildFenceGreenery(lines: [number, number, number, number][], height = 2, seed = 5): THREE.Group {
  const g = new THREE.Group();
  const r = seeded(seed);
  const list: Card[] = [];
  const terracotta = M.ceramic('#b45f3c');
  for (const [x1, z1, x2, z2] of lines) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const nx = (x2 - x1) / len;
    const nz = (z2 - z1) / len;
    // Mảng dây leo từng cụm (không phủ kín → còn thấy gỗ)
    for (let t = 0.5; t < len; t += 2.2 + r() * 1.5) {
      const cx = x1 + nx * t;
      const cz = z1 + nz * t;
      const span = 0.8 + r() * 1.4;
      const top = height * (0.5 + r() * 0.5);
      for (let k = 0; k < 30; k++) {
        const u = (r() - 0.5) * span;
        const y = r() * top;
        list.push({ pos: new THREE.Vector3(cx + nx * u, y, cz + nz * u), yaw: Math.atan2(-nz, nx) + Math.PI / 2 + (r() - 0.5) * 0.6, pitch: (r() - 0.5) * 0.6, roll: r() - 0.5, sx: 0.3 + r() * 0.2, sy: 0.3 + r() * 0.2 });
      }
      // Chậu đất nung + bụi cây ở chân rào
      if (r() < 0.6) {
        const px = cx + nx * (span / 2 + 0.4);
        const pz = cz + nz * (span / 2 + 0.4);
        g.add(lathe([[0, 0], [0.16, 0], [0.22, 0.34], [0.24, 0.36], [0, 0.36]], terracotta, 16)).children.at(-1)!.position.set(px, 0, pz);
        for (let k = 0; k < 10; k++) list.push({ pos: new THREE.Vector3(px + (r() - 0.5) * 0.3, 0.36 + r() * 0.35, pz + (r() - 0.5) * 0.3), yaw: r() * 6.28, pitch: -0.3 - r() * 0.6, sx: 0.32, sy: 0.32 });
      }
    }
  }
  if (list.length) g.add(cards('ficus', list));
  return g;
}

/** Bồn rửa tay đá mài + gương + vòi, khung gỗ (góc tiện ích quán) */
export function buildOutdoorSink(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const { widthM: w, depthM: d } = o;
  const wood = M.wood('#6b4226');
  g.add(box(w, 0.8, d, wood, 0, 0.4, 0, 0.02));
  const stone = M.paint('#a8a29e', 0.6);
  g.add(box(w + 0.04, 0.06, d + 0.04, stone, 0, 0.83, 0));
  g.add(lathe([[0, 0], [0.16, 0.0], [0.2, 0.12], [0.18, 0.12], [0, 0.03]], M.ceramic('#f5f5f4'), 20)).children.at(-1)!.position.set(0, 0.86, 0.02);
  g.add(cyl(0.012, 0.012, 0.22, M.chrome(), 0, 1.0, -d / 2 + 0.08, 8));
  const spout = cyl(0.01, 0.01, 0.14, M.chrome(), 0, 1.1, -d / 2 + 0.14, 8);
  spout.rotation.x = Math.PI / 2;
  g.add(spout);
  // Gương tròn khung mây + hộp xà phòng
  g.add(box(w * 0.9, 1.1, 0.04, wood, 0, 1.55, -d / 2 - 0.02));
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.26, 28), sharedMat('g:mirror', () => new THREE.MeshStandardMaterial({ color: '#dbeafe', metalness: 1, roughness: 0.05 })));
  mirror.position.set(0, 1.55, -d / 2 + 0.002);
  g.add(mirror);
  g.add(cyl(0.035, 0.035, 0.12, M.ceramic('#16a34a'), w * 0.3, 0.92, -0.05, 12));
  return g;
}

/** Thùng rác phân loại 2 ngăn (tái chế / thường) */
export function buildTrashBins(o: SpaceObject): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#2563eb', '#16a34a'];
  for (let i = 0; i < 2; i++) {
    const x = (i - 0.5) * o.widthM * 0.5;
    g.add(box(o.widthM * 0.46, o.heightM, o.depthM, M.paint(cols[i], 0.5), x, o.heightM / 2, 0, 0.03));
    g.add(box(o.widthM * 0.48, 0.05, o.depthM + 0.02, M.paint('#1f2937', 0.5), x, o.heightM + 0.02, 0, 0.02));
    g.add(box(o.widthM * 0.2, 0.08, 0.01, M.paint('#f8fafc', 0.5), x, o.heightM * 0.7, o.depthM / 2 + 0.005));
  }
  return g;
}
