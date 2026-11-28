import { describe, it, expect, vi } from 'vitest';
import { parseListQuery, pageMeta, parseListParam, parseIdParam, parseDateParam } from '@/lib/list-query';
import { computeOrderDebt, businessToday } from '@/lib/customer-debt';
import { nextCode, withFreshCode, isUniqueViolation } from '@/server/lib/code-sequence';

describe('parseListQuery', () => {
  const opts = { sorts: ['created', 'name'] as const, defaultSort: 'created' as const };

  it('mặc định trang 1, 20 dòng, sort mặc định', () => {
    expect(parseListQuery({}, opts)).toMatchObject({ page: 1, pageSize: 20, sort: 'created', q: '', skip: 0, take: 20 });
  });

  it('tính skip theo trang và chặn size tối đa 100', () => {
    const q = parseListQuery({ page: '3', size: '500' }, opts);
    expect(q.pageSize).toBe(100);
    expect(q.skip).toBe(200);
  });

  it('bỏ giá trị rác: trang âm, sort lạ, q quá dài', () => {
    const q = parseListQuery({ page: '-2', sort: 'drop table', q: ` ${'a'.repeat(300)} ` }, opts);
    expect(q.page).toBe(1);
    expect(q.sort).toBe('created');
    expect(q.q.length).toBe(120);
  });

  it('pageMeta luôn có ít nhất 1 trang', () => {
    expect(pageMeta(0, 1, 20)).toMatchObject({ totalPages: 1, offset: 0 });
    expect(pageMeta(41, 3, 20)).toMatchObject({ totalPages: 3, offset: 40 });
  });

  it('parse tham số phụ', () => {
    expect(parseListParam('A,B,X', ['A', 'B'] as const)).toEqual(['A', 'B']);
    expect(parseIdParam('12')).toBe(12);
    expect(parseIdParam('1.5')).toBeNull();
    expect(parseDateParam('2026-02-30x')).toBeNull();
    expect(parseDateParam('2026-11-28')?.getDate()).toBe(28);
  });
});

describe('computeOrderDebt', () => {
  const now = new Date('2026-11-28T05:00:00Z'); // 12:00 giờ VN

  it('trừ hàng trả lại nhưng không vượt tổng đơn', () => {
    const d = computeOrderDebt({ totalAmount: 1000, paidAmount: 0, returnedAmount: 5000 }, now);
    expect(d.returned).toBe(1000);
    expect(d.remaining).toBe(0);
  });

  it('nhận Decimal/chuỗi như số', () => {
    const d = computeOrderDebt({ totalAmount: '1500.5', paidAmount: { toString: () => '500.5' } }, now);
    expect(d.remaining).toBe(1000);
  });

  it('quá hạn theo ngày Việt Nam, đếm số ngày quá hạn', () => {
    const d = computeOrderDebt({ totalAmount: 100, dueDate: new Date('2026-11-18T00:00:00Z') }, now);
    expect(d.overdue).toBe(true);
    expect(d.overdueDays).toBe(10);
    expect(computeOrderDebt({ totalAmount: 100, dueDate: new Date('2026-11-28T00:00:00Z') }, now).overdue).toBe(false);
  });

  it('23:30 giờ VN vẫn là cùng ngày, không nhảy sang hôm sau theo UTC', () => {
    expect(businessToday(new Date('2026-11-28T16:30:00Z'))).toBe('2026-11-28');
    expect(businessToday(new Date('2026-11-28T17:30:00Z'))).toBe('2026-11-29');
  });

  it('đơn hủy không còn nợ', () => {
    expect(computeOrderDebt({ totalAmount: 100, status: 'CANCELLED', dueDate: '2020-01-01' }, now)).toMatchObject({ remaining: 0, overdue: false });
  });
});

describe('nextCode', () => {
  it('lấy MAX từ DB rồi cộng 1, giữ pad', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ max: 41n }]) };
    expect(await nextCode('CustomerOrder', 'ORD-2026-', 4, db)).toBe('ORD-2026-0042');
    const [sql, like] = db.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('"CustomerOrder"');
    expect(sql).toContain('"orderCode"');
    expect(like).toBe('ORD-2026-%');
  });

  it('chưa có mã nào thì bắt đầu từ 1', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ max: null }]) };
    expect(await nextCode('CustomerQuotation', 'BG-2026-11', 3, db)).toBe('BG-2026-11001');
  });

  it('escape ký tự LIKE trong tiền tố', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ max: 0 }]) };
    await nextCode('Task', 'A_B%', 4, db);
    expect(db.$queryRawUnsafe.mock.calls[0][1]).toBe('A\\_B\\%%');
  });
});

describe('withFreshCode', () => {
  it('đụng unique thì sinh mã mới và thử lại', async () => {
    const gen = vi.fn().mockResolvedValueOnce('C1').mockResolvedValueOnce('C2');
    const create = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
      .mockImplementation(async (code: string) => code);
    expect(await withFreshCode(gen, create)).toBe('C2');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('lỗi khác thì ném ra ngay', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withFreshCode(async () => 'X', create)).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('nhận diện P2002', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});
