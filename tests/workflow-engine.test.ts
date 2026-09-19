import { describe, it, expect } from 'vitest';
import { evaluateCondition, describeCondition } from '@/server/modules/workflow/engine';

describe('Điều kiện bước duyệt', () => {
  const ctx = { totalDays: 5, leaveTypeCode: 'ANNUAL', isPaid: true, departmentId: 7 };

  it('không có điều kiện thì luôn chạy', () => {
    expect(evaluateCondition(null, ctx)).toBe(true);
    expect(evaluateCondition(undefined, ctx)).toBe(true);
    expect(evaluateCondition({}, ctx)).toBe(true);
  });

  it('so sánh số', () => {
    expect(evaluateCondition({ field: 'totalDays', op: '>', value: 3 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'totalDays', op: '>', value: 5 }, ctx)).toBe(false);
    expect(evaluateCondition({ field: 'totalDays', op: '>=', value: 5 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'totalDays', op: '<', value: 10 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'totalDays', op: '<=', value: 4 }, ctx)).toBe(false);
  });

  it('so sánh chuỗi và danh sách', () => {
    expect(evaluateCondition({ field: 'leaveTypeCode', op: '==', value: 'ANNUAL' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'leaveTypeCode', op: '!=', value: 'SICK' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'leaveTypeCode', op: 'in', value: ['ANNUAL', 'SICK'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'leaveTypeCode', op: 'not_in', value: ['SICK'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'leaveTypeCode', op: 'in', value: ['UNPAID'] }, ctx)).toBe(false);
  });

  it('trường không tồn tại trong ngữ cảnh không làm hỏng đánh giá', () => {
    expect(evaluateCondition({ field: 'khongCo', op: '==', value: 'x' }, ctx)).toBe(false);
    expect(evaluateCondition({ field: 'khongCo', op: '!=', value: 'x' }, ctx)).toBe(true);
  });

  it('mô tả điều kiện bằng tiếng Việt', () => {
    expect(describeCondition({ field: 'totalDays', op: '>', value: 3 })).toBe('Số ngày nghỉ lớn hơn 3');
    expect(describeCondition(null)).toBeNull();
  });
});
