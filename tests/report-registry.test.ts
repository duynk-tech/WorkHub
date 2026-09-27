import { describe, it, expect } from 'vitest';
import {
  REPORTS,
  REPORT_GROUPS,
  sanitizeDisabledKeys,
  visibleReports,
  visibleGroups,
} from '@/server/modules/report/registry';

const allow = () => true;

describe('danh mục báo cáo', () => {
  it('mỗi báo cáo thuộc một nhóm đã khai báo và có khóa duy nhất', () => {
    const keys = REPORTS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of REPORTS) expect(REPORT_GROUPS[r.group]).toBeDefined();
  });

  it('không tắt gì thì hiện đủ ba nhóm', () => {
    const visible = visibleReports([], allow);
    expect(visible).toHaveLength(REPORTS.length);
    expect(visibleGroups(visible)).toEqual(['WORK', 'SALES', 'HR']);
  });

  it('tắt một báo cáo thì chỉ báo cáo đó biến mất', () => {
    const visible = visibleReports(['customer-debt'], allow);
    expect(visible.map((r) => r.key)).not.toContain('customer-debt');
    expect(visible.map((r) => r.key)).toContain('sales-inventory');
    expect(visibleGroups(visible)).toContain('SALES');
  });

  it('tắt hết báo cáo của một nhóm thì nhóm đó không còn tab', () => {
    const visible = visibleReports(['sales-inventory', 'customer-debt'], allow);
    expect(visibleGroups(visible)).toEqual(['WORK', 'HR']);
  });

  it('thiếu quyền thì ẩn báo cáo dù đang bật', () => {
    expect(visibleReports([], () => false)).toEqual([]);
    expect(visibleReports([], (p) => p === 'FEATURE_REPORT_TASK').map(r => r.key)).toEqual(['task']);
    expect(visibleReports([], (p) => p === 'FEATURE_REPORT_ATTENDANCE').map(r => r.key)).toEqual(['attendance']);
  });

  it('bỏ qua khóa lạ còn sót trong cấu hình cũ', () => {
    expect(sanitizeDisabledKeys(['task', 'bao-cao-da-xoa'])).toEqual(['task']);
    expect(sanitizeDisabledKeys('không phải mảng')).toEqual([]);
    expect(sanitizeDisabledKeys(null)).toEqual([]);
  });
});
