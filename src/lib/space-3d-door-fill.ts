/**
 * Cửa đặt trên vách kính/tường: tự lấp khe hở cho kín như công trình thật (chỉ khi dựng cảnh, không lưu):
 * - Tấm ô thoáng phía trên cửa (từ đầu khung cửa lên tới chiều cao vách bên cạnh)
 * - Tấm lấp 2 bên khung cửa tới đầu vách thẳng hàng / vách vuông góc gần nhất (khe ≤ 1.2m)
 * Mặt cắt cục bộ: trục X của vật = chiều dài; quy ước three.js (hướng X thế giới = (cos r, −sin r)).
 */
interface WallLike {
  id: string;
  kind: string;
  label?: string;
  posX: number;
  posY?: number;
  posZ: number;
  rotY: number;
  widthM: number;
  depthM: number;
  heightM: number;
}

const WALL_KINDS = new Set(['GLASS_WALL', 'WALL']);
const FRAME = 0.06;
const MAX_GAP = 1.2;

export function doorWallFillers<T extends WallLike>(objects: T[]): T[] {
  const walls = objects.filter((o) => WALL_KINDS.has(o.kind) && (o.posY ?? 0) < 0.1);
  const out: T[] = [];
  for (const door of objects) {
    if (door.kind !== 'DOOR') continue;
    const ux = Math.cos(door.rotY);
    const uz = -Math.sin(door.rotY);
    const hw = door.widthM / 2 + FRAME;
    // Chiếu các đầu vách lên đường cửa
    let leftEnd = -Infinity;
    let rightEnd = Infinity;
    let wallH = 0;
    let tpl: T | null = null;
    for (const w of walls) {
      const dx = w.posX - door.posX;
      const dz = w.posZ - door.posZ;
      const along = dx * ux + dz * uz;
      const perp = -dx * uz + dz * ux;
      const dAng = Math.abs(Math.sin(w.rotY - door.rotY));
      if (dAng < 0.05) {
        // Thẳng hàng với cửa
        if (Math.abs(perp) > 0.2) continue;
        const a = along - w.widthM / 2;
        const b = along + w.widthM / 2;
        if (b <= 0 && b > leftEnd && -hw - b < MAX_GAP) leftEnd = b;
        else if (a >= 0 && a < rightEnd && a - hw < MAX_GAP) rightEnd = a;
        else continue;
        wallH = Math.max(wallH, w.heightM);
        tpl = tpl ?? w;
      } else if (dAng > 0.99) {
        // Vách vuông góc chạm đường cửa: mặt trong của vách là điểm dừng
        if (Math.abs(perp) > w.widthM / 2 + 0.2) continue;
        const face = along > 0 ? along - w.depthM / 2 : along + w.depthM / 2;
        if (face <= 0 && face > leftEnd && -hw - face < MAX_GAP) leftEnd = face;
        else if (face >= 0 && face < rightEnd && face - hw < MAX_GAP) rightEnd = face;
        else continue;
        wallH = Math.max(wallH, w.heightM);
        tpl = tpl ?? w;
      }
    }
    if (!tpl) continue;
    const make = (suffix: string, center: number, width: number, y: number, h: number): T => ({
      ...tpl!,
      id: `${door.id}:fill-${suffix}`,
      label: '',
      posX: door.posX + ux * center,
      posZ: door.posZ + uz * center,
      posY: y,
      rotY: door.rotY,
      widthM: width,
      heightM: h,
    });
    const doorTop = door.heightM + FRAME;
    let span0 = -hw;
    let span1 = hw;
    if (Number.isFinite(leftEnd) && -hw - leftEnd > 0.02) {
      out.push(make('l', (leftEnd - hw) / 2, -hw - leftEnd, 0, wallH));
      span0 = leftEnd;
    }
    if (Number.isFinite(rightEnd) && rightEnd - hw > 0.02) {
      out.push(make('r', (hw + rightEnd) / 2, rightEnd - hw, 0, wallH));
      span1 = rightEnd;
    }
    void span0;
    void span1;
    if (wallH - doorTop > 0.05) out.push(make('top', 0, hw * 2, doorTop, wallH - doorTop));
  }
  return out;
}
