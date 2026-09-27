import type { Prisma, PrismaClient } from '@prisma/client';
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
  const year = now.getFullYear();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000);

  const samples = [
    {
      code: `TSK-${year}-0001`,
      title: 'Hoàn thiện module báo cáo doanh thu quý & công nợ khách hàng',
      assignee: 'NV005',
      creator: 'NV004',
      dept: 'P_DEV',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      due: 3,
      progress: 65,
      checklists: [
        { content: 'Thiết kế query tổng hợp doanh thu 6 tháng', isDone: true },
        { content: 'Bổ sung biểu đồ phân tích theo chuỗi F&B', isDone: true },
        { content: 'Xử lý công nợ quá hạn và cảnh báo SLA', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0002`,
      title: 'Kiểm định chất lượng định kỳ máy pha La Marzocco tại Phúc Long Landmark 81',
      assignee: 'NV005',
      creator: 'NV003',
      dept: 'KHOI_KT',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      due: 1,
      progress: 40,
      checklists: [
        { content: 'Đo áp suất lò hơi và nhiệt độ họng chiết xuất', isDone: true },
        { content: 'Thay thế gioăng cao su silicone chịu nhiệt 8.5mm', isDone: false },
        { content: 'Lấy mẫu kiểm tra chất lượng nước qua lọc RO', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0003`,
      title: 'Nâng cấp máy chủ cơ sở dữ liệu ứng dụng & bảo mật',
      assignee: 'NV008',
      creator: 'NV003',
      dept: 'P_IT',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      due: -1,
      progress: 75,
      checklists: [
        { content: 'Sao lưu snapshot dữ liệu toàn hệ thống', isDone: true },
        { content: 'Cập nhật bản vá bảo mật hạt nhân Ubuntu', isDone: true },
        { content: 'Cấu hình cảnh báo tài nguyên qua Zalo Bot', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0004`,
      title: 'Soạn thảo hợp đồng cho thuê 03 máy làm kem Taylor C708 chuỗi Gogi House',
      assignee: 'NV011',
      creator: 'NV010',
      dept: 'P_KD1',
      priority: 'HIGH',
      status: 'REVIEW',
      due: 2,
      progress: 90,
      checklists: [
        { content: 'Thống nhất điều khoản đặt cọc và SLA bảo dưỡng định kỳ', isDone: true },
        { content: 'Phòng Pháp chế & Kế toán rà soát hợp đồng', isDone: true },
        { content: 'Chờ đại diện Golden Gate ký kết số hóa', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0005`,
      title: 'Lập chiến dịch quảng bá linh kiện máy pha F&B chính hãng quý 4',
      assignee: 'NV012',
      creator: 'NV009',
      dept: 'P_MKT',
      priority: 'MEDIUM',
      status: 'TODO',
      due: 7,
      progress: 10,
      checklists: [
        { content: 'Lên danh mục linh kiện tiêu hao cần đẩy mạnh', isDone: true },
        { content: 'Thiết kế brochure giới thiệu dịch vụ cứu hộ 2h', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0006`,
      title: 'Tổng hợp bảng công & phụ cấp trực kỹ thuật hiện trường tháng trước',
      assignee: 'NV014',
      creator: 'NV002',
      dept: 'P_HR',
      priority: 'HIGH',
      status: 'DONE',
      due: -3,
      progress: 100,
      checklists: [
        { content: 'Đối soát dữ liệu GPS check-in kỹ thuật viên', isDone: true },
        { content: 'Tính toán giờ làm thêm ca đêm (OT)', isDone: true },
        { content: 'Gửi bảng xác nhận cho Trưởng khối Kỹ thuật', isDone: true },
      ],
    },
    {
      code: `TSK-${year}-0007`,
      title: 'Tối ưu tốc độ tải danh mục tồn kho 2 miền Bắc - Nam',
      assignee: 'NV006',
      creator: 'NV004',
      dept: 'P_DEV',
      priority: 'MEDIUM',
      status: 'TODO',
      due: 6,
      progress: 0,
      checklists: [
        { content: 'Đánh index các cột khóa ngoại kho & phụ tùng', isDone: false },
        { content: 'Cache kết quả lọc theo chủng loại máy F&B', isDone: false },
      ],
    },
    {
      code: `TSK-${year}-0008`,
      title: 'Rà soát chi phí nhập khẩu lô hàng phụ tùng Selmi & Unox tháng 9',
      assignee: 'NV013',
      creator: 'NV001',
      dept: 'P_KT',
      priority: 'MEDIUM',
      status: 'DONE',
      due: -1,
      progress: 100,
      checklists: [
        { content: 'Khớp số liệu tờ khai hải quan và invoice quốc tế', isDone: true },
        { content: 'Hạch toán phân bổ chi phí vận chuyển đường biển', isDone: true },
      ],
    },
  ];

  const depts = await prisma.department.findMany({ select: { id: true, code: true } });
  const deptByCode = new Map(depts.map((d) => [d.code, d.id]));

  for (const s of samples) {
    const existing = await prisma.task.findUnique({ where: { code: s.code } });
    const creatorId = employees.get(s.creator) || employees.values().next().value;
    const assigneeId = employees.get(s.assignee) || creatorId;
    if (!creatorId || !assigneeId) continue;

    let taskId: number;
    if (existing) {
      await prisma.task.update({
        where: { id: existing.id },
        data: {
          title: s.title,
          priority: s.priority as never,
          status: s.status as never,
          progress: s.progress,
          dueDate: day(s.due),
        },
      });
      taskId = existing.id;
    } else {
      const created = await prisma.task.create({
        data: {
          code: s.code,
          title: s.title,
          description: `Công việc mẫu được phân công trực tiếp trong hệ thống quản trị vận hành WorkHub.`,
          departmentId: deptByCode.get(s.dept) || null,
          creatorId,
          assigneeId,
          status: s.status as never,
          priority: s.priority as never,
          startDate: day(-3),
          dueDate: day(s.due),
          progress: s.progress,
          completedAt: s.status === 'DONE' ? day(s.due) : null,
        },
      });
      taskId = created.id;
    }

    // Checklists con
    for (let i = 0; i < s.checklists.length; i++) {
      const c = s.checklists[i];
      const existCheck = await prisma.taskChecklistItem.findFirst({
        where: { taskId, content: c.content },
      });
      if (!existCheck) {
        await prisma.taskChecklistItem.create({
          data: {
            taskId,
            content: c.content,
            isDone: c.isDone,
            sortOrder: i + 1,
            completedAt: c.isDone ? day(-1) : null,
          },
        });
      }
    }
  }

  return samples.length;
}

export async function seedDemoAssets(prisma: PrismaClient, employees: Map<string, number>) {
  const count = await prisma.asset.count();
  if (count > 0) return 0;

  const year = new Date().getFullYear();
  const nv005 = employees.get('NV005');
  const nv006 = employees.get('NV006');
  const nv007 = employees.get('NV007');

  // 1. MacBook Pro M2 (NV005 đang dùng, có nâng cấp RAM/SSD)
  const a1 = await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0001`,
      name: 'MacBook Pro 16 inch M2 Pro',
      category: 'LAPTOP',
      brand: 'Apple',
      model: 'A2780 (2023)',
      serialNumber: 'C02G41KSMD6T',
      status: 'IN_USE',
      specs: {
        cpu: 'Apple M2 Pro 12-core',
        ram: '32GB Unified Memory',
        storage: '1TB Apple SSD',
        gpu: '19-core GPU',
        screen: '16.2 inch Liquid Retina XDR 120Hz',
        os: 'macOS Sequoia 15',
        other: 'Space Gray, Pin 96%',
      },
      purchaseDate: new Date('2024-03-15'),
      purchasePrice: 58000000,
      supplier: 'FPT Shop',
      warrantyMonths: 12,
      warrantyExpiresAt: new Date('2025-03-15'),
      location: 'Bàn làm việc Phòng Phát triển phần mềm',
      currentAssigneeId: nv005 || null,
      assignedAt: new Date('2024-03-20'),
      notes: 'Máy cấp cho Tech Lead, có nâng cấp RAM và SSD phục vụ build Docker',
    },
  });

  if (nv005) {
    await prisma.assetAssignment.create({
      data: {
        assetId: a1.id,
        employeeId: nv005,
        type: 'ASSIGN',
        assignedDate: new Date('2024-03-20'),
        conditionOnAssign: 'Mới 100% nguyên hộp, sạc MagSafe 140W',
        handoverNote: 'Bàn giao thiết bị làm việc chính thức',
      },
    });

    // Lịch sử nâng cấp RAM & SSD
    await prisma.assetUpgrade.create({
      data: {
        assetId: a1.id,
        component: 'RAM',
        action: 'Nâng cấp thêm',
        beforeSpec: '16GB Unified',
        afterSpec: '32GB Unified Memory',
        cost: 6500000,
        provider: 'Apple Care Support Center',
        notes: 'Nâng cấp RAM lên 32GB phục vụ chạy nhiều Docker container',
        upgradeDate: new Date('2024-06-10'),
      },
    });

    await prisma.assetUpgrade.create({
      data: {
        assetId: a1.id,
        component: 'STORAGE',
        action: 'Nâng cấp thêm',
        beforeSpec: '512GB SSD',
        afterSpec: '1TB Apple SSD',
        cost: 4500000,
        provider: 'Apple Care Support Center',
        notes: 'Nâng dung lượng lưu trữ phục vụ dự án AI',
        upgradeDate: new Date('2024-06-10'),
      },
    });
  }

  // 2. Dell XPS 15 (NV006 đang dùng)
  const a2 = await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0002`,
      name: 'Dell XPS 15 9520',
      category: 'LAPTOP',
      brand: 'Dell',
      model: 'XPS 15 9520',
      serialNumber: '8J3X9Q2',
      status: 'IN_USE',
      specs: {
        cpu: 'Intel Core i7-12700H 14-core',
        ram: '32GB (16GB x 2) DDR5 4800MHz',
        storage: '1TB NVMe PCIe Gen 4 SSD',
        gpu: 'NVIDIA GeForce RTX 3050 Ti 4GB',
        screen: '15.6 inch OLED 3.5K Touch',
        os: 'Windows 11 Pro',
      },
      purchaseDate: new Date('2024-05-10'),
      purchasePrice: 42000000,
      supplier: 'Phong Vũ',
      warrantyMonths: 24,
      warrantyExpiresAt: new Date('2026-05-10'),
      location: 'Phòng Phát triển phần mềm',
      currentAssigneeId: nv006 || null,
      assignedAt: new Date('2024-05-15'),
    },
  });

  if (nv006) {
    await prisma.assetAssignment.create({
      data: {
        assetId: a2.id,
        employeeId: nv006,
        type: 'ASSIGN',
        assignedDate: new Date('2024-05-15'),
        conditionOnAssign: 'Mới 100%, kèm sạc 130W Type-C',
        handoverNote: 'Cấp phát máy cho Senior Frontend Developer',
      },
    });
  }

  // 3. Asus ROG Strix G16 (Trong kho sẵn sàng cấp phát)
  await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0003`,
      name: 'Asus ROG Strix G16 (2024)',
      category: 'LAPTOP',
      brand: 'Asus',
      model: 'G614JIR',
      serialNumber: 'R8NRCX0149204',
      status: 'IN_STOCK',
      specs: {
        cpu: 'Intel Core i9-14900HX',
        ram: '32GB DDR5 5600MHz',
        storage: '1TB M.2 NVMe SSD',
        gpu: 'NVIDIA RTX 4070 8GB GDDR6',
        screen: '16 inch QHD+ 240Hz Nebula Display',
        os: 'Windows 11 Home',
      },
      purchaseDate: new Date('2025-01-20'),
      purchasePrice: 48500000,
      supplier: 'GearVN',
      warrantyMonths: 24,
      warrantyExpiresAt: new Date('2027-01-20'),
      location: 'Kho IT Tầng 3 - Tủ thiết bị dự phòng',
      notes: 'Máy cấu hình cao dự phòng cho nhân sự AI / Game Dev',
    },
  });

  // 4. Màn hình Dell Ultrasharp 27 inch 4K (NV007 đang dùng)
  const a4 = await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0004`,
      name: 'Màn hình Dell UltraSharp U2723QE 27 inch 4K',
      category: 'MONITOR',
      brand: 'Dell',
      model: 'U2723QE',
      serialNumber: 'CN0837X174411',
      status: 'IN_USE',
      specs: {
        screen: '27 inch IPS Black, 4K UHD 3840x2160, 100% sRGB, Type-C 90W Hub',
        other: 'Chân đế công thái học nâng hạ xoay 90 độ',
      },
      purchaseDate: new Date('2024-08-01'),
      purchasePrice: 12500000,
      supplier: 'Hacom',
      warrantyMonths: 36,
      warrantyExpiresAt: new Date('2027-08-01'),
      location: 'Bàn làm việc Phòng Kiểm thử (P_QC)',
      currentAssigneeId: nv007 || null,
      assignedAt: new Date('2024-08-05'),
    },
  });

  if (nv007) {
    await prisma.assetAssignment.create({
      data: {
        assetId: a4.id,
        employeeId: nv007,
        type: 'ASSIGN',
        assignedDate: new Date('2024-08-05'),
        conditionOnAssign: 'Màn hình hiển thị chuẩn màu, không điểm chết',
      },
    });
  }

  // 5. ThinkPad T14s (Đang sửa chữa bàn phím)
  const a5 = await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0005`,
      name: 'Lenovo ThinkPad T14s Gen 3',
      category: 'LAPTOP',
      brand: 'Lenovo',
      model: '21CQ000DVA',
      serialNumber: 'PF3X7K99',
      status: 'UNDER_MAINTENANCE',
      specs: {
        cpu: 'AMD Ryzen 7 PRO 6850U',
        ram: '16GB LPDDR5 6400MHz',
        storage: '512GB SSD PCIe Gen 4',
        screen: '14 inch WUXGA IPS chống chói',
        os: 'Ubuntu 24.04 LTS',
      },
      purchaseDate: new Date('2023-11-15'),
      purchasePrice: 27000000,
      supplier: 'ThinkPro',
      warrantyMonths: 12,
      warrantyExpiresAt: new Date('2024-11-15'),
      location: 'Trung tâm sửa chữa Laptop24h',
      notes: 'Bị kẹt phím Space và bụi quạt tản nhiệt',
    },
  });

  await prisma.assetMaintenance.create({
    data: {
      assetId: a5.id,
      type: 'REPAIR',
      title: 'Thay cụm bàn phím gõ kẹt & Vệ sinh tra keo tản nhiệt',
      description: 'Phím cách kẹt không nảy, nhiệt độ CPU cao lúc tải nặng',
      provider: 'Laptop24h Thái Hà',
      cost: 850000,
      startDate: new Date('2026-09-18'),
      status: 'PENDING',
    },
  });

  // 6. HP Pavilion 14 (Đã thanh lý)
  const a6 = await prisma.asset.create({
    data: {
      assetCode: `AST-${year}-0006`,
      name: 'HP Pavilion 14 (Core i3 Gen 8)',
      category: 'LAPTOP',
      brand: 'HP',
      model: '14-ce0021TU',
      serialNumber: '5CD8391K3P',
      status: 'LIQUIDATED',
      specs: {
        cpu: 'Intel Core i3-8130U',
        ram: '4GB DDR4',
        storage: '1TB HDD',
      },
      purchaseDate: new Date('2019-05-10'),
      purchasePrice: 11500000,
      supplier: 'Trần Anh',
      warrantyMonths: 12,
      warrantyExpiresAt: new Date('2020-05-10'),
      location: 'Đã xuất kho thanh lý',
      notes: 'Máy đời cũ 2019, pin chai, phồng nhẹ, đã khấu hao hết 100%',
    },
  });

  await prisma.assetLiquidation.create({
    data: {
      assetId: a6.id,
      liquidationDate: new Date('2026-08-20'),
      reason: 'Đã hết thời gian khấu hao (5 năm), cấu hình chậm không còn đáp ứng công việc',
      liquidationType: 'SELL_SCRAP',
      recoveredAmount: 1200000,
      buyer: 'Đơn vị thu mua đồ điện tử cũ',
      notes: 'Đã tháo ổ cứng tiêu hủy dữ liệu an toàn trước khi bán',
    },
  });

  return 6;
}

