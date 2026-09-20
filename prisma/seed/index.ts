import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  seedPermissions, seedRoles, seedPositions, seedWorkShifts, seedLeaveTypes,
  seedHolidays, seedSystemSettings, seedNotificationTemplates, seedDefaultWorkflow,
} from './core';
import { seedDemoOrg, seedDemoEmployees, seedDemoTasks, seedDemoAssets } from './demo';
import { hashPassword } from '../../src/server/auth/password';

const prisma = new PrismaClient();

/**
 * Seed idempotent — chạy lại nhiều lần đều an toàn.
 *   npm run db:seed                      → chỉ dữ liệu hệ thống
 *   npm run db:seed -- --demo            → thêm cây phòng ban + nhân sự demo
 *   SEED_ADMIN_USERNAME=... SEED_ADMIN_PASSWORD=... npm run db:seed
 */
async function main() {
  const withDemo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true';
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

  // Gắn quy trình mặc định cho các loại phép chưa cấu hình riêng
  await prisma.leaveType.updateMany({
    where: { workflowDefinitionId: null },
    data: { workflowDefinitionId: workflow.id },
  });

  if (withDemo) {
    const depts = await seedDemoOrg(prisma);
    console.log('→ Phòng ban demo       :', depts.size);
    const employees = await seedDemoEmployees(prisma, depts, process.env.SEED_DEMO_PASSWORD || 'Workhub@123');
    console.log('→ Nhân sự demo         :', employees.size);
    console.log('→ Công việc demo       :', await seedDemoTasks(prisma, employees));
    console.log('→ Thiết bị demo        :', await seedDemoAssets(prisma, employees));
  }

  await ensureAdmin();
  console.log('\n✅ Seed hoàn tất.');
}

/** Luôn đảm bảo có ít nhất một tài khoản ADMIN đăng nhập được. */
async function ensureAdmin() {
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  if (!adminRole) return;

  const existingAdmin = await prisma.userRole.findFirst({ where: { roleId: adminRole.id } });
  if (existingAdmin) return;

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Workhub@123';
  const fullName = process.env.SEED_ADMIN_NAME || 'Quản trị hệ thống';

  let employee = await prisma.employee.findUnique({ where: { code: 'ADMIN' } });
  if (!employee) {
    employee = await prisma.employee.create({
      data: { code: 'ADMIN', fullName, email: process.env.SEED_ADMIN_EMAIL || 'admin@workhub.local', status: 'ACTIVE' },
    });
  }

  let user = await prisma.user.findUnique({ where: { employeeId: employee.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        employeeId: employee.id,
        username,
        passwordHash: await hashPassword(password),
        mustChangePassword: !process.env.SEED_ADMIN_PASSWORD,
      },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  await prisma.leaveBalance.upsert({
    where: { employeeId_year: { employeeId: employee.id, year: new Date().getFullYear() } },
    update: {},
    create: { employeeId: employee.id, year: new Date().getFullYear() },
  });

  console.log(`→ Tài khoản quản trị   : ${username} / ${password}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed thất bại:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
