import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { buildAuthContextForEmployee } from '@/server/modules/zalo/ai-agent';
import { findEmployeeByZaloId } from '@/server/modules/zalo/link';
afterEach(() => vi.restoreAllMocks());
describe('Zalo identity does not grant fallback authority', () => {
  it('rejects a missing active user without constructing fallback permissions', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
    const employee = vi.spyOn(prisma.employee, 'findUnique');
    expect(await buildAuthContextForEmployee(7)).toBeNull();
    expect(employee).not.toHaveBeenCalled();
  });
  it.each([
    { isActive: false, employee: { status: 'ACTIVE' } },
    { isActive: true, employee: { status: 'RESIGNED' } },
    { isActive: true, employee: { status: 'ACTIVE' }, lockedUntil: new Date(Date.now() + 60000) },
  ])('rejects disabled, resigned or locked AI users', async (user) => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(user as never);
    expect(await buildAuthContextForEmployee(7)).toBeNull();
  });
  it('rejects slash-command identity when its user is disabled', async () => {
    vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({ status: 'ACTIVE', user: { isActive: false } } as never);
    expect(await findEmployeeByZaloId('staff')).toBeNull();
  });
});
