'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { can, requireAuth } from '@/server/auth/context';
import {
  synthesizeProcedural3D,
  type Procedural3DPart,
  type SpaceStructure,
} from '@/lib/space-3d-types';

export interface SpaceActionResult {
  ok: boolean;
  message: string;
  parts?: Procedural3DPart[];
}

function canEditSpace(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  return (
    ctx.isAdmin ||
    can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
    can(ctx, 'FEATURE_SETTING_GENERAL')
  );
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
  },
): Promise<SpaceActionResult> {
  try {
    const ctx = await requireAuth();
    if (!canEditSpace(ctx)) {
      return { ok: false, message: 'Bạn không có quyền chỉnh sửa bố cục Không gian 3D' };
    }

    const scene = await prisma.spaceScene.findUnique({ where: { code: sceneCode } });
    if (!scene) return { ok: false, message: 'Không tìm thấy không gian 3D' };

    const validPlacements = payload.placements
      .map((p) => placementInputSchema.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data);

    await prisma.$transaction(async (tx) => {
      await tx.spaceScene.update({
        where: { id: scene.id },
        data: { structuresJson: payload.structures as never },
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
    });

    revalidatePath('/3d');
    return { ok: true, message: `Đã lưu sơ đồ 3D (${validPlacements.length} thiết bị)` };
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
        lastSeenAt: new Date(),
      },
    });

    revalidatePath('/3d');
    return { ok: true, message: `Đang trực tại ${stationLabel || ctx.departmentName || 'quầy'}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Cập nhật trạng thái trực thất bại' };
  }
}
