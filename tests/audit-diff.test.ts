import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { diffFields } from '@/server/lib/audit';

describe('diffFields', () => {
  it('chỉ trả về trường đổi thật; ngày so theo ngày, Decimal so theo số, rỗng = null', () => {
    const before = { status: 'NEW', totalAmount: new Prisma.Decimal('1000.00'), dueDate: new Date('2026-03-01T00:00:00Z'), notes: '' };
    const after = { status: 'CONFIRMED', totalAmount: new Prisma.Decimal('1000'), dueDate: new Date('2026-03-01T00:00:00Z'), notes: null };
    expect(diffFields(before, after, ['status', 'totalAmount', 'dueDate', 'notes'])).toEqual({ status: { from: 'NEW', to: 'CONFIRMED' } });
  });
  it('bản ghi mới: mọi trường có giá trị đều là thay đổi từ null', () => {
    expect(diffFields(null, { name: 'A', phone: '' }, ['name', 'phone'])).toEqual({ name: { from: null, to: 'A' } });
  });
});
