import { describe, it, expect } from 'vitest';
import { resolveRange, reportToCsv, type InventoryProfitReport } from '@/server/modules/spare-parts/report';

/** Ngày theo giờ địa phương — tránh lệch múi giờ như toISOString(). */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('Kỳ báo cáo kho', () => {
  const anchor = new Date(2026, 4, 17); // 17/05/2026

  it('kỳ tháng lấy trọn tháng chứa ngày mốc', () => {
    const r = resolveRange('MONTH', anchor);
    expect(ymd(r.from)).toBe('2026-05-01');
    expect(r.to.getDate()).toBe(31);
    expect(r.label).toBe('Tháng 5/2026');
  });

  it('kỳ quý lấy trọn quý, tháng 5 thuộc quý 2', () => {
    const r = resolveRange('QUARTER', anchor);
    expect(r.from.getMonth()).toBe(3); // tháng 4
    expect(r.to.getMonth()).toBe(5); // tháng 6
    expect(r.to.getDate()).toBe(30);
    expect(r.label).toBe('Quý 2/2026');
  });

  it('kỳ năm lấy từ 01/01 đến 31/12', () => {
    const r = resolveRange('YEAR', anchor);
    expect(ymd(r.from)).toBe('2026-01-01');
    expect(r.to.getMonth()).toBe(11);
    expect(r.to.getDate()).toBe(31);
  });

  it('kỳ tùy chọn lấy đúng khoảng đã nhập và bao trọn ngày cuối', () => {
    const r = resolveRange('CUSTOM', anchor, { from: '2026-03-10', to: '2026-03-20' });
    expect(r.from.getDate()).toBe(10);
    expect(r.to.getDate()).toBe(20);
    expect(r.to.getHours()).toBe(23);
  });

  it('tháng 2 năm nhuận lấy đủ 29 ngày', () => {
    const r = resolveRange('MONTH', new Date(2028, 1, 5));
    expect(r.to.getDate()).toBe(29);
  });
});

describe('Xuất file báo cáo', () => {
  const report: InventoryProfitReport = {
    range: { from: '2026-05-01', to: '2026-05-31', label: 'Tháng 5/2026' },
    summary: {
      inQty: 10, inValue: 20_000_000, soldQty: 4, revenue: 16_000_000,
      discount: 500_000, vatAmount: 1_600_000, returnedAmount: 0,
      cogs: 8_000_000, grossProfit: 8_000_000, marginPercent: 50,
      nonSaleCost: 1_000_000, netProfit: 7_000_000,
      transactionCount: 3, orderCount: 2,
    },
    costByReason: [{ code: 'SCRAP', label: 'Hủy hàng hư hỏng', qty: 1, value: 1_000_000 }],
    items: [{
      itemId: 1, itemCode: 'SP-0001', name: 'Gioăng cao su; loại A', unit: 'Cái',
      inQty: 10, inValue: 20_000_000, soldQty: 4, revenue: 16_000_000,
      discount: 500_000, cogs: 8_000_000,
      grossProfit: 8_000_000, marginPercent: 50, actualUnitCost: 2_000_000,
      avgSellPrice: 4_000_000, nonSaleQty: 1, nonSaleCost: 1_000_000, closingStock: 5,
    }],
  };

  it('có BOM để Excel không lỗi dấu tiếng Việt', () => {
    expect(reportToCsv(report).startsWith('﻿')).toBe(true);
  });

  it('bọc ngoặc kép cho tên hàng chứa dấu phân cách', () => {
    expect(reportToCsv(report)).toContain('"Gioăng cao su; loại A"');
  });

  it('có đủ các dòng tổng hợp và chi tiết', () => {
    const csv = reportToCsv(report);
    expect(csv).toContain('Lãi gộp;8000000');
    expect(csv).toContain('Lãi thuần;7000000');
    expect(csv).toContain('Chiết khấu;500000');
    expect(csv).toContain('Thuế VAT;1600000');
    expect(csv).toContain('Số đơn bán hàng;2');
    expect(csv).toContain('CHI PHÍ XUẤT KHO THEO LÝ DO');
    expect(csv).toContain('Hủy hàng hư hỏng');
    expect(csv).toContain('CHI TIẾT THEO MẶT HÀNG');
    expect(csv).toContain('Giá bán TB');
    expect(csv).toContain('Đơn giá vốn thực tế (đã gồm phí)');
  });
});
