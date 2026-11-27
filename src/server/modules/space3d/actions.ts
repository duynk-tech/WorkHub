'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthContext, requireAuth } from '@/server/auth/context';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { canDesignSpace } from './permissions';
import {
  broadcastServer,
  GUEST_KEY_RE as GUEST_KEY_PATTERN,
  guestNumericId,
  mintGuestRealtimeToken,
  DM_RATE_LIMIT,
  getRealtimeConfig,
  isDmRateLimited,
  mintRealtimeToken,
  validateDmInput,
} from './realtime';
import {
  normalizeAvatar3DConfig,
  synthesizeProcedural3D,
  type Avatar3DConfig,
  type Procedural3DPart,
  type SpaceDmMessage,
  type SpaceDmThread,
  type SpaceRealtimeSession,
  type SpaceStructure,
  normalizeSpaceObjects,
} from '@/lib/space-3d-types';
import { MAX_SPACE_OBJECTS } from '@/lib/space-3d-catalog';

export interface SpaceActionResult {
  ok: boolean;
  message: string;
  parts?: Procedural3DPart[];
}

function canEditSpace(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  return canDesignSpace(ctx);
}

const placementInputSchema = z.object({
  inventoryItemId: z.number().int().positive().nullable(),
  label: z.string().max(191).optional().nullable(),
  locationCode: z.string().max(64).optional().nullable(),
  posX: z.number().finite(),
  posY: z.number().finite(),
  posZ: z.number().finite(),
  rotY: z.number().finite(),
  scale: z.number().min(0.2).max(5).default(1),
  isPublic: z.boolean().default(true),
});

export async function saveSpaceSceneLayoutAction(
  sceneCode: string,
  payload: {
    structures: SpaceStructure[];
    placements: z.infer<typeof placementInputSchema>[];
    /** updatedAt của scene lúc bắt đầu chỉnh sửa — chống ghi đè khi 2 người cùng sửa */
    baseUpdatedAt?: string | null;
    /** Kích thước mặt bằng (tuỳ chọn) */
    widthM?: number;
    depthM?: number;
  },
): Promise<SpaceActionResult & { updatedAt?: string }> {
  try {
    const ctx = await requireAuth();
    if (!canEditSpace(ctx)) {
      return { ok: false, message: 'Bạn không có quyền chỉnh sửa bố cục Không gian 3D' };
    }

    const scene = await prisma.spaceScene.findUnique({ where: { code: sceneCode } });
    if (!scene) return { ok: false, message: 'Không tìm thấy không gian 3D' };
    if (payload.baseUpdatedAt && new Date(payload.baseUpdatedAt).getTime() !== scene.updatedAt.getTime()) {
      return {
        ok: false,
        message: 'Bố cục vừa được người khác cập nhật. Hãy tải lại trang để xem bản mới trước khi lưu.',
      };
    }
    const objects = normalizeSpaceObjects(payload.structures);
    if (objects.length > MAX_SPACE_OBJECTS) {
      return { ok: false, message: `Tối đa ${MAX_SPACE_OBJECTS} vật thể trong một không gian` };
    }
    const widthM = typeof payload.widthM === 'number' ? Math.min(120, Math.max(10, payload.widthM)) : scene.widthM;
    const depthM = typeof payload.depthM === 'number' ? Math.min(120, Math.max(10, payload.depthM)) : scene.depthM;

    const validPlacements = payload.placements
      .map((p) => placementInputSchema.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.spaceScene.update({
        where: { id: scene.id },
        data: { structuresJson: objects as never, widthM, depthM },
      });
      await tx.spacePlacement.deleteMany({ where: { sceneId: scene.id } });
      if (validPlacements.length > 0) {
        await tx.spacePlacement.createMany({
          data: validPlacements.map((p) => ({
            sceneId: scene.id,
            inventoryItemId: p.inventoryItemId,
            label: p.label || null,
            locationCode: p.locationCode || null,
            posX: p.posX,
            posY: p.posY,
            posZ: p.posZ,
            rotY: p.rotY,
            scale: p.scale,
            isPublic: p.isPublic,
          })),
        });
      }
      return row;
    });

    revalidatePath('/3d');
    return {
      ok: true,
      message: `Đã lưu bố cục (${objects.length} vật thể, ${validPlacements.length} thiết bị)`,
      updatedAt: updated.updatedAt.toISOString(),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu sơ đồ 3D thất bại' };
  }
}

