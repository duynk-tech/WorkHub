// Toán học cổng đi bộ Quán cà phê ⇄ Showroom — không phụ thuộc three.js (dùng được ở gói tải đầu)
/**
 * Lối đi bộ nối Quán cà phê ⇄ Showroom: ngoài việc chọn cảnh, nhân vật có thể đi bộ sang.
 * - Quán cà phê: lối mở ở hàng rào bên phải, nhìn ra mặt tiền showroom TIM Corp phía bên kia đường nội bộ.
 * - Showroom: cửa kính bên trái, nhìn ra cổng gỗ quán Xởi Lởi.
 * Đi vào sát cổng → chuyển cảnh và xuất hiện ngay cổng đối diện bên kia.
 */
export type PortalTarget = 'SHOWROOM' | 'CAFE';

export interface ScenePortal {
  target: PortalTarget;
  /** Tâm cổng (trên mặt tường / hàng rào) */
  x: number;
  z: number;
  /** Hướng mặt từ cổng nhìn VÀO trong cảnh (rad, theo trục +Z) */
  inward: number;
  /** Bề rộng lối đi */
  width: number;
  /** Khoảng cách tối thiểu tới cổng mà nhân vật đi tới được (giới hạn sàn) */
  reach: number;
  label: string;
}

/** Cổng nối của cảnh hiện tại (không có → null) */
export function portalFor(sceneKind: string, widthM: number, depthM: number): ScenePortal | null {
  if (sceneKind === 'CAFE') {
    return { target: 'SHOWROOM', x: widthM / 2, z: depthM * 0.25, inward: -Math.PI / 2, width: 1.8, reach: 0.4, label: 'Sang Showroom TIM Corp' };
  }
  if (sceneKind === 'SHOWROOM') {
    // Tường kính hông nằm ngoài sàn 1m → nhân vật chỉ tới được cách kính 1.4m
    return { target: 'CAFE', x: -(widthM / 2 + 1), z: depthM * 0.32, inward: Math.PI / 2, width: 2, reach: 1.4, label: 'Sang Quán Xởi Lởi' };
  }
  return null;
}

/** Toạ độ cục bộ của điểm (x,z) so với cổng: depth = khoảng cách vào trong, side = lệch ngang */
export function portalLocal(p: ScenePortal, x: number, z: number): { depth: number; side: number } {
  const fx = Math.sin(p.inward);
  const fz = Math.cos(p.inward);
  const dx = x - p.x;
  const dz = z - p.z;
  return { depth: dx * fx + dz * fz, side: dx * fz - dz * fx };
}

/** Nhân vật đang đứng trong vùng kích hoạt cổng */
export function inPortalZone(p: ScenePortal, x: number, z: number): boolean {
  const { depth, side } = portalLocal(p, x, z);
  // Chỉ dải sát cổng phía trong (khuôn viên showroom đi được cả bên ngoài tường → không coi ngoài tường là "tới cổng")
  return depth > -0.3 && depth < p.reach + 0.45 && Math.abs(side) < p.width / 2;
}

/** Điểm xuất hiện khi vừa đi qua cổng sang cảnh này (cách cổng đủ xa để không kích hoạt lại) */
export function portalSpawn(p: ScenePortal): { x: number; z: number; rotY: number } {
  const k = p.reach + 1.6;
  return { x: p.x + Math.sin(p.inward) * k, z: p.z + Math.cos(p.inward) * k, rotY: p.inward };
}

/** Vật phẳng / treo cao: chân cột dây đèn được phép đứng trên (không coi là chướng ngại) */
const FLAT_OR_OVERHEAD = new Set([
  'GRAVEL_BED', 'STEPPING_PATH', 'ROOM_ZONE', 'SHADE_NET', 'METAL_ROOF', 'RUG', 'RED_CARPET',
  'STRING_LIGHTS', 'LANTERN_STRING', 'PENDANT_LIGHT', 'BAMBOO_PENDANT', 'PATIO_UMBRELLA',
]);

interface PathObj {
  kind: string;
  posX: number;
  posY?: number;
  posZ: number;
  rotY: number;
  widthM: number;
  depthM: number;
}

/**
 * Giữ lối đi tới cổng thông thoáng: cột chân dây đèn Edison (STRING_LIGHTS) nào cắm giữa lối
 * (từ cổng vào sâu 9m) thì dời cả dây theo phương vuông góc tới chỗ trống gần nhất.
 * Không đổi dữ liệu lưu — chỉ áp khi dựng cảnh. Vật không bị ảnh hưởng giữ nguyên tham chiếu.
 */
export function clearPortalPath<T extends PathObj>(objects: T[], p: ScenePortal, widthM: number, depthM: number): T[] {
  const inLane = (x: number, z: number) => {
    const { depth, side } = portalLocal(p, x, z);
    return depth > -0.5 && depth < 9 && Math.abs(side) < p.width / 2 + 0.8;
  };
  const solids = objects.filter((o) => !FLAT_OR_OVERHEAD.has(o.kind) && (o.posY ?? 0) <= 0.3);
  const free = (x: number, z: number) => {
    if (Math.abs(x) > widthM / 2 - 0.3 || Math.abs(z) > depthM / 2 - 0.3) return false;
    for (const o of solids) {
      const c = Math.cos(o.rotY);
      const s = Math.sin(o.rotY);
      const rx = x - o.posX;
      const rz = z - o.posZ;
      if (Math.abs(rx * c - rz * s) < o.widthM / 2 + 0.25 && Math.abs(rx * s + rz * c) < o.depthM / 2 + 0.25) return false;
    }
    return true;
  };
  return objects.map((o) => {
    if (o.kind !== 'STRING_LIGHTS') return o;
    const ax = Math.cos(o.rotY) * (o.widthM / 2);
    const az = -Math.sin(o.rotY) * (o.widthM / 2);
    const poles = (cx: number, cz: number) => [
      [cx + ax, cz + az],
      [cx - ax, cz - az],
    ];
    if (!poles(o.posX, o.posZ).some(([x, z]) => inLane(x, z))) return o;
    const px = Math.sin(o.rotY);
    const pz = Math.cos(o.rotY);
    for (let k = 1; k <= 16; k++) {
      for (const sg of [1, -1]) {
        const cx = o.posX + px * k * 0.3 * sg;
        const cz = o.posZ + pz * k * 0.3 * sg;
        if (poles(cx, cz).every(([x, z]) => !inLane(x, z) && free(x, z))) return { ...o, posX: cx, posZ: cz };
      }
    }
    return o;
  });
}

