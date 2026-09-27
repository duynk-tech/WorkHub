import { googleReady } from '@/server/auth/google/service';
import { GoogleAccount } from './google-account';
import { requireAuth } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getOrCreateBalance, remainingDays } from '@/server/modules/leave/service';
import { ProfileScreen } from './profile-screen';

export const metadata = { title: 'Hồ sơ cá nhân' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const ctx = await requireAuth();
  const year = new Date().getFullYear();

  const [employee, balance, stats] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: ctx.employeeId },
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        manager: { select: { fullName: true } },
        workShift: { select: { name: true, startTime: true, endTime: true } },
      },
    }),
    getOrCreateBalance(ctx.employeeId, year),
    Promise.all([
      prisma.task.count({ where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
      prisma.task.count({ where: { assigneeId: ctx.employeeId, status: 'DONE' } }),
      prisma.leaveRequest.count({ where: { employeeId: ctx.employeeId, status: 'APPROVED' } }),
    ]),
  ]);

  const googleEnabled = await googleReady();
  const google = googleEnabled ? await prisma.externalIdentity.findUnique({ where: { userId_provider: { userId: ctx.userId, provider: 'google' } } }) : null;
  const result = (await searchParams).google;
  return (
    <div className="stack"><ProfileScreen
      employee={JSON.parse(JSON.stringify(employee))}
      user={{ username: ctx.username, roleNames: ctx.roleNames }}
      balance={{ remaining: remainingDays(balance), used: Number(balance.usedDays), pending: Number(balance.pendingDays), year }}
      stats={{ openTasks: stats[0], doneTasks: stats[1], approvedLeaves: stats[2] }}
      zaloLinked={ctx.zaloLinked}
    /><GoogleAccount enabled={googleEnabled} email={google?.email ?? null} result={result} /></div>
  );
}
