'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';
import {
  clampColSpan,
  defaultColSpanForWidget,
  filterPermittedWidgetKeys,
  normalizeWidgetLayout,
  WIDGET_BY_KEY,
} from '@/lib/dashboard-widgets';

const saveBoardSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, 'Nhập tên bảng Dashboard').max(120),
  description: z.string().trim().max(255).optional().default(''),
  widgets: z.array(z.string()).min(1, 'Chọn ít nhất 1 khối hiển thị'),
  isDefault: z.boolean().optional().default(false),
  isShared: z.boolean().optional().default(false),
  shareScope: z.enum(['ALL', 'ROLES', 'USERS']).optional().default('ALL'),
  sharedRoleCodes: z.array(z.string()).optional().default([]),
  sharedUserIds: z.array(z.number().int().positive()).optional().default([]),
});

export interface BoardActionResult {
  ok: boolean;
  message: string;
  boardId?: number;
}

export async function saveDashboardBoardAction(input: z.infer<typeof saveBoardSchema>): Promise<BoardActionResult> {
  const ctx = await requireAuth();
  const parsed = saveBoardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
  }

  const data = parsed.data;
  const validWidgets = ctx.isAdmin
    ? Array.from(new Set(data.widgets.filter((k) => WIDGET_BY_KEY.has(k))))
    : filterPermittedWidgetKeys(data.widgets, ctx.permissions, ctx.isAdmin);

  if (validWidgets.length === 0) {
    return { ok: false, message: 'Bạn chưa chọn khối hiển thị nào hợp lệ với quyền hiện tại' };
  }

  const canShare = ctx.isAdmin;
  const isShared = canShare ? data.isShared : false;
  const shareScope = isShared ? data.shareScope : 'ALL';
  const sharedRoleCodes = isShared && shareScope === 'ROLES' ? Array.from(new Set(data.sharedRoleCodes)) : [];
  const sharedUserIds = isShared && shareScope === 'USERS' ? Array.from(new Set(data.sharedUserIds)) : [];

  try {
    if (data.id) {
      const existing = await prisma.dashboardBoard.findUnique({ where: { id: data.id } });
      if (!existing) return { ok: false, message: 'Không tìm thấy bảng Dashboard' };
      if (existing.ownerId !== ctx.userId && !ctx.isAdmin) {
        return { ok: false, message: 'Bạn không có quyền chỉnh sửa bảng này' };
      }

      const existingSpanMap = new Map(
        normalizeWidgetLayout(existing.widgetsJson).map((item) => [item.key, item.colSpan]),
      );
      const nextLayout = validWidgets.map((key) => ({
        key,
        colSpan: existingSpanMap.get(key) ?? defaultColSpanForWidget(key),
      }));

      const updated = await prisma.$transaction(async (tx) => {
        if (data.isDefault && existing.ownerId === ctx.userId) {
          await tx.dashboardBoard.updateMany({
            where: { ownerId: ctx.userId, id: { not: existing.id } },
            data: { isDefault: false },
          });
        }
        return tx.dashboardBoard.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            description: data.description || null,
            widgetsJson: nextLayout as never,
            ...(existing.ownerId === ctx.userId ? { isDefault: data.isDefault } : {}),
            ...(canShare
              ? {
                  isShared,
                  shareScope,
                  sharedRoleCodes: sharedRoleCodes as never,
                  sharedUserIds: sharedUserIds as never,
                }
              : {}),
          },
        });
      });

      revalidatePath('/dashboard');
      return { ok: true, message: 'Đã cập nhật bảng Dashboard', boardId: updated.id };
    }

    const created = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.dashboardBoard.updateMany({
          where: { ownerId: ctx.userId },
          data: { isDefault: false },
        });
      }
      return tx.dashboardBoard.create({
        data: {
          name: data.name,
          description: data.description || null,
          ownerId: ctx.userId,
          isDefault: data.isDefault,
          isShared,
          shareScope,
          sharedRoleCodes: sharedRoleCodes as never,
          sharedUserIds: sharedUserIds as never,
          widgetsJson: validWidgets.map((key) => ({
            key,
            colSpan: defaultColSpanForWidget(key),
          })) as never,
        },
      });
    });

    revalidatePath('/dashboard');
    return { ok: true, message: 'Đã tạo bảng Dashboard mới', boardId: created.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Không thể lưu bảng Dashboard' };
  }
}

export async function deleteDashboardBoardAction(boardId: number): Promise<BoardActionResult> {
  const ctx = await requireAuth();
  const existing = await prisma.dashboardBoard.findUnique({ where: { id: boardId } });
  if (!existing) return { ok: false, message: 'Bảng không tồn tại' };
  if (existing.ownerId !== ctx.userId && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền xóa bảng này' };
  }

  await prisma.dashboardBoard.delete({ where: { id: boardId } });
  revalidatePath('/dashboard');
  return { ok: true, message: 'Đã xóa bảng Dashboard' };
}

export async function setDefaultDashboardBoardAction(boardId: number): Promise<BoardActionResult> {
  const ctx = await requireAuth();
  const existing = await prisma.dashboardBoard.findUnique({ where: { id: boardId } });
  if (!existing || existing.ownerId !== ctx.userId) {
    return { ok: false, message: 'Chỉ có thể đặt làm mặc định cho bảng do bạn tạo' };
  }

  await prisma.$transaction([
    prisma.dashboardBoard.updateMany({ where: { ownerId: ctx.userId }, data: { isDefault: false } }),
    prisma.dashboardBoard.update({ where: { id: boardId }, data: { isDefault: true } }),
  ]);

  revalidatePath('/dashboard');
  return { ok: true, message: `Đã đặt "${existing.name}" làm Dashboard mặc định` };
}

const saveLayoutSchema = z.object({
  boardId: z.number().int().positive(),
  layout: z
    .array(
      z.object({
        key: z.string().min(1),
        colSpan: z.number().int(),
      }),
    )
    .min(1, 'Bảng cần ít nhất 1 khối hiển thị'),
});

export async function saveDashboardLayoutAction(
  boardId: number,
  layout: { key: string; colSpan: number }[],
): Promise<BoardActionResult> {
  const ctx = await requireAuth();
  const parsed = saveLayoutSchema.safeParse({ boardId, layout });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu layout không hợp lệ' };
  }

  const existing = await prisma.dashboardBoard.findUnique({ where: { id: boardId } });
  if (!existing) return { ok: false, message: 'Không tìm thấy bảng Dashboard' };
  if (existing.ownerId !== ctx.userId && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền thiết kế layout cho bảng này' };
  }

  const allowedKeys = new Set(
    ctx.isAdmin
      ? parsed.data.layout.map((i) => i.key).filter((k) => WIDGET_BY_KEY.has(k))
      : filterPermittedWidgetKeys(
          parsed.data.layout.map((i) => i.key),
          ctx.permissions,
          ctx.isAdmin,
        ),
  );

  const seen = new Set<string>();
  const sanitized = [];
  for (const item of parsed.data.layout) {
    if (!allowedKeys.has(item.key) || seen.has(item.key)) continue;
    seen.add(item.key);
    sanitized.push({
      key: item.key,
      colSpan: clampColSpan(item.colSpan, item.key),
    });
  }

  if (sanitized.length === 0) {
    return { ok: false, message: 'Không có khối hiển thị hợp lệ để lưu' };
  }

  await prisma.dashboardBoard.update({
    where: { id: boardId },
    data: { widgetsJson: sanitized as never },
  });

  revalidatePath('/dashboard');
  return { ok: true, message: 'Đã lưu bố cục Dashboard', boardId };
}
