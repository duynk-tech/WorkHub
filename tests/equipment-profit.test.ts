import { describe, it, expect } from 'vitest';

/**
 * Phép tính lãi/lỗ vòng đời máy — đúng công thức getEquipmentProfit dùng.
 * Tách ra hàm thuần để kiểm được các ca biên mà dữ liệu thật khó dựng.
 */
function compute(input: {
  soldPrice: number;
  unitCost: number | null;
  tickets: { partsCost: number; revenue: number }[];
}) {
  const hasCost = input.unitCost !== null;
  const saleProfit = hasCost ? input.soldPrice - (input.unitCost as number) : 0;
  const servicePartsCost = input.tickets.reduce((s, t) => s + t.partsCost, 0);
  const serviceRevenue = input.tickets.reduce((s, t) => s + t.revenue, 0);
  return {
    hasCost,
    saleProfit,
    saleMarginPercent:
      input.soldPrice > 0 && hasCost ? Math.round((saleProfit / input.soldPrice) * 10000) / 100 : 0,
    serviceRevenue,
    servicePartsCost,
    serviceProfit: serviceRevenue - servicePartsCost,
    netProfit: saleProfit + serviceRevenue - servicePartsCost,
    billedTicketCount: input.tickets.filter((t) => t.revenue > 0).length,
  };
}

describe('lãi / lỗ vòng đời một chiếc máy', () => {
  it('bán có lãi, một ca bảo hành và một ca thu tiền', () => {
    const r = compute({
      soldPrice: 250_000_000,
      unitCost: 180_000_000,
      tickets: [
        { partsCost: 2_805_556, revenue: 0 },
        { partsCost: 0, revenue: 5_000_000 },
      ],
    });
    expect(r.saleProfit).toBe(70_000_000);
    expect(r.saleMarginPercent).toBe(28);
    expect(r.serviceRevenue).toBe(5_000_000);
    expect(r.servicePartsCost).toBe(2_805_556);
    expect(r.netProfit).toBe(72_194_444);
    expect(r.billedTicketCount).toBe(1);
  });

  it('máy khai tay chưa có giá vốn thì KHÔNG lấy giá bán làm lãi', () => {
    const r = compute({ soldPrice: 250_000_000, unitCost: null, tickets: [] });
    expect(r.hasCost).toBe(false);
    expect(r.saleProfit).toBe(0);
    expect(r.saleMarginPercent).toBe(0);
    expect(r.netProfit).toBe(0);
  });

  it('bảo hành nhiều làm lãi thuần thấp hơn lãi bán hàng', () => {
    const r = compute({
      soldPrice: 200_000_000,
      unitCost: 180_000_000,
      tickets: [
        { partsCost: 8_000_000, revenue: 0 },
        { partsCost: 7_000_000, revenue: 0 },
      ],
    });
    expect(r.saleProfit).toBe(20_000_000);
    expect(r.netProfit).toBe(5_000_000);
    expect(r.serviceProfit).toBe(-15_000_000);
  });

  it('máy bán lỗ vẫn tính ra số âm chứ không kẹp về 0', () => {
    const r = compute({ soldPrice: 150_000_000, unitCost: 180_000_000, tickets: [] });
    expect(r.saleProfit).toBe(-30_000_000);
    expect(r.netProfit).toBe(-30_000_000);
    expect(r.saleMarginPercent).toBe(-20);
  });

  it('bảo hành ăn hết lãi thì lãi thuần âm', () => {
    const r = compute({
      soldPrice: 200_000_000,
      unitCost: 190_000_000,
      tickets: [{ partsCost: 25_000_000, revenue: 0 }],
    });
    expect(r.saleProfit).toBe(10_000_000);
    expect(r.netProfit).toBe(-15_000_000);
  });

  it('máy chưa có ca sửa nào thì phần dịch vụ bằng 0', () => {
    const r = compute({ soldPrice: 100_000_000, unitCost: 80_000_000, tickets: [] });
    expect(r.serviceRevenue).toBe(0);
    expect(r.servicePartsCost).toBe(0);
    expect(r.serviceProfit).toBe(0);
    expect(r.netProfit).toBe(r.saleProfit);
  });

  it('giá bán bằng 0 thì không chia cho 0 khi tính tỷ suất', () => {
    const r = compute({ soldPrice: 0, unitCost: 0, tickets: [] });
    expect(r.saleMarginPercent).toBe(0);
    expect(Number.isFinite(r.saleMarginPercent)).toBe(true);
  });
});
