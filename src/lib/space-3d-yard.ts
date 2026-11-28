/**
 * Sân trước quán cà phê (ngoài cổng): vỉa hè + mép đường trước mặt tiền, đi ra/vào chỉ qua cổng.
 * Mặt tiền ở +Z. Thuần TS (test được).
 */
export interface FrontYard {
  /** Khoảng trống cổng đi qua được (theo X) */
  gateX0: number;
  gateX1: number;
  /** Đường hàng rào mặt tiền */
  zLine: number;
  /** Giới hạn sân trước */
  zMax: number;
  xMin: number;
  xMax: number;
  /** Gốc cây ngoài cổng (không đi xuyên) */
  trees: { x: number; z: number; r: number }[];
  /** Lớp tường thứ 2 (vd. vách kính mặt tiền showroom) — cũng chỉ qua được ở khoảng cổng */
  zWall?: number;
}

/**
 * Showroom trong khu nhà xưởng: đi ra cửa kính giữa mặt tiền (cửa tự động ±1.2m) ra sân trước & đường nội bộ.
 * Sàn trong nhà tới depth/2, vách kính ở depth/2 + 2.
 */
export function showroomFrontYard(widthM: number, depthM: number): FrontYard {
  return {
    gateX0: -1.2,
    gateX1: 1.2,
    zLine: depthM / 2,
    zWall: depthM / 2 + 2,
    zMax: depthM / 2 + 2 + 16,
    xMin: -widthM / 2 - 12,
    xMax: widthM / 2 + 12,
    trees: [],
  };
}

type GateLike = { posX: number; posZ: number; widthM: number } | undefined;

export function cafeFrontYard(widthM: number, depthM: number, gate: GateLike): FrontYard {
  const gap = Math.min(6, widthM * 0.3);
  const near = gate && Math.abs(gate.posZ - depthM / 2) < 1.5 ? gate : undefined;
  const half = near ? Math.min(gap / 2, near.widthM / 2) - 0.35 : gap / 2 - 0.3;
  const cx = near ? near.posX : 0;
  return {
    gateX0: cx - half,
    gateX1: cx + half,
    zLine: depthM / 2,
    zMax: depthM / 2 + 12,
    xMin: -widthM / 2 - 3,
    xMax: widthM / 2 + 3,
    // Khớp 2 cây lớn hai bên cổng trong createCafeEnvironment
    trees: [-1, 1].map((s) => ({ x: s * (gap / 2 + 2.6), z: depthM / 2 + 1.6, r: 0.55 })),
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Đoạn (a → b) có băng qua hàng rào mặt tiền ở ngoài khoảng cổng không */
function crossesLine(line: number, y: FrontYard, ax: number, az: number, bx: number, bz: number): boolean {
  if (az <= line === bz <= line) return false;
  const t = (line - az) / (bz - az);
  const cx = ax + (bx - ax) * t;
  return cx < y.gateX0 || cx > y.gateX1;
}
export function crossesFence(y: FrontYard, ax: number, az: number, bx: number, bz: number): boolean {
  return crossesLine(y.zLine, y, ax, az, bx, bz) || (y.zWall !== undefined && crossesLine(y.zWall, y, ax, az, bx, bz));
}

/** Điểm giữa cổng, lùi vào phía `inside` hoặc ra ngoài 0.6m */
export function gateWaypoint(y: FrontYard, inside: boolean): { x: number; z: number } {
  // Có vách thứ 2: điểm ngoài nằm sau vách (đi thẳng qua cả 2 lớp trong khoảng cổng)
  const outZ = (y.zWall ?? y.zLine) + 0.6;
  return { x: (y.gateX0 + y.gateX1) / 2, z: inside ? y.zLine - 0.6 : outZ };
}

/**
 * Bước đi (p → n) hợp lệ: trong sân quán hoặc sân trước, chỉ băng hàng rào qua cổng, không xuyên gốc cây.
 * Không có sân trước → kẹp trong mặt bằng như cũ.
 */
export function constrainWalk(y: FrontYard | null, widthM: number, depthM: number, px: number, pz: number, nx: number, nz: number): { x: number; z: number } {
  let x = nx;
  let z = nz;
  if (!y) return { x: clamp(x, -widthM / 2, widthM / 2), z: clamp(z, -depthM / 2, depthM / 2) };
  const wasIn = pz <= y.zLine;
  if (crossesLine(y.zLine, y, px, pz, x, z)) z = wasIn ? y.zLine - 0.01 : y.zLine + 0.01;
  if (y.zWall !== undefined && crossesLine(y.zWall, y, px, pz, x, z)) z = pz <= y.zWall ? y.zWall - 0.01 : y.zWall + 0.01;
  if (z <= y.zLine) {
    x = clamp(x, -widthM / 2, widthM / 2);
    z = clamp(z, -depthM / 2, y.zLine);
  } else {
    x = clamp(x, y.xMin, y.xMax);
    z = clamp(z, y.zLine, y.zMax);
  }
  for (const t of y.trees) {
    const dx = x - t.x;
    const dz = z - t.z;
    const d = Math.hypot(dx, dz);
    if (d < t.r && d > 1e-6) {
      x = t.x + (dx / d) * t.r;
      z = t.z + (dz / d) * t.r;
    }
  }
  return { x, z };
}

/** Điểm bấm hợp lệ cho click-to-walk (trong sân quán hoặc sân trước) */
export function walkableTarget(y: FrontYard | null, widthM: number, depthM: number, x: number, z: number): { x: number; z: number } {
  if (!y || z <= y.zLine) return { x: clamp(x, -widthM / 2, widthM / 2), z: clamp(z, -depthM / 2, depthM / 2) };
  return { x: clamp(x, y.xMin, y.xMax), z: clamp(z, y.zLine, y.zMax) };
}
