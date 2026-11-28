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
