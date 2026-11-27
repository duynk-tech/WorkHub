import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Gộp các mesh TĨNH trong một group theo (vật liệu, cast/receive shadow, occluder) thành ít mesh nhất có thể
 * → giảm mạnh draw call. Bỏ qua Sprite, mesh có userData tương tác (booth/placement) hoặc `noMerge`.
 */
export function mergeStaticGroup(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; occluder: boolean; roof: boolean; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  const skip = new Set<THREE.Object3D>();

  root.traverse((o) => {
    if (o === root) return;
    if (o.parent && skip.has(o.parent)) {
      skip.add(o);
      return;
    }
    const mesh = o as THREE.Mesh;
    // Nhóm động (cánh cửa…) đánh dấu noMerge → giữ nguyên cả cây con để còn chuyển động quanh bản lề
    if (!mesh.isMesh && o.userData.noMerge) {
      keep.push(o);
      skip.add(o);
      return;
    }
    if (!mesh.isMesh || Array.isArray(mesh.material)) {
      // Sprite / Points / mesh nhiều vật liệu (vd. tấm gỗ mặt vân + cạnh vỏ cây): không gộp được → giữ nguyên
      if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (mesh.isMesh && Array.isArray(mesh.material))) {
        keep.push(o);
        skip.add(o);
      }
      return;
    }
    if (mesh.userData.noMerge || mesh.userData.boothId || mesh.userData.placementId) {
      keep.push(o);
      skip.add(o);
      return;
    }
    const mat = mesh.material as THREE.Material;
    const occluder = Boolean(mesh.userData.occluder);
    const roof = Boolean(mesh.userData.roof);
    const key = `${mat.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${occluder}|${roof}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, cast: mesh.castShadow, receive: mesh.receiveShadow, occluder, roof, geos: [] };
      buckets.set(key, b);
    }
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    b.geos.push(g);
  });

  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const anyNonIndexed = b.geos.some((g) => !g.index);
    const attrs = ['position', 'normal', 'uv'];
    const prepared = b.geos.map((g) => {
      let gg = anyNonIndexed && g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(gg.attributes)) if (!attrs.includes(name)) gg.deleteAttribute(name);
      if (!gg.attributes.uv) {
        const count = gg.attributes.position.count;
        gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      if (gg !== g) g.dispose();
      gg.clearGroups();
      return gg;
    });
    const merged = mergeGeometries(prepared, false);
    prepared.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.userData.occluder = b.occluder;
    m.userData.roof = b.roof;
    m.matrixAutoUpdate = false;
    out.add(m);
  }

  // Giữ nguyên các object không gộp (đặt lại theo ma trận thế giới)
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const clone = o;
    clone.parent?.remove(clone);
    clone.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    out.add(clone);
  }
  return out;
}

/**
 * Đóng băng ma trận cục bộ của mọi node con (đồ đạc tĩnh) → mỗi khung hình three.js không phải
 * compose lại hàng nghìn ma trận. Gốc vẫn tự cập nhật nên kéo thả/xoay vật thể vẫn đúng.
 */
export function freezeStaticDescendants(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const isDynamic = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
    return false;
  };
  root.traverse((o) => {
    if (o === root || (o as { isCSS2DObject?: boolean }).isCSS2DObject) return;
    // Bộ phận chuyển động (cánh cửa) giữ cập nhật ma trận tự động
    if (isDynamic(o)) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}
