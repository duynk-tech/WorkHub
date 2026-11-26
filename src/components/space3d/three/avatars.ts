import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Avatar3DConfig, RemotePlayerMeta } from '@/lib/space-3d-types';
import { applyRimLight } from './materials';

export interface BubbleSlot {
  sprite: THREE.Object3D | null;
  text: string;
}

/** Nhãn HTML đang hiển thị (để làm mờ theo khoảng cách) */
export const htmlLabels = new Set<CSS2DObject>();

function htmlLabel(el: HTMLElement, y: number): CSS2DObject {
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  obj.position.y = y;
  obj.userData.htmlLabel = true;
  htmlLabels.add(obj);
  obj.addEventListener('removed', () => htmlLabels.delete(obj));
  return obj;
}

const LABEL_FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

export const BUBBLE_VISIBLE_DIST = 8;

export interface AnimatedAvatar {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  /** Độ cao gốc của đầu (để nhịp thở / nhún không cộng dồn) */
  headBaseY: number;
  /** Pivot mí trên — xoay x để chớp mắt */
  blinkers: THREE.Object3D[];
  /** Thời điểm (giây) lần chớp mắt kế tiếp */
  blinkAt: number;
  /** Khớp gối / khuỷu để dáng đi mềm */
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  /** Biên độ sải chân (đầm công sở bước ngắn để chân không lộ ra ngoài váy) */
  stride: number;
  /** Chân váy (đung đưa theo bước) */
  skirt: THREE.Object3D | null;
}

/** Dáng đi: sải hông, gập gối ở pha nhấc chân, đánh tay có gập khuỷu, nhún nhẹ. */
export function poseWalk(av: AnimatedAvatar, phase: number): void {
  const k = av.stride;
  const sn = Math.sin(phase);
  const hip = sn * 0.5 * k;
  av.leftLeg.rotation.x = hip;
  av.rightLeg.rotation.x = -hip;
  // Gối gập khi chân đang đưa ra trước (đùi xoay âm = ra sau trong hệ này → dùng dạng bán sóng)
  av.leftKnee.rotation.x = 0.08 + Math.max(0, Math.sin(phase + 1.2)) * 0.75 * k;
  av.rightKnee.rotation.x = 0.08 + Math.max(0, Math.sin(phase + 1.2 + Math.PI)) * 0.75 * k;
  av.leftArm.rotation.x = -sn * 0.42 * Math.max(0.6, k);
  av.rightArm.rotation.x = sn * 0.42 * Math.max(0.6, k);
  av.leftElbow.rotation.x = -0.22 - Math.max(0, -sn) * 0.35;
  av.rightElbow.rotation.x = -0.22 - Math.max(0, sn) * 0.35;
  if (av.skirt) {
    av.skirt.rotation.z = sn * 0.035;
    av.skirt.rotation.x = Math.abs(sn) * -0.02;
  }
  av.group.position.y = Math.abs(Math.cos(phase)) * 0.028;
}

/** Tư thế ngồi: đùi nằm ngang ra trước, cẳng chân thả xuống, tay đặt lên đùi; hông đặt đúng độ cao mặt ghế. */
export function poseSit(av: AnimatedAvatar, seatY: number): void {
  const k = 0.35; // nội suy để ngồi xuống mượt
  const lerp = (cur: number, to: number) => cur + (to - cur) * k;
  for (const leg of [av.leftLeg, av.rightLeg]) leg.rotation.x = lerp(leg.rotation.x, -1.5);
  for (const knee of [av.leftKnee, av.rightKnee]) knee.rotation.x = lerp(knee.rotation.x, 1.5);
  for (const arm of [av.leftArm, av.rightArm]) arm.rotation.x = lerp(arm.rotation.x, -0.55);
  for (const el of [av.leftElbow, av.rightElbow]) el.rotation.x = lerp(el.rotation.x, -0.7);
  if (av.skirt) av.skirt.rotation.x = lerp(av.skirt.rotation.x, -0.35);
  // Hông (pivot chân ở y = 0.9) hạ xuống mặt ghế + bề dày đùi
  av.group.position.y = lerp(av.group.position.y, seatY - 0.9 + 0.07);
}

/** Trả dáng về đứng thẳng mượt mà khi dừng. */
export function relaxPose(av: AnimatedAvatar): void {
  const d = 0.82;
  av.leftLeg.rotation.x *= d;
  av.rightLeg.rotation.x *= d;
  av.leftKnee.rotation.x = av.leftKnee.rotation.x * d + 0.02 * (1 - d);
  av.rightKnee.rotation.x = av.rightKnee.rotation.x * d + 0.02 * (1 - d);
  av.leftArm.rotation.x *= d;
  av.rightArm.rotation.x *= d;
  av.leftElbow.rotation.x = av.leftElbow.rotation.x * d - 0.12 * (1 - d);
  av.rightElbow.rotation.x = av.rightElbow.rotation.x * d - 0.12 * (1 - d);
  if (av.skirt) {
    av.skirt.rotation.z *= d;
    av.skirt.rotation.x *= d;
  }
  av.group.position.y = 0;
}

/** Nhãn nổi gọn dạng viên thuốc, rộng theo nội dung (dùng cho sản phẩm & nhãn chung). */
export function createBadgeSprite(text: string, bgColor = '#0f172a', textColor = '#ffffff'): THREE.Sprite {
  return createPillSprite({ text: text.slice(0, 40), bg: bgColor, fg: textColor, dot: null, height: 0.2 });
}

export type NameTagStatus = 'self' | 'duty' | 'staff' | 'guest';

/** Nhãn tên trên đầu nhân vật: viên thuốc kính mờ tối, chấm trạng thái, tên rõ nét; đang trực có chip xanh. */
/**
 * Nhãn tên dạng HTML (CSS2D) — chữ do trình duyệt vẽ nên luôn sắc nét ở mọi khoảng cách / màn hình retina,
 * không bị tone mapping, bloom hay mipmap làm mờ như texture.
 */
