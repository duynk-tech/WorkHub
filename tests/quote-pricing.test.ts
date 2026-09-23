import { describe, it, expect } from 'vitest';
import {
  calculateQuotedUnitPrice,
  estimateImportFreight,
  calculateSellingPriceFromMargin,
} from '@/server/modules/spare-parts/types';

const CONFIG = {
  defaultExchangeRateEur: 30_000,
  defaultMarginPercent: 30,
  pricingMethod: 'MARGIN' as const,
  defaultShippingFee: 3_500_000,
};

describe('Đơn giá báo khách cho linh kiện', () => {
  it('ưu tiên giá bán đã khai trong danh mục', () => {
    const r = calculateQuotedUnitPrice(
      { sellingPrice: 6_500_000, costPrice: 3_000_000, priceEur: 100 },
      CONFIG,
    );
    expect(r.price).toBe(6_500_000);
    expect(r.source).toBe('LIST');
  });

  it('chưa có giá bán thì suy ra từ giá vốn theo tỷ suất lợi nhuận', () => {
    const r = calculateQuotedUnitPrice({ sellingPrice: null, costPrice: 1_400_000 }, CONFIG);
    // Margin 30%: giá bán = giá vốn / (1 - 0.3)
    expect(r.price).toBe(calculateSellingPriceFromMargin(1_400_000, 30, 'MARGIN'));
    expect(r.price).toBe(2_000_000);
    expect(r.source).toBe('ESTIMATED');
  });

  it('không có giá vốn thì quy đổi từ giá EUR theo tỷ giá cấu hình', () => {
    const r = calculateQuotedUnitPrice({ sellingPrice: null, priceEur: 100 }, CONFIG);
    expect(r.cost).toBe(3_000_000);
    expect(r.price).toBe(calculateSellingPriceFromMargin(3_000_000, 30, 'MARGIN'));
  });

  it('áp margin lên giá vốn rồi mới cộng cước, cước không ăn lợi nhuận', () => {
    const noFreight = calculateQuotedUnitPrice({ sellingPrice: null, costPrice: 1_400_000 }, CONFIG);
    const withFreight = calculateQuotedUnitPrice(
      { sellingPrice: null, costPrice: 1_400_000 },
      CONFIG,
      600_000,
    );
    expect(withFreight.shippingPerUnit).toBe(600_000);
    // 1.400.000 / (1 - 0,3) = 2.000.000, cộng nguyên 600.000 cước
    expect(withFreight.price).toBe(2_600_000);
    expect(withFreight.price).toBe(noFreight.price + 600_000);
  });

  it('khớp công thức "giá vốn / (1 - margin) + cước" trên số liệu thực tế', () => {
    // 3.802.500 / (1 - 0,35) = 5.850.000, cộng 3.500.000 cước = 9.350.000
    const r = calculateQuotedUnitPrice(
      { sellingPrice: null, costPrice: 3_802_500 },
      { ...CONFIG, defaultMarginPercent: 35 },
      3_500_000,
    );
    expect(r.price).toBe(9_350_000);
  });

  it('không đủ dữ liệu giá thì trả về 0 và đánh dấu để người dùng tự nhập', () => {
    const r = calculateQuotedUnitPrice({ sellingPrice: null, costPrice: null, priceEur: null }, CONFIG);
    expect(r.price).toBe(0);
    expect(r.source).toBe('NONE');
  });

  it('mỗi mặt hàng cộng một suất cước', () => {
    // Bỏ phụ trội đa mã và phí hải quan, cước tính thẳng theo số mặt hàng
    expect(estimateImportFreight(1, CONFIG)).toBe(3_500_000);
    expect(estimateImportFreight(3, CONFIG)).toBe(10_500_000);
    expect(estimateImportFreight(0, CONFIG)).toBe(0);
  });
});
