import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerOrder: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

vi.mock('@/server/modules/equipment/service', () => ({
  generateMachineCode: vi.fn(),
}));

import { listSalesOrders, canViewSalesOrders } from '@/server/modules/customer/service';
import type { AuthContext } from '@/server/auth/context';

function ctx(permissions: string[], isAdmin = false): AuthContext {
  return {
    userId: 1, username: 'test', employeeId: 1, fullName: 'Người kiểm thử',
    email: null, avatarUrl: null, departmentId: 1, departmentName: null, departmentPath: '/1/',
    positionName: null, managerId: null, zaloLinked: false,
    roleCodes: isAdmin ? ['ADMIN'] : ['EMPLOYEE'], roleNames: [],
    permissions: new Set(permissions), dataScope: 'ALL', customDeptIds: [], isAdmin,
  };
}

/**
 * Màn "Máy móc & Phụ tùng" mở bằng quyền KHO, nhưng tab Bán hàng lại đọc doanh
 * thu và công nợ của khách. Ràng buộc phải nằm ngay trong service, không thể chỉ
 * dựa vào chỗ gọi — quên một chỗ là lộ dữ liệu kinh doanh cho thủ kho.
 */
describe('Quyền đọc đơn bán', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('quyền kho đơn thuần KHÔNG đọc được đơn bán', async () => {
    const thuKho = ctx(['MENU_SPARE_PARTS', 'FEATURE_SPARE_PARTS_MANAGE', 'MENU_EQUIPMENT']);

    expect(canViewSalesOrders(thuKho)).toBe(false);
    expect(await listSalesOrders(thuKho)).toEqual([]);
    // Không có quyền thì thậm chí không được chạm vào bảng
    expect(findMany).not.toHaveBeenCalled();
  });

  it('có quyền khách hàng thì đọc được', async () => {
    const kinhDoanh = ctx(['MENU_CUSTOMERS']);
    expect(canViewSalesOrders(kinhDoanh)).toBe(true);
    await listSalesOrders(kinhDoanh);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('quyền quản lý khách hàng cũng đủ', () => {
    expect(canViewSalesOrders(ctx(['FEATURE_CUSTOMER_MANAGE']))).toBe(true);
  });

  it('admin đọc được kể cả khi không gán quyền lẻ', async () => {
    const admin = ctx([], true);
    expect(canViewSalesOrders(admin)).toBe(true);
    await listSalesOrders(admin);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('không quyền gì thì trả mảng rỗng chứ không ném lỗi lộ cấu trúc', async () => {
    expect(await listSalesOrders(ctx([]))).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
