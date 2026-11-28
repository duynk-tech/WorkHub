import { prisma } from '@/lib/prisma';

/**
 * Nhân sự đang có một quyền (qua bất kỳ vai trò nào) hoặc là ADMIN.
 * Không import server-only — dùng được trong job chạy dưới tsx.
 */
export async function employeeIdsWithPermission(code: string): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: {
        some: {
          role: {
            OR: [{ code: 'ADMIN' }, { permissions: { some: { permissionCode: code } } }],
          },
        },
      },
    },
    select: { employeeId: true },
  });
  return Array.from(new Set(users.map((u) => u.employeeId)));
}
