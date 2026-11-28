/**
 * Xe điện tham quan khuôn viên showroom (thuần TS, test được): vòng đường nội bộ quanh nhà xưởng,
 * trạm đón trước cửa, lộ trình bo góc và lấy vị trí/hướng theo quãng đường đã đi.
 */
export interface ShowroomRing {
  /** Tim đường 4 cạnh */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  roadW: number;
  /** Trạm đón/trả khách (trên tim đường trước mặt tiền) */
  stop: { x: number; z: number };
}

export function showroomRing(widthM: number, depthM: number): ShowroomRing {
  const hx = widthM / 2 + 1 + 7;
  const hz = depthM / 2 + 2 + 7;
  return { x0: -hx, x1: hx, z0: -hz, z1: hz, roadW: 6, stop: { x: 5, z: hz } };
}

/** Lộ trình vòng (chạy làn phải, bo góc bán kính 3.5m), bắt đầu từ trạm, đi ngược chiều kim đồng hồ nhìn từ trên */
export function tourPath(r: ShowroomRing): { x: number; z: number }[] {
  const lane = 1.4; // chạy lệch phải tim đường
  const x0 = r.x0 + lane;
  const x1 = r.x1 - lane;
  const z0 = r.z0 + lane;
  const z1 = r.z1 - lane;
  const R = 3.5;
  const pts: { x: number; z: number }[] = [];
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      pts.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
    }
  };
  pts.push({ x: r.stop.x, z: z1 });
  arc(x1 - R, z1 - R, Math.PI / 2, 0); // góc trước phải
  arc(x1 - R, z0 + R, 0, -Math.PI / 2); // góc sau phải
  arc(x0 + R, z0 + R, -Math.PI / 2, -Math.PI); // góc sau trái
  arc(x0 + R, z1 - R, Math.PI, Math.PI / 2); // góc trước trái
  pts.push({ x: r.stop.x, z: z1 });
  return pts;
}

