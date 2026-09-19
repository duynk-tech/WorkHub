import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getTaskDetail } from '@/server/modules/task/service';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { TaskDetail } from './task-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id: Number(id) }, select: { code: true, title: true } });
  return { title: task ? `${task.code} · ${task.title}` : 'Công việc' };
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const [{ id }, sp] = await Promise.all([params, searchParams ? searchParams : Promise.resolve({})]);
  const task = await getTaskDetail(ctx, Number(id));
  if (!task) notFound();

  const scopeIds = await visibleEmployeeIds(ctx);
  const [employees, tree] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE', ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, code: true, avatarUrl: true },
    }),
    getDepartmentTree(),
  ]);

  const canEdit =
    task.assigneeId === ctx.employeeId || task.creatorId === ctx.employeeId || can(ctx, 'FEATURE_TASK_EDIT');

  return (
    <TaskDetail
      initialTab={(sp as any)?.tab ?? 'comments'}
      task={JSON.parse(JSON.stringify(task))}
      employees={employees}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      currentEmployeeId={ctx.employeeId}
      canEdit={canEdit}
      canDelete={can(ctx, 'FEATURE_TASK_DELETE')}
      canAssign={can(ctx, 'FEATURE_TASK_ASSIGN')}
    />
  );
}