export function createNameTag(name: string, status: NameTagStatus): CSS2DObject {
  // Bản thân: viền xanh để phân biệt; đang trực: chip xanh lá; còn lại: viên tối gọn
  const border = status === 'self' ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.16)';
  const el = document.createElement('div');
  el.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:3px 10px',
    'border-radius:999px',
    'background:rgba(15,23,42,0.78)',
    `border:${border}`,
    status === 'self' ? 'box-shadow:0 0 0 2px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.28)' : 'box-shadow:0 2px 8px rgba(0,0,0,0.28)',
    `font:600 12px/1.25 ${LABEL_FONT}`,
    'color:#fff',
    'white-space:nowrap',
    'pointer-events:none',
    'user-select:none',
    '-webkit-font-smoothing:antialiased',
    'transition:opacity .25s',
  ].join(';');
  const t = document.createElement('span');
  t.textContent = name.slice(0, 28);
  el.append(t);
  if (status === 'duty') {
    const c = document.createElement('span');
    c.textContent = 'Đang trực';
    c.style.cssText = `font:700 10px/1 ${LABEL_FONT};padding:3px 6px;border-radius:99px;background:#16a34a;color:#fff`;
    el.append(c);
  }
  return htmlLabel(el, 1.88);
}

function createPillSprite(opts: {
  text: string;
  bg: string;
  fg: string;
  dot: string | null;
  chip?: string | null;
  chipColor?: string;
  height: number;
}): THREE.Sprite {
  const S = 3;
  const H = 44;
  const font = '600 22px Inter, "Segoe UI", system-ui, sans-serif';
  const chipFont = '700 14px Inter, "Segoe UI", system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const tw = Math.ceil(measure.measureText(opts.text).width);
  measure.font = chipFont;
  const cw = opts.chip ? Math.ceil(measure.measureText(opts.chip).width) + 16 : 0;
  const padL = opts.dot ? 30 : 16;
  const W = padL + tw + (opts.chip ? cw + 10 : 0) + 16;

  const canvas = document.createElement('canvas');
  canvas.width = (W + 8) * S;
  canvas.height = (H + 8) * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.translate(4, 4);
  // Bóng đổ mềm + nền viên thuốc
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, H / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (opts.dot) {
    ctx.fillStyle = opts.dot;
    ctx.beginPath();
    ctx.arc(17, H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = opts.fg;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(opts.text, padL, H / 2 + 1);
  if (opts.chip) {
    const x = padL + tw + 10;
    ctx.fillStyle = opts.chipColor ?? '#2563eb';
    ctx.beginPath();
    ctx.roundRect(x, 10, cw, H - 20, (H - 20) / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = chipFont;
    ctx.textAlign = 'center';
    ctx.fillText(opts.chip, x + cw / 2, H / 2 + 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(opts.height * aspect, opts.height, 1);
  sprite.renderOrder = 9;
  return sprite;
}

// ───────────────────────── Nhân vật bán chân thật ─────────────────────────

/** Kích thước đầu (ellipsoid) — dùng chung cho mặt, tóc, kính */
const HEAD = { a: 0.118, b: 0.142, c: 0.128 };
const JAW_TAPER_X = 0.24;
const JAW_TAPER_Z = 0.1;

/** Toạ độ z trên bề mặt khuôn mặt tại (x, y) — tính cả độ thon cằm. */
/** Độ thon cằm hiện hành (V-line cho nữ, hàm vuông hơn cho nam) — đặt trước khi dựng mặt. */
let jawTaper = JAW_TAPER_X;

function faceZ(x: number, y: number, lift = 0): number {
  const t = y < 0 ? Math.min(1, -y / HEAD.b) : 0;
  const x0 = x / (1 - jawTaper * (0.55 * t + 0.45 * t * t));
  const k = 1 - (x0 / HEAD.a) ** 2 - (y / HEAD.b) ** 2;
  const z0 = HEAD.c * Math.sqrt(Math.max(0, k));
  return z0 * (1 - JAW_TAPER_Z * t) + lift;
}

const skinDetailCache = new Map<string, THREE.CanvasTexture>();
/**
 * Texture chi tiết da (nhân với màu da): má hồng, phấn mắt, tạo khối gò má/cằm, ửng đầu mũi.
 * Equirect theo UV hình cầu: mặt trước ở u = 0.25.
 */
function createSkinDetailTexture(feminine: boolean): THREE.CanvasTexture {
  const key = feminine ? 'f' : 'm';
  const hit = skinDetailCache.get(key);
  if (hit) return hit;
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  // Toạ độ mặt (x, y — mét, gốc giữa đầu) → pixel trên texture
  const uv = (x: number, y: number) => {
    const nx = THREE.MathUtils.clamp(x / HEAD.a, -0.99, 0.99);
    const ny = THREE.MathUtils.clamp(y / HEAD.b, -0.99, 0.99);
    const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
    let phi = Math.atan2(nz, -nx);
    if (phi < 0) phi += Math.PI * 2;
    return { px: (phi / (Math.PI * 2)) * W, py: (Math.acos(ny) / Math.PI) * H };
  };
  const blob = (x: number, y: number, rPx: number, color: string, alpha: number, sx = 1, sy = 1) => {
    const { px, py } = uv(x, y);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rPx);
    g.addColorStop(0, color.replace('A', String(alpha)));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  for (const s of [-1, 1]) {
    // Má hồng
    blob(s * 0.056, -0.018, 40, 'rgba(255,125,135,A)', feminine ? 0.3 : 0.1, 1.2, 0.85);
    // Phấn mắt / bọng mí
    blob(s * 0.044, 0.026, 26, feminine ? 'rgba(190,110,120,A)' : 'rgba(150,110,95,A)', feminine ? 0.4 : 0.16, 1.5, 0.75);
    // Quầng nhẹ dưới mắt (tạo chiều sâu)
    blob(s * 0.042, -0.002, 20, 'rgba(150,110,110,A)', 0.12, 1.6, 0.6);
    // Tạo khối dưới gò má
    blob(s * 0.085, -0.06, 40, 'rgba(120,80,70,A)', feminine ? 0.12 : 0.2, 0.7, 1.2);
    // Nam: viền hàm sẫm nhẹ (râu cạo)
    if (!feminine) blob(s * 0.06, -0.11, 60, 'rgba(90,80,85,A)', 0.16, 1.3, 0.7);
  }
  blob(0, -0.045, 14, 'rgba(255,120,120,A)', 0.22); // ửng đầu mũi
  blob(0, -0.125, 26, 'rgba(255,140,140,A)', feminine ? 0.14 : 0.05, 1.4, 0.7); // cằm
  if (!feminine) blob(0, -0.1, 70, 'rgba(90,80,85,A)', 0.12, 1.2, 0.8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  skinDetailCache.set(key, tex);
  return tex;
}

function createHeadGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * HEAD.a;
    const y = p.getY(i) * HEAD.b;
    let z = p.getZ(i) * HEAD.c;
    if (y < 0) {
      const t = Math.min(1, -y / HEAD.b);
      // V-line: thon dần mạnh hơn ở cằm (bình phương) để cằm thanh, má vẫn đầy
      x *= 1 - jawTaper * (0.55 * t + 0.45 * t * t);
      z *= 1 - JAW_TAPER_Z * t;
    }
    // Gò má & trán nhô nhẹ
    if (z > 0) z *= 1 + 0.04 * Math.exp(-((y - 0.02) ** 2) / 0.002) * Math.exp(-((Math.abs(x) - 0.06) ** 2) / 0.0015);
    // Hốc mắt: lõm nhẹ để nhãn cầu nằm sâu tự nhiên dưới cung mày
    if (z > 0) z -= 0.0075 * Math.exp(-((Math.abs(x) - 0.042) ** 2 + ((y - 0.012) * 1.2) ** 2) / (2 * 0.0125 ** 2));
    // Sống mũi nhô nhẹ giữa hai mắt
    if (z > 0) z += 0.004 * Math.exp(-(x ** 2) / (2 * 0.008 ** 2)) * Math.exp(-((y + 0.005) ** 2) / (2 * 0.025 ** 2));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

const irisTexCache = new Map<string, THREE.CanvasTexture>();
/** Texture nhãn cầu (equirect): lòng trắng, mống mắt có vân, đồng tử, đốm sáng. Mặt trước ở u=0.25. */
function createEyeTexture(irisColor: string): THREE.CanvasTexture {
  const hit = irisTexCache.get(irisColor);
  if (hit) return hit;
  const H = 256;
  const W = H * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f6f3ef';
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.25;
  const cy = H * 0.5;
  const R = H * 0.19;
  const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  g.addColorStop(0, '#1a120d');
  g.addColorStop(0.3, irisColor);
  g.addColorStop(0.85, irisColor);
  g.addColorStop(1, '#120c08');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,190,0.18)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42);
    ctx.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = '#050403';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(cx - R * 0.32, cy - R * 0.34, R * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx + R * 0.3, cy + R * 0.28, R * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  irisTexCache.set(irisColor, tex);
  return tex;
}

let hairStrandTex: THREE.CanvasTexture | null = null;
/** Bump map sợi tóc mảnh chạy dọc (theo kinh tuyến của hình cầu) → ánh tóc mượt. */
function getHairStrandTexture(): THREE.CanvasTexture {
  if (hairStrandTex) return hairStrandTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 1024;
    const v = 90 + Math.random() * 120;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 0.8 + Math.random() * 1.4, 64);
  }
  hairStrandTex = new THREE.CanvasTexture(c);
  hairStrandTex.wrapS = THREE.RepeatWrapping;
  hairStrandTex.wrapT = THREE.RepeatWrapping;
  hairStrandTex.repeat.set(3, 1);
  return hairStrandTex;
}

/** Tóc dạng vỏ ellipsoid mượt: các đỉnh ngoài vùng phủ tóc được thu vào trong đầu → đường chân tóc tự nhiên. */
function createHairGeometry(style: Avatar3DConfig['hairStyle']): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 80, 54);
  const p = g.attributes.position as THREE.BufferAttribute;
  const longish = style === 'bob' || style === 'long';
  const front = style === 'bob' ? 0.38 : style === 'long' ? 0.52 : style === 'slick' ? 0.6 : 0.55; // ny chân tóc trán
  const side = longish ? -0.62 : 0.08;
  const back = longish ? -0.66 : style === 'ponytail' || style === 'bun' ? -0.32 : -0.42;
  const vol = style === 'bob' ? 1.1 : style === 'long' ? 1.085 : 1.075;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i);
    const ny = p.getY(i);
    const nz = p.getZ(i);
    const phi = Math.abs(Math.atan2(nx, nz)); // 0 = trước, π = sau
    const sideW = THREE.MathUtils.smoothstep(phi, 0.5, 1.25);
    const backW = THREE.MathUtils.smoothstep(phi, 1.7, 2.6);
    // Tóc dài: mái lệch chéo (rẽ ngôi bên trái, mái phủ xéo sang phải)
    const frontLine = style === 'long' ? front - 0.16 * nx + 0.05 * Math.cos(nx * 6) : front;
    let line = THREE.MathUtils.lerp(frontLine, side, sideW);
    line = THREE.MathUtils.lerp(line, back, backW);
    // Khoét quanh tai (trừ kiểu bob)
    if (!longish) line += 0.32 * Math.exp(-((phi - Math.PI / 2) ** 2) / 0.09) * Math.exp(-((ny + 0.05) ** 2) / 0.05);
    // Mái bob hơi lượn
    if (style === 'bob' && phi < 0.6) line = front - 0.06 * Math.cos(nx * 9);

    // Dải chuyển tiếp mềm quanh chân tóc: vỏ tóc mỏng dần rồi lẩn vào da → viền mượt, không răng cưa
    const cover = THREE.MathUtils.smoothstep(ny - line, -0.02, 0.06);
    const covered = cover > 0.001;
    let s = vol;
    if (longish && ny < 0.1) s += (style === 'long' ? 0.05 : 0.09) * THREE.MathUtils.smoothstep(-ny, -0.1, 0.6) * (phi > 0.5 ? 1 : 0.2);
    if ((style === 'short' || style === 'slick') && ny > 0.55 && nz > 0) s += 0.035 * (ny - 0.55) * 2.2; // mái phồng nhẹ
    // Rẽ ngôi lệch cho kiểu slick
    if (style === 'slick' && ny > 0.35) s -= 0.03 * Math.exp(-((nx + 0.38) ** 2) / 0.004);
    s = THREE.MathUtils.lerp(0.97, s, cover); // ngoài vùng tóc: nằm ngay dưới da (bị che)
    let x = nx * HEAD.a * s;
    let z = nz * HEAD.c * s;
    const yScale = THREE.MathUtils.lerp(0.97, longish ? 1.06 : 1.075, cover);
    const y = ny * HEAD.b * yScale + 0.006 * cover;
    if (y < 0) {
      const t = Math.min(1, -y / HEAD.b);
      x *= 1 - jawTaper * t * (longish && covered ? 0.3 : 1);
      z *= 1 - JAW_TAPER_Z * t;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Mảng tóc dài xõa sau lưng & hai bên vai (bề mặt tham số, có gợn sóng sợi, đuôi tóc so le). */
function createLongHairCurtain(): THREE.BufferGeometry {
  const U = 48;
  const V = 34;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= V; j++) {
    const v = j / V;
    for (let i = 0; i <= U; i++) {
      const u = (i / U) * 2 - 1; // -1..1 quanh phía sau
      const range = THREE.MathUtils.lerp(1.95, 1.2, THREE.MathUtils.smoothstep(v, 0.28, 0.62));
      const phi = Math.PI + u * range;
      const r =
        THREE.MathUtils.lerp(HEAD.a * 1.06, 0.19, THREE.MathUtils.smoothstep(v, 0.22, 0.72)) +
        0.004 * Math.sin(u * 34 + v * 3) +
        0.012 * v * v;
      // Đuôi tóc so le, dài hơn ở giữa lưng
      const len = 0.44 - 0.07 * u * u + 0.012 * Math.sin(u * 23);
      const y = 0.035 - v * len;
      const zScale = v < 0.3 ? HEAD.c / HEAD.a : THREE.MathUtils.lerp(HEAD.c / HEAD.a, 0.9, THREE.MathUtils.smoothstep(v, 0.3, 0.7));
      pos.push(Math.sin(phi) * r, y, Math.cos(phi) * r * zScale);
      uv.push((u + 1) * 1.5, v);
    }
  }
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i;
      const b = a + U + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points: THREE.Vector3[], r0: number, r1: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 24, 1, 12, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const segs = 25;
  const ring = 13;
  const center = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    curve.getPointAt(t, center);
    const r = THREE.MathUtils.lerp(r0, r1, t);
    for (let j = 0; j < ring; j++) {
      const idx = i * ring + j;
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function lathe(profile: [number, number][], mat: THREE.Material, flattenZ = 0.7, segments = 32): THREE.Mesh {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const m = new THREE.Mesh(geo, mat);
  m.scale.z = flattenZ;
  return m;
}

/** Chi thon mượt (đùi/bắp chân/cánh tay): lathe đầu tròn, to trên nhỏ dưới, có bụng cơ nhẹ. */
function limb(rTop: number, rBottom: number, len: number, mat: THREE.Material, belly = 0.08): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  const half = len / 2;
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rBottom, -half + Math.sin(a) * rBottom));
  }
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const r = THREE.MathUtils.lerp(rBottom, rTop, t) * (1 + belly * Math.sin(t * Math.PI) * (t < 0.6 ? 1 : 0.6));
    pts.push(new THREE.Vector2(r, -half + t * len));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rTop, half + Math.sin(a) * rTop));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat);
}