const product3DSchema = z.object({
  modelType: z.enum(['BOX_PRESET', 'PROCEDURAL_JSON', 'GLB']),
  glbUrl: z.string().max(512).nullable().optional(),
  proceduralParts: z.array(z.any()).nullable().optional(),
  widthM: z.number().min(0.1).max(6),
  heightM: z.number().min(0.1).max(6),
  depthM: z.number().min(0.1).max(6),
  primaryColor: z.string().max(32).default('#2563eb'),
  aiPrompt: z.string().max(1000).nullable().optional(),
});

export async function saveProduct3DModelAction(
  inventoryItemId: number,
  raw: z.infer<typeof product3DSchema>,
): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    if (!canEditSpace(ctx)) {
      return { ok: false, message: 'Bạn không có quyền chỉnh sửa mô hình 3D thiết bị' };
    }

    const parsed = product3DSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Thông số mô hình 3D không hợp lệ' };
    }
    const d = parsed.data;

    await prisma.product3DModel.upsert({
      where: { inventoryItemId },
      create: {
        inventoryItemId,
        modelType: d.modelType,
        glbUrl: d.glbUrl || null,
        proceduralJson: d.proceduralParts ? (d.proceduralParts as never) : undefined,
        widthM: d.widthM,
        heightM: d.heightM,
        depthM: d.depthM,
        primaryColor: d.primaryColor,
        aiPrompt: d.aiPrompt || null,
      },
      update: {
        modelType: d.modelType,
        glbUrl: d.glbUrl || null,
        proceduralJson: d.proceduralParts ? (d.proceduralParts as never) : undefined,
        widthM: d.widthM,
        heightM: d.heightM,
        depthM: d.depthM,
        primaryColor: d.primaryColor,
        aiPrompt: d.aiPrompt || null,
      },
    });

    revalidatePath('/3d');
    return { ok: true, message: 'Đã lưu mô hình 3D cho thiết bị' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu mô hình 3D thất bại' };
  }
}

/**
 * Sinh cấu trúc 3D Procedural JSON từ câu mô tả thiết bị.
 * Nếu có GEMINI_API_KEY sẽ gọi Gemini để thiết kế hình khối chi tiết,
 * ngược lại tự động dùng bộ tổng hợp hình khối F&B tích hợp sẵn.
 */
export async function generateProduct3DAction(
  prompt: string,
  dims: { widthM: number; heightM: number; depthM: number },
  primaryColor = '#1e293b',
): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    if (!canEditSpace(ctx)) {
      return { ok: false, message: 'Bạn không có quyền tạo mô hình 3D' };
    }
    if (!prompt.trim()) {
      return { ok: false, message: 'Nhập mô tả sản phẩm để AI dựng 3D' };
    }

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      try {
        const sysPrompt = `You are a 3D product designer for Three.js. Convert the product description into a JSON array of 5 to 12 primitive parts forming a clean stylized industrial/F&B product fitting within width=${dims.widthM}m, height=${dims.heightM}m, depth=${dims.depthM}m, sitting on y=0.
Return ONLY a valid JSON array where each element has:
{"shape":"box"|"cylinder"|"sphere","pos":[x,y,z],"size":[w,h,d],"rot":[rx,ry,rz],"color":"#hex","metalness":0..1,"roughness":0..1,"opacity":0..1,"emissive":"#hex"}
Product description: ${prompt}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: sysPrompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
            }),
          },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return { ok: true, message: 'AI Gemini đã dựng xong mô hình 3D', parts: parsed as Procedural3DPart[] };
            }
          }
        }
      } catch {
        // Rơi về bộ dựng nội bộ
      }
    }

    const parts = synthesizeProcedural3D(prompt, dims, primaryColor);
    return { ok: true, message: 'Đã dựng mô hình 3D từ mô tả', parts };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Tạo 3D thất bại' };
  }
}

export async function toggleStaffDutyAction(
  sceneCode: string,
  stationLabel: string,
  posX: number,
  posZ: number,
  rotY: number,
  active: boolean,
): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    if (!active) {
      await prisma.spacePresence.deleteMany({ where: { employeeId: ctx.employeeId } });
      revalidatePath('/3d');
      return { ok: true, message: 'Đã rời vị trí trực quầy' };
    }

    const savedAvatar = await prisma.spaceAvatarConfig.findUnique({
      where: { employeeId: ctx.employeeId },
    });

    await prisma.spacePresence.upsert({
      where: { employeeId: ctx.employeeId },
      create: {
        sceneCode,
        employeeId: ctx.employeeId,
        employeeName: ctx.fullName,
        department: ctx.departmentName,
        stationLabel: stationLabel || ctx.departmentName || 'Quầy tư vấn',
        posX,
        posZ,
        rotY,
        status: 'ON_DUTY',
        avatarJson: savedAvatar?.configJson ? (savedAvatar.configJson as never) : undefined,
        lastSeenAt: new Date(),
      },
      update: {
        sceneCode,
        employeeName: ctx.fullName,
        department: ctx.departmentName,
        stationLabel: stationLabel || ctx.departmentName || 'Quầy tư vấn',
        posX,
        posZ,
        rotY,
        status: 'ON_DUTY',
        avatarJson: savedAvatar?.configJson ? (savedAvatar.configJson as never) : undefined,
        lastSeenAt: new Date(),
      },
    });

    revalidatePath('/3d');
    return { ok: true, message: `Đang trực tại ${stationLabel || ctx.departmentName || 'quầy'}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật trạng thái trực thất bại' };
  }
}

