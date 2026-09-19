import { describe, it, expect } from 'vitest';
import { PERMISSIONS, PERMISSION_CODES, SYSTEM_ROLES } from '@/lib/permissions';
import { can, canAny, type AuthContext } from '@/server/auth/context';

function ctx(permissions: string[], isAdmin = false): AuthContext {
  return {
    userId: 1, username: 'test', employeeId: 1, fullName: 'Người kiểm thử',
    email: null, avatarUrl: null, departmentId: 1, departmentName: null, departmentPath: '/1/',
    positionName: null, managerId: null, zaloLinked: false,
    roleCodes: isAdmin ? ['ADMIN'] : ['EMPLOYEE'], roleNames: [],
    permissions: new Set(permissions), dataScope: 'SELF', customDeptIds: [], isAdmin,
  };
}

describe('Danh mục quyền', () => {
  it('không có mã quyền trùng nhau', () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
  });

  it('mọi quyền đều thuộc nhóm và có tên', () => {
    for (const p of PERMISSIONS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.group.length).toBeGreaterThan(0);
      expect(['MENU', 'FEATURE']).toContain(p.category);
    }
  });

  it('vai trò hệ thống chỉ tham chiếu quyền tồn tại', () => {
    for (const role of SYSTEM_ROLES) {
      for (const code of role.permissions) {
        expect(PERMISSION_CODES, `Vai trò ${role.code} tham chiếu quyền không tồn tại: ${code}`).toContain(code);
      }
    }
  });

  it('ADMIN có toàn bộ quyền, EMPLOYEE không có quyền quản trị', () => {
    const admin = SYSTEM_ROLES.find((r) => r.code === 'ADMIN')!;
    expect(admin.permissions.length).toBe(PERMISSION_CODES.length);
    expect(admin.dataScope).toBe('ALL');

    const employee = SYSTEM_ROLES.find((r) => r.code === 'EMPLOYEE')!;
    expect(employee.permissions).not.toContain('FEATURE_ROLE_MANAGE');
    expect(employee.permissions).not.toContain('MENU_ACCOUNTS');
    expect(employee.dataScope).toBe('SELF');
  });
});

describe('Kiểm tra quyền', () => {
  it('người dùng thường chỉ có quyền được gán', () => {
    const user = ctx(['MENU_TASKS', 'FEATURE_TASK_CREATE']);
    expect(can(user, 'MENU_TASKS')).toBe(true);
    expect(can(user, 'FEATURE_TASK_DELETE')).toBe(false);
    expect(canAny(user, ['FEATURE_TASK_DELETE', 'FEATURE_TASK_CREATE'])).toBe(true);
  });

  it('ADMIN vượt qua mọi kiểm tra quyền', () => {
    const admin = ctx([], true);
    expect(can(admin, 'FEATURE_ROLE_MANAGE')).toBe(true);
    expect(can(admin, 'BAT_KY_QUYEN_NAO')).toBe(true);
  });

  it('không có phiên đăng nhập thì không có quyền nào', () => {
    expect(can(null, 'MENU_DASHBOARD')).toBe(false);
    expect(canAny(null, ['MENU_DASHBOARD'])).toBe(false);
  });
});
