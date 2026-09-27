import { afterEach, describe, expect, it, vi } from 'vitest';
import { customerInsights, customerCsv } from '@/lib/customer-insights';
import { contactSchema, profileSchema } from '@/server/modules/customer/workspace-schema';
import { prisma } from '@/lib/prisma';
import { saveCustomerWorkspaceAction, allocateCustomerCreditAction, exportCustomerReportAction } from '@/server/modules/customer/workspace-actions';
import { requireAuth, can } from '@/server/auth/context';
vi.mock('@/server/auth/context', () => ({ requireAuth: vi.fn(), can: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const customer = {
  orders: [{ id: 1, totalAmount: 1000, returnedAmount: 200, paidAmount: 300, dueDate: '2026-09-01', status: 'DELIVERED', items: [{ id: 11, quantity: 5, itemType: 'SPARE_PART' }] }, { id: 2, status: 'CANCELLED', totalAmount: 900 }],
  payments: [{ allocationVersion: 1, amount: 400, allocations: [{ orderId: 1, amount: 300 }] }],
  returns: [{ items: [{ orderItemId: 11, quantity: 2 }] }],
};
describe('Số liệu khách hàng', () => {
  it('giảm trừ theo đơn, tách dư tiền và trả phụ tùng đúng dòng', () => {
    const result = customerInsights(customer, new Date('2026-09-27T12:00:00Z'));
    expect(result).toMatchObject({ billed: 1000, paid: 300, returned: 200, outstanding: 500, overdue: 500, unapplied: 100, allocationMismatch: 0 });
    expect(result.parts[0]).toMatchObject({ returnedQty: 2, netQty: 3 });
  });
  it('không suy đoán tiền dư của phiếu cũ', () => {
    expect(customerInsights({ payments: [{ amount: 999, allocationVersion: 0 }] })).toMatchObject({ unapplied: 0, legacyPayments: 1 });
  });
  it('CSV chặn công thức và giữ dấu tiếng Việt', () => {
    const csv = customerCsv([['=SUM(A1)', 'Khách; "Mộc"']]);
    expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain("'=SUM(A1)"); expect(csv).toContain('"Khách; ""Mộc"""');
  });
  it('validate liên hệ và hồ sơ trước khi ghi', () => {
    expect(contactSchema.safeParse({ name: ' ', isPrimary: true }).success).toBe(false);
    expect(profileSchema.safeParse({ kind: 'BUSINESS', ownerEmployeeId: null, billingEmail: 'wrong' }).success).toBe(false);
  });
});
describe('Quyền và phạm vi thao tác khách hàng', () => {
  function auth(allowed: boolean) {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 1 } as any);
    vi.mocked(can).mockReturnValue(allowed);
    vi.spyOn(prisma.customer, 'findUniqueOrThrow').mockResolvedValue({ id: 1 } as any);
  }
  it('từ chối tài khoản không quyền trước transaction', async () => {
    auth(false); const transaction = vi.spyOn(prisma, '$transaction');
    expect((await saveCustomerWorkspaceAction(1, 'contact', {})).ok).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    await expect(exportCustomerReportAction(1)).rejects.toThrow('quyền');
  });
  it('chặn sửa liên hệ của khách khác', async () => {
    auth(true);
    const tx = { customerContact: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    expect((await saveCustomerWorkspaceAction(1, 'contact', { id: 22, name: 'A', isPrimary: false })).ok).toBe(false);
    expect(tx.customerContact.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 22, customerId: 1 } }));
  });
  it('chặn request phân bổ lặp trên snapshot cũ', async () => {
    auth(true);
    const tx = { customerPayment: { findFirstOrThrow: vi.fn().mockResolvedValue({ amount: 1000, allocations: [{ amount: 400 }] }) }, customerOrder: { findFirstOrThrow: vi.fn().mockResolvedValue({ totalAmount: 1000, paidAmount: 400, returnedAmount: 0 }), update: vi.fn() } };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    const result = await allocateCustomerCreditAction(1, { paymentId: 1, orderId: 1, amount: 100, expectedAllocated: 300 });
    expect(result.ok).toBe(false); expect(result.message).toContain('đã thay đổi'); expect(tx.customerOrder.update).not.toHaveBeenCalled();
  });
});
it('người được xem khách nhưng thiếu quyền export không tải CSV', async () => {
  vi.mocked(requireAuth).mockResolvedValue({ userId: 1 } as any);
  vi.mocked(can).mockImplementation((_ctx: any, permission: any) => permission === 'MENU_CUSTOMERS');
  vi.spyOn(prisma.customer, 'findUniqueOrThrow').mockResolvedValue({ id: 1 } as any);
  await expect(exportCustomerReportAction(1)).rejects.toThrow('xuất báo cáo');
});
it('không hoàn thành lịch của khách khác', async () => {
  vi.mocked(requireAuth).mockResolvedValue({ userId: 1 } as any); vi.mocked(can).mockReturnValue(true);
  vi.spyOn(prisma.customer, 'findUniqueOrThrow').mockResolvedValue({ id: 1 } as any);
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn({ customerCareActivity: { updateMany } }));
  expect((await saveCustomerWorkspaceAction(1, 'complete', 22)).ok).toBe(false);
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 22, customerId: 1, completedAt: null } }));
});