export async function saveMyAvatar3DAction(raw: Avatar3DConfig): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    const config = normalizeAvatar3DConfig(raw);

    await prisma.$transaction(async (tx) => {
      await tx.spaceAvatarConfig.upsert({
        where: { employeeId: ctx.employeeId },
        create: { employeeId: ctx.employeeId, configJson: config as never },
        update: { configJson: config as never },
      });
      await tx.spacePresence.updateMany({
        where: { employeeId: ctx.employeeId },
        data: { avatarJson: config as never },
      });
    });

    revalidatePath('/3d');
    return { ok: true, message: 'Đã lưu diện mạo & phong cách nhân vật của bạn' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu diện mạo nhân vật thất bại' };
  }
}

// ───────────────────────── Realtime & Chat 1-1 ─────────────────────────

/** Phiên realtime: khách nhận anon key (chỉ nghe); nhân viên nhận thêm JWT ký bởi server. */
export async function getRealtimeSessionAction(guestKey?: string): Promise<SpaceRealtimeSession | null> {
  const cfg = getRealtimeConfig();
  if (!cfg) return null;
  const ctx = await getAuthContext();
  if (!ctx && cfg.jwtSecret && guestKey && GUEST_KEY_PATTERN.test(guestKey)) {
    // Khách đã vào tham quan → token tạm để hiện nhân vật & di chuyển cho mọi người cùng thấy
    const { token, expiresAt } = await mintGuestRealtimeToken(guestKey, cfg.jwtSecret);
    return { url: cfg.url, anonKey: cfg.anonKey, token, expiresAt, employeeId: null, guestId: guestNumericId(guestKey) };
  }
  if (!ctx || !cfg.jwtSecret) {
    return { url: cfg.url, anonKey: cfg.anonKey, token: null, expiresAt: null, employeeId: ctx?.employeeId ?? null };
  }
  const { token, expiresAt } = await mintRealtimeToken(ctx.employeeId, cfg.jwtSecret);
  return { url: cfg.url, anonKey: cfg.anonKey, token, expiresAt, employeeId: ctx.employeeId };
}