function capsule(r: number, len: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
}


/**
 * Dựng nhân vật 3D bán chân thật (tỷ lệ ~1:6.5): mặt 3D có nhãn cầu + mí mắt chớp, lông mày, mũi, môi, tai;
 * tóc mượt có đường chân tóc; thân lathe mềm mại; tay/chân capsule; trang phục Vest / Đầm / Sơ mi / Polo.
 */
export function createChibiAvatar(opts: {
  name: string;
  config: Avatar3DConfig;
  isSelf?: boolean;
  isOnDuty?: boolean;
  /** Nhân viên (không phải khách) — đổi màu chấm trạng thái */
  isStaff?: boolean;
}): AnimatedAvatar {
  const { name, config, isSelf = false, isOnDuty = false } = opts;
  const group = new THREE.Group();
  const skinColor = config.skinTone || '#fce2c4';
  const outfitColor = config.outfitColor || '#1e3a8a';
  const pantsColor = config.pantsColor || '#1e293b';
  const hairColor = config.hairColor || '#1c1917';
  const style = config.outfitStyle;

  const skin = new THREE.MeshPhysicalMaterial({
    color: skinColor,
    roughness: 0.52,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffb59e'),
  });
  const fabric = new THREE.MeshPhysicalMaterial({ color: outfitColor, roughness: 0.78, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(outfitColor).lerp(new THREE.Color('#ffffff'), 0.35) });
  const pantsMat = new THREE.MeshPhysicalMaterial({ color: pantsColor, roughness: 0.75, sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(pantsColor).lerp(new THREE.Color('#ffffff'), 0.3) });
  const whiteShirt = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.62 });
  const shoeMat = new THREE.MeshPhysicalMaterial({
    color: style === 'polo' || style === 'shirt' ? '#3b2a20' : '#141414',
    roughness: 0.35,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: hairColor,
    roughness: 0.42,
    bumpMap: getHairStrandTexture(),
    bumpScale: 0.6,
    sheen: 1,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(hairColor).lerp(new THREE.Color('#ffffff'), 0.45),
    clearcoat: style === 'suit' ? 0.25 : 0.15,
    clearcoatRoughness: 0.4,
  });

  // ── Chân: hông → đùi → ống chân → giày ──
  const isDress = style === 'dress';
  let skirtGroup: THREE.Group | null = null;
  const knees: THREE.Group[] = [];
  const makeLeg = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.9, 0);
    const legMat = isDress ? skin : pantsMat;
    // Đùi (thon dần về gối)
    const thigh = limb(isDress ? 0.058 : 0.078, isDress ? 0.043 : 0.057, 0.36, legMat, 0.06);
    thigh.position.y = -0.21;
    pivot.add(thigh);
    // Gối → ống chân (bắp chân nở nhẹ) → giày
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    const shin = limb(isDress ? 0.042 : 0.054, isDress ? 0.03 : 0.045, 0.34, legMat, isDress ? 0.16 : 0.08);
    shin.position.y = -0.2;
    // Khớp gối liền mạch khi gập
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(isDress ? 0.043 : 0.057, 16, 12), legMat);
    knee.add(shin, kneeCap);
    const shoe = capsule(0.046, 0.13, shoeMat);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.12, 1, 0.78);
    shoe.position.set(0, -0.43, 0.045);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.24), new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.8 }));
    sole.position.set(0, -0.462, 0.045);
    knee.add(shoe, sole);
    if (isDress) {
      // Giày cao gót công sở: mũi thon, gót mảnh, không đế bệt
      sole.visible = false;
      shoe.scale.set(0.82, 0.92, 0.62);
      shoe.position.set(0, -0.43, 0.05);
      shoe.rotation.x = Math.PI / 2 + 0.22;
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.005, 0.055, 10), shoeMat);
      heel.position.set(0, -0.44, -0.012);
      knee.add(heel);
    }
    pivot.add(knee);
    knees.push(knee);
    return pivot;
  };
  const leftLeg = makeLeg(-0.082);
  const rightLeg = makeLeg(0.082);
  group.add(leftLeg, rightLeg);

  // ── Thân ──
  if (isDress) {
    const bodice = lathe([[0.0, 1.0], [0.135, 1.0], [0.125, 1.08], [0.15, 1.2], [0.165, 1.3], [0.15, 1.38], [0.07, 1.43], [0.0, 1.43]], fabric, 0.68);
    // Chân váy chữ A dài qua gối, hơi xòe → che chân khi bước
    const skirtMesh = lathe(
      [[0.0, 0.4], [0.235, 0.4], [0.238, 0.43], [0.215, 0.58], [0.18, 0.76], [0.15, 0.9], [0.137, 1.0], [0.0, 1.0]],
      fabric,
      0.82,
      40,
    );
    skirtMesh.position.y = -1.0;
    skirtGroup = new THREE.Group();
    skirtGroup.position.y = 1.0;
    skirtGroup.add(skirtMesh);
    const skirt = skirtGroup;
    const belt = lathe([[0.137, 0.985], [0.137, 1.03]], new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 }), 0.68);
    group.add(bodice, skirt, belt);
  } else {
        const torso = lathe(
      [[0.0, 0.86], [0.15, 0.86], [0.158, 0.95], [0.145, 1.05], [0.155, 1.18], [0.175, 1.3], [0.17, 1.38], [0.08, 1.44], [0.0, 1.44]],
      fabric,
      0.66,
    );
    group.add(torso);
    // Hông quần
    const hips = lathe([[0.0, 0.8], [0.15, 0.8], [0.158, 0.9], [0.0, 0.9]], pantsMat, 0.68);
    group.add(hips);
    const belt = lathe([[0.159, 0.88], [0.159, 0.915]], new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }), 0.68);
    group.add(belt);
  }

  // Vai bo tròn
  for (const sx of [-0.162, 0.162]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 16), fabric);
    sh.scale.set(1, 0.85, 0.78);
    sh.position.set(sx, 1.358, 0);
    group.add(sh);
  }

  // Cổ
  const neck = capsule(0.046, 0.06, skin);
  neck.position.y = 1.47;
  group.add(neck);

  const frontZ = (y: number, r: number) => r * 0.66 + 0.002 + (y > 1.2 ? 0.004 : 0);

  if (style === 'suit') {
    // Ve áo vest + sơ mi chữ V + cà vạt
    const shirtV = new THREE.Mesh(new THREE.CircleGeometry(0.085, 3), whiteShirt);
    shirtV.position.set(0, 1.33, frontZ(1.33, 0.172));
    shirtV.rotation.z = Math.PI;
    shirtV.scale.set(0.9, 1.5, 1);
    group.add(shirtV);
    const lapelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(outfitColor).multiplyScalar(0.75), roughness: 0.6 });
    for (const s of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.012), lapelMat);
      lapel.position.set(s * 0.05, 1.3, frontZ(1.3, 0.172) + 0.004);
      lapel.rotation.z = s * 0.38;
      group.add(lapel);
    }
    const tieColor = outfitColor === '#1e3a8a' ? '#b91c1c' : '#1d4ed8';
    const tieMat = new THREE.MeshPhysicalMaterial({ color: tieColor, roughness: 0.4, sheen: 0.8, sheenColor: new THREE.Color('#ffffff') });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), tieMat);
    knot.position.set(0, 1.405, frontZ(1.4, 0.17) + 0.008);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.012, 0.2, 4), tieMat);
    tie.rotation.y = Math.PI / 4;
    tie.scale.z = 0.3;
    tie.position.set(0, 1.29, frontZ(1.29, 0.165) + 0.01);
    tie.rotation.x = -0.12;
    group.add(knot, tie);
    for (const by of [1.12, 1.03]) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3 }));
      btn.position.set(0, by, frontZ(by, 0.15) + 0.003);
      group.add(btn);
    }
  }
  if (style === 'shirt' || style === 'polo' || style === 'suit') {
    // Cổ áo
    const collar = lathe([[0.058, 1.42], [0.07, 1.455], [0.062, 1.47]], style === 'suit' ? whiteShirt : fabric, 1, 20);
    group.add(collar);
  }
  if (style === 'shirt' || style === 'polo') {
    const placketLen = style === 'polo' ? 0.1 : 0.48;
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.022, placketLen, 0.006), new THREE.MeshStandardMaterial({ color: new THREE.Color(outfitColor).multiplyScalar(0.85), roughness: 0.6 }));
    placket.position.set(0, 1.42 - placketLen / 2, 0.118);
    group.add(placket);
  }

  // Thẻ nhân viên khi đang trực
  if (isOnDuty) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.006), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    card.position.set(0.085, 1.22, frontZ(1.22, 0.162) + 0.006);
    const cardTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.02, 0.007), new THREE.MeshStandardMaterial({ color: '#2563eb' }));
    cardTop.position.set(0.085, 1.25, frontZ(1.25, 0.162) + 0.007);
    group.add(card, cardTop);
  }

  // ── Tay: vai → cánh tay → cẳng tay → bàn tay ──
  const longSleeve = style === 'suit' || style === 'shirt';
  const elbows: THREE.Group[] = [];
  const makeArm = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 1.37, 0);
    pivot.rotation.z = offsetX < 0 ? -0.07 : 0.07;
    const sleeveMat = isDress ? skin : fabric;
    const upper = limb(0.048, 0.04, 0.24, longSleeve || style === 'polo' ? fabric : sleeveMat, 0.07);
    upper.position.y = -0.14;
    pivot.add(upper);
    if (style === 'polo') {
      // Tay áo ngắn polo: phần dưới cánh tay là da
      upper.scale.y = 0.55;
      upper.position.y = -0.085;
      const bare = limb(0.04, 0.036, 0.13, skin, 0.05);
      bare.position.y = -0.2;
      pivot.add(bare);
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 20), fabric);
      hem.rotation.x = Math.PI / 2;
      hem.position.y = -0.15;
      pivot.add(hem);
    }
    if (isDress) {
      const capSleeve = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), fabric);
      capSleeve.position.y = -0.03;
      pivot.add(capSleeve);
    }
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.29, 0);
    elbow.rotation.x = -0.12;
    const fore = limb(0.039, 0.03, 0.22, longSleeve ? fabric : skin, 0.1);
    fore.position.y = -0.13;
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), longSleeve ? fabric : skin);
    elbow.add(fore, elbowCap);
    if (longSleeve) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.028, 16), whiteShirt);
      cuff.position.y = -0.255;
      elbow.add(cuff);
    }
    // Bàn tay: lòng bàn tay + 4 ngón khép + ngón cái
    const palm = capsule(0.028, 0.04, skin);
    palm.scale.set(1, 1, 0.55);
    palm.position.set(0, -0.3, 0.004);
    const fingers = capsule(0.024, 0.035, skin);
    fingers.scale.set(1, 1, 0.45);
    fingers.position.set(0, -0.35, 0.008);
    fingers.rotation.x = -0.25;
    const thumb = capsule(0.01, 0.028, skin);
    thumb.position.set(offsetX < 0 ? 0.022 : -0.022, -0.29, 0.02);
    thumb.rotation.z = offsetX < 0 ? -0.45 : 0.45;
    elbow.add(palm, fingers, thumb);
    pivot.add(elbow);
    elbows.push(elbow);
    return pivot;
  };
  const leftArm = makeArm(-0.205);
  const rightArm = makeArm(0.205);
  group.add(leftArm, rightArm);

  // ── Đầu ──
  const headBaseY = 1.615;
  const headGroup = new THREE.Group();
  headGroup.position.y = headBaseY;

  // Nét mặt theo phong cách: nữ (đầm / tóc dài, bob, đuôi ngựa, búi) → mặt V-line, mắt to có mi, môi hồng;
  // nam → hàm vuông hơn, mày đậm thẳng, mũi cao.
  const feminine = isDress || ['long', 'bob', 'ponytail', 'bun'].includes(config.hairStyle);
  jawTaper = feminine ? 0.32 : 0.17;
  const faceSkin = skin.clone();
  faceSkin.userData = {}; // để viền rim được gắn lại cho bản clone
  faceSkin.map = createSkinDetailTexture(feminine);
  faceSkin.sheen = feminine ? 0.55 : 0.3;
  const head = new THREE.Mesh(createHeadGeometry(), faceSkin);
  headGroup.add(head);

  // Tai
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin);
    ear.scale.set(0.011, 0.031, 0.02);
    ear.position.set(s * (HEAD.a - 0.002), -0.005, -0.01);
    ear.rotation.y = s * 0.3;
    headGroup.add(ear);
  }

  // Mắt: nhãn cầu + mí trên (chớp được) + viền mi
  const eyeR = feminine ? 0.0186 : 0.0172;
  const eyeY = 0.012;
  const eyeX = feminine ? 0.043 : 0.042;
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: createEyeTexture(feminine ? '#6b4528' : '#4a3020'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 });
  eyeMat.userData.noRim = true;
  const lidMat = skin;
  const linerMat = new THREE.MeshStandardMaterial({ color: '#1b130f', roughness: 0.6 });
  linerMat.userData.noRim = true;
  const blinkers: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const ez = faceZ(s * eyeX, eyeY) - eyeR * 0.95;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 16), eyeMat);
    eye.position.set(s * eyeX, eyeY, ez);
    eye.rotation.y = -s * 0.06; // hơi hướng vào giữa cho ánh nhìn tự nhiên
    headGroup.add(eye);

    const lidPivot = new THREE.Group();
    lidPivot.position.copy(eye.position);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 24, 10, 0, Math.PI * 2, 0, 0.92), lidMat);
    lid.rotation.x = feminine ? -0.5 : -0.56;
    const liner = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (feminine ? 1.16 : 1.13), 24, 2, 0, Math.PI * 2, 0.8, feminine ? 0.17 : 0.11), linerMat);
    liner.rotation.x = feminine ? -0.5 : -0.56;
    lidPivot.add(lid, liner);
    if (feminine) {
      // Kẻ mắt kéo dài nhẹ ở khoé ngoài (hiệu ứng mi cong) — bám theo mí nên chớp mắt vẫn khớp
      liner.scale.set(1.08, 1, 1);
      liner.position.x = s * 0.0012;
    }
    lidPivot.userData.open = 0;
    headGroup.add(lidPivot);
    blinkers.push(lidPivot);

    // Mí dưới mỏng
    const lower = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.06, 24, 4, 0, Math.PI * 2, 2.25, 0.5), lidMat);
    lower.position.copy(eye.position);
    lower.rotation.x = 0.15;
    headGroup.add(lower);

    // Lông mày: 2 đoạn tạo vòm
    const browMat = new THREE.MeshStandardMaterial({
      color: feminine ? new THREE.Color(hairColor).lerp(new THREE.Color('#6b4a3a'), 0.45) : new THREE.Color(hairColor).multiplyScalar(0.9),
      roughness: 0.8,
    });
    browMat.userData.noRim = true;
    const bw = feminine ? 0.0019 : 0.0042;
    const by = feminine ? 0.048 : 0.044;
    const inner = capsule(bw, 0.022, browMat);
    inner.rotation.z = Math.PI / 2 + s * (feminine ? 0.18 : 0.06);
    inner.position.set(s * 0.03, by, faceZ(s * 0.03, by) + 0.001);
    const outer = capsule(bw * 0.85, 0.02, browMat);
    outer.rotation.z = Math.PI / 2 - s * (feminine ? 0.42 : 0.18);
    outer.position.set(s * 0.055, by - (feminine ? 0.001 : 0.002), faceZ(s * 0.055, by) + 0.0005);
    headGroup.add(inner, outer);
  }

  // Mũi: sống mũi + đầu mũi + 2 cánh mũi
  // Mũi dùng vật liệu da KHÔNG viền rim (tránh quầng sáng quanh khối nhỏ)
  const noseMat = skin.clone();
  noseMat.userData = { noRim: true };
  noseMat.color.lerp(new THREE.Color('#e9a89a'), 0.12); // cùng tông với vùng má/mũi đã ửng hồng
  noseMat.sheen = 0;
  const bridge = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), noseMat);
  bridge.scale.set(feminine ? 0.0046 : 0.0068, feminine ? 0.022 : 0.029, feminine ? 0.0072 : 0.011);
  bridge.rotation.x = -0.42; // đỉnh mũi tựa vào trán, chân mũi nhô ra phía trước
  bridge.position.set(0, -0.028, faceZ(0, -0.028) - 0.002);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(feminine ? 0.0054 : 0.0074, 16, 12), noseMat);
  tip.position.set(0, -0.045, faceZ(0, -0.045) + 0.0028);
  headGroup.add(bridge, tip);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(feminine ? 0.0038 : 0.005, 12, 10), noseMat);
    wing.position.set(s * 0.0092, -0.049, faceZ(s * 0.0092, -0.049) - 0.001);
    headGroup.add(wing);
  }

  // Môi: môi trên + môi dưới đầy đặn hơn
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(skinColor).lerp(new THREE.Color(feminine ? '#d24b63' : '#a8544a'), feminine ? 0.75 : 0.45),
    roughness: feminine ? 0.3 : 0.45,
    clearcoat: feminine ? 0.7 : 0.2,
    clearcoatRoughness: 0.2,
  });
  const upperLip = capsule(feminine ? 0.0037 : 0.0032, feminine ? 0.02 : 0.023, lipMat);
  upperLip.rotation.z = Math.PI / 2;
  upperLip.scale.z = 0.7;
  upperLip.position.set(0, -0.08, faceZ(0, -0.08) - 0.0015);
  const lowerLip = capsule(feminine ? 0.0055 : 0.0042, feminine ? 0.016 : 0.019, lipMat);
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.scale.z = 0.7;
  lowerLip.position.set(0, -0.0885, faceZ(0, -0.0885) - 0.0025);
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#5a2420', roughness: 0.7 });
  mouthMat.userData.noRim = true;
  const mouthLine = capsule(0.0013, 0.026, mouthMat);
  mouthLine.rotation.z = Math.PI / 2;
  mouthLine.position.set(0, -0.0843, faceZ(0, -0.0843) - 0.0008);
  headGroup.add(upperLip, lowerLip, mouthLine);
  // Khoé miệng cười nhẹ
  for (const s of [-1, 1]) {
    const corner = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), mouthMat);
    corner.position.set(s * 0.0155, -0.0825, faceZ(s * 0.0155, -0.0825) - 0.0012);
    headGroup.add(corner);
  }

  // Tóc
  const hair = new THREE.Mesh(createHairGeometry(config.hairStyle), hairMat);
  headGroup.add(hair);
  if (config.hairStyle === 'long') {
    const curtainMat = hairMat.clone();
    curtainMat.side = THREE.DoubleSide;
    headGroup.add(new THREE.Mesh(createLongHairCurtain(), curtainMat));
  }
  if (config.hairStyle === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 18), hairMat);
    bun.scale.set(1, 0.9, 0.85);
    bun.position.set(0, 0.06, -HEAD.c - 0.03);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 20), new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 }));
    band.position.set(0, 0.055, -HEAD.c - 0.006);
    headGroup.add(bun, band);
  }
  if (config.hairStyle === 'ponytail') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 8, 18), new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 }));
    band.position.set(0, 0.03, -HEAD.c - 0.012);
    const tail = tube(
      [new THREE.Vector3(0, 0.03, -HEAD.c - 0.015), new THREE.Vector3(0, -0.02, -HEAD.c - 0.05), new THREE.Vector3(0, -0.12, -HEAD.c - 0.045), new THREE.Vector3(0, -0.22, -HEAD.c - 0.015)],
      0.03,
      0.008,
      hairMat,
    );
    headGroup.add(band, tail);
  }

  // Kính gọng mảnh
  if (config.hasGlasses) {
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.25 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1 });
    lensMat.userData.noRim = true;
    const gz = faceZ(eyeX, eyeY) + 0.016;
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0025, 8, 28), frameMat);
      rim.scale.set(1.1, 0.85, 1);
      rim.position.set(s * eyeX, eyeY - 0.002, gz);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), lensMat);
      lens.scale.set(1.1, 0.85, 1);
      lens.position.set(s * eyeX, eyeY - 0.002, gz - 0.001);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.12), frameMat);
      arm.position.set(s * (HEAD.a + 0.004), eyeY + 0.004, gz - 0.065);
      headGroup.add(rim, lens, arm);
    }
    const nb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.003), frameMat);
    nb.position.set(0, eyeY + 0.004, gz + 0.002);
    headGroup.add(nb);
  }

  group.add(headGroup);

  // Nhãn tên nổi
  const badge = createNameTag(name, isOnDuty ? 'duty' : isSelf ? 'self' : opts.isStaff ? 'staff' : 'guest');
  badge.position.y = 1.97;
  group.add(badge);

  // Nhân vật là vật thể ĐỘNG: không đổ bóng vào shadow map đã bake; bóng đĩa mờ + viền rim cho nổi khối.
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if (!m.userData.noRim) applyRimLight(m);
    });
  });
  addBlobShadow(group, 0.36);

  return {
    group,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    headBaseY,
    blinkers,
    blinkAt: 1 + Math.random() * 3,
    leftKnee: knees[0],
    rightKnee: knees[1],
    leftElbow: elbows[0],
    rightElbow: elbows[1],
    stride: isDress ? 0.42 : 1,
    skirt: skirtGroup,
  };
}

