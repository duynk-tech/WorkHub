import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  seedPermissions, seedRoles, seedPositions, seedWorkShifts, seedLeaveTypes,
  seedHolidays, seedSystemSettings, seedNotificationTemplates, seedDefaultWorkflow,
} from './core';
import {
  seedDemoOrg, seedDemoEmployees, seedDemoTasks, seedDemoAssets,
  seedDemoAttendance, seedDemoLeaves, seedDemoAdminApprovals,
} from './demo';
import { seedDemoFnbEquipment } from './fnb-equipment';
import { cleanBusinessData } from './clean';
import { hashPassword } from '../../src/server/auth/password';

export { cleanBusinessData };

const prisma = new PrismaClient();

/**
 * Hàm thực thi nạp toàn bộ seed demo.
 * Có thể truyền tùy chọn clean = true để dọn sạch dữ liệu cũ trước khi nạp lại.
 */
export async function runFullDemoSeed(db: PrismaClient = prisma, options?: { clean?: boolean }) {
  if (options?.clean) {
    console.log('🧹 Đang làm sạch dữ liệu cũ...');
    await cleanBusinessData(db);
    console.log('✨ Đã làm sạch dữ liệu cũ thành công.');
  }

  const year = new Date().getFullYear();

  console.log('→ Quyền hệ thống       :', await seedPermissions(db));
  console.log('→ Vai trò mặc định     :', await seedRoles(db));
  console.log('→ Chức danh            :', await seedPositions(db));
  console.log('→ Ca làm việc          :', await seedWorkShifts(db));
  console.log('→ Loại nghỉ phép       :', await seedLeaveTypes(db));
  console.log('→ Ngày lễ', year, '       :', await seedHolidays(db, year));
  console.log('→ Cấu hình hệ thống    :', await seedSystemSettings(db));
  console.log('→ Mẫu thông báo        :', await seedNotificationTemplates(db));

  const workflow = await seedDefaultWorkflow(db);
  console.log('→ Quy trình duyệt      :', workflow.code);

  // Gắn quy trình mặc định cho các loại phép chưa cấu hình riêng
  await db.leaveType.updateMany({
    where: { workflowDefinitionId: null },
    data: { workflowDefinitionId: workflow.id },
  });

  const depts = await seedDemoOrg(db);
  console.log('→ Phòng ban demo       :', depts.size);
  const employees = await seedDemoEmployees(db, depts, process.env.SEED_DEMO_PASSWORD || 'Workhub@123');
  console.log('→ Nhân sự demo         :', employees.size);
  console.log('→ Công việc demo       :', await seedDemoTasks(db, employees));
  console.log('→ Thiết bị demo        :', await seedDemoAssets(db, employees));
  console.log('→ Chấm công 30 ngày    :', await seedDemoAttendance(db, employees));
  console.log('→ Đơn nghỉ phép demo   :', await seedDemoLeaves(db, employees));
  await seedDemoFnbEquipment(db, employees.get('NV005'));

  const adminEmployee = await ensureAdmin(db);
  if (adminEmployee) {
    const refreshedEmployees = await seedDemoEmployees(db, await seedDemoOrg(db), process.env.SEED_DEMO_PASSWORD || 'Workhub@123');
    await seedDemoAdminApprovals(db, adminEmployee.id, refreshedEmployees);
  }

  console.log('\n✅ Nạp dữ liệu seed demo thành công.');
}

/** Luôn đảm bảo có ít nhất một tài khoản ADMIN đăng nhập được. */
export async function ensureAdmin(db: PrismaClient = prisma) {
  const adminRole = await db.role.findUnique({ where: { code: 'ADMIN' } });
  if (!adminRole) return null;

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Workhub@123';
  const fullName = process.env.SEED_ADMIN_NAME || 'Quản trị hệ thống';

  let employee = await db.employee.findUnique({ where: { code: 'ADMIN' } });
  if (!employee) {
    employee = await db.employee.create({
      data: { code: 'ADMIN', fullName, email: process.env.SEED_ADMIN_EMAIL || 'admin@workhub.local', status: 'ACTIVE' },
    });
  }

  let user = await db.user.findUnique({ where: { employeeId: employee.id } });
  if (!user) {
    user = await db.user.create({
      data: {
        employeeId: employee.id,
        username,
        passwordHash: await hashPassword(password),
        mustChangePassword: !process.env.SEED_ADMIN_PASSWORD,
      },
    });
  }

  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  await db.leaveBalance.upsert({
    where: { employeeId_year: { employeeId: employee.id, year: new Date().getFullYear() } },
    update: {},
    create: { employeeId: employee.id, year: new Date().getFullYear() },
  });

  console.log(`→ Tài khoản quản trị   : ${username} / ${password}`);
  return employee;
}

/**
 * Seed idempotent — chạy lại nhiều lần đều an toàn.
 *   npm run db:seed                      → chỉ dữ liệu hệ thống
 *   npm run db:seed -- --demo            → thêm cây phòng ban + nhân sự demo
 *   npm run db:seed:all                  → nạp toàn bộ seed demo
 */
async function main() {
  const withDemo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true';
  const shouldClean = process.argv.includes('--clean') || process.env.SEED_CLEAN === 'true';

  if (withDemo) {
    await runFullDemoSeed(prisma, { clean: shouldClean });
  } else {
    const year = new Date().getFullYear();
    console.log('→ Quyền hệ thống       :', await seedPermissions(prisma));
    console.log('→ Vai trò mặc định     :', await seedRoles(prisma));
    console.log('→ Chức danh            :', await seedPositions(prisma));
    console.log('→ Ca làm việc          :', await seedWorkShifts(prisma));
    console.log('→ Loại nghỉ phép       :', await seedLeaveTypes(prisma));
    console.log('→ Ngày lễ', year, '       :', await seedHolidays(prisma, year));
    console.log('→ Cấu hình hệ thống    :', await seedSystemSettings(prisma));
    console.log('→ Mẫu thông báo        :', await seedNotificationTemplates(prisma));

    const workflow = await seedDefaultWorkflow(prisma);
    console.log('→ Quy trình duyệt      :', workflow.code);

    await prisma.leaveType.updateMany({
      where: { workflowDefinitionId: null },
      data: { workflowDefinitionId: workflow.id },
    });

    await ensureAdmin(prisma);
    console.log('\n✅ Seed hệ thống hoàn tất.');
  }
}

if (process.argv[1] && /(?:^|[\\/])index\.(?:ts|js)$/.test(process.argv[1])) {
  main()
    .catch((e) => {
      console.error('❌ Seed thất bại:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
