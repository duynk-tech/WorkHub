import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/server/auth/password';

/** Cây phòng ban mẫu 3 cấp + nhân sự demo. Chỉ chạy khi DB còn trống. */
export async function seedDemoOrg(prisma: PrismaClient) {
  const tree = [
    { code: 'CTY', name: 'Ban Tổng giám đốc', parent: null as string | null, sortOrder: 10 },
    { code: 'KHOI_KD', name: 'Khối Kinh doanh', parent: 'CTY', sortOrder: 20 },
    { code: 'P_KD1', name: 'Phòng Kinh doanh 1', parent: 'KHOI_KD', sortOrder: 21 },
    { code: 'P_KD2', name: 'Phòng Kinh doanh 2', parent: 'KHOI_KD', sortOrder: 22 },
    { code: 'P_MKT', name: 'Phòng Marketing', parent: 'KHOI_KD', sortOrder: 23 },
    { code: 'KHOI_KT', name: 'Khối Kỹ thuật', parent: 'CTY', sortOrder: 30 },
    { code: 'P_DEV', name: 'Phòng Phát triển phần mềm', parent: 'KHOI_KT', sortOrder: 31 },
    { code: 'P_IT', name: 'Phòng Hạ tầng - IT', parent: 'KHOI_KT', sortOrder: 32 },
    { code: 'P_QC', name: 'Phòng Kiểm thử', parent: 'KHOI_KT', sortOrder: 33 },
    { code: 'KHOI_HT', name: 'Khối Hành chính - Nhân sự', parent: 'CTY', sortOrder: 40 },
    { code: 'P_HR', name: 'Phòng Nhân sự', parent: 'KHOI_HT', sortOrder: 41 },
    { code: 'P_KT', name: 'Phòng Kế toán', parent: 'KHOI_HT', sortOrder: 42 },
  ];

  const idByCode = new Map<string, { id: number; path: string; level: number }>();

  for (const node of tree) {
    const parent = node.parent ? idByCode.get(node.parent) : undefined;
    const level = parent ? parent.level + 1 : 1;
    const existing = await prisma.department.findUnique({ where: { code: node.code } });
    const dept = existing
      ? await prisma.department.update({
          where: { id: existing.id },
          data: { name: node.name, parentId: parent?.id ?? null, level, sortOrder: node.sortOrder },
        })
      : await prisma.department.create({
          data: { code: node.code, name: node.name, parentId: parent?.id ?? null, level, sortOrder: node.sortOrder, path: '/' },
        });

    const path = `${parent ? parent.path : '/'}${dept.id}/`;
    await prisma.department.update({ where: { id: dept.id }, data: { path } });
    idByCode.set(node.code, { id: dept.id, path, level });
  }

  return idByCode;
}

interface DemoPerson {
  code: string;
  name: string;
  dept: string;
  position: string;
  role: string;
  username: string;
  manager?: string;
}