function toDmView(m: {
  id: number;
  fromEmployeeId: number;
  toEmployeeId: number;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}): SpaceDmMessage {
  return {
    id: m.id,
    fromEmployeeId: m.fromEmployeeId,
    toEmployeeId: m.toEmployeeId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

export async function sendSpaceDmAction(
  toEmployeeId: number,
  body: string,
): Promise<{ ok: boolean; message: string; data?: SpaceDmMessage }> {
  try {
    const ctx = await requireAuth();
    const v = validateDmInput(ctx.employeeId, { toEmployeeId, body });
    if (!v.ok) return { ok: false, message: v.message };

    const recent = await prisma.spaceChatMessage.count({
      where: { fromEmployeeId: ctx.employeeId, createdAt: { gte: new Date(Date.now() - DM_RATE_LIMIT.windowMs) } },
    });
    if (isDmRateLimited(recent)) return { ok: false, message: 'Bạn gửi quá nhanh, vui lòng chờ vài giây' };

    const target = await prisma.employee.findFirst({
      where: { id: v.data.toEmployeeId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!target) return { ok: false, message: 'Không tìm thấy nhân viên nhận' };

    const row = await prisma.spaceChatMessage.create({
      data: { fromEmployeeId: ctx.employeeId, toEmployeeId: target.id, body: v.data.body },
    });
    const view = toDmView(row);
    const payload = { message: view, fromName: ctx.fullName, fromDepartment: ctx.departmentName };
    await Promise.all([
      broadcastServer(`dm:${target.id}`, 'dm', payload),
      broadcastServer(`dm:${ctx.employeeId}`, 'dm', payload),
    ]);
    return { ok: true, message: 'Đã gửi', data: view };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Gửi tin nhắn thất bại' };
  }
}

export async function listSpaceDmThreadsAction(): Promise<SpaceDmThread[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];
  const me = ctx.employeeId;
  const [recent, unreadGroups] = await Promise.all([
    prisma.spaceChatMessage.findMany({
      where: { OR: [{ fromEmployeeId: me }, { toEmployeeId: me }] },
      orderBy: { id: 'desc' },
      take: 400,
    }),
    prisma.spaceChatMessage.groupBy({
      by: ['fromEmployeeId'],
      where: { toEmployeeId: me, readAt: null },
      _count: { _all: true },
    }),
  ]);

  const lastByOther = new Map<number, (typeof recent)[number]>();
  for (const m of recent) {
    const other = m.fromEmployeeId === me ? m.toEmployeeId : m.fromEmployeeId;
    if (!lastByOther.has(other)) lastByOther.set(other, m);
  }
  const unreadMap = new Map(unreadGroups.map((g) => [g.fromEmployeeId, g._count._all]));

  const ids = [...lastByOther.keys()];
  if (ids.length === 0) return [];
  const people = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, department: { select: { name: true } } },
  });
  const personMap = new Map(people.map((p) => [p.id, p]));

  return ids.map((id) => {
    const m = lastByOther.get(id)!;
    const p = personMap.get(id);
    return {
      otherEmployeeId: id,
      otherName: p?.fullName ?? `Nhân viên #${id}`,
      otherDepartment: p?.department?.name ?? null,
      lastBody: m.body,
      lastAt: m.createdAt.toISOString(),
      lastFromMe: m.fromEmployeeId === me,
      unread: unreadMap.get(id) ?? 0,
    };
  });
}

export async function listSpaceDmMessagesAction(
  otherEmployeeId: number,
  beforeId?: number,
): Promise<{ messages: SpaceDmMessage[]; hasMore: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx || !Number.isInteger(otherEmployeeId)) return { messages: [], hasMore: false };
  const me = ctx.employeeId;
  const PAGE = 30;
  const rows = await prisma.spaceChatMessage.findMany({
    where: {
      OR: [
        { fromEmployeeId: me, toEmployeeId: otherEmployeeId },
        { fromEmployeeId: otherEmployeeId, toEmployeeId: me },
      ],
      ...(beforeId ? { id: { lt: beforeId } } : {}),
    },
    orderBy: { id: 'desc' },
    take: PAGE + 1,
  });
  const hasMore = rows.length > PAGE;
  return { messages: rows.slice(0, PAGE).reverse().map(toDmView), hasMore };
}

