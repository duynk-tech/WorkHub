import { requireAuth, can } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getMonthlySheet, getTodayRecord } from '@/server/modules/attendance/service';
import { getDepartmentTree, flattenTree } from '@/server/modules/org/department-service';
import { prisma } from '@/lib/prisma';
import { AttendanceScreen } from './attendance-screen';

export const metadata = { title: 'Chấm công' };
export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; dept?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;

  const now = new Date();
  const [yearStr, monthStr] = (sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  let scopeIds = await visibleEmployeeIds(ctx);
  if (sp.dept) {
    const dept = await prisma.department.findUnique({ where: { id: Number(sp.dept) }, select: { path: true } });
    if (dept) {
      const branch = await prisma.department.findMany({ where: { path: { startsWith: dept.path } }, select: { id: true } });
      const inDept = await prisma.employee.findMany({
        where: { departmentId: { in: branch.map((d) => d.id) } },
        select: { id: true },
      });
      const deptIds = inDept.map((e) => e.id);
      scopeIds = scopeIds === null ? deptIds : scopeIds.filter((id) => deptIds.includes(id));
    }
  }

  const [sheet, myRecord, tree] = await Promise.all([
    getMonthlySheet(year, month, scopeIds),
    getTodayRecord(ctx.employeeId),
    getDepartmentTree(),
  ]);

  return (
    <AttendanceScreen
      sheet={JSON.parse(JSON.stringify(sheet))}
      myRecord={myRecord ? {
        checkInAt: myRecord.checkInAt?.toISOString() ?? null,
        checkOutAt: myRecord.checkOutAt?.toISOString() ?? null,
        lateMinutes: myRecord.lateMinutes,
        status: myRecord.status,
      } : null}
      departments={flattenTree(tree).map((d) => ({ id: d.id, name: d.name, level: d.level }))}
      month={`${year}-${String(month).padStart(2, '0')}`}
      selectedDept={sp.dept ?? ''}
      canEdit={can(ctx, 'FEATURE_ATTENDANCE_EDIT')}
      canImport={can(ctx, 'FEATURE_ATTENDANCE_IMPORT')}
    />
  );
}