export async function seedDemoEmployees(
  prisma: PrismaClient,
  depts: Map<string, { id: number; path: string; level: number }>,
  defaultPassword: string,
) {
  const people: DemoPerson[] = [
    { code: 'NV001', name: 'Trần Quốc Dũng', dept: 'CTY', position: 'CEO', role: 'ADMIN', username: 'dungtq' },
    { code: 'NV002', name: 'Phạm Thị Hồng Hà', dept: 'P_HR', position: 'MANAGER', role: 'HR', username: 'hapth', manager: 'NV001' },
    { code: 'NV003', name: 'Lê Minh Khang', dept: 'KHOI_KT', position: 'DIRECTOR', role: 'MANAGER', username: 'khanglm', manager: 'NV001' },
    { code: 'NV004', name: 'Nguyễn Văn Bảo', dept: 'P_DEV', position: 'MANAGER', role: 'MANAGER', username: 'baonv', manager: 'NV003' },
    { code: 'NV005', name: 'Vũ Thanh Tùng', dept: 'P_DEV', position: 'SENIOR_STAFF', role: 'EMPLOYEE', username: 'tungvt', manager: 'NV004' },
    { code: 'NV006', name: 'Đỗ Thị Mai Anh', dept: 'P_DEV', position: 'STAFF', role: 'EMPLOYEE', username: 'anhdtm', manager: 'NV004' },
    { code: 'NV007', name: 'Hoàng Gia Huy', dept: 'P_QC', position: 'TEAM_LEAD', role: 'EMPLOYEE', username: 'huyhg', manager: 'NV003' },
    { code: 'NV008', name: 'Bùi Ngọc Lan', dept: 'P_IT', position: 'STAFF', role: 'EMPLOYEE', username: 'lanbn', manager: 'NV003' },
    { code: 'NV009', name: 'Trương Hải Đăng', dept: 'KHOI_KD', position: 'DIRECTOR', role: 'MANAGER', username: 'dangth', manager: 'NV001' },
    { code: 'NV010', name: 'Ngô Phương Thảo', dept: 'P_KD1', position: 'MANAGER', role: 'MANAGER', username: 'thaonp', manager: 'NV009' },
    { code: 'NV011', name: 'Lý Quang Vinh', dept: 'P_KD1', position: 'STAFF', role: 'EMPLOYEE', username: 'vinhlq', manager: 'NV010' },
    { code: 'NV012', name: 'Đặng Thu Trang', dept: 'P_MKT', position: 'STAFF', role: 'EMPLOYEE', username: 'trangdt', manager: 'NV009' },
    { code: 'NV013', name: 'Phan Kim Chi', dept: 'P_KT', position: 'MANAGER', role: 'EMPLOYEE', username: 'chipk', manager: 'NV001' },
    { code: 'NV014', name: 'Võ Anh Tuấn', dept: 'P_HR', position: 'STAFF', role: 'EMPLOYEE', username: 'tuanva', manager: 'NV002' },
  ];

  const shift = await prisma.workShift.findUnique({ where: { code: 'ADMIN' } });
  const passwordHash = await hashPassword(defaultPassword);
  const idByCode = new Map<string, number>();
  const year = new Date().getFullYear();

  // Vòng 1: tạo nhân sự
  for (const p of people) {
    const position = await prisma.position.findUnique({ where: { code: p.position } });
    const dept = depts.get(p.dept);
    const email = `${p.username}@congty.vn`;

    const existing = await prisma.employee.findUnique({ where: { code: p.code } });
    const emp = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data: { fullName: p.name, departmentId: dept?.id, positionId: position?.id, workShiftId: shift?.id },
        })
      : await prisma.employee.create({
          data: {
            code: p.code, fullName: p.name, email, phone: null,
            departmentId: dept?.id, positionId: position?.id, workShiftId: shift?.id,
            joinDate: new Date(Date.UTC(year - 2, 0, 15)), status: 'ACTIVE', employmentType: 'FULL_TIME',
          },
        });
    idByCode.set(p.code, emp.id);
  }

  // Vòng 2: gán quản lý trực tiếp + tài khoản + vai trò + quỹ phép
  for (const p of people) {
    const empId = idByCode.get(p.code)!;
    if (p.manager) {
      await prisma.employee.update({ where: { id: empId }, data: { managerId: idByCode.get(p.manager) } });
    }

    const role = await prisma.role.findUnique({ where: { code: p.role } });
    const existingUser = await prisma.user.findUnique({ where: { employeeId: empId } });
    const user = existingUser
      ? existingUser
      : await prisma.user.create({
          data: { employeeId: empId, username: p.username, passwordHash, isActive: true, mustChangePassword: false },
        });

    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId: empId, year } },
      update: {},
      create: { employeeId: empId, year, standardDays: 12, bonusDays: 0, carriedOverDays: 0 },
    });
  }

  // Trưởng đơn vị của từng phòng ban
  const heads: Record<string, string> = {
    CTY: 'NV001', KHOI_KT: 'NV003', P_DEV: 'NV004', P_QC: 'NV007',
    KHOI_KD: 'NV009', P_KD1: 'NV010', P_HR: 'NV002', P_KT: 'NV013',
  };
  for (const [deptCode, empCode] of Object.entries(heads)) {
    const dept = depts.get(deptCode);
    const empId = idByCode.get(empCode);
    if (dept && empId) {
      await prisma.department.update({ where: { id: dept.id }, data: { managerId: empId } });
    }
  }

  return idByCode;
}

export async function seedDemoTasks(prisma: PrismaClient, employees: Map<string, number>) {
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000);

  const samples = [
    { title: 'Hoàn thiện module báo cáo doanh thu quý', assignee: 'NV005', creator: 'NV004', dept: 'P_DEV', priority: 'HIGH', status: 'IN_PROGRESS', due: 3, progress: 60 },
    { title: 'Kiểm thử hồi quy phiên bản 2.4', assignee: 'NV007', creator: 'NV003', dept: 'P_QC', priority: 'MEDIUM', status: 'TODO', due: 5, progress: 0 },
    { title: 'Nâng cấp máy chủ ứng dụng lên Ubuntu 24.04', assignee: 'NV008', creator: 'NV003', dept: 'P_IT', priority: 'URGENT', status: 'IN_PROGRESS', due: -1, progress: 40 },
    { title: 'Chuẩn bị hợp đồng khách hàng ABC', assignee: 'NV011', creator: 'NV010', dept: 'P_KD1', priority: 'HIGH', status: 'REVIEW', due: 1, progress: 90 },
    { title: 'Lập kế hoạch truyền thông tháng tới', assignee: 'NV012', creator: 'NV009', dept: 'P_MKT', priority: 'MEDIUM', status: 'TODO', due: 7, progress: 0 },
    { title: 'Tổng hợp bảng công tháng trước', assignee: 'NV014', creator: 'NV002', dept: 'P_HR', priority: 'HIGH', status: 'DONE', due: -3, progress: 100 },
    { title: 'Sửa lỗi hiển thị biểu đồ trên Safari', assignee: 'NV006', creator: 'NV004', dept: 'P_DEV', priority: 'LOW', status: 'TODO', due: 10, progress: 0 },
    { title: 'Rà soát chi phí vận hành quý', assignee: 'NV013', creator: 'NV001', dept: 'P_KT', priority: 'MEDIUM', status: 'IN_PROGRESS', due: 4, progress: 25 },
  ];

  const count = await prisma.task.count();
  if (count > 0) return 0;

  const depts = await prisma.department.findMany({ select: { id: true, code: true } });
  const deptByCode = new Map(depts.map((d) => [d.code, d.id]));
  const year = new Date().getFullYear();
  let seq = 0;

  for (const s of samples) {
    seq++;
    await prisma.task.create({
      data: {
        code: `TSK-${year}-${String(seq).padStart(4, '0')}`,
        title: s.title,
        description: null,
        departmentId: deptByCode.get(s.dept),
        creatorId: employees.get(s.creator)!,
        assigneeId: employees.get(s.assignee)!,
        status: s.status as never,
        priority: s.priority as never,
        startDate: day(-2),
        dueDate: day(s.due),
        progress: s.progress,
        completedAt: s.status === 'DONE' ? day(s.due) : null,
      },
    });
  }
  return samples.length;
}
