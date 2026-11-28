import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@/server/auth/context';

let currentCtx: AuthContext;

function ctx(permissions: string[], isAdmin = false): AuthContext {
  return {
    userId: 1, username: 'test', employeeId: 1, fullName: 'Người kiểm thử',
    email: null, avatarUrl: null, departmentId: 1, departmentName: null, departmentPath: '/1/',
    positionName: null, managerId: null, zaloLinked: false,
    roleCodes: isAdmin ? ['ADMIN'] : ['EMPLOYEE'], roleNames: [],
    permissions: new Set(permissions), dataScope: 'ALL', customDeptIds: [], isAdmin,
  };
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock('@/server/auth/context', () => {
  const can = (c: AuthContext | null, code: string) => !!c && (c.isAdmin || c.permissions.has(code));
  return {
    requireAuth: async () => currentCtx,
    requirePermission: async (code: string) => {
      if (!can(currentCtx, code)) throw new Error('forbidden');
      return currentCtx;
    },
    can,
    canAny: (c: AuthContext | null, codes: string[]) => codes.some((code) => can(c, code)),
  };
});

const listServiceTickets = vi.fn(async () => []);
const getServiceTicket = vi.fn(async () => ({ id: 1 }));
vi.mock('@/server/modules/equipment/ticket-service', () => ({
  listServiceTickets: (...a: unknown[]) => listServiceTickets(...(a as [])),
  getServiceTicket: (...a: unknown[]) => getServiceTicket(...(a as [])),
  saveServiceTicket: vi.fn(),
  assignServiceTicket: vi.fn(),
  updateTicketStatus: vi.fn(),
  deleteServiceTicket: vi.fn(),
}));

const listSupplierPayments = vi.fn(async () => []);
const listStockTransactions = vi.fn(async () => ({ rows: [] }));
vi.mock('@/server/modules/spare-parts/service', () => ({
  listSupplierPayments: (...a: unknown[]) => listSupplierPayments(...(a as [])),
  listStockTransactions: (...a: unknown[]) => listStockTransactions(...(a as [])),
}));

const getCustomerOrderFulfillment = vi.fn(async () => ({ lines: [] }));
vi.mock('@/server/modules/customer/service', () => ({
  getCustomerOrderFulfillment: (...a: unknown[]) => getCustomerOrderFulfillment(...(a as [])),
}));

const taskCommentFindFirst = vi.fn();
const taskCommentDelete = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskComment: {
      findFirst: (...a: unknown[]) => taskCommentFindFirst(...a),
      delete: (...a: unknown[]) => taskCommentDelete(...a),
    },
  },
}));
vi.mock('@/server/modules/task/service', () => ({
  generateTaskCode: vi.fn(),
  logActivity: vi.fn(),
  notifyTaskAssigned: vi.fn(),
  notifyTaskComment: vi.fn(),
  taskScopeWhere: async () => ({ assigneeId: 1 }),
}));
vi.mock('@/server/modules/webhook/dispatcher', () => ({ dispatchOutboundWebhook: vi.fn() }));

import { canViewModule } from '@/server/auth/module-access';
import { listTicketsAction, getTicketAction } from '@/server/modules/equipment/ticket-actions';
import { listSupplierPaymentsAction, listStockTransactionsAction } from '@/server/modules/spare-parts/actions';
import { getOrderFulfillmentAction } from '@/server/modules/customer/actions';
import { deleteCommentAction } from '@/server/modules/task/actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canViewModule', () => {
  it('admin xem được mọi module', () => {
    const admin = ctx([], true);
    expect(canViewModule(admin, 'customers')).toBe(true);
    expect(canViewModule(admin, 'inventory')).toBe(true);
    expect(canViewModule(admin, 'tickets')).toBe(true);
  });

  it('quyền kho không mở được khách hàng', () => {
    const thuKho = ctx(['MENU_SPARE_PARTS']);
    expect(canViewModule(thuKho, 'inventory')).toBe(true);
    expect(canViewModule(thuKho, 'customers')).toBe(false);
  });

  it('null ctx bị chặn', () => {
    expect(canViewModule(null, 'tickets')).toBe(false);
  });
});

describe('Server action đọc dữ liệu phải kiểm tra quyền', () => {
  it('phiếu sự cố: nhân viên không có quyền thiết bị bị chặn, không chạm DB', async () => {
    currentCtx = ctx(['MENU_TASKS']);
    expect((await listTicketsAction({})).ok).toBe(false);
    expect((await getTicketAction(1)).ok).toBe(false);
    expect(listServiceTickets).not.toHaveBeenCalled();
    expect(getServiceTicket).not.toHaveBeenCalled();
  });

  it('phiếu sự cố: kỹ thuật viên bảo trì đọc được', async () => {
    currentCtx = ctx(['FEATURE_EQUIPMENT_MAINTENANCE']);
    expect((await listTicketsAction({})).ok).toBe(true);
    expect(listServiceTickets).toHaveBeenCalledTimes(1);
  });

  it('thanh toán NCC: chỉ người quản lý phụ tùng đọc được', async () => {
    currentCtx = ctx(['MENU_SPARE_PARTS']);
    expect((await listSupplierPaymentsAction(undefined, 1)).ok).toBe(false);
    expect(listSupplierPayments).not.toHaveBeenCalled();

    currentCtx = ctx(['FEATURE_SPARE_PARTS_MANAGE']);
    expect((await listSupplierPaymentsAction(undefined, 1)).ok).toBe(true);
  });

  it('lịch sử kho: cần quyền kho/thiết bị', async () => {
    currentCtx = ctx(['MENU_CUSTOMERS']);
    expect((await listStockTransactionsAction({})).ok).toBe(false);
    expect(listStockTransactions).not.toHaveBeenCalled();
  });

  it('thông tin giao hàng của đơn: cần quyền khách hàng', async () => {
    currentCtx = ctx(['MENU_SPARE_PARTS']);
    expect((await getOrderFulfillmentAction(5)).ok).toBe(false);
    expect(getCustomerOrderFulfillment).not.toHaveBeenCalled();

    currentCtx = ctx(['MENU_CUSTOMERS']);
    expect((await getOrderFulfillmentAction(5)).ok).toBe(true);
  });
});

describe('Bình luận công việc theo phạm vi dữ liệu', () => {
  it('bình luận ngoài phạm vi coi như không tồn tại', async () => {
    currentCtx = ctx(['FEATURE_TASK_EDIT']);
    taskCommentFindFirst.mockResolvedValue(null);
    const res = await deleteCommentAction(9);
    expect(res.ok).toBe(false);
    expect(taskCommentDelete).not.toHaveBeenCalled();
    // Truy vấn phải lọc theo phạm vi công việc, không tìm trần theo id
    expect(taskCommentFindFirst.mock.calls[0][0]).toMatchObject({ where: { id: 9, task: { assigneeId: 1 } } });
  });

  it('không phải tác giả và không có quyền sửa thì không xoá được', async () => {
    currentCtx = ctx([]);
    taskCommentFindFirst.mockResolvedValue({ id: 9, taskId: 3, authorId: 99 });
    expect((await deleteCommentAction(9)).ok).toBe(false);
    expect(taskCommentDelete).not.toHaveBeenCalled();
  });

  it('tác giả xoá được bình luận của mình', async () => {
    currentCtx = ctx([]);
    taskCommentFindFirst.mockResolvedValue({ id: 9, taskId: 3, authorId: 1 });
    expect((await deleteCommentAction(9)).ok).toBe(true);
    expect(taskCommentDelete).toHaveBeenCalledTimes(1);
  });
});
