import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { WorkflowScreen } from './workflow-screen';

export const metadata = { title: 'Quy trình duyệt' };
export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const ctx = await requireAuth();

  const [definitions, roles, positions, employees, leaveTypes, tree] = await Promise.all([
    prisma.workflowDefinition.findMany({
      orderBy: [{ entityType: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { instances: true, leaveTypes: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.position.findMany({ orderBy: { rankLevel: 'desc' }, select: { id: true, name: true, rankLevel: true } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, code: true } }),
    prisma.leaveType.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true, workflowDefinitionId: true } }),
    getDepartmentTree(),
  ]);

  return (
    <WorkflowScreen
      definitions={JSON.parse(JSON.stringify(definitions))}
      roles={roles}
      positions={positions}
      employees={employees}
      leaveTypes={leaveTypes}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      canManage={can(ctx, 'FEATURE_WORKFLOW_MANAGE')}
    />
  );
}
