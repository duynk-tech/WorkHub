import { prisma } from '@/lib/prisma';

/**
 * Số liệu "sống" của khung app: badge menu + thông báo gần nhất.
 * Dùng chung cho layout (lần tải đầu) và /api/notifications/live (cập nhật định kỳ),
 * nên hai nơi không bao giờ lệch nhau.
 */
export async function loadShellLive(ctx: { userId: number; employeeId: number }) {
  const [pendingApprovals, myTasks, notifications, unreadCount] = await Promise.all([
    prisma.approvalTask.count({ where: { approverId: ctx.employeeId, status: 'PENDING' } }),
    prisma.task.count({ where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
    prisma.inAppNotification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true },
    }),
    prisma.inAppNotification.count({ where: { userId: ctx.userId, readAt: null } }),
  ]);
  return { badges: { pendingApprovals, myTasks }, notifications, unreadCount };
}

export type ShellLive = Awaited<ReturnType<typeof loadShellLive>>;