export async function markSpaceDmReadAction(otherEmployeeId: number): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx || !Number.isInteger(otherEmployeeId)) return;
  await prisma.spaceChatMessage.updateMany({
    where: { fromEmployeeId: otherEmployeeId, toEmployeeId: ctx.employeeId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ───────────────────────── Khách tham quan ↔ nhân viên & chế độ trả lời ─────────────────────────

const GUEST_KEY_RE = /^[a-f0-9]{32,64}$/;

export interface GuestChatMessage {
  id: number;
  fromGuest: boolean;
  body: string;
  createdAt: string;
  guestName: string;
}

/** Nhân viên chọn chế độ trả lời khách: LIVE (tự trả lời) hoặc AI (trợ lý AI trả lời thay). */
export async function setSpaceChatModeAction(mode: 'LIVE' | 'AI'): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    const m = mode === 'AI' ? 'AI' : 'LIVE';
    await prisma.spaceAvatarConfig.upsert({
      where: { employeeId: ctx.employeeId },
      create: { employeeId: ctx.employeeId, configJson: normalizeAvatar3DConfig(null) as never, chatMode: m },
      update: { chatMode: m },
    });
    return { ok: true, message: m === 'AI' ? 'Đã bật Trợ lý AI trả lời thay bạn' : 'Đã bật chế độ tự trả lời trực tiếp' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Không đổi được chế độ trả lời' };
  }
}

/** Khách gửi câu hỏi cho nhân viên (chế độ LIVE). Công khai, giới hạn tần suất theo guestKey. */
export async function sendGuestMessageAction(
  staffEmployeeId: number,
  guestKey: string,
  guestName: string,
  body: string,
): Promise<{ ok: boolean; message: string; data?: GuestChatMessage }> {
  const text = (body || '').trim().slice(0, 1000);
  if (!GUEST_KEY_RE.test(guestKey) || !text || !Number.isInteger(staffEmployeeId)) {
    return { ok: false, message: 'Tin nhắn không hợp lệ' };
  }
  const recent = await prisma.spaceGuestMessage.count({
    where: { guestKey, fromGuest: true, createdAt: { gte: new Date(Date.now() - 30_000) } },
  });
  if (recent >= 6) return { ok: false, message: 'Bạn gửi hơi nhanh, vui lòng chờ vài giây' };
  const staff = await prisma.employee.findFirst({ where: { id: staffEmployeeId, status: 'ACTIVE' }, select: { id: true } });
  if (!staff) return { ok: false, message: 'Nhân viên không còn trực tuyến' };
  const name = (guestName || 'Khách tham quan').trim().slice(0, 40) || 'Khách tham quan';
  const row = await prisma.spaceGuestMessage.create({
    data: { staffEmployeeId, guestKey, guestName: name, fromGuest: true, body: text },
  });
  const view: GuestChatMessage = { id: row.id, fromGuest: true, body: row.body, createdAt: row.createdAt.toISOString(), guestName: name };
  await broadcastServer(`dm:${staffEmployeeId}`, 'guest', { guestKey, message: view });
  return { ok: true, message: 'Đã gửi', data: view };
}

/** Nhân viên trả lời khách — đẩy realtime về kênh riêng của khách. */
export async function replyGuestAction(guestKey: string, body: string): Promise<{ ok: boolean; message: string; data?: GuestChatMessage }> {
  try {
    const ctx = await requireAuth();
    const text = (body || '').trim().slice(0, 1000);
    if (!GUEST_KEY_RE.test(guestKey) || !text) return { ok: false, message: 'Tin nhắn không hợp lệ' };
    const last = await prisma.spaceGuestMessage.findFirst({
      where: { guestKey, staffEmployeeId: ctx.employeeId },
      orderBy: { id: 'desc' },
      select: { guestName: true },
    });
    if (!last) return { ok: false, message: 'Không tìm thấy cuộc trò chuyện với khách này' };
    const row = await prisma.spaceGuestMessage.create({
      data: { staffEmployeeId: ctx.employeeId, guestKey, guestName: last.guestName, fromGuest: false, body: text },
    });
    const view: GuestChatMessage = { id: row.id, fromGuest: false, body: row.body, createdAt: row.createdAt.toISOString(), guestName: last.guestName };
    await broadcastServer(`gchat:${guestKey}`, 'reply', { message: view, staffName: ctx.fullName, staffEmployeeId: ctx.employeeId });
    await broadcastServer(`dm:${ctx.employeeId}`, 'guest', { guestKey, message: view });
    return { ok: true, message: 'Đã gửi', data: view };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Gửi trả lời thất bại' };
  }
}

/**
 * Mã nhắn tin của khách: guestKey bí mật đã MÃ HOÁ (AES-GCM) — khách gửi kèm presence để nhân viên
 * chủ động nhắn trước mà không lộ guestKey (chỉ server giải mã được).
 */
export async function getGuestChatHandleAction(guestKey: string): Promise<string | null> {
  if (!GUEST_KEY_RE.test(guestKey || '')) return null;
  return encryptSecret(`gk:${guestKey}`);
}

/** Nhân viên chủ động nhắn cho khách (từ mã nhắn tin). Trả guestKey để tiếp tục cuộc trò chuyện trong hộp thư. */
export async function startGuestChatAction(
  handle: string,
  guestName: string,
  body: string,
): Promise<{ ok: boolean; message: string; data?: { guestKey: string; message: GuestChatMessage } }> {
  try {
    const ctx = await requireAuth();
    const text = (body || '').trim().slice(0, 1000);
    if (!text) return { ok: false, message: 'Tin nhắn trống' };
    if (typeof handle !== 'string' || !handle.startsWith('v1.')) return { ok: false, message: 'Không nhắn được cho khách này' };
    const plain = decryptSecret(handle);
    const guestKey = plain.startsWith('gk:') ? plain.slice(3) : '';
    if (!GUEST_KEY_RE.test(guestKey)) return { ok: false, message: 'Không nhắn được cho khách này' };
    const recent = await prisma.spaceGuestMessage.count({
      where: { staffEmployeeId: ctx.employeeId, fromGuest: false, createdAt: { gte: new Date(Date.now() - 10_000) } },
    });
    if (recent >= 10) return { ok: false, message: 'Bạn gửi hơi nhanh, vui lòng chờ vài giây' };
    const name = (guestName || 'Khách tham quan').trim().slice(0, 40) || 'Khách tham quan';
    const row = await prisma.spaceGuestMessage.create({
      data: { staffEmployeeId: ctx.employeeId, guestKey, guestName: name, fromGuest: false, body: text },
    });
    const view: GuestChatMessage = { id: row.id, fromGuest: false, body: row.body, createdAt: row.createdAt.toISOString(), guestName: name };
    await broadcastServer(`gchat:${guestKey}`, 'reply', { message: view, staffName: ctx.fullName, staffEmployeeId: ctx.employeeId });
    await broadcastServer(`dm:${ctx.employeeId}`, 'guest', { guestKey, message: view });
    return { ok: true, message: 'Đã gửi', data: { guestKey, message: view } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Gửi tin nhắn thất bại' };
  }
}

/** Lịch sử 1 cuộc trò chuyện khách ↔ nhân viên (khách đọc bằng guestKey bí mật; nhân viên đọc của mình). */
export async function listGuestMessagesAction(guestKey: string, staffEmployeeId: number): Promise<GuestChatMessage[]> {
  if (!GUEST_KEY_RE.test(guestKey) || !Number.isInteger(staffEmployeeId)) return [];
  const rows = await prisma.spaceGuestMessage.findMany({
    where: { guestKey, staffEmployeeId },
    orderBy: { id: 'desc' },
    take: 50,
  });
  return rows.reverse().map((r) => ({ id: r.id, fromGuest: r.fromGuest, body: r.body, createdAt: r.createdAt.toISOString(), guestName: r.guestName }));
}

/** Danh sách khách đang hỏi nhân viên hiện tại (24 giờ gần nhất). */
export async function listMyGuestThreadsAction(): Promise<{ guestKey: string; guestName: string; lastBody: string; lastAt: string; lastFromGuest: boolean }[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];
  const rows = await prisma.spaceGuestMessage.findMany({
    where: { staffEmployeeId: ctx.employeeId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    orderBy: { id: 'desc' },
    take: 300,
  });
  const seen = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!seen.has(r.guestKey)) seen.set(r.guestKey, r);
  return [...seen.values()].map((r) => ({ guestKey: r.guestKey, guestName: r.guestName, lastBody: r.body, lastAt: r.createdAt.toISOString(), lastFromGuest: r.fromGuest }));
}

/** Nhịp tim trực quầy: client gọi mỗi 60s khi đang trực để giữ trạng thái "Đang trực" (hết nhịp → tự rời sau 3 phút). */
export async function heartbeatPresenceAction(pos?: { x: number; z: number; r: number }): Promise<boolean> {
  const ctx = await getAuthContext();
  if (!ctx) return false;
  const data: { lastSeenAt: Date; posX?: number; posZ?: number; rotY?: number } = { lastSeenAt: new Date() };
  if (pos && [pos.x, pos.z, pos.r].every(Number.isFinite)) {
    data.posX = pos.x;
    data.posZ = pos.z;
    data.rotY = pos.r;
  }
  const res = await prisma.spacePresence.updateMany({ where: { employeeId: ctx.employeeId }, data });
  return res.count > 0;
}