/** Độ dài tích luỹ của lộ trình */
export function pathLengths(pts: { x: number; z: number }[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return out;
}

/** Vị trí & hướng tại quãng đường s (m) trên lộ trình khép kín */
export function samplePath(pts: { x: number; z: number }[], lens: number[], s: number): { x: number; z: number; rotY: number } {
  const total = lens[lens.length - 1];
  const d = ((s % total) + total) % total;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = lens[i] - lens[i - 1] || 1;
  const t = (d - lens[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rotY: Math.atan2(b.x - a.x, b.z - a.z) };
}

// ───────────── Bố cục khuôn viên showroom (dùng chung cho dựng cảnh, đi bộ, lái ô tô) ─────────────
export interface Box2 {
  x: number;
  z: number;
  hw: number;
  hd: number;
}
export interface CampusLayout {
  /** Khối nhà xưởng (tính cả tường, chừa 0.3m) */
  building: Box2;
  /** Sàn trong nhà (đi lại bên trong) */
  floor: { hw: number; hd: number };
  /** Lối cửa chính giữa mặt tiền */
  door: { x0: number; x1: number };
  /** Ranh giới khuôn viên đi lại / lái xe */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Nhà xưởng lân cận (không đi xuyên) */
  neighbors: (Box2 & { h: number; rot: number; w: number; d: number; color: string })[];
  /** Chỗ đậu ô tô (bãi hông trái) */
  parking: { x: number; z: number; rotY: number; color: string }[];
  /** Hàng cây ven đường (gốc cây chắn xe/người, bán kính ~0.35m) */
  trees: { x: number; z: number; scale: number }[];
  /** Cột đèn đường (mặt đèn hướng ra ngoài) */
  lamps: { x: number; z: number; faceX: number; faceZ: number }[];
}

const TREE_R = 0.35;
const LAMP_R = 0.14;

/** Cây & cột đèn dọc đường vòng — dựng cảnh và va chạm dùng chung */
function roadsideProps(ring: ShowroomRing): Pick<CampusLayout, 'trees' | 'lamps'> {
  const RW = ring.roadW;
  const trees: CampusLayout['trees'] = [];
  const outer = RW / 2 + 2.6;
  for (let x = ring.x0; x <= ring.x1 + 0.1; x += 8.5) {
    for (const z of [ring.z0 - outer, ring.z1 + outer]) trees.push({ x: x + Math.sin(x) * 0.6, z, scale: 1.05 + Math.abs(Math.sin(x * 0.7)) * 0.3 });
  }
  for (let z = ring.z0 + 8; z <= ring.z1 - 4; z += 8.5) {
    for (const x of [ring.x0 - outer, ring.x1 + outer]) trees.push({ x, z: z + Math.cos(z) * 0.6, scale: 1.05 + Math.abs(Math.cos(z * 0.7)) * 0.3 });
  }
  const lamps: CampusLayout['lamps'] = [];
  const inner = RW / 2 + 0.7;
  for (let x = ring.x0 + 6; x <= ring.x1 - 5; x += 14) {
    lamps.push({ x, z: ring.z0 + inner, faceX: 0, faceZ: -1 });
    lamps.push({ x, z: ring.z1 - inner, faceX: 0, faceZ: 1 });
  }
  for (let z = ring.z0 + 10; z <= ring.z1 - 8; z += 14) {
    lamps.push({ x: ring.x0 + inner, z, faceX: -1, faceZ: 0 });
    lamps.push({ x: ring.x1 - inner, z, faceX: 1, faceZ: 0 });
  }
  return { trees, lamps };
}

export function campusLayout(widthM: number, depthM: number): CampusLayout {
  const halfW = widthM / 2 + 1;
  const halfD = depthM / 2 + 2;
  // Xưởng lân cận: (tâm x, tâm z, dài, sâu, cao, xoay, màu) — xoay ±90° thì đổi chiều dài/sâu theo trục thế giới
  const nb = (x: number, z: number, w: number, d: number, h: number, rot: number, color: string) => {
    const swap = Math.abs(Math.sin(rot)) > 0.5;
    return { x, z, w, d, h, rot, color, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 };
  };
  return {
    building: { x: 0, z: 0, hw: halfW + 0.3, hd: halfD + 0.3 },
    floor: { hw: widthM / 2, hd: depthM / 2 },
    door: { x0: -1.2, x1: 1.2 },
    bounds: { x0: -halfW - 15, x1: halfW + 14, z0: -halfD - 12.5, z1: halfD + 20 },
    neighbors: [
      nb(-halfW - 26, -6, 30, 22, 10, Math.PI / 2, '#d4d9df'),
      nb(halfW + 24, 0, 34, 20, 11, -Math.PI / 2, '#c9d3de'),
      nb(-14, -halfD - 22, 36, 18, 12, 0, '#d4d9df'),
      nb(26, -halfD - 26, 28, 18, 9, 0, '#c9d3de'),
    ],
    parking: [
      { x: -halfW - 2.1, z: -2.5, rotY: 0, color: '#e2e8f0' },
      { x: -halfW - 2.1, z: -9, rotY: 0, color: '#1e3a8a' },
    ],
    ...roadsideProps(showroomRing(widthM, depthM)),
  };
}

const inBox = (b: Box2, x: number, z: number, pad = 0) => Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad;

/** Điểm (x, z) ở ngoài nhà xưởng có đi/lái được không (trong ranh giới, không trong xưởng lân cận) */
export function campusFree(c: CampusLayout, x: number, z: number, pad = 0): boolean {
  if (x < c.bounds.x0 + pad || x > c.bounds.x1 - pad || z < c.bounds.z0 + pad || z > c.bounds.z1 - pad) return false;
  if (inBox(c.building, x, z, pad)) return false;
  if (c.neighbors.some((n) => inBox(n, x, z, pad))) return false;
  // Gốc cây / cột đèn: chỉ chừa thêm tối đa 0.1m (không chặn rộng theo pad của bãi đỗ)
  const pp = Math.min(pad, 0.1);
  for (const t of c.trees) if ((x - t.x) ** 2 + (z - t.z) ** 2 < (TREE_R + pp) ** 2) return false;
  for (const l of c.lamps) if ((x - l.x) ** 2 + (z - l.z) ** 2 < (LAMP_R + pp) ** 2) return false;
  return true;
}

/** Đang ở trong nhà (sàn hoặc hành lang cửa) */
function insideHall(c: CampusLayout, x: number, z: number): boolean {
  return inBox(c.building, x, z);
}
function onFloor(c: CampusLayout, x: number, z: number): boolean {
  return Math.abs(x) <= c.floor.hw && Math.abs(z) <= c.floor.hd;
}
function inDoorway(c: CampusLayout, x: number, z: number): boolean {
  return x >= c.door.x0 && x <= c.door.x1 && z >= c.floor.hd - 0.05 && z <= c.building.hd + 0.05;
}

/**
 * Đi bộ khắp khuôn viên: trong nhà đi trên sàn; ra/vào nhà chỉ qua lối cửa chính; ngoài trời không xuyên
 * nhà xưởng & xưởng lân cận. Bị chặn 1 trục thì trượt theo trục còn lại.
 */
export function campusWalk(c: CampusLayout, px: number, pz: number, nx: number, nz: number): { x: number; z: number } {
  const ok = (x: number, z: number) => {
    if (inDoorway(c, x, z)) return true;
    if (insideHall(c, x, z)) return onFloor(c, x, z) && (insideHall(c, px, pz) || inDoorway(c, px, pz));
    return campusFree(c, x, z) && (!insideHall(c, px, pz) || inDoorway(c, px, pz));
  };
  if (ok(nx, nz)) return { x: nx, z: nz };
  if (ok(nx, pz)) return { x: nx, z: pz };
  if (ok(px, nz)) return { x: px, z: nz };
  return { x: px, z: pz };
}

/** Điểm bấm click-to-walk hợp lệ + chặng qua cửa nếu đi từ trong ra ngoài (hoặc ngược lại) */
export function campusRoute(c: CampusLayout, px: number, pz: number, tx: number, tz: number): { x: number; z: number }[] {
  const fromIn = insideHall(c, px, pz) && !inDoorway(c, px, pz);
  let target = { x: tx, z: tz };
  if (insideHall(c, tx, tz) && !inDoorway(c, tx, tz)) target = { x: Math.max(-c.floor.hw, Math.min(c.floor.hw, tx)), z: Math.max(-c.floor.hd, Math.min(c.floor.hd, tz)) };
  else if (!campusFree(c, tx, tz) && !inDoorway(c, tx, tz)) return [];
  const toIn = insideHall(c, target.x, target.z) && !inDoorway(c, target.x, target.z);
  if (fromIn === toIn) return [target];
  const mid = (c.door.x0 + c.door.x1) / 2;
  const inPt = { x: mid, z: c.floor.hd - 0.6 };
  const outPt = { x: mid, z: c.building.hd + 0.8 };
  return fromIn ? [inPt, outPt, target] : [outPt, inPt, target];
}

/** Xe/người có trong vùng lái xe ngoài trời không (để đặt ô tô / kiểm tra va chạm) */
export function campusCarFree(c: CampusLayout, x: number, z: number): boolean {
  return campusFree(c, x, z, 0.1);
}
