'use server';

import { prisma } from '@/lib/prisma';
import { getAuthContext } from '@/server/auth/context';
import { getSetting } from '@/server/modules/settings/service';
import { broadcastServer } from './realtime';
import { GUEST_KEY_RE, guestNumericId } from '@/lib/space-3d-guest';
import { normalizeSpaceObjects } from '@/lib/space-3d-types';
import {
  DRINK_ORDER_TTL_MS,
  findServeSpot,
  normalizeCafeMenu,
  orderSummary,
  validateOrderLines,
  type CafeMenuItem,
  type DrinkOrderStatus,
  type DrinkOrderView,
  type OrderLine,
} from '@/lib/space-3d-cafe-menu';

/**
 * Gọi nước trong quán cà phê 3D: khách (guestKey) hoặc nhân viên gọi món → nhân viên trực nhận,
 * pha & phục vụ → ly 3D hiện trên bàn khách ở mọi máy. Không có thanh toán thật.
 */

type OrderRow = NonNullable<Awaited<ReturnType<typeof prisma.spaceDrinkOrder.findFirst>>>;

function toView(r: OrderRow): DrinkOrderView {
  const lines = (Array.isArray(r.itemsJson) ? r.itemsJson : []) as unknown as OrderLine[];
  return {
    id: r.id,
    sceneCode: r.sceneCode,
    customerName: r.customerName,
    customerRid: r.guestKey ? guestNumericId(r.guestKey) : (r.employeeId ?? 0),
    lines,
    note: r.note,
    status: r.status as DrinkOrderStatus,
    servedByName: r.servedByName,
    spot: r.tableObjectId && r.spotX != null && r.spotY != null && r.spotZ != null ? { objectId: r.tableObjectId, x: r.spotX, y: r.spotY, z: r.spotZ } : null,
    posX: r.posX,
    posZ: r.posZ,
    createdAt: r.createdAt.toISOString(),
    servedAt: r.servedAt?.toISOString() ?? null,
  };
}

/** Bảng đơn chưa được tạo trên DB (chưa chạy prisma db push) → báo thân thiện thay vì lỗi kỹ thuật */
function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : '';
  if (/P2021|does not exist|SpaceDrinkOrder/i.test(msg)) return 'Quầy gọi món đang được chuẩn bị, vui lòng quay lại sau ít phút.';
  return fallback;
}

async function getMenu(): Promise<CafeMenuItem[]> {
  return normalizeCafeMenu(await getSetting<unknown>('space.cafeMenu', null));
}

async function findScene(sceneCode: string, isStaff: boolean) {
  const scene = await prisma.spaceScene.findUnique({
    where: { code: String(sceneCode).slice(0, 64) },
    select: { code: true, kind: true, isPublic: true, structuresJson: true },
  });
  if (!scene || (!scene.isPublic && !isStaff)) return null;
  return scene;
}

/** Menu + các đơn còn hiệu lực trong cảnh (đơn đang chờ/đang pha, ly đã phục vụ trong 30 phút). */
export async function getCafeStateAction(sceneCode: string): Promise<{ menu: CafeMenuItem[]; orders: DrinkOrderView[] }> {
  const ctx = await getAuthContext();
  const scene = await findScene(sceneCode, Boolean(ctx));
  const menu = await getMenu();
  if (!scene) return { menu, orders: [] };
  const since = new Date(Date.now() - DRINK_ORDER_TTL_MS);
  const rows = await prisma.spaceDrinkOrder
    .findMany({
    where: {
      sceneCode: scene.code,
      OR: [{ status: { in: ['NEW', 'PREPARING'] }, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } }, { status: 'SERVED', servedAt: { gte: since } }],
    },
    orderBy: { id: 'asc' },
    take: 80,
  })
    .catch(() => []);
  return { menu, orders: rows.map(toView) };
}