/**
 * Seed 30 ngày dữ liệu chấm công cho toàn bộ nhân sự demo:
 * Đa dạng trường hợp (Đúng giờ, Đi muộn có đơn, Về sớm, Nghỉ phép năm, OT, T7/CN)
 */
export async function seedDemoAttendance(prisma: PrismaClient, employees: Map<string, number>) {
  const shift = await prisma.workShift.findUnique({ where: { code: 'ADMIN' } });
  const shiftId = shift?.id ?? null;
  const now = new Date();
  let count = 0;

  async function upsertAttendance(employeeId: number, workDate: Date, data: Omit<Prisma.AttendanceRecordUncheckedCreateInput, 'employeeId' | 'workDate'>) {
    const dateKey = `${workDate.getFullYear()}-${String(workDate.getMonth() + 1).padStart(2, '0')}-${String(workDate.getDate()).padStart(2, '0')}`;
    const key = { employeeId_workDate: { employeeId, workDate } };
    const findByCalendarDate = async () => {
      const rows = await prisma.$queryRaw<Array<{ id: number }>>`SELECT id FROM AttendanceRecord WHERE employeeId = ${employeeId} AND DATEDIFF(workDate, STR_TO_DATE(${dateKey}, '%Y-%m-%d')) = 0 LIMIT 1`;
      return rows[0] ?? null;
    };
    const existing = await findByCalendarDate();
    if (existing) return prisma.attendanceRecord.update({ where: { id: existing.id }, data });
    try {
      return await prisma.attendanceRecord.create({ data: { ...data, employeeId, workDate } });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const raced = await findByCalendarDate();
      if (!raced) {
        const candidates = await prisma.$queryRaw<Array<{ id: number; day: string }>>`SELECT id, DATE_FORMAT(workDate, '%Y-%m-%d') AS day FROM AttendanceRecord WHERE employeeId = ${employeeId} ORDER BY workDate DESC LIMIT 3`;
        throw new Error(`Attendance seed unique conflict: employee=${employeeId} requested=${dateKey} candidates=${JSON.stringify(candidates)}`);
      }
      return prisma.attendanceRecord.update({ where: { id: raced.id }, data });
    }
  }

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset));
    const dayOfWeek = targetDate.getDay(); // 0: CN, 6: T7
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (const [code, empId] of employees.entries()) {
      if (isWeekend) {
        // Cuối tuần: một số kỹ thuật viên trực OT hiện trường (NV005, NV008)
        if (dayOfWeek === 6 && (code === 'NV005' || code === 'NV008') && dayOffset % 2 === 0) {
          const inTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 8, 30);
          const outTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 17, 30);
          await upsertAttendance(empId, targetDate, {
              shiftId,
              checkInAt: inTime,
              checkOutAt: outTime,
              source: 'WEB',
              checkInLat: 10.776889,
              checkInLng: 106.700806,
              checkInAddress: 'Phúc Long Landmark 81, TP.HCM',
              workedMinutes: 480,
              otMinutes: 240,
              status: 'PRESENT',
              note: 'Trực cứu hộ kỹ thuật máy pha cafe cuối tuần',
          });
          count++;
        }
        continue;
      }

      // Ngày thường
      // Random hóa trạng thái chấm công chân thực
      const hash = (empId * 37 + dayOffset * 13) % 100;
      let status: 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'WFH' | 'LEAVE' = 'PRESENT';
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;
      let otMinutes = 0;
      let inHour = 7;
      let inMin = 50 + (hash % 10); // 7:50 - 7:59
      let outHour = 17;
      let outMin = 30 + (hash % 20); // 17:30 - 17:50
      let note: string | null = null;

      if (hash < 6) {
        // Đi muộn (có lý do kẹt xe hoặc hỗ trợ khách sớm)
        status = 'LATE';
        lateMinutes = 15 + (hash % 25);
        inHour = 8;
        inMin = lateMinutes;
        note = 'Kẹt xe tuyến đường giờ cao điểm, đã gửi đơn giải trình';
      } else if (hash < 10) {
        // Về sớm (việc cá nhân / khám bệnh)
        status = 'EARLY_LEAVE';
        earlyLeaveMinutes = 30;
        outHour = 17;
        outMin = 0;
        note = 'Xin về sớm 30 phút có việc gia đình';
      } else if (hash < 14 && (code === 'NV004' || code === 'NV006')) {
        // WFH
        status = 'WFH';
        note = 'Đăng ký làm việc tại nhà theo quy chế';
      } else if (hash < 18) {
        // OT ngày thường (NV005, NV007, NV008)
        otMinutes = 90;
        outHour = 19;
        outMin = 0;
        note = 'Tăng ca bảo trì hệ thống máy chủ và kiểm định';
      }

      const inTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), inHour, inMin);
      const outTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), outHour, outMin);
      const workedMinutes = Math.max(0, Math.round((outTime.getTime() - inTime.getTime()) / 60000) - 90);

      await upsertAttendance(empId, targetDate, {
        shiftId, checkInAt: inTime, checkOutAt: outTime, workedMinutes, lateMinutes,
        earlyLeaveMinutes, otMinutes, source: 'WEB', checkInLat: 10.762622,
        checkInLng: 106.660172, checkInAddress: 'Văn phòng Công ty WorkHub',
        status: status as never, note,
      });
      count++;
    }
  }

  return count;
}

