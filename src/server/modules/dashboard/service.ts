import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { filterPermittedWidgetKeys } from '@/lib/dashboard-widgets';

export interface DashboardBoardView {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  ownerName: string;
  isOwn: boolean;
  isDefault: boolean;
  isShared: boolean;
  shareScope: 'ALL' | 'ROLES' | 'USERS';
  sharedRoleCodes: string[];
  sharedUserIds: number[];
  /** Toàn bộ widget đã lưu trên board (dành cho chủ sở hữu / admin khi sửa). */
  rawWidgets: string[];
  /** Các widget người dùng hiện tại ĐƯỢC PHÉP thấy theo phân quyền. */
  visibleWidgets: string[];
}

function asStringArray(val: unknown): string[] {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];
}

function asNumberArray(val: unknown): number[] {
  return Array.isArray(val) ? val.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
}

/**
 * Lấy danh sách bảng Dashboard người dùng được phép xem (bảng của chính mình + bảng được quản trị chia sẻ).
 * - Lọc chặt theo đối tượng chia sẻ (ALL / ROLES / USERS).
 * - Lọc chặt từng widget theo quyền thực tế của người dùng; nếu bảng chia sẻ không còn widget nào hợp lệ thì ẩn bảng.
 * - Quy tắc chọn mặc định:
 *   1. Bảng được chỉ định qua URL `?board=<id>` (nếu hợp lệ)
 *   2. Bảng của chính người dùng có `isDefault = true`
 *   3. Bảng đầu tiên trong danh sách khả dụng (bao gồm cả bảng chia sẻ)
 */
export async function getAccessibleDashboardBoards(
  ctx: AuthContext,
  requestedBoardId?: number | null,
): Promise<{ boards: DashboardBoardView[]; activeBoard: DashboardBoardView | null }> {
  const rows = await prisma.dashboardBoard.findMany({
    where: {
      OR: [{ ownerId: ctx.userId }, { isShared: true }],
    },
    include: {
      owner: { select: { username: true, employee: { select: { fullName: true } } } },
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });

  const boards: DashboardBoardView[] = [];
  for (const row of rows) {
    const isOwn = row.ownerId === ctx.userId;
    const shareScope = (row.shareScope === 'ROLES' || row.shareScope === 'USERS' ? row.shareScope : 'ALL') as
      | 'ALL'
      | 'ROLES'
      | 'USERS';
    const sharedRoleCodes = asStringArray(row.sharedRoleCodes);
    const sharedUserIds = asNumberArray(row.sharedUserIds);

    // Kiểm tra quyền thấy bảng chia sẻ
    if (!isOwn) {
      if (!row.isShared) continue;
      if (!ctx.isAdmin) {
        if (shareScope === 'ROLES' && !ctx.roleCodes.some((c) => sharedRoleCodes.includes(c))) {
          continue;
        }
        if (shareScope === 'USERS' && !sharedUserIds.includes(ctx.userId)) {
          continue;
        }
      }
    }

    const rawWidgets = asStringArray(row.widgetsJson);
    const visibleWidgets = filterPermittedWidgetKeys(rawWidgets, ctx.permissions, ctx.isAdmin);

    // Với bảng được chia sẻ, nếu người xem không có quyền xem bất kỳ widget nào thì ẩn bảng
    if (!isOwn && !ctx.isAdmin && visibleWidgets.length === 0) {
      continue;
    }

    boards.push({
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      ownerName: row.owner.employee?.fullName || row.owner.username,
      isOwn,
      isDefault: isOwn && row.isDefault,
      isShared: row.isShared,
      shareScope,
      sharedRoleCodes,
      sharedUserIds,
      rawWidgets,
      visibleWidgets,
    });
  }

  // Sắp xếp: bảng cá nhân mặc định lên đầu, tiếp đến bảng cá nhân khác, rồi bảng được chia sẻ
  boards.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    return a.id - b.id;
  });

  let activeBoard: DashboardBoardView | null = null;
  if (requestedBoardId) {
    activeBoard = boards.find((b) => b.id === requestedBoardId) ?? null;
  }
  if (!activeBoard) {
    activeBoard = boards.find((b) => b.isDefault) ?? boards[0] ?? null;
  }

  return { boards, activeBoard };
}