export async function placeDrinkOrderAction(input: {
  sceneCode: string;
  guestKey?: string | null;
  name: string;
  lines: OrderLine[];
  note?: string;
  x: number;
  z: number;
  /** Điểm ngắm đặt ly (trước mặt người đang ngồi); không có → dùng x, z */
  aimX?: number;
  aimZ?: number;
}): Promise<{ ok: boolean; message: string; order?: DrinkOrderView }> {
  try {
    const ctx = await getAuthContext();
    const guestKey = ctx ? null : String(input.guestKey ?? '');
    if (!ctx && !GUEST_KEY_RE.test(guestKey!)) return { ok: false, message: 'Vui lòng vào tham quan trước khi gọi món' };
    const scene = await findScene(input.sceneCode, Boolean(ctx));
    if (!scene) return { ok: false, message: 'Không tìm thấy không gian' };
    if (scene.kind !== 'CAFE') return { ok: false, message: 'Chỉ gọi món được trong quán cà phê' };
    const menu = await getMenu();
    const v = validateOrderLines(input.lines, menu);
    if (!v.ok) return { ok: false, message: v.message };
    const x = Number(input.x);
    const z = Number(input.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, message: 'Vị trí không hợp lệ' };

    // Chống spam: tối đa 2 đơn / phút và 3 đơn đang chờ cho mỗi người
    const who = ctx ? { employeeId: ctx.employeeId } : { guestKey: guestKey! };
    const [recent, pending] = await Promise.all([
      prisma.spaceDrinkOrder.count({ where: { ...who, createdAt: { gte: new Date(Date.now() - 60_000) } } }),
      prisma.spaceDrinkOrder.count({ where: { ...who, status: { in: ['NEW', 'PREPARING'] } } }),
    ]);
    if (recent >= 2) return { ok: false, message: 'Bạn gọi hơi nhanh, vui lòng chờ một chút' };
    if (pending >= 3) return { ok: false, message: 'Bạn đang có 3 đơn chờ phục vụ' };

    const ax = Number.isFinite(Number(input.aimX)) ? Number(input.aimX) : x;
    const az = Number.isFinite(Number(input.aimZ)) ? Number(input.aimZ) : z;
    const spot = findServeSpot(normalizeSpaceObjects(scene.structuresJson), ax, az);
    const name = (ctx ? ctx.fullName : String(input.name || 'Khách tham quan')).trim().slice(0, 40) || 'Khách tham quan';
    const row = await prisma.spaceDrinkOrder.create({
      data: {
        sceneCode: scene.code,
        guestKey,
        employeeId: ctx?.employeeId ?? null,
        customerName: name,
        itemsJson: v.lines as never,
        note: input.note ? String(input.note).trim().slice(0, 200) || null : null,
        posX: x,
        posZ: z,
        tableObjectId: spot?.objectId ?? null,
        spotX: spot?.x ?? null,
        spotY: spot?.y ?? null,
        spotZ: spot?.z ?? null,
      },
    });
    await broadcastServer(`space:${scene.code}`, 'order', { id: row.id });
    return { ok: true, message: `Đã gọi: ${orderSummary(v.lines, menu)}`, order: toView(row) };
  } catch (e) {
    console.error('[space3d-cafe] placeDrinkOrder failed:', e);
    return { ok: false, message: friendlyError(e, 'Gọi món thất bại, vui lòng thử lại') };
  }
}

/** Nhân viên cập nhật đơn: nhận làm → phục vụ (hoặc huỷ). */
export async function updateDrinkOrderAction(
  id: number,
  status: Exclude<DrinkOrderStatus, 'NEW'>,
): Promise<{ ok: boolean; message: string; order?: DrinkOrderView }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, message: 'Chỉ nhân viên mới xử lý đơn' };
  if (!['PREPARING', 'SERVED', 'CANCELLED'].includes(status)) return { ok: false, message: 'Trạng thái không hợp lệ' };
  const cur = await prisma.spaceDrinkOrder.findUnique({ where: { id: Number(id) } }).catch(() => null);
  if (!cur) return { ok: false, message: 'Không tìm thấy đơn' };
  if (cur.status === 'SERVED' || cur.status === 'CANCELLED') return { ok: false, message: 'Đơn đã xử lý xong' };
  const row = await prisma.spaceDrinkOrder.update({
    where: { id: cur.id },
    data: {
      status,
      servedById: ctx.employeeId,
      servedByName: ctx.fullName.slice(0, 120),
      servedAt: status === 'SERVED' ? new Date() : null,
    },
  });
  await broadcastServer(`space:${row.sceneCode}`, 'order', { id: row.id });
  const msg = status === 'SERVED' ? 'Đã phục vụ' : status === 'PREPARING' ? 'Đang pha chế' : 'Đã huỷ đơn';
  return { ok: true, message: msg, order: toView(row) };
}

