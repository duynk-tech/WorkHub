import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from './context';

/**
 * Chuyển phạm vi dữ liệu của vai trò thành danh sách employeeId được phép xem.
 * Trả về null nghĩa là "không giới hạn" (scope ALL).
 */
async function loadVisibleEmployeeIds(ctx: AuthContext): Promise<number[] | null> {
  if (ctx.dataScope === 'ALL') return null;

  if (ctx.dataScope === 'SELF') {
    // Nhân viên vẫn thấy được nhân sự cấp dưới trực tiếp nếu có
    const reports = await prisma.employee.findMany({
      where: { managerId: ctx.employeeId },
      select: { id: true },
    });
    return [ctx.employeeId, ...reports.map((r) => r.id)];
  }

  const deptIds = await visibleDepartmentIds(ctx);
  if (deptIds === null) return null;

  const employees = await prisma.employee.findMany({
    where: { departmentId: { in: deptIds.length ? deptIds : [-1] } },
    select: { id: true },
  });
  const ids = new Set(employees.map((e) => e.id));
  ids.add(ctx.employeeId);
  return Array.from(ids);
}

async function loadVisibleDepartmentIds(ctx: AuthContext): Promise<number[] | null> {
  if (ctx.dataScope === 'ALL') return null;

  if (ctx.dataScope === 'DEPT_TREE') {
    if (!ctx.departmentPath) return ctx.departmentId ? [ctx.departmentId] : [];
    // Cả nhánh: chính nó + mọi phòng ban con (materialized path)
    const rows = await prisma.department.findMany({
      where: { path: { startsWith: ctx.departmentPath } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (ctx.dataScope === 'DEPT') {
    return ctx.departmentId ? [ctx.departmentId] : [];
  }

  if (ctx.dataScope === 'CUSTOM') {
    const base = new Set(ctx.customDeptIds);
    if (ctx.departmentId) base.add(ctx.departmentId);
    return Array.from(base);
  }

  return ctx.departmentId ? [ctx.departmentId] : [];
}

/**
 * Một request gọi phạm vi dữ liệu nhiều lần (layout, page, từng báo cáo...).
 * `cache` của React nhớ kết quả theo đúng object ctx trong phạm vi một request
 * (getAuthContext cũng được cache nên ctx là cùng một object), nên chỉ truy vấn một lần.
 */
export const visibleEmployeeIds: (ctx: AuthContext) => Promise<number[] | null> = cache(loadVisibleEmployeeIds);

/** Danh sách phòng ban được phép xem. null = tất cả. */
export const visibleDepartmentIds: (ctx: AuthContext) => Promise<number[] | null> = cache(loadVisibleDepartmentIds);

/** Điều kiện Prisma cho bảng có cột employeeId */
export async function employeeScopeWhere(ctx: AuthContext, field = 'employeeId') {
  const ids = await visibleEmployeeIds(ctx);
  if (ids === null) return {};
  return { [field]: { in: ids.length ? ids : [-1] } };
}

/** Kiểm tra quyền thao tác trên một nhân sự cụ thể */
export async function canTouchEmployee(ctx: AuthContext, employeeId: number): Promise<boolean> {
  if (ctx.dataScope === 'ALL') return true;
  if (employeeId === ctx.employeeId) return true;
  const ids = await visibleEmployeeIds(ctx);
  return ids === null || ids.includes(employeeId);
}
