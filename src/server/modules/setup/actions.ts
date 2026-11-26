'use server';

import { headers } from 'next/headers';
import { sha256 } from '@/lib/crypto';

import { prisma } from '@/lib/prisma';
import { hashPassword, checkPasswordStrength } from '@/server/auth/password';
import { createSessionCookie } from '@/server/auth/session';
import { setSetting } from '@/server/modules/settings/service';

export interface InstallResult { ok: boolean; message: string }

export interface InstallPayload {
  companyName: string;
  companyShortName: string;
  adminFullName: string;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  withDemo: boolean;
}

/** Kiểm tra trạng thái hệ thống để quyết định hiển thị trình cài đặt. */
export async function checkInstallStatus() {
  try {
    const [userCount, permissionCount] = await Promise.all([
      prisma.user.count(),
      prisma.permission.count(),
    ]);
    return { ok: true as const, installed: userCount > 0, seeded: permissionCount > 0, error: undefined as string | undefined };
  } catch (e) {
    return {
      ok: false as const,
      installed: false,
      seeded: false,
      error: e instanceof Error ? e.message : 'Không kết nối được database',
    };
  }
}

/**
 * Chạy cài đặt lần đầu từ giao diện web.
 * Chỉ hoạt động khi hệ thống chưa có tài khoản nào — tránh bị lạm dụng sau khi đã cài.
 */
export async function runInstallAction(payload: InstallPayload): Promise<InstallResult> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    return { ok: false, message: 'Hệ thống đã được cài đặt. Hãy đăng nhập bằng tài khoản quản trị.' };
  }

  if (!payload.adminUsername.trim()) return { ok: false, message: 'Nhập tên đăng nhập quản trị' };
  if (!/^[a-zA-Z0-9._-]+$/.test(payload.adminUsername)) {
    return { ok: false, message: 'Tên đăng nhập chỉ gồm chữ, số và . _ -' };
  }
  const strength = checkPasswordStrength(payload.adminPassword);
  if (!strength.ok) return { ok: false, message: strength.message! };
  if (!payload.adminFullName.trim()) return { ok: false, message: 'Nhập họ tên quản trị' };

  try {
    // Nạp dữ liệu hệ thống (idempotent, dùng chung với CLI seed)
    const core = await import('../../../../prisma/seed/core');
    await core.seedPermissions(prisma);
    await core.seedRoles(prisma);
    await core.seedPositions(prisma);
    await core.seedWorkShifts(prisma);
    await core.seedLeaveTypes(prisma);
    await core.seedHolidays(prisma, new Date().getFullYear());
    await core.seedSystemSettings(prisma);
    await core.seedNotificationTemplates(prisma);
    const workflow = await core.seedDefaultWorkflow(prisma);
    await prisma.leaveType.updateMany({ where: { workflowDefinitionId: null }, data: { workflowDefinitionId: workflow.id } });

    if (payload.withDemo) {
      const demo = await import('../../../../prisma/seed/demo');
      const depts = await demo.seedDemoOrg(prisma);
      const employees = await demo.seedDemoEmployees(prisma, depts, 'Workhub@123');
      await demo.seedDemoTasks(prisma, employees);
    }

    await setSetting('company.name', payload.companyName || 'Công ty của bạn', { group: 'general' });
    await setSetting('company.shortName', payload.companyShortName || 'WorkHub', { group: 'general' });
    await setSetting('app.name', payload.companyShortName || 'WorkHub', { group: 'general' });

    const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
    if (!adminRole) return { ok: false, message: 'Không tìm thấy vai trò quản trị sau khi nạp dữ liệu' };

    const employee = await prisma.employee.upsert({
      where: { code: 'ADMIN' },
      update: { fullName: payload.adminFullName, email: payload.adminEmail || null },
      create: { code: 'ADMIN', fullName: payload.adminFullName, email: payload.adminEmail || null, status: 'ACTIVE' },
    });

    const hdrs = await headers();
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    const user = await prisma.user.create({
      data: {
        employeeId: employee.id,
        username: payload.adminUsername.toLowerCase(),
        passwordHash: await hashPassword(payload.adminPassword),
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        roles: { create: [{ roleId: adminRole.id }] },
      },
    });

    await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId: employee.id, year: new Date().getFullYear() } },
      update: {},
      create: { employeeId: employee.id, year: new Date().getFullYear() },
    });

    await prisma.auditLog.create({
      data: { actorId: user.id, entityType: 'System', entityId: 'install', action: 'CREATE', diffJson: { withDemo: payload.withDemo } as never },
    });

    await createSessionCookie({ userId: user.id, username: user.username, credentialVersion: sha256(user.passwordHash) });
    return { ok: true, message: 'Cài đặt hoàn tất' };
  } catch (e) {
    return { ok: false, message: `Cài đặt thất bại: ${e instanceof Error ? e.message : 'lỗi không xác định'}` };
  }
}
