import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { approveStockTransaction, createStockTransaction } from '@/server/modules/spare-parts/service';
afterEach(() => vi.restoreAllMocks());
describe('Stock issuance guards', () => {
  it('rejects invalid quantities and duplicate lines before touching stock', async () => {
    const transaction = vi.spyOn(prisma, '$transaction');
    await expect(createStockTransaction({ type: 'OUT', items: [{ itemId: 1, quantity: -1 }] } as any, 1)).rejects.toThrow('nguyên dương');
    await expect(createStockTransaction({ type: 'OUT', items: [{ itemId: 1, quantity: 1 }, { itemId: 1, quantity: 1 }] } as any, 1)).rejects.toThrow('một lần');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('aborts when a competing issue has consumed stock after the initial read', async () => {
    vi.spyOn(prisma.inventoryTransaction, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue(null);
    const tx = {
      inventoryStock: { findUnique: vi.fn().mockResolvedValue({ quantity: 5 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      inventoryItem: { findMany: vi.fn().mockResolvedValue([{ id: 1, avgCost: 100 }]) },
      inventoryTransaction: { create: vi.fn() },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    await expect(createStockTransaction({ type: 'OUT', reasonCode: 'SALE', sourceWarehouseId: 2, items: [{ itemId: 1, quantity: 5 }] } as any, 1)).rejects.toThrow('Tồn kho đã thay đổi');
    expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({ where: { warehouseId: 2, itemId: 1, quantity: { gte: 5 } }, data: { quantity: { decrement: 5 } } });
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });
});

describe('Stock approval concurrency', () => {
  it('does not move stock when another approver already claimed the voucher', async () => {
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue(null);
    const tx = {
      inventoryTransaction: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING_APPROVAL', type: 'OUT', sourceWarehouseId: 2, items: [{ itemId: 1, quantity: 5 }] }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryStock: { findUnique: vi.fn(), updateMany: vi.fn() },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    await expect(approveStockTransaction(1, 1)).rejects.toThrow('đã được xử lý');
    expect(tx.inventoryStock.updateMany).not.toHaveBeenCalled();
  });
  it('aborts approval when available stock changes after the initial read', async () => {
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue(null);
    const tx = {
      inventoryTransaction: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING_APPROVAL', type: 'OUT', sourceWarehouseId: 2, items: [{ itemId: 1, quantity: 5 }] }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn(),
      },
      inventoryStock: { findUnique: vi.fn().mockResolvedValue({ quantity: 5 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(tx));
    await expect(approveStockTransaction(1, 1)).rejects.toThrow('Tồn kho đã thay đổi');
    expect(tx.inventoryTransaction.update).not.toHaveBeenCalled();
  });
});