/**
 * Seed các đơn nghỉ phép mẫu (Approved, Pending, Rejected) và liên kết quy trình duyệt
 */
export async function seedDemoLeaves(prisma: PrismaClient, employees: Map<string, number>) {
  const year = new Date().getFullYear();
  const annualType = await prisma.leaveType.findUnique({ where: { code: 'ANNUAL' } });
  const sickType = await prisma.leaveType.findUnique({ where: { code: 'SICK' } });
  const unpaidType = await prisma.leaveType.findUnique({ where: { code: 'UNPAID' } });

  const empTung = employees.get('NV005'); // Vũ Thanh Tùng
  const empAnh = employees.get('NV006'); // Đỗ Thị Mai Anh
  const empVinh = employees.get('NV011'); // Lý Quang Vinh
  const empBao = employees.get('NV004'); // Nguyễn Văn Bảo (Trưởng phòng)
  const empHa = employees.get('NV002'); // Phạm Thị Hồng Hà (Trưởng phòng HR)
  const defaultWorkflow = await prisma.workflowDefinition.findUnique({ where: { code: 'LEAVE_DEFAULT' } });

  if (!empTung || !annualType || !defaultWorkflow) return 0;

  // 1. Đơn ĐÃ DUYỆT (Approved) của NV005
  const code1 = `LR-${year}-0001`;
  let req1 = await prisma.leaveRequest.findUnique({ where: { code: code1 } });
  if (!req1) {
    const start1 = new Date(Date.UTC(year, 8, 10));
    const end1 = new Date(Date.UTC(year, 8, 11));
    req1 = await prisma.leaveRequest.create({
      data: {
        code: code1,
        employeeId: empTung,
        leaveTypeId: annualType.id,
        startDate: start1,
        endDate: end1,
        durationType: 'FULL_DAY',
        totalDays: 2,
        reason: 'Nghỉ phép năm đưa gia đình đi du lịch Nha Trang',
        handoverToId: empAnh || null,
        handoverNote: 'Đã bàn giao tài liệu kỹ thuật bảo trì máy pha Phúc Long cho Mai Anh',
        contactDuringLeave: '0909123456',
        status: 'APPROVED',
        submittedAt: new Date(Date.UTC(year, 8, 5, 8, 30)),
        closedAt: new Date(Date.UTC(year, 8, 6, 14, 0)),
        closingNote: 'Trưởng phòng Bảo duyệt đồng ý, HR đã trừ quỹ phép',
      },
    });

    await prisma.leaveRequestDay.createMany({
      data: [
        { requestId: req1.id, date: start1, portion: 1 },
        { requestId: req1.id, date: end1, portion: 1 },
      ],
      skipDuplicates: true,
    });
  }

  // 2. Đơn CHỜ DUYỆT (Pending) của NV006 -> Gửi cho Quản lý Bảo (NV004)
  const code2 = `LR-${year}-0002`;
  let req2 = await prisma.leaveRequest.findUnique({ where: { code: code2 } });
  if (!req2 && empAnh && sickType) {
    const start2 = new Date(Date.UTC(year, 8, 25));
    const end2 = new Date(Date.UTC(year, 8, 25));
    req2 = await prisma.leaveRequest.create({
      data: {
        code: code2,
        employeeId: empAnh,
        leaveTypeId: sickType.id,
        startDate: start2,
        endDate: end2,
        durationType: 'FULL_DAY',
        totalDays: 1,
        reason: 'Khám sức khỏe răng miệng tại Bệnh viện Răng Hàm Mặt',
        handoverToId: empTung,
        handoverNote: 'Có tài liệu test trên Jira, Tùng theo dõi giúp',
        contactDuringLeave: '0912345678',
        status: 'PENDING',
        submittedAt: new Date(),
      },
    });

    await prisma.leaveRequestDay.createMany({
      data: [{ requestId: req2.id, date: start2, portion: 1 }],
      skipDuplicates: true,
    });

    // Tạo workflow instance & task chờ duyệt
    const wfInstance = await prisma.workflowInstance.create({
      data: {
        definitionId: defaultWorkflow.id,
        entityType: 'LEAVE',
        entityId: req2.id,
        requesterId: empAnh,
        status: 'RUNNING',
        currentStepOrder: 1,
      },
    });

    await prisma.leaveRequest.update({
      where: { id: req2.id },
      data: { workflowInstanceId: wfInstance.id },
    });

    const step1 = await prisma.workflowStep.findFirst({
      where: { definitionId: defaultWorkflow.id, stepOrder: 1 },
    });

    if (step1 && empBao) {
      await prisma.approvalTask.create({
        data: {
          instanceId: wfInstance.id,
          stepId: step1.id,
          stepOrder: 1,
          approverId: empBao,
          status: 'PENDING',
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  // 3. Đơn TỪ CHỐI (Rejected) của NV011
  const code3 = `LR-${year}-0003`;
  let req3 = await prisma.leaveRequest.findUnique({ where: { code: code3 } });
  if (!req3 && empVinh && unpaidType) {
    const start3 = new Date(Date.UTC(year, 8, 15));
    const end3 = new Date(Date.UTC(year, 8, 16));
    req3 = await prisma.leaveRequest.create({
      data: {
        code: code3,
        employeeId: empVinh,
        leaveTypeId: unpaidType.id,
        startDate: start3,
        endDate: end3,
        durationType: 'FULL_DAY',
        totalDays: 2,
        reason: 'Nghỉ giải quyết việc riêng gia đình',
        status: 'REJECTED',
        submittedAt: new Date(Date.UTC(year, 8, 12)),
        closedAt: new Date(Date.UTC(year, 8, 13)),
        closingNote: 'Trùng lịch ký kết hợp đồng quan trọng với Golden Gate, vui lòng dời lịch nghỉ',
      },
    });
  }

  return 3;
}

/**
 * Đảm bảo tài khoản ADMIN cũng có 2 phiếu chờ duyệt trực tiếp trong /approvals
 */
export async function seedDemoAdminApprovals(prisma: PrismaClient, adminEmployeeId: number, employees: Map<string, number>) {
  const defaultWorkflow = await prisma.workflowDefinition.findUnique({ where: { code: 'LEAVE_DEFAULT' } });
  if (!defaultWorkflow) return;

  const empKhang = employees.get('NV003'); // Lê Minh Khang (Giám đốc Khối KT) báo cáo trực tiếp ADMIN
  const annualType = await prisma.leaveType.findUnique({ where: { code: 'ANNUAL' } });
  const year = new Date().getFullYear();

  if (empKhang && annualType) {
    const codeAdmin1 = `LR-${year}-0004`;
    let reqAdmin = await prisma.leaveRequest.findUnique({ where: { code: codeAdmin1 } });
    if (!reqAdmin) {
      const start = new Date(Date.now() + 2 * 86400000);
      const end = new Date(Date.now() + 5 * 86400000);
      reqAdmin = await prisma.leaveRequest.create({
        data: {
          code: codeAdmin1,
          employeeId: empKhang,
          leaveTypeId: annualType.id,
          startDate: start,
          endDate: end,
          durationType: 'FULL_DAY',
          totalDays: 4,
          reason: 'Nghỉ phép thường niên cùng gia đình, đã bàn giao công việc điều phối kỹ thuật',
          status: 'PENDING',
          submittedAt: new Date(),
        },
      });

      const wfInstance = await prisma.workflowInstance.create({
        data: {
          definitionId: defaultWorkflow.id,
          entityType: 'LEAVE',
          entityId: reqAdmin.id,
          requesterId: empKhang,
          status: 'RUNNING',
          currentStepOrder: 1,
        },
      });

      await prisma.leaveRequest.update({
        where: { id: reqAdmin.id },
        data: { workflowInstanceId: wfInstance.id },
      });

      const step1 = await prisma.workflowStep.findFirst({
        where: { definitionId: defaultWorkflow.id, stepOrder: 1 },
      });

      if (step1) {
        await prisma.approvalTask.create({
          data: {
            instanceId: wfInstance.id,
            stepId: step1.id,
            stepOrder: 1,
            approverId: adminEmployeeId,
            status: 'PENDING',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  }
}
