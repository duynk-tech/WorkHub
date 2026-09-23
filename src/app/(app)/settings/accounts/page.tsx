import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { AccountScreen } from './account-screen';

export const metadata = { title: 'Tài khoản' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const ctx = await requireAuth();

  const [users, roles] = await Promise.all([
    // Tìm kiếm và lọc chạy tại client nên lấy hết một lần, khỏi nạp lại trang mỗi lần gõ
    prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
      include: {
        employee: { select: { id: true, fullName: true, code: true, avatarUrl: true, department: { select: { name: true } }, position: { select: { name: true } } } },
        roles: { select: { roleId: true, role: { select: { code: true, name: true } } } },
      },
    }),
    prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true } }),
  ]);

  return (
    <AccountScreen
      users={JSON.parse(JSON.stringify(users))}
      roles={roles}
      currentUserId={ctx.userId}
      canManage={can(ctx, 'FEATURE_ACCOUNT_MANAGE')}
      canResetPassword={can(ctx, 'FEATURE_ACCOUNT_RESET_PASSWORD')}
    />
  );
}
