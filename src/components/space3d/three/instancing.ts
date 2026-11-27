import * as THREE from 'three';

/**
 * Instancing: gom các vật thể GIỐNG HỆT nhau (cùng chữ ký dựng hình) thành InstancedMesh
 * → 60 ghế chỉ còn ~1 draw call.
 * - Chỉ gom phần mesh "tĩnh thường"; bộ phận đặc biệt (màn hình bàn, cánh cửa, bảng hiệu mờ, hàng hoá instanced,
 *   mesh nhiều vật liệu) vẫn vẽ riêng như cũ.
 * - Mesh gốc được ẩn nhưng vẫn nằm trong cây cảnh → raycast (chọn ghế, ngồi, va chạm camera) chạy như cũ
 *   (three.js không kiểm tra `visible` khi raycast).
 * - Chế độ thiết kế: tắt gom để kéo thả từng món.
 */
export const INSTANCE_MIN = 3;

/** Mesh có được gom không (không thuộc bộ phận động / tương tác riêng) */
function isPlain(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return false;
  for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) {
    const u = p.userData;
    if (u.doorLeaf || u.dynamic || u.screenOf || u.fadeOnOcclude) return false;
  }
  return true;
}

export function rebuildInstancing(
  objectMap: Map<string, { sig: string; root: THREE.Group }>,
  group: THREE.Group,
  editMode: boolean,
): { instancedMeshes: number; hiddenMeshes: number } {
  // Gỡ bản gộp cũ, hiện lại mesh gốc
  for (const c of [...group.children]) {
    group.remove(c);
    (c as THREE.InstancedMesh).dispose?.();
  }
  for (const entry of objectMap.values()) {
    if (!entry.root.userData.instanced) continue;
    entry.root.traverse((c) => {
      if (c.userData.instHidden) {
        c.visible = true;
        c.userData.instHidden = false;
      }
    });
    entry.root.userData.instanced = false;
  }
  if (editMode) return { instancedMeshes: 0, hiddenMeshes: 0 };

  const bySig = new Map<string, THREE.Group[]>();
  for (const entry of objectMap.values()) {
    const root = entry.root;
    if (root.userData.kind === 'ROOM_ZONE' || !root.visible) continue;
    const list = bySig.get(entry.sig) ?? [];
    list.push(root);
    bySig.set(entry.sig, list);
  }

  const plainMeshes = (r: THREE.Object3D) => {
    const out: THREE.Mesh[] = [];
    r.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.visible && isPlain(m, r)) out.push(m);
    });
    return out;
  };

  let instancedMeshes = 0;
  let hiddenMeshes = 0;
  for (const roots of bySig.values()) {
    if (roots.length < INSTANCE_MIN) continue;
    for (const r of roots) r.updateMatrixWorld(true);
    // Cùng chữ ký → cùng cấu trúc; nếu lệch (hiếm) thì bỏ qua nhóm
    const all = roots.map(plainMeshes);
    const n = all[0].length;
    if (n === 0 || all.some((ms) => ms.length !== n)) continue;
    for (let j = 0; j < n; j++) {
      const tm = all[0][j];
      const inst = new THREE.InstancedMesh(tm.geometry, tm.material as THREE.Material, roots.length);
      for (let i = 0; i < roots.length; i++) inst.setMatrixAt(i, all[i][j].matrixWorld);
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = tm.castShadow;
      inst.receiveShadow = tm.receiveShadow;
      inst.computeBoundingSphere();
      inst.computeBoundingBox();
      inst.matrixAutoUpdate = false;
      group.add(inst);
      instancedMeshes++;
    }
    for (let i = 0; i < roots.length; i++) {
      for (const m of all[i]) {
        m.visible = false;
        m.userData.instHidden = true;
        hiddenMeshes++;
      }
      roots[i].userData.instanced = true;
    }
  }
  return { instancedMeshes, hiddenMeshes };
}
