import { afterEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { saveCustomerOrder } from '@/server/modules/customer/service';
afterEach(() => vi.restoreAllMocks());
const input = { orderCode: 'TEST-001', customerId: 1, orderType: 'SPARE_PART', items: [{ itemType: 'SPARE_PART', name: 'Lõi lọc', quantity: 1, unitPrice: 100 }] };
it('đơn mới mặc định chờ xác nhận', async () => {
  const create = vi.spyOn(prisma.customerOrder, 'create').mockResolvedValue({ id: 1 } as any);
  await saveCustomerOrder(null, input);
  expect(create.mock.calls[0][0].data.status).toBe('PENDING');
});
it.each(['DELIVERED', 'COMPLETED', 'CANCELLED'])('chặn client tự tạo đơn với trạng thái %s', async (status) => {
  const create = vi.spyOn(prisma.customerOrder, 'create');
  await expect(saveCustomerOrder(null, { ...input, status })).rejects.toThrow('Đơn mới phải');
  expect(create).not.toHaveBeenCalled();
});
