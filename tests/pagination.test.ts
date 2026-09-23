import { describe, it, expect } from 'vitest';
import { paginate } from '@/components/ui/pagination';

const rows = Array.from({ length: 45 }, (_, i) => i + 1);

describe('paginate', () => {
  it('cắt đúng số dòng của trang đầu', () => {
    const r = paginate(rows, 1, 20);
    expect(r.rows).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(r.offset).toBe(0);
    expect(r.totalPages).toBe(3);
    expect(r.total).toBe(45);
  });

  it('trang giữa lấy đúng khoảng và offset để đánh STT liên tục', () => {
    const r = paginate(rows, 2, 20);
    expect(r.rows[0]).toBe(21);
    expect(r.rows.at(-1)).toBe(40);
    expect(r.offset).toBe(20);
  });

  it('trang cuối chỉ còn phần dư', () => {
    const r = paginate(rows, 3, 20);
    expect(r.rows).toEqual([41, 42, 43, 44, 45]);
  });

  it('trang vượt quá số trang thì kéo về trang cuối, không trả mảng rỗng', () => {
    const r = paginate(rows, 99, 20);
    expect(r.page).toBe(3);
    expect(r.rows).toEqual([41, 42, 43, 44, 45]);
  });

  it('lọc còn ít dòng thì số trang co lại theo', () => {
    const r = paginate(rows.slice(0, 5), 3, 20);
    expect(r.totalPages).toBe(1);
    expect(r.page).toBe(1);
    expect(r.rows).toHaveLength(5);
  });

  it('danh sách rỗng vẫn là một trang, không chia cho 0', () => {
    const r = paginate([], 1, 20);
    expect(r.totalPages).toBe(1);
    expect(r.total).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('chống page hoặc pageSize không hợp lệ', () => {
    expect(paginate(rows, 0, 20).page).toBe(1);
    expect(paginate(rows, -5, 20).page).toBe(1);
    expect(paginate(rows, 1, 0).pageSize).toBe(1);
  });
});
