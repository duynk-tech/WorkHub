import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocatePayment } from '@/lib/payment-allocation';
import { prisma } from '@/lib/prisma';
import { recordCustomerPayment, deleteCustomerPayment } from '@/server/modules/customer/service';
import { recordSupplierPayment } from '@/server/modules/spare-parts/service';
afterEach(() => vi.restoreAllMocks());
describe('Payment allocations', () => {
  it('allocates oldest first, caps debt and retains unapplied deposits', () => {
    expect(allocatePayment(150, [{ id: 1, remaining: 30 }, { id: 2, remaining: 70 }])).toEqual({ allocations: [{ orderId: 1, amount: 30 }, { orderId: 2, amount: 70 }], unapplied: 50 });
    expect(allocatePayment(0.3, [{ id: 1, remaining: 0.1 }, { id: 2, remaining: 0.2 }]).unapplied).toBe(0);
    expect(() => allocatePayment(Infinity, [])).toThrow();
  });
  it('subtracts returns before allocating a customer receipt and saves exact allocation', async () => {
    vi.spyOn(prisma.customerPayment, 'findMany').mockResolvedValue([]);
    const order = { id: 1, customerId: 2, totalAmount: 100, returnedAmount: 40, paidAmount: 10, stockIssuedAt: null, status: 'CONFIRMED' };
    const tx = {
      customerOrder: { findMany: vi.fn().mockResolvedValue([order]), update: vi.fn().mockResolvedValue({ ...order, paidAmount: 60 }) },
      customerPayment: { create: vi.fn().mockResolvedValue({ id: 9 }) }, auditLog: { create: vi.fn() },
    };
    const transaction = vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    const payment = await recordCustomerPayment({ customerId: 2, amount: 80 } as any, 3);
    expect(payment.unappliedAmount).toBe(30);
    expect(tx.customerPayment.create.mock.calls[0][0].data.allocations.create).toEqual([{ orderId: 1, amount: 50 }]);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('uses supplier debt cost basis, not customer selling total', async () => {
    vi.spyOn(prisma.supplierPayment, 'findMany').mockResolvedValue([]);
    const tx = { sparePartOrder: { findMany: vi.fn().mockResolvedValue([{ id: 4, subtotalVnd: 100, totalVnd: 170, paidAmount: 20 }]), update: vi.fn() }, supplierPayment: { create: vi.fn().mockResolvedValue({ id: 7 }) }, auditLog: { create: vi.fn() } };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    const payment = await recordSupplierPayment({ supplier: 'Supplier', amount: 100 }, 1);
    expect(payment.unappliedAmount).toBe(20);
    expect(tx.supplierPayment.create.mock.calls[0][0].data.allocations.create).toEqual([{ orderId: 4, amount: 80 }]);
  });
  it('reverses only the original order even if newer orders now exist', async () => {
    const tx = {
      customerPayment: { findUnique: vi.fn().mockResolvedValue({ id: 9, amount: 50, allocationVersion: 1, allocations: [{ orderId: 1, amount: 50 }] }), delete: vi.fn() },
      customerOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'CONFIRMED' }) }, auditLog: { create: vi.fn() },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    await deleteCustomerPayment(9);
    expect(tx.customerOrder.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: 1, paidAmount: { gte: 50 } }, data: { paidAmount: { decrement: 50 } } });
  });
  it('refuses to guess allocations for a legacy general receipt', async () => {
    const tx = { customerPayment: { findUnique: vi.fn().mockResolvedValue({ id: 9, amount: 50, allocationVersion: 0, orderId: null, allocations: [] }), delete: vi.fn() } };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    await expect(deleteCustomerPayment(9)).rejects.toThrow('đối soát');
    expect(tx.customerPayment.delete).not.toHaveBeenCalled();
  });
});