/** Chớp mắt tự nhiên (mỗi 2–5s) + đầu khẽ nghiêng — gọi mỗi frame cho nhân vật trong tầm nhìn. */
export function animateAvatarIdle(av: AnimatedAvatar, time: number): void {
  if (!av.blinkers.length) return;
  if (time > av.blinkAt + 0.16) av.blinkAt = time + 2 + Math.random() * 3;
  const k = time >= av.blinkAt ? Math.sin(((time - av.blinkAt) / 0.16) * Math.PI) : 0;
  const close = Math.max(0, k) * 1.55;
  for (const b of av.blinkers) b.rotation.x = close;
}

let blobGeo: THREE.PlaneGeometry | null = null;
let blobMat: THREE.MeshBasicMaterial | null = null;

function createBlobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(15,23,42,0.55)');
  g.addColorStop(0.6, 'rgba(15,23,42,0.22)');
  g.addColorStop(1, 'rgba(15,23,42,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Bóng tiếp xúc mềm dưới chân (dùng chung geometry + material). */
export function addBlobShadow(group: THREE.Object3D, radius = 0.42) {
  blobGeo ??= new THREE.PlaneGeometry(1, 1);
  blobMat ??= new THREE.MeshBasicMaterial({ map: createBlobTexture(), transparent: true, depthWrite: false });
  blobMat.userData.shared = true;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.scale.setScalar(radius * 2);
  blob.renderOrder = 1;
  blob.userData.shared = true;
  blob.userData.isBlobShadow = true;
  group.add(blob);
}

/** Avatar realtime: gắn id để raycast click. */
export function prepareRemoteAvatar(av: AnimatedAvatar, employeeId: number) {
  av.group.traverse((o) => {
    o.userData.remoteEmployeeId = employeeId;
  });
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData?.shared) return;
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/** Bong bóng chat (HTML) nằm ngay trên nhãn tên — chữ sắc nét, tự xuống dòng. */
export function createBubbleSprite(text: string): CSS2DObject {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:relative',
    'max-width:220px',
    'padding:7px 11px',
    'margin-bottom:30px',
    'border-radius:14px',
    'background:#ffffff',
    'color:#0f172a',
    `font:500 13px/1.35 ${LABEL_FONT}`,
    'box-shadow:0 6px 18px rgba(15,23,42,0.25)',
    'pointer-events:none',
    'word-wrap:break-word',
    '-webkit-font-smoothing:antialiased',
  ].join(';');
  el.textContent = text;
  const tail = document.createElement('span');
  tail.style.cssText = 'position:absolute;left:50%;bottom:-6px;width:12px;height:12px;background:#fff;transform:translateX(-50%) rotate(45deg);border-radius:2px';
  el.append(tail);
  return htmlLabel(el, 1.88);
}

/** Hiện / ẩn / thay bong bóng theo nội dung hiện tại (chỉ tạo texture khi text đổi). */
export function syncBubble(slot: BubbleSlot, parent: THREE.Object3D, text: string | null) {
  if (!text) {
    if (slot.sprite) slot.sprite.visible = false;
    return;
  }
  if (slot.text !== text || !slot.sprite) {
    if (slot.sprite) slot.sprite.parent?.remove(slot.sprite);
    slot.sprite = createBubbleSprite(text);
    slot.text = text;
  }
  if (slot.sprite.parent !== parent) parent.add(slot.sprite);
  slot.sprite.visible = true;
}

export function remoteSig(m: RemotePlayerMeta) {
  const a = m.avatar;
  return `${m.employeeName}|${m.onDuty}|${a.outfitStyle}|${a.outfitColor}|${a.pantsColor}|${a.hairStyle}|${a.hairColor}|${a.skinTone}|${a.hasGlasses}`;
}

