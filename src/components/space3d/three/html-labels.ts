import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * Bộ vẽ nhãn HTML gọn nhẹ thay cho CSS2DRenderer.
 * - Chỉ duyệt danh sách nhãn đang có (không duyệt cả cây cảnh), chỉ ghi DOM khi giá trị đổi.
 * - Tránh chồng nhãn: nhãn gần camera giữ chỗ, nhãn xa hơn bị đè thì xếp tầng lên trên (dịch mượt).
 */
const _v = new THREE.Vector3();
const _vp = new THREE.Matrix4();

interface LabelCache {
  transform: string;
  display: string;
  opacity: string;
  z: string;
  /** Kích thước phần tử (px), đo thưa */
  w: number;
  h: number;
  /** Độ dịch lên hiện tại (px) để tránh chồng */
  off: number;
}

interface Placed {
  lbl: CSS2DObject;
  c: LabelCache;
  x: number;
  y: number;
  dist: number;
  opacity: number;
}

export class LiteLabelRenderer {
  readonly domElement: HTMLDivElement;
  private w = 1;
  private h = 1;
  private frame = 0;
  private placed: Placed[] = [];

  constructor() {
    this.domElement = document.createElement('div');
  }

  setSize(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;
  }

  /** `scene` để nhận biết nhãn đã bị gỡ khỏi cảnh (nhân vật rời đi / đổi diện mạo) → xoá DOM. */
  render(labels: Set<CSS2DObject>, scene: THREE.Object3D, camera: THREE.Camera) {
    this.frame += 1;
    const sortNow = this.frame % 10 === 0;
    const measureNow = this.frame % 20 === 1;
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const hw = this.w / 2;
    const hh = this.h / 2;
    const camPos = camera.position;
    const visibleList = this.placed;
    visibleList.length = 0;

    // Lượt 1: chiếu toạ độ, xác định nhãn hiển thị
    for (const lbl of labels) {
      let visible = lbl.visible;
      let root: THREE.Object3D = lbl;
      while (root.parent) {
        root = root.parent;
        if (!root.visible) visible = false;
      }
      const el = lbl.element as HTMLElement;
      if (root !== scene) {
        el.remove();
        labels.delete(lbl);
        continue;
      }
      const c = (lbl.userData.__lc ??= { transform: '', display: '', opacity: '', z: '', w: 0, h: 0, off: 0 }) as LabelCache;
      if (visible) {
        _v.setFromMatrixPosition(lbl.matrixWorld);
        const dist = _v.distanceTo(camPos);
        const opacity = dist > 30 ? 0 : dist > 18 ? 1 - (dist - 18) / 12 : 1;
        _v.applyMatrix4(_vp);
        if (_v.z < -1 || _v.z > 1 || opacity <= 0) visible = false;
        if (visible) {
          if (el.parentNode !== this.domElement) this.domElement.appendChild(el);
          visibleList.push({ lbl, c, x: _v.x * hw + hw, y: -_v.y * hh + hh, dist, opacity });
        }
      }
      const d = visible ? '' : 'none';
      if (c.display !== d) {
        el.style.display = d;
        c.display = d;
      }
    }

    // Đo kích thước thưa (đọc layout tốn kém)
    if (measureNow) {
      for (const p of visibleList) {
        const el = p.lbl.element as HTMLElement;
        p.c.w = el.offsetWidth;
        p.c.h = el.offsetHeight;
      }
    }

    // Lượt 2: xếp tầng tránh chồng — gần trước, xa sau
    // Nhãn tên giữ chỗ trước, bong bóng chat xếp lên trên (cộng thêm "khoảng cách ảo")
    const prio = (p: Placed) => p.dist + (p.lbl.userData.bubble ? 0.6 : 0);
    visibleList.sort((a, b) => prio(a) - prio(b));
    const rects: { l: number; r: number; t: number; b: number }[] = [];
    for (const p of visibleList) {
      const { c, lbl } = p;
      const w = c.w || 80;
      const h = c.h || 24;
      // Neo đáy-giữa (center 0.5, 1): khung = [x - w/2, y - h] … [x + w/2, y]
      const l = p.x - w * lbl.center.x;
      const r = l + w;
      let bottom = p.y + (h * (1 - lbl.center.y));
      let target = 0;
      for (let iter = 0; iter < 8; iter++) {
        const top = bottom - h;
        const hit = rects.find((q) => l < q.r - 2 && r > q.l + 2 && top < q.b - 2 && bottom > q.t + 2);
        if (!hit) break;
        // Đẩy lên ngay trên nhãn đang chiếm chỗ
        const shift = bottom - (hit.t - 3);
        target -= shift;
        bottom -= shift;
      }
      rects.push({ l, r, t: bottom - h, b: bottom });
      c.off += (target - c.off) * 0.25;
      if (Math.abs(c.off - target) < 0.3) c.off = target;

      const el = lbl.element as HTMLElement;
      const t = `translate(${-100 * lbl.center.x}%,${-100 * lbl.center.y}%) translate(${p.x.toFixed(1)}px,${(p.y + c.off).toFixed(1)}px)`;
      if (c.transform !== t) {
        el.style.transform = t;
        c.transform = t;
      }
      const o = p.opacity.toFixed(2);
      if (c.opacity !== o) {
        el.style.opacity = o;
        c.opacity = o;
      }
      if (sortNow) {
        // Nhãn gần đè lên nhãn xa
        const z = String(Math.max(0, 10000 - Math.round(p.dist * 100)));
        if (c.z !== z) {
          el.style.zIndex = z;
          c.z = z;
        }
      }
    }
  }
}
