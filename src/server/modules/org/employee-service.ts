import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';

export interface EmployeeFilter {
  search?: string;
  departmentId?: number | null;
  /** true = tính cả các đơn vị trực thuộc */
  includeSubDepts?: boolean;
  status?: string;
  positionId?: number | null;
  hasAccount?: boolean | null;
  page?: number;
  pageSize?: number;
}

export async function listEmployees(ctx: AuthContext, filter: EmployeeFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, filter.pageSize ?? 20);
  const scopeIds = await visibleEmployeeIds(ctx);

  const where: Prisma.EmployeeWhereInput = {};
  if (scopeIds !== null) where.id = { in: scopeIds.length ? scopeIds : [-1] };

  if (filter.search?.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { fullName: { contains: q } },
      { code: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  if (filter.departmentId) {
    if (filter.includeSubDepts) {
      const dept = await prisma.department.findUnique({ where: { id: filter.departmentId }, select: { path: true } });
      if (dept) {
        const branch = await prisma.department.findMany({ where: { path: { startsWith: dept.path } }, select: { id: true } });
        where.departmentId = { in: branch.map((d) => d.id) };
      }
    } else {
      where.departmentId = filter.departmentId;
    }
  }

  if (filter.status) where.status = filter.status as never;
  if (filter.positionId) where.positionId = filter.positionId;
  if (filter.hasAccount === true) where.user = { isNot: null };
  if (filter.hasAccount === false) where.user = { is: null };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: [{ department: { path: 'asc' } }, { fullName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, rankLevel: true } },
        manager: { select: { id: true, fullName: true } },
        user: { select: { id: true, username: true, isActive: true, lastLoginAt: true, roles: { select: { role: { select: { code: true, name: true } } } } } },
        workShift: { select: { id: true, name: true } },
      },
    }),
    prisma.employee.count({ where }),
  ]);

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface EmployeeInput {
  code: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  departmentId: number | null;
  positionId: number | null;
  managerId: number | null;
  workShiftId: number | null;
  employmentType: string;
  status: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  note?: string | null;
}

export async function createEmployee(input: EmployeeInput) {
  const dup = await prisma.employee.findUnique({ where: { code: input.code } });
  if (dup) throw new Error(`Mã nhân sự "${input.code}" đã tồn tại`);
  if (input.email) {
    const dupEmail = await prisma.employee.findUnique({ where: { email: input.email } });
    if (dupEmail) throw new Error(`Email "${input.email}" đã được dùng`);
  }

  const employee = await prisma.employee.create({
    data: {
      code: input.code, fullName: input.fullName, email: input.email || null, phone: input.phone || null,
      departmentId: input.departmentId, positionId: input.positionId, managerId: input.managerId,
      workShiftId: input.workShiftId, employmentType: input.employmentType as never, status: input.status as never,
      gender: input.gender || null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      joinDate: input.joinDate ? new Date(input.joinDate) : null,
      note: input.note || null,
    },
  });

  // Mở quỹ phép năm hiện tại theo cấu hình mặc định
  const year = new Date().getFullYear();
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'leave.annualDefaultDays' } });
  const standardDays = Number(setting?.valueJson ?? 12);
  await prisma.leaveBalance.create({ data: { employeeId: employee.id, year, standardDays } });

  return employee;
}

export async function updateEmployee(id: number, input: EmployeeInput) {
  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) throw new Error('Không tìm thấy nhân sự');

  const dup = await prisma.employee.findFirst({ where: { code: input.code, id: { not: id } } });
  if (dup) throw new Error(`Mã nhân sự "${input.code}" đã được dùng`);

  if (input.managerId === id) throw new Error('Nhân sự không thể là quản lý của chính mình');
  if (input.managerId) {
    // Chặn vòng lặp trong chuỗi quản lý
    let cursor: number | null = input.managerId;
    const seen = new Set<number>([id]);
    while (cursor) {
      if (seen.has(cursor)) throw new Error('Cấu hình quản lý tạo thành vòng lặp');
      seen.add(cursor);
      const next: { managerId: number | null } | null = await prisma.employee.findUnique({
        where: { id: cursor }, select: { managerId: true },
      });
      cursor = next?.managerId ?? null;
    }
  }

  return prisma.employee.update({
    where: { id },
    data: {
      code: input.code, fullName: input.fullName, email: input.email || null, phone: input.phone || null,
      departmentId: input.departmentId, positionId: input.positionId, managerId: input.managerId,
      workShiftId: input.workShiftId, employmentType: input.employmentType as never, status: input.status as never,
      gender: input.gender || null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      joinDate: input.joinDate ? new Date(input.joinDate) : null,
      note: input.note || null,
    },
  });
}

/** Chuỗi quản lý từ nhân sự lên trên, dùng cho workflow resolver và hiển thị. */
export async function getManagerChain(employeeId: number, maxDepth = 8) {
  const chain: { id: number; fullName: string; positionName: string | null; level: number }[] = [];
  let cursor: number | null = employeeId;
  const seen = new Set<number>();

  for (let level = 0; level < maxDepth && cursor; level++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const emp: {
      managerId: number | null;
      manager: { id: number; fullName: string; position: { name: string } | null } | null;
    } | null = await prisma.employee.findUnique({
      where: { id: cursor },
      select: { managerId: true, manager: { select: { id: true, fullName: true, position: { select: { name: true } } } } },
    });
    if (!emp?.manager) break;
    chain.push({ id: emp.manager.id, fullName: emp.manager.fullName, positionName: emp.manager.position?.name ?? null, level: level + 1 });
    cursor = emp.managerId;
  }
  return chain;
}
