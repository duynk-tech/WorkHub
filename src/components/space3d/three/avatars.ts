import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const UNIFORM_LOGO_URL = '/brand/timcorp-logo-ngang.png';
const uniformLogoMats = new Map<boolean, THREE.MeshStandardMaterial>();

/** Logo thêu trên ngực áo đồng phục. Áo xanh đậm → logo trên miếng vải trắng để rõ nét. Dùng chung cho mọi nhân vật. */
function getUniformLogoMaterial(onDark: boolean): THREE.MeshStandardMaterial {
  const cached = uniformLogoMats.get(onDark);
  if (cached) return cached;
  const W = 352;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (img?: HTMLImageElement) => {
    ctx.clearRect(0, 0, W, H);
    if (onDark) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(4, 4, W - 8, H - 8, 18);
      ctx.fill();
    }
    if (img) {
      const pad = onDark ? 16 : 6;
      const s = Math.min((W - pad * 2) / img.width, (H - pad * 2) / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#1d3f91';
      ctx.font = `800 ${Math.round(H * 0.5)}px ${LABEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TIM CORP', W / 2, H / 2 + 2);
    }
    tex.needsUpdate = true;
  };
  draw();
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = UNIFORM_LOGO_URL;
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
    roughness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  mat.userData.noRim = true;
  mat.userData.shared = true;
  uniformLogoMats.set(onDark, mat);
  return mat;
}

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
  /** Góc gập chân váy khi ngồi (phủ lên đùi) */
  skirtSitX: number;
  /** Váy lúc ngồi: tấm vải phủ lên đùi rồi rủ xuống qua gối (thay cho chân váy hình chuông khi đứng) */
  skirtSit: THREE.Object3D | null;
  /** Khoang miệng — phóng theo trục y để nhép miệng khi nói */
  mouth: THREE.Object3D | null;
  /** Nhãn cầu (liếc mắt) + đốm sáng long lanh (ẩn khi chớp) */
  eyes: THREE.Object3D[];
  sparkles: THREE.Object3D[];
  /** Hướng liếc mắt hiện tại/đích + thời điểm đổi hướng kế tiếp */
  gaze: { x: number; y: number; tx: number; ty: number; at: number };
}

/**
 * Mặt vải váy lúc ngồi (toạ độ nhân vật, hông y = 0.9): vòm phủ trên 2 đùi nằm ngang từ sau hông tới gối,
 * rồi rủ xuống như rèm trước đầu gối. Hở phía trong không lộ vì 2 mép vòm buông thấp dưới đùi.
 */
function seatedSkirtGeo(halfW: number, archH: number, zTo: number, drop: number): THREE.BufferGeometry {
  const N = 14; // dọc đùi
  const M = 6; // phần rủ trước gối
  const K = 16; // quanh vòm
  const zFrom = -0.13;
  const sideDrop = 0.075;
  const pos: number[] = [];
  const rows = N + M + 1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j <= K; j++) {
      const th = (j / K) * Math.PI; // 0 → π: mép phải → đỉnh → mép trái
      const sn = Math.sin(th);
      const xArch = halfW * Math.cos(th);
      const yArch = archH * sn - sideDrop * (1 - sn);
      if (i <= N) {
        const t = i / N;
        // Hông đầy hơn, thon dần về gối
        const k = 1.08 - 0.12 * t;
        pos.push(xArch * k, yArch * (0.95 + 0.1 * (1 - t)), zFrom + (zTo - zFrom) * t);
      } else {
        const t = (i - N) / M;
        const ease = Math.sin((t * Math.PI) / 2);
        pos.push(xArch * (0.96 + 0.08 * t), yArch * (1 - ease) - drop * ease, zTo + 0.05 * Math.sin(t * Math.PI) + 0.01 * t);
      }
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < K; j++) {
      const a = i * (K + 1) + j;
      const b = a + K + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Ngồi (đùi nằm ngang) → hiện váy phủ đùi, ẩn chân váy chuông; đứng/đi → ngược lại. */
function syncSkirt(av: AnimatedAvatar) {
  if (!av.skirt || !av.skirtSit) return;
  const seated = av.leftLeg.rotation.x < -1.05;
  av.skirtSit.visible = seated;
  av.skirt.visible = !seated;
}

/** Trả góc dang tay (z) & độ nghiêng người về mặc định sau biểu cảm. */
function settleArms(av: AnimatedAvatar) {
  av.leftArm.rotation.z += (-0.07 - av.leftArm.rotation.z) * 0.2;
  av.rightArm.rotation.z += (0.07 - av.rightArm.rotation.z) * 0.2;
  av.group.rotation.x *= 0.8;
}

/** Dáng đi: sải hông, gập gối ở pha nhấc chân, đánh tay có gập khuỷu, nhún nhẹ. */
export function poseWalk(av: AnimatedAvatar, phase: number): void {
  settleArms(av);
  if (av.skirtSit?.visible) syncSkirt(av);
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
  av.group.rotation.x *= 0.8;
  const k = 0.18; // nội suy để hạ người ngồi xuống từ từ
  const lerp = (cur: number, to: number) => cur + (to - cur) * k;
  // Đùi nằm ngang ra trước (-1.48 rad). Gối gập ~1.48 rad → cẳng chân thẳng đứng, bàn chân đặt trên sàn.
  // Ghế thấp (hông thấp hơn chiều dài cẳng chân 0.46m) → cẳng chân chéo ra trước thêm góc φ để bàn chân vẫn chạm sàn.
  // Ghế bar cao → chân co lên gác thanh ghế.
  const hipY = seatY + 0.02;
  const shin = 0.46;
  const thighX = -1.48;
  const reach = (hipY - 0.03) / shin;
  const kneeBend =
    hipY > shin + 0.12 ? 1.05 : -thighX - (reach < 1 ? Math.acos(Math.max(0.2, reach)) : 0) + 0.04;
  for (const leg of [av.leftLeg, av.rightLeg]) leg.rotation.x = lerp(leg.rotation.x, thighX);
  for (const knee of [av.leftKnee, av.rightKnee]) knee.rotation.x = lerp(knee.rotation.x, kneeBend);
  // Mặc váy → khép gối; mặc quần → hai gối hơi mở
  const spread = av.skirt ? 0 : 0.06;
  av.leftLeg.rotation.z = lerp(av.leftLeg.rotation.z, spread);
  av.rightLeg.rotation.z = lerp(av.rightLeg.rotation.z, -spread);
  // Tay khép vào trong, cẳng tay đặt lên đùi (không buông thõng ra hai bên chạm ghế bên cạnh)
  for (const arm of [av.leftArm, av.rightArm]) arm.rotation.x = lerp(arm.rotation.x, -0.25);
  av.leftArm.rotation.z = lerp(av.leftArm.rotation.z, 0.2);
  av.rightArm.rotation.z = lerp(av.rightArm.rotation.z, -0.2);
  for (const el of [av.leftElbow, av.rightElbow]) el.rotation.x = lerp(el.rotation.x, -1.05);
  av.headGroup.rotation.x = lerp(av.headGroup.rotation.x, -0.06);
  if (av.skirt) av.skirt.rotation.x = lerp(av.skirt.rotation.x, av.skirtSit ? 0 : av.skirtSitX);
  // Pivot hông ở y = 0.9 trong nhân vật → hạ cả người cho hông chạm đệm
  av.group.position.y = lerp(av.group.position.y, hipY - 0.9);
  syncSkirt(av);
}

/**
 * Hoạt động khi đang ngồi (gọi SAU poseSit): gõ phím tại bàn làm việc, hoặc đặt tay lên bàn họp.
 * Bàn cao ~0.75m, vai người ngồi ~1.0m → cánh tay chếch trước, cẳng tay nằm ngang trên mặt bàn.
 */
export function poseSeatActivity(av: AnimatedAvatar, activity: 'type' | 'meeting' | 'rest', time: number): void {
  if (activity === 'rest') return;
  const k = 0.2;
  const lerp = (cur: number, to: number) => cur + (to - cur) * k;
  if (activity === 'type') {
    const tap = Math.sin(time * 17);
    av.leftArm.rotation.x = lerp(av.leftArm.rotation.x, -0.55);
    av.rightArm.rotation.x = lerp(av.rightArm.rotation.x, -0.55);
    av.leftArm.rotation.z = lerp(av.leftArm.rotation.z, 0.12);
    av.rightArm.rotation.z = lerp(av.rightArm.rotation.z, -0.12);
    // Gõ phím: 2 tay nhấp xen kẽ rất nhẹ; thỉnh thoảng 1 tay sang chuột
    const mouse = Math.sin(time * 0.6) > 0.55;
    av.leftElbow.rotation.x = lerp(av.leftElbow.rotation.x, -1.02 + tap * 0.035);
    av.rightElbow.rotation.x = lerp(av.rightElbow.rotation.x, mouse ? -0.9 : -1.02 - tap * 0.035);
    if (mouse) av.rightArm.rotation.z = lerp(av.rightArm.rotation.z, 0.05);
    av.headGroup.rotation.x = lerp(av.headGroup.rotation.x, 0.08);
  } else {
    // Họp: tay đặt lên bàn, đầu thỉnh thoảng gật / nghiêng như đang nghe
    av.leftArm.rotation.x = lerp(av.leftArm.rotation.x, -0.48);
    av.rightArm.rotation.x = lerp(av.rightArm.rotation.x, -0.48);
    av.leftArm.rotation.z = lerp(av.leftArm.rotation.z, 0.18);
    av.rightArm.rotation.z = lerp(av.rightArm.rotation.z, -0.18);
    av.leftElbow.rotation.x = lerp(av.leftElbow.rotation.x, -1.1);
    av.rightElbow.rotation.x = lerp(av.rightElbow.rotation.x, -1.1);
    av.headGroup.rotation.x = lerp(av.headGroup.rotation.x, Math.max(0, Math.sin(time * 0.9)) * 0.08);
    av.headGroup.rotation.z = lerp(av.headGroup.rotation.z, Math.sin(time * 0.37) * 0.06);
  }
}

/** Trả dáng về đứng thẳng mượt mà khi dừng. */
export function relaxPose(av: AnimatedAvatar): void {
  const d = 0.82;
  av.leftLeg.rotation.z *= d;
  av.rightLeg.rotation.z *= d;
  av.headGroup.rotation.x *= d;
  av.headGroup.rotation.z *= d;
  av.leftLeg.rotation.x *= d;
  av.rightLeg.rotation.x *= d;
  av.leftKnee.rotation.x = av.leftKnee.rotation.x * d + 0.02 * (1 - d);
  av.rightKnee.rotation.x = av.rightKnee.rotation.x * d + 0.02 * (1 - d);
  av.leftArm.rotation.x *= d;
  av.rightArm.rotation.x *= d;
  settleArms(av);
  av.leftElbow.rotation.x = av.leftElbow.rotation.x * d - 0.12 * (1 - d);
  av.rightElbow.rotation.x = av.rightElbow.rotation.x * d - 0.12 * (1 - d);
  if (av.skirt) {
    av.skirt.rotation.z *= d;
    av.skirt.rotation.x *= d;
  }
  // Đứng dậy từ ghế: nâng người lên dần (không bật thẳng)
  av.group.position.y = Math.abs(av.group.position.y) < 0.002 ? 0 : av.group.position.y * 0.8;
  if (av.skirtSit?.visible) syncSkirt(av);
}

/** Nhãn nổi gọn dạng viên thuốc, rộng theo nội dung (dùng cho sản phẩm & nhãn chung). */
export function createBadgeSprite(text: string, bgColor = '#0f172a', textColor = '#ffffff'): THREE.Sprite {
  return createPillSprite({ text: text.slice(0, 40), bg: bgColor, fg: textColor, dot: null, height: 0.2 });
}

export type NameTagStatus = 'self' | 'duty' | 'staff' | 'guest' | 'npc';

/** Nhãn tên trên đầu nhân vật: viên thuốc kính mờ tối, chấm trạng thái, tên rõ nét; đang trực có chip xanh. */
/**
 * Nhãn tên dạng HTML (CSS2D) — chữ do trình duyệt vẽ nên luôn sắc nét ở mọi khoảng cách / màn hình retina,
 * không bị tone mapping, bloom hay mipmap làm mờ như texture.
 */
export function createNameTag(name: string, status: NameTagStatus): CSS2DObject {
  // Bản thân: viền xanh dương; đang trực: viền xanh lá (không chữ); còn lại: viên tối gọn
  const ring = status === 'self' ? '#3b82f6' : status === 'duty' ? '#22c55e' : status === 'npc' ? '#a8a29e' : null;
  const border = ring ? `1.5px solid ${ring}` : '1px solid rgba(255,255,255,0.16)';
  const el = document.createElement('div');
  el.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:6px',
    'padding:3px 10px',
    'border-radius:999px',
    'background:rgba(15,23,42,0.78)',
    `border:${border}`,
    ring ? `box-shadow:0 0 0 2px ${ring}40,0 2px 8px rgba(0,0,0,0.28)` : 'box-shadow:0 2px 8px rgba(0,0,0,0.28)',
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
  const font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
  const chipFont = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Roboto, Arial, "Noto Sans", sans-serif';
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
/** Vị trí hốc mắt hiện hành (mắt anime nữ to & thấp hơn) — đặt trước khi dựng đầu */
let eyeSocket = { x: 0.042, y: 0.012, r: 0.0125 };

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
    blob(s * 0.058, -0.022, 44, 'rgba(255,120,135,A)', feminine ? 0.42 : 0.1, 1.25, 0.8);
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
  tex.anisotropy = 16;
  skinDetailCache.set(key, tex);
  return tex;
}

function createHeadGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 32, 24);
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
    if (z > 0) z -= 0.0075 * Math.exp(-((Math.abs(x) - eyeSocket.x) ** 2 + ((y - eyeSocket.y) * 1.2) ** 2) / (2 * eyeSocket.r ** 2));
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
  const R = H * 0.21;
  // Mống mắt kiểu anime: hơi bầu dục dọc, trên sẫm (bóng mi) → dưới sáng trong
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 1.12);
  const base = new THREE.Color(irisColor);
  const dark = '#' + base.clone().multiplyScalar(0.35).getHexString();
  const light = '#' + base.clone().lerp(new THREE.Color('#f3c98b'), 0.45).getHexString();
  const lin = ctx.createLinearGradient(0, -R, 0, R);
  lin.addColorStop(0, dark);
  lin.addColorStop(0.45, irisColor);
  lin.addColorStop(1, light);
  ctx.fillStyle = lin;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  // Vân mống mắt mảnh
  ctx.strokeStyle = 'rgba(255,236,200,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45);
    ctx.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
    ctx.stroke();
  }
  // Vòng viền mống mắt sẫm (limbal ring)
  ctx.strokeStyle = 'rgba(20,12,8,0.85)';
  ctx.lineWidth = R * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  // Đồng tử to
  ctx.fillStyle = '#060403';
  ctx.beginPath();
  ctx.arc(0, R * 0.04, R * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Đốm sáng long lanh: 1 lớn trên-trái, 1 nhỏ dưới-phải + ánh phản quang nhạt dưới đáy
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.34, -R * 0.38, R * 0.24, R * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(R * 0.36, R * 0.3, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
  const glow = ctx.createRadialGradient(0, R * 0.62, 0, 0, R * 0.62, R * 0.5);
  glow.addColorStop(0, 'rgba(255,240,210,0.35)');
  glow.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-R, 0, R * 2, R);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
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
  const g = new THREE.SphereGeometry(1, 56, 38);
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
  const U = 48; // giữ đủ mẫu cho gợn sóng sợi tóc theo chiều ngang
  const V = 22;
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
  // 14×8 phân đoạn: đủ mượt ở khoảng cách camera thường dùng (24×12 cũ tốn gấp ~2.5 lần tam giác)
  const TUBE_SEGS = 14;
  const TUBE_RADIAL = 8;
  const geo = new THREE.TubeGeometry(curve, TUBE_SEGS, 1, TUBE_RADIAL, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const segs = TUBE_SEGS + 1;
  const ring = TUBE_RADIAL + 1;
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

function lathe(profile: [number, number][], mat: THREE.Material, flattenZ = 0.7, segments = 24): THREE.Mesh {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const m = new THREE.Mesh(geo, mat);
  m.scale.z = flattenZ;
  return m;
}

/** Chi thon mượt (đùi/bắp chân/cánh tay): lathe đầu tròn, to trên nhỏ dưới, có bụng cơ nhẹ. */
function limb(rTop: number, rBottom: number, len: number, mat: THREE.Material, belly = 0.08): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  const half = len / 2;
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rBottom, -half + Math.sin(a) * rBottom));
  }
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const r = THREE.MathUtils.lerp(rBottom, rTop, t) * (1 + belly * Math.sin(t * Math.PI) * (t < 0.6 ? 1 : 0.6));
    pts.push(new THREE.Vector2(r, -half + t * len));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * rTop, half + Math.sin(a) * rTop));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat);
}

function capsule(r: number, len: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
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
  /** Nhân vật tự động (NPC) — nhãn viền xám */
  npc?: boolean;
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
  const isUniform = style === 'uniform';
  // Chân váy bút chì (đồng phục / sơ mi công sở nữ)
  const pencilSkirt = (isUniform || style === 'shirt') && config.bottomStyle === 'skirt';
  const bareLegs = isDress || pencilSkirt;
  let skirtGroup: THREE.Group | null = null;
  let skirtSit: THREE.Object3D | null = null;
  /** Váy ngồi + phần hông (đầm không có thân dưới eo) — ẩn khi đứng */
  const makeSeatedSkirt = (mat: THREE.Material, halfW: number, archH: number, zTo: number, drop: number, withHips: boolean) => {
    const sm = (mat as THREE.MeshStandardMaterial).clone();
    sm.side = THREE.DoubleSide;
    const grp = new THREE.Group();
    const cloth = new THREE.Mesh(seatedSkirtGeo(halfW, archH, zTo, drop), sm);
    cloth.position.y = 0.9;
    grp.add(cloth);
    if (withHips) grp.add(lathe([[0.0, 0.84], [0.15, 0.84], [0.165, 0.9], [0.15, 0.98], [0.137, 1.0], [0.0, 1.0]], sm, 0.72));
    grp.visible = false;
    return grp;
  };
  const knees: THREE.Group[] = [];
  const makeLeg = (offsetX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, 0.9, 0);
    const legMat = bareLegs ? skin : pantsMat;
    // Mặc váy: đùi dùng chính vải váy (như lớp lót) → khi bước chân vung ra khỏi mép váy không lộ đùi trần
    const thighMat = isDress ? fabric : pencilSkirt ? pantsMat : legMat;
    // Đùi (thon dần về gối)
    const thigh = limb(bareLegs ? 0.064 : 0.078, bareLegs ? 0.046 : 0.057, 0.36, thighMat, 0.06);
    thigh.position.y = -0.21;
    pivot.add(thigh);
    // Gối → ống chân (bắp chân nở nhẹ) → giày
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    const shin = limb(bareLegs ? 0.042 : 0.054, bareLegs ? 0.03 : 0.045, 0.34, legMat, bareLegs ? 0.16 : 0.08);
    shin.position.y = -0.2;
    // Khớp gối liền mạch khi gập
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(bareLegs ? 0.043 : 0.057, 16, 12), legMat);
    knee.add(shin, kneeCap);
    const shoe = capsule(0.046, 0.13, shoeMat);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.12, 1, 0.78);
    shoe.position.set(0, -0.43, 0.045);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.24), new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.8 }));
    sole.position.set(0, -0.462, 0.045);
    knee.add(shoe, sole);
    if (bareLegs) {
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
    // Đầm chữ A khi ngồi: phủ đùi, rủ qua gối xuống giữa ống chân
    skirtSit = makeSeatedSkirt(fabric, 0.2, 0.085, 0.47, 0.22, true);
    group.add(bodice, skirt, belt, skirtSit);
  } else {
        const torso = lathe(
      [[0.0, 0.86], [0.15, 0.86], [0.158, 0.95], [0.145, 1.05], [0.155, 1.18], [0.175, 1.3], [0.17, 1.38], [0.08, 1.44], [0.0, 1.44]],
      fabric,
      0.66,
    );
    group.add(torso);
    if (pencilSkirt) {
      // Chân váy bút chì ôm hông, dài tới gối, có xẻ sau → bước ngắn
      const skirtMesh = lathe(
        [[0.0, 0.5], [0.163, 0.5], [0.167, 0.53], [0.174, 0.7], [0.173, 0.84], [0.166, 0.95], [0.16, 0.995], [0.0, 0.995]],
        pantsMat,
        0.74,
        40,
      );
      skirtMesh.position.y = -0.995;
      skirtGroup = new THREE.Group();
      skirtGroup.position.y = 0.995;
      skirtGroup.add(skirtMesh);
      const waistband = lathe([[0.161, 0.965], [0.161, 0.998]], pantsMat, 0.74);
      // Chân váy bút chì khi ngồi: ôm đùi, mép váy ngay trên gối
      skirtSit = makeSeatedSkirt(pantsMat, 0.168, 0.078, 0.38, 0.05, false);
      group.add(skirtGroup, waistband, skirtSit);
    } else {
      // Hông quần
      const hips = lathe([[0.0, 0.8], [0.15, 0.8], [0.158, 0.9], [0.0, 0.9]], pantsMat, 0.68);
      group.add(hips);
      const belt = lathe([[0.159, 0.88], [0.159, 0.915]], new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }), 0.68);
      group.add(belt);
      if (isUniform) {
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.006), new THREE.MeshStandardMaterial({ color: '#c0c6cf', metalness: 0.9, roughness: 0.25 }));
        buckle.position.set(0, 0.897, 0.159 * 0.68 + 0.003);
        group.add(buckle);
      }
    }
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
  if (style === 'shirt' || style === 'polo' || style === 'suit' || isUniform) {
    // Cổ áo
    const collar = lathe([[0.058, 1.42], [0.07, 1.455], [0.062, 1.47]], style === 'suit' ? whiteShirt : fabric, 1, 20);
    group.add(collar);
  }
  if (style === 'shirt' || style === 'polo' || isUniform) {
    const placketLen = style === 'polo' ? 0.1 : 0.48;
    const light = new THREE.Color(outfitColor).getHSL({ h: 0, s: 0, l: 0 }).l > 0.8;
    const placket = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, placketLen, 0.006),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(outfitColor).multiplyScalar(light ? 0.94 : 0.85), roughness: 0.6 }),
    );
    placket.position.set(0, 1.42 - placketLen / 2, 0.118);
    group.add(placket);
    if (isUniform) {
      // Hàng cúc áo + logo TIM Corp thêu ngực trái
      const btnMat = new THREE.MeshStandardMaterial({ color: light ? '#e2e8f0' : '#cbd5e1', roughness: 0.3 });
      for (const by of [1.37, 1.27, 1.17, 1.07]) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10), btnMat);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0, by, 0.1225);
        group.add(btn);
      }
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.024), getUniformLogoMaterial(!light));
      logo.position.set(0.078, 1.275, 0.1045);
      logo.rotation.y = 0.31;
      logo.userData.noRim = true;
      group.add(logo);
    }
  }

  // Thẻ nhân viên khi đang trực
  if (isOnDuty) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.006), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    const cx = isUniform ? -0.085 : 0.085;
    card.position.set(cx, 1.22, frontZ(1.22, 0.162) + 0.006);
    const cardTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.02, 0.007), new THREE.MeshStandardMaterial({ color: '#2563eb' }));
    cardTop.position.set(cx, 1.25, frontZ(1.25, 0.162) + 0.007);
    group.add(card, cardTop);
  }

  // ── Tay: vai → cánh tay → cẳng tay → bàn tay ──
  const longSleeve = style === 'suit' || style === 'shirt' || isUniform;
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
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.028, 16), style === 'suit' ? whiteShirt : fabric);
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
  const feminine = isDress || pencilSkirt || ['long', 'bob', 'ponytail', 'bun'].includes(config.hairStyle);
  jawTaper = feminine ? 0.33 : 0.18;
  // Mắt anime pha thật: to, tròn, hơi thấp trên mặt (trán cao) → nét "xinh"
  // Tỉ lệ chuẩn: mắt ngang giữa đầu, mỗi mắt ≈ 1/5 bề ngang mặt, khoảng cách 2 mắt = 1 mắt
  const eyeR = feminine ? 0.0238 : 0.0205;
  const eyeY = feminine ? 0.003 : 0.006;
  const eyeX = feminine ? 0.047 : 0.044;
  eyeSocket = { x: eyeX, y: eyeY, r: feminine ? 0.016 : 0.0135 };
  const faceSkin = skin.clone();
  faceSkin.userData = {}; // để viền rim được gắn lại cho bản clone
  faceSkin.map = createSkinDetailTexture(feminine);
  faceSkin.sheen = feminine ? 0.55 : 0.3;
  // Ánh sáng mềm phủ mặt: da sáng, mịn, không tối sạm khi đứng trong bóng → nét mặt "lung linh"
  faceSkin.emissive = new THREE.Color(skinColor).multiplyScalar(feminine ? 0.09 : 0.06);
  faceSkin.roughness = feminine ? 0.46 : 0.5;
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

  // Mắt: nhãn cầu + mí trên (chớp được) + viền mi + đốm sáng
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: createEyeTexture(feminine ? '#6b4528' : '#4a3020'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 });
  eyeMat.userData.noRim = true;
  const lidMat = skin;
  const linerMat = new THREE.MeshStandardMaterial({ color: '#120c09', roughness: 0.5 });
  linerMat.userData.noRim = true;
  const blinkers: THREE.Object3D[] = [];
  const eyes: THREE.Object3D[] = [];
  const sparkles: THREE.Object3D[] = [];
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  sparkleMat.userData.noRim = true;
  for (const s of [-1, 1]) {
    const ez = faceZ(s * eyeX, eyeY) - eyeR * 0.95;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 20, 14), eyeMat);
    eye.position.set(s * eyeX, eyeY, ez);
    eye.scale.y = feminine ? 1.1 : 1.04; // mắt hơi tròn dọc
    eye.rotation.y = -s * 0.06; // hơi hướng vào giữa cho ánh nhìn tự nhiên
    eye.userData.baseRotY = eye.rotation.y;
    headGroup.add(eye);
    eyes.push(eye);
    // Đốm sáng cố định theo đầu (như phản chiếu đèn) → mắt luôn long lanh
    const sp = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.13, 10, 8), sparkleMat);
    sp.position.set(s * eyeX - eyeR * 0.32, eyeY + eyeR * 0.36, ez + eyeR * 0.92);
    const sp2 = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.06, 8, 6), sparkleMat);
    sp2.position.set(s * eyeX + eyeR * 0.3, eyeY - eyeR * 0.28, ez + eyeR * 0.95);
    headGroup.add(sp, sp2);
    sparkles.push(sp, sp2);

    const lidPivot = new THREE.Group();
    lidPivot.position.copy(eye.position);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 24, 10, 0, Math.PI * 2, 0, 0.92), lidMat);
    lid.rotation.x = feminine ? -0.5 : -0.56;
    const liner = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (feminine ? 1.16 : 1.13), 24, 2, 0, Math.PI * 2, 0.8, feminine ? 0.17 : 0.11), linerMat);
    liner.rotation.x = feminine ? -0.5 : -0.56;
    lidPivot.add(lid, liner);
    if (feminine) {
      // Kẻ mắt kéo dài nhẹ ở khoé ngoài (hiệu ứng mi cong) — bám theo mí nên chớp mắt vẫn khớp
      liner.scale.set(1.1, 1, 1);
      liner.position.x = s * 0.0014;
      // 3 sợi mi cong vểnh ở khoé ngoài (gắn vào mí → chớp cùng)
      for (let k = 0; k < 3; k++) {
        const lash = capsule(0.0011, 0.0075 - k * 0.0012, linerMat);
        const ang = 0.55 + k * 0.32;
        lash.position.set(s * eyeR * (0.72 + k * 0.1), eyeR * (0.62 - k * 0.2), eyeR * 0.55);
        lash.rotation.z = -s * ang;
        lash.rotation.x = -0.5;
        lidPivot.add(lash);
      }
    }
    // Mí đôi: đường mảnh phía trên mí (nét đặc trưng mắt anime)
    const crease = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.02, 0.0007, 4, 20, Math.PI * 0.62), linerMat);
    crease.position.set(s * eyeX, eyeY + eyeR * 0.42, ez + eyeR * 0.62);
    crease.rotation.z = Math.PI * 0.19;
    crease.rotation.x = -0.35;
    crease.scale.set(1.05, 0.55, 1);
    (crease.material as THREE.Material).transparent = false;
    headGroup.add(crease);
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
    const bw = feminine ? 0.0016 : 0.0038;
    const by = feminine ? 0.05 : 0.047;
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
  // Mũi kiểu anime: nữ chỉ còn đầu mũi nhỏ xinh; nam giữ sống mũi nhẹ
  if (feminine) {
    tip.scale.setScalar(0.85);
    headGroup.add(tip);
  } else {
    headGroup.add(bridge, tip);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), noseMat);
      wing.position.set(s * 0.0092, -0.049, faceZ(s * 0.0092, -0.049) - 0.001);
      headGroup.add(wing);
    }
  }

  // Môi: môi trên + môi dưới đầy đặn hơn
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(skinColor).lerp(new THREE.Color(feminine ? '#d24b63' : '#a8544a'), feminine ? 0.75 : 0.45),
    roughness: feminine ? 0.3 : 0.45,
    clearcoat: feminine ? 0.95 : 0.25,
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
  if (feminine) {
    upperLip.scale.x = 0.82;
    lowerLip.scale.x = 0.85;
    mouthLine.scale.y = 0.8;
  }
  headGroup.add(upperLip, lowerLip, mouthLine);
  // Khoé miệng cong lên (cười mỉm)
  for (const s of [-1, 1]) {
    const cx = s * (feminine ? 0.0135 : 0.0155);
    const corner = new THREE.Mesh(new THREE.SphereGeometry(0.0021, 8, 6), mouthMat);
    corner.position.set(cx, -0.0815, faceZ(cx, -0.0815) - 0.0012);
    headGroup.add(corner);
  }
  // Khoang miệng: bình thường dẹt bằng 0 (ẩn), khi nói phóng theo y → nhép miệng
  const mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#4a1a1c', roughness: 0.8 }));
  (mouthOpen.material as THREE.Material).userData.noRim = true;
  mouthOpen.scale.set(feminine ? 0.0105 : 0.012, 0.0001, 0.004);
  mouthOpen.position.set(0, -0.0855, faceZ(0, -0.0855) - 0.0015);
  mouthOpen.userData.maxY = feminine ? 0.0058 : 0.0065;
  mouthOpen.visible = false;
  headGroup.add(mouthOpen);

  // Tóc
  const hair = new THREE.Mesh(createHairGeometry(config.hairStyle), hairMat);
  headGroup.add(hair);
  // Mái kiểu anime: các lọn thon nhọn rủ xuống trán, rẽ lệch (không che mắt)
  if (config.hairStyle !== 'slick') {
    const n = feminine ? 7 : 6;
    const tipY = feminine ? 0.058 : 0.072;
    const sweep = feminine ? 0.016 : 0.01;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = THREE.MathUtils.lerp(-0.074, 0.074, t);
      const edge = Math.abs(t - 0.5) * 2; // 0 giữa → 1 rìa
      const ty = tipY + edge * edge * (feminine ? -0.03 : 0.012) + (i % 2) * 0.006; // rìa dài hơn (nữ) tạo khung mặt
      const top = new THREE.Vector3(x * 0.6, 0.118, faceZ(x * 0.6, 0.118, 0.016));
      const mid = new THREE.Vector3(x * 0.95, (0.118 + ty) / 2 + 0.01, faceZ(x * 0.95, (0.118 + ty) / 2, 0.015));
      const tx = x + sweep * (1 - edge * 0.5);
      const tip = new THREE.Vector3(tx, ty, faceZ(tx, ty, 0.009));
      const strand = tube([top, mid, tip], feminine ? 0.012 : 0.013, 0.0012, hairMat);
      strand.scale.z = 0.7;
      strand.position.z = 0.002;
      headGroup.add(strand);
    }
  }
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

  headGroup.scale.setScalar(1.05); // đầu to hơn chút cho tỉ lệ "xinh"
  group.add(headGroup);

  // Nhãn tên nổi
  const badge = createNameTag(name, opts.npc ? 'npc' : isOnDuty ? 'duty' : isSelf ? 'self' : opts.isStaff ? 'staff' : 'guest');
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
  // Không vẽ nhân vật trong lượt normal/depth của GTAO (bóng tiếp xúc): nhân đôi ~40 lượt vẽ/nhân vật mà gần như không thấy khác
  group.userData.noAO = true;
  // Gộp các mảnh tĩnh cùng vật liệu trong từng khớp → ~70 mesh còn ~25 (giảm mạnh draw call)
  const keepParts = new Set<THREE.Object3D>([...eyes, ...sparkles, mouthOpen]);
  if (skirtSit) keepParts.add(skirtSit);
  if (skirtGroup) keepParts.add(skirtGroup);
  skinAvatar(group, keepParts);

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
    stride: isDress ? 0.42 : pencilSkirt ? 0.34 : 1,
    skirt: skirtGroup,
    skirtSitX: pencilSkirt ? -1.25 : -0.95,
    skirtSit,
    mouth: mouthOpen,
    eyes,
    sparkles,
    gaze: { x: 0, y: 0, tx: 0, ty: 0, at: 1 + Math.random() * 2 },
  };
}

/**
 * Gộp cả nhân vật thành vài LƯỚI CÓ XƯƠNG (SkinnedMesh): mỗi khớp hiện có (thân, đầu, vai, khuỷu, hông, gối, mí mắt…)
 * trở thành 1 xương, mỗi mảnh gắn cứng 100% vào khớp cha → mọi tư thế/chuyển động giữ nguyên, nhưng GPU tự xoay đỉnh.
 * - Mảnh vật liệu trơn (không texture, đục, không phát sáng) gộp theo MÀU ĐỈNH dùng chung vật liệu cho MỌI nhân vật.
 * - Mảnh có texture / vật liệu đặc biệt gộp theo vật liệu.
 * → ~40 lượt vẽ/nhân vật còn ~10. Bỏ qua mảnh cần điều khiển riêng (`keep`: nhãn cầu, đốm sáng, miệng, váy đổi dáng).
 * Gọi khi nhân vật còn ở gốc toạ độ (chưa đặt vị trí).
 */
const vcMats = new Map<string, THREE.MeshStandardMaterial>();
function plainKey(m: THREE.Mesh): string | null {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (!mat.isMeshStandardMaterial || (mat as unknown as { isMeshPhysicalMaterial?: boolean }).isMeshPhysicalMaterial) return null;
  if (mat.map || mat.emissiveMap || mat.alphaMap || mat.normalMap || mat.bumpMap || mat.transparent || mat.opacity < 1 || mat.vertexColors) return null;
  if (mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0) return null;
  if (mat.userData?.shared) return null;
  return `${mat.side}|${Math.round(mat.roughness * 5)}|${Math.round(mat.metalness * 4)}|${mat.flatShading}|${Boolean(mat.userData.noRim)}`;
}
function skinAvatar(root: THREE.Group, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const isKept = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (keep.has(p)) return true;
    return false;
  };
  const buckets = new Map<string, { meshes: THREE.Mesh[]; vc: boolean }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m === (root as unknown) || m.children.length || !m.visible || Array.isArray(m.material)) return;
    if ((m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || (m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
    if (m.userData.isBlobShadow || isKept(m) || !m.parent) return;
    const vk = plainKey(m);
    const key = vk ? `vc|${vk}` : `m|${(m.material as THREE.Material).uuid}`;
    const b = buckets.get(key) ?? { meshes: [], vc: Boolean(vk) };
    b.meshes.push(m);
    buckets.set(key, b);
  });
  // Xương = các nút cha của mảnh được gộp (theo thứ tự gặp)
  const bones: THREE.Object3D[] = [];
  const boneIdx = new Map<THREE.Object3D, number>();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    for (const m of b.meshes) {
      const p = m.parent!;
      if (!boneIdx.has(p)) {
        boneIdx.set(p, bones.length);
        bones.push(p);
      }
    }
  }
  if (!bones.length) return;
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[]);
  const tmp = new THREE.Matrix4();
  for (const [key, b] of buckets) {
    if (b.meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of b.meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count;
      if (b.vc) {
        const c = (m.material as THREE.MeshStandardMaterial).color;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          col[i * 3] = c.r;
          col[i * 3 + 1] = c.g;
          col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      const bi = boneIdx.get(m.parent!)!;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        si[i * 4] = bi;
        sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.applyMatrix4(tmp.multiplyMatrices(rootInv, m.matrixWorld));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    let mat: THREE.Material;
    if (b.vc) {
      const src = b.meshes[0].material as THREE.MeshStandardMaterial;
      const vkey = key.slice(3);
      let vm = vcMats.get(vkey);
      if (!vm) {
        vm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: src.roughness, metalness: src.metalness, side: src.side, flatShading: src.flatShading });
        vm.userData.shared = true;
        if (!src.userData.noRim) applyRimLight(vm);
        else vm.userData.noRim = true;
        vcMats.set(vkey, vm);
      }
      mat = vm;
    } else mat = b.meshes[0].material as THREE.Material;
    const sm = new THREE.SkinnedMesh(merged, mat);
    sm.castShadow = false;
    sm.receiveShadow = b.meshes[0].receiveShadow;
    root.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    // Hộp bao cố định quanh người (khỏi tính lại theo xương mỗi lần lọc khung nhìn)
    sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.3);
    for (const m of b.meshes) {
      m.parent!.remove(m);
      m.geometry.dispose();
    }
  }
}

/** Chớp mắt tự nhiên (mỗi 2–5s) + đầu khẽ nghiêng — gọi mỗi frame cho nhân vật trong tầm nhìn. */
export function animateAvatarIdle(av: AnimatedAvatar, time: number): void {
  if (!av.blinkers.length) return;
  if (time > av.blinkAt + 0.16) av.blinkAt = time + 2 + Math.random() * 3;
  const k = time >= av.blinkAt ? Math.sin(((time - av.blinkAt) / 0.16) * Math.PI) : 0;
  const close = Math.max(0, k) * 1.55;
  for (const b of av.blinkers) b.rotation.x = close;
  const showSpark = close < 0.7;
  for (const sp of av.sparkles) sp.visible = showSpark;
  // Ánh mắt đảo nhẹ tự nhiên (mỗi 1.5–4s), phần lớn thời gian nhìn thẳng
  const g = av.gaze;
  if (time > g.at) {
    const center = Math.random() < 0.55;
    g.tx = center ? 0 : (Math.random() - 0.5) * 0.36;
    g.ty = center ? 0 : (Math.random() - 0.5) * 0.14;
    g.at = time + 1.5 + Math.random() * 2.5;
  }
  g.x += (g.tx - g.x) * 0.25;
  g.y += (g.ty - g.y) * 0.25;
  for (const e of av.eyes) {
    e.rotation.y = (e.userData.baseRotY ?? 0) + g.x;
    e.rotation.x = -g.y;
  }
}

/**
 * Biểu cảm nhanh, t = 0..1 trong suốt thời lượng. Gọi SAU các tư thế khác (ghi đè có trộn mượt theo e).
 * Tay "rightArm" nằm ở +x của nhân vật.
 */
export function poseEmote(av: AnimatedAvatar, kind: 'wave' | 'nod' | 'bow' | 'clap' | 'sip' | 'brew', t: number, time: number): void {
  const e = Math.sin(Math.PI * Math.min(1, Math.max(0, t))); // vào – ra mềm
  const mix = (cur: number, to: number) => cur + (to - cur) * e;
  switch (kind) {
    case 'wave':
      av.rightArm.rotation.z = mix(av.rightArm.rotation.z, 2.55 + Math.sin(time * 12) * 0.22);
      av.rightArm.rotation.x = mix(av.rightArm.rotation.x, -0.15);
      av.rightElbow.rotation.x = mix(av.rightElbow.rotation.x, -0.35);
      av.headGroup.rotation.z = mix(av.headGroup.rotation.z, 0.08);
      break;
    case 'nod':
      av.headGroup.rotation.x = mix(av.headGroup.rotation.x, 0.06 + Math.abs(Math.sin(time * 9)) * 0.24);
      break;
    case 'bow':
      av.group.rotation.x = 0.32 * e; // cúi người về trước
      av.headGroup.rotation.x = mix(av.headGroup.rotation.x, 0.25);
      for (const arm of [av.leftArm, av.rightArm]) arm.rotation.x = mix(arm.rotation.x, 0.1);
      break;
    case 'sip':
      // Nâng ly lên miệng (tay +x), đầu hơi ngửa
      av.rightArm.rotation.x = mix(av.rightArm.rotation.x, -1.05);
      av.rightArm.rotation.z = mix(av.rightArm.rotation.z, -0.32);
      av.rightElbow.rotation.x = mix(av.rightElbow.rotation.x, -1.95);
      av.headGroup.rotation.x = mix(av.headGroup.rotation.x, -0.12);
      break;
    case 'brew':
      // Pha chế ở quầy: hai tay đưa ra trước thao tác, nhìn xuống mặt quầy
      av.leftArm.rotation.x = mix(av.leftArm.rotation.x, -0.75 + Math.sin(time * 3.2) * 0.12);
      av.rightArm.rotation.x = mix(av.rightArm.rotation.x, -0.8 + Math.sin(time * 2.1 + 1) * 0.18);
      av.leftElbow.rotation.x = mix(av.leftElbow.rotation.x, -1.0);
      av.rightElbow.rotation.x = mix(av.rightElbow.rotation.x, -1.1 + Math.sin(time * 4) * 0.15);
      av.headGroup.rotation.x = mix(av.headGroup.rotation.x, 0.22);
      break;
    case 'clap': {
      const c = Math.sin(time * 22) * 0.1;
      av.leftArm.rotation.x = mix(av.leftArm.rotation.x, -1.0);
      av.rightArm.rotation.x = mix(av.rightArm.rotation.x, -1.0);
      av.leftArm.rotation.z = mix(av.leftArm.rotation.z, 0.32 + c);
      av.rightArm.rotation.z = mix(av.rightArm.rotation.z, -0.32 - c);
      av.leftElbow.rotation.x = mix(av.leftElbow.rotation.x, -1.15);
      av.rightElbow.rotation.x = mix(av.rightElbow.rotation.x, -1.15);
      break;
    }
  }
}

/** Đang nói: nhép miệng theo nhịp, gật đầu & tay phải khẽ đưa lên. talking=false → khép miệng dần. */
export function poseTalk(av: AnimatedAvatar, time: number, talking: boolean, gesture = true): void {
  const m = av.mouth;
  if (m) {
    const maxY = (m.userData.maxY as number) ?? 0.006;
    const target = talking ? maxY * (0.25 + 0.75 * Math.abs(Math.sin(time * 13) * Math.sin(time * 4.7 + 1))) : 0.0001;
    m.scale.y += (target - m.scale.y) * 0.45;
    m.visible = m.scale.y > 0.0004;
  }
  if (!talking) return;
  av.headGroup.rotation.x += Math.sin(time * 3.1) * 0.0035;
  av.headGroup.rotation.z = Math.sin(time * 1.7) * 0.035;
  if (gesture) {
    av.rightElbow.rotation.x = -0.35 - (0.35 + 0.25 * Math.sin(time * 2.3)) * 0.8;
    av.rightArm.rotation.x = -0.18 - 0.1 * Math.sin(time * 2.3);
  }
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

let bubbleCssReady = false;
function ensureBubbleCss() {
  if (bubbleCssReady || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = [
    '@keyframes wh3dPop{0%{transform:scale(.55) translateY(10px);opacity:0}65%{transform:scale(1.05) translateY(0);opacity:1}100%{transform:scale(1)}}',
    '@keyframes wh3dDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
    '.wh3d-pop{animation:wh3dPop .34s cubic-bezier(.2,.9,.3,1.25) both;transform-origin:50% 100%}',
    '.wh3d-dot{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:99px;background:#64748b;animation:wh3dDot 1.2s infinite}',
    '.wh3d-dot:nth-child(2){animation-delay:.15s}.wh3d-dot:nth-child(3){animation-delay:.3s}',
  ].join('');
  document.head.append(st);
  bubbleCssReady = true;
}

/** Bong bóng hội thoại (HTML) trên đầu nhân vật: câu trước nhỏ & mờ phía trên, câu mới nảy lên, có trạng thái "đang nhập…". */
export function createBubbleSprite(): CSS2DObject {
  ensureBubbleCss();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:30px;pointer-events:none;-webkit-font-smoothing:antialiased';
  const prev = document.createElement('div');
  prev.style.cssText = [
    'max-width:190px',
    'padding:4px 9px',
    'border-radius:11px',
    'background:rgba(255,255,255,0.78)',
    'color:#334155',
    `font:500 11.5px/1.3 ${LABEL_FONT}`,
    'opacity:0.75',
    'display:none',
    'word-wrap:break-word',
    'box-shadow:0 3px 10px rgba(15,23,42,0.15)',
  ].join(';');
  const main = document.createElement('div');
  main.style.cssText = [
    'position:relative',
    'max-width:230px',
    'padding:7px 12px',
    'border-radius:15px',
    'background:#ffffff',
    'color:#0f172a',
    `font:500 13px/1.38 ${LABEL_FONT}`,
    'box-shadow:0 6px 18px rgba(15,23,42,0.25)',
    'word-wrap:break-word',
    'text-align:left',
  ].join(';');
  wrap.append(prev, main);
  const obj = htmlLabel(wrap, 1.9);
  obj.userData.bubble = { prev, main, key: '' };
  return obj;
}

/**
 * Đồng bộ bong bóng của 1 nhân vật. text = câu đang nói (null = không), typing = đang nhập.
 * Phần tử DOM được dùng lại; chỉ khi nội dung đổi mới chạy hiệu ứng nảy.
 */
export function syncBubble(slot: BubbleSlot, parent: THREE.Object3D, text: string | null, typing = false, prevText?: string | null) {
  if (!text && !typing) {
    if (slot.sprite) slot.sprite.visible = false;
    slot.text = '';
    return;
  }
  if (!slot.sprite) slot.sprite = createBubbleSprite();
  const ui = slot.sprite.userData.bubble as { prev: HTMLDivElement; main: HTMLDivElement; key: string };
  const key = text ? `t:${text}` : 'typing';
  if (ui.key !== key) {
    ui.key = key;
    ui.main.textContent = '';
    if (text) {
      ui.main.append(document.createTextNode(text));
    } else {
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('span');
        d.className = 'wh3d-dot';
        ui.main.append(d);
      }
    }
    const tail = document.createElement('span');
    tail.style.cssText = 'position:absolute;left:50%;bottom:-6px;width:12px;height:12px;background:#fff;transform:translateX(-50%) rotate(45deg);border-radius:2px';
    ui.main.append(tail);
    ui.main.style.padding = text ? '7px 12px' : '9px 12px';
    // Chạy lại hiệu ứng nảy
    ui.main.classList.remove('wh3d-pop');
    void ui.main.offsetWidth;
    ui.main.classList.add('wh3d-pop');
  }
  const pv = text && prevText ? prevText : '';
  if (ui.prev.textContent !== pv) ui.prev.textContent = pv;
  ui.prev.style.display = pv ? '' : 'none';
  slot.text = text ?? '';
  if (slot.sprite.parent !== parent) parent.add(slot.sprite);
  slot.sprite.visible = true;
}

export function remoteSig(m: RemotePlayerMeta) {
  const a = m.avatar;
  return `${m.employeeName}|${m.onDuty}|${a.outfitStyle}|${a.outfitColor}|${a.pantsColor}|${a.bottomStyle}|${a.hairStyle}|${a.hairColor}|${a.skinTone}|${a.hasGlasses}`;
}

