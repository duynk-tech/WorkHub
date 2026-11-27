import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * Bộ vẽ nhãn HTML gọn nhẹ thay cho CSS2DRenderer.
 * CSS2DRenderer duyệt lại TOÀN BỘ cây cảnh (hàng nghìn node) + ghi style DOM mỗi khung hình → tốn CPU.
 * Bản này chỉ duyệt danh sách nhãn đang có, và chỉ ghi DOM khi giá trị thực sự đổi.
 */
const _v = new THREE.Vector3();
const _vp = new THREE.Matrix4();

interface LabelCache {
  transform: string;
  display: string;
  opacity: string;
  z: string;
}

export class LiteLabelRenderer {
  readonly domElement: HTMLDivElement;
  private w = 1;
  private h = 1;
  private frame = 0;

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
    _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const hw = this.w / 2;
    const hh = this.h / 2;
    const camPos = camera.position;
    for (const lbl of labels) {
      // Leo lên gốc: vừa kiểm tra còn trong cảnh, vừa kiểm tra mọi cha đều hiển thị
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
      const c = (lbl.userData.__lc ??= { transform: '', display: '', opacity: '', z: '' }) as LabelCache;
      let opacity = 1;
      if (visible) {
        _v.setFromMatrixPosition(lbl.matrixWorld);
        const dist = _v.distanceTo(camPos);
        // Mờ dần khi xa (> 18m), ẩn khi > 30m để không rối mắt
        opacity = dist > 30 ? 0 : dist > 18 ? 1 - (dist - 18) / 12 : 1;
        _v.applyMatrix4(_vp);
        if (_v.z < -1 || _v.z > 1 || opacity <= 0) visible = false;
        if (visible) {
          const t = `translate(${-100 * lbl.center.x}%,${-100 * lbl.center.y}%) translate(${(_v.x * hw + hw).toFixed(1)}px,${(-_v.y * hh + hh).toFixed(1)}px)`;
          if (c.transform !== t) {
            el.style.transform = t;
            c.transform = t;
          }
          const o = opacity.toFixed(2);
          if (c.opacity !== o) {
            el.style.opacity = o;
            c.opacity = o;
          }
          if (sortNow) {
            // Nhãn gần đè lên nhãn xa
            const z = String(Math.max(0, 10000 - Math.round(dist * 100)));
            if (c.z !== z) {
              el.style.zIndex = z;
              c.z = z;
            }
          }
          if (el.parentNode !== this.domElement) this.domElement.appendChild(el);
        }
      }
      const d = visible ? '' : 'none';
      if (c.display !== d) {
        el.style.display = d;
        c.display = d;
      }
    }
  }
}