/**
 * Dọn bàn: dọn ly của 1 đơn hoặc TẤT CẢ ly đã phục vụ trong cảnh.
 * Nhân viên dọn được mọi đơn; khách chỉ dọn được ly của mình (guestKey).
 */
export async function clearDrinkOrdersAction(input: {
  sceneCode: string;
  orderId?: number | null;
  guestKey?: string | null;
}): Promise<{ ok: boolean; message: string; count?: number }> {
  try {
    const ctx = await getAuthContext();
    const code = String(input.sceneCode).slice(0, 64);
    const where: Record<string, unknown> = { sceneCode: code, status: 'SERVED' };
    if (input.orderId) where.id = Number(input.orderId);
    if (!ctx) {
      if (!input.guestKey || !GUEST_KEY_RE.test(input.guestKey)) return { ok: false, message: 'Không có quyền dọn bàn' };
      where.guestKey = input.guestKey;
    }
    const res = await prisma.spaceDrinkOrder.updateMany({ where, data: { status: 'CLEARED' } });
    if (res.count > 0) await broadcastServer(`space:${code}`, 'order', { cleared: res.count });
    return { ok: true, message: res.count ? `Đã dọn ${res.count} đơn` : 'Không còn ly nào để dọn', count: res.count };
  } catch (e) {
    return { ok: false, message: friendlyError(e, 'Dọn bàn thất bại') };
  }
}

const NPC_SERVER_NAME = 'Bé Na (phục vụ)';
/**
 * NPC (nhân viên quán) tự pha & bưng nước cho mọi đơn.
 * Chỉ người gọi đơn được đẩy trạng thái; đúng thứ tự & đủ thời gian (chống spam / nhảy cóc).
 */
export async function npcAdvanceOrderAction(
  orderId: number,
  to: 'PREPARING' | 'SERVED',
  guestKey?: string | null,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await getAuthContext();
    const cur = await prisma.spaceDrinkOrder.findUnique({ where: { id: Number(orderId) } });
    if (!cur) return { ok: false, message: 'Không tìm thấy đơn' };
    const owner = ctx ? cur.employeeId === ctx.employeeId : Boolean(guestKey && GUEST_KEY_RE.test(guestKey) && cur.guestKey === guestKey);
    if (!owner) return { ok: false, message: 'Không phải đơn của bạn' };
    // Quán cà phê có nhân viên riêng (NPC) → luôn tự phục vụ; nhân viên công ty vào quán cũng là khách
    const age = Date.now() - cur.createdAt.getTime();
    if (to === 'PREPARING' && (cur.status !== 'NEW' || age < 2500)) return { ok: false, message: 'Chưa thể nhận đơn' };
    if (to === 'SERVED' && (cur.status !== 'PREPARING' || age < 10_000)) return { ok: false, message: 'Đồ uống đang được pha' };
    await prisma.spaceDrinkOrder.update({
      where: { id: cur.id },
      data: { status: to, servedByName: NPC_SERVER_NAME, servedAt: to === 'SERVED' ? new Date() : null },
    });
    await broadcastServer(`space:${cur.sceneCode}`, 'order', { id: cur.id });
    return { ok: true, message: to === 'SERVED' ? 'Đã phục vụ' : 'Đang pha chế' };
  } catch (e) {
    return { ok: false, message: friendlyError(e, 'Không cập nhật được đơn') };
  }
}
