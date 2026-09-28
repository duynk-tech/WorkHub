import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setAvatarUrlAction, updateContactInfoAction } from '@/server/modules/profile/actions';
import { prisma } from '@/lib/prisma';
import * as authContext from '@/server/auth/context';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    employee: {
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/server/auth/context', () => ({
  requireAuth: vi.fn(),
}));

describe('Profile Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authContext.requireAuth).mockResolvedValue({
      userId: 1,
      username: 'admin',
      employeeId: 10,
      fullName: 'Quản trị viên',
      email: 'admin@workhub.local',
      avatarUrl: null,
      departmentId: null,
      departmentName: null,
      departmentPath: null,
      positionName: null,
      managerId: null,
      zaloLinked: false,
      roleCodes: ['ADMIN'],
      roleNames: ['Quản trị hệ thống'],
      permissions: new Set(),
      dataScope: 'ALL' as any,
      customDeptIds: [],
      isAdmin: true,
    });
  });

  describe('setAvatarUrlAction', () => {
    it('cập nhật avatarUrl cho nhân sự và ghi audit log', async () => {
      vi.mocked(prisma.employee.update).mockResolvedValue({ id: 10, avatarUrl: '/uploads/avatars/test.jpg' } as any);

      const res = await setAvatarUrlAction('/uploads/avatars/test.jpg');
      expect(res.ok).toBe(true);
      expect(res.message).toContain('Đã đổi ảnh đại diện');
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { avatarUrl: '/uploads/avatars/test.jpg' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('cho phép gỡ bỏ avatarUrl (set null)', async () => {
      vi.mocked(prisma.employee.update).mockResolvedValue({ id: 10, avatarUrl: null } as any);

      const res = await setAvatarUrlAction(null);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('Đã xóa ảnh đại diện');
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { avatarUrl: null },
      });
    });
  });

  describe('updateContactInfoAction', () => {
    it('cập nhật email và số điện thoại hợp lệ', async () => {
      vi.mocked(prisma.employee.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.employee.update).mockResolvedValue({ id: 10 } as any);

      const res = await updateContactInfoAction({
        email: 'test@workhub.local',
        phone: '0987654321',
        gender: 'MALE',
      });

      expect(res.ok).toBe(true);
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          email: 'test@workhub.local',
          phone: '0987654321',
          gender: 'MALE',
          dateOfBirth: null,
        },
      });
    });

    it('báo lỗi khi email đã được người khác sử dụng', async () => {
      vi.mocked(prisma.employee.findFirst).mockResolvedValue({ id: 99, email: 'duplicate@workhub.local' } as any);

      const res = await updateContactInfoAction({
        email: 'duplicate@workhub.local',
      });

      expect(res.ok).toBe(false);
      expect(res.message).toContain('đã được nhân sự khác sử dụng');
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });
  });
});
