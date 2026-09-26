import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sparePartOrder: {
      count: vi.fn().mockResolvedValue(5),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import {
  calculateOrderPricing,
  generateOrderCode,
  calculateSellingPriceFromMargin,
} from '@/server/modules/spare-parts/service';
import { orderStatusLabel } from '@/server/modules/spare-parts/types';

describe('Spare Part Order Pricing & Formulas (Alluvia Excel)', () => {
  it('should calculate 0% volume discount for 1 item', () => {
    // 1 item * €100 = €100 * 32,500 = 3,250,000 VND
    // Cước: 3,500,000 VND (phẳng cho cả lô)
    // Chiết khấu: 0% = 0 VND
    // Tổng: 3,250,000 + 3,500,000 = 6,750,000 VND
    const pricing = calculateOrderPricing(
      [{ itemId: 1, quantity: 1, unitPriceEur: 100 }],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
      }
    );

    expect(pricing.subtotalVnd).toBe(3250000);
    expect(pricing.discountRate).toBe(0.00);
    expect(pricing.discountVnd).toBe(0);
    expect(pricing.shippingFee).toBe(3500000);
    expect(pricing.customsFee).toBe(0);
    expect(pricing.totalVnd).toBe(6750000);
  });

  it('should calculate 1% volume discount for 2-9 total items', () => {
    // 5 items * €50 = €250 * 32,500 = 8,125,000 VND
    // Discount: 1% * 8,125,000 = 81,250 VND
    // Cước: 3,500,000 VND
    // Tổng: 8,125,000 - 81,250 + 3,500,000 = 11,543,750 VND
    const pricing = calculateOrderPricing(
      [{ itemId: 1, quantity: 5, unitPriceEur: 50 }],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
      }
    );

    expect(pricing.subtotalVnd).toBe(8125000);
    expect(pricing.discountRate).toBe(0.01);
    expect(pricing.discountVnd).toBe(81250);
    expect(pricing.shippingFee).toBe(3500000);
    expect(pricing.customsFee).toBe(0);
    expect(pricing.totalVnd).toBe(11543750);
  });

  it('should not calculate volume discount when hasCustomer is false (nhập kho dự trữ)', () => {
    // 5 items * €50 = 8,125,000 VND
    // hasCustomer = false => discountRate = 0, discountVnd = 0
    const pricing = calculateOrderPricing(
      [{ itemId: 1, quantity: 5, unitPriceEur: 50 }],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
        hasCustomer: false,
      }
    );

    expect(pricing.subtotalVnd).toBe(8125000);
    expect(pricing.discountRate).toBe(0);
    expect(pricing.discountVnd).toBe(0);
    expect(pricing.totalVnd).toBe(8125000 + 3500000);
  });

  it('should calculate 2% volume discount for 10-29 total items', () => {
    // 20 items * €10 = €200 * 32,500 = 6,500,000 VND
    // Discount: 2% * 6,500,000 = 130,000 VND
    // Cước: 3,500,000 VND
    // Tổng: 6,500,000 - 130,000 + 3,500,000 = 9,870,000 VND
    const pricing = calculateOrderPricing(
      [{ itemId: 1, quantity: 20, unitPriceEur: 10 }],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
      }
    );

    expect(pricing.subtotalVnd).toBe(6500000);
    expect(pricing.discountRate).toBe(0.02);
    expect(pricing.discountVnd).toBe(130000);
    expect(pricing.totalVnd).toBe(9870000);
  });

  it('should calculate 3% volume discount for >= 30 total items', () => {
    // 30 items * €10 = €300 * 32,500 = 9,750,000 VND
    // Discount: 3% * 9,750,000 = 292,500 VND
    const pricing = calculateOrderPricing(
      [{ itemId: 1, quantity: 30, unitPriceEur: 10 }],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
      }
    );

    expect(pricing.discountRate).toBe(0.03);
    expect(pricing.discountVnd).toBe(292500);
  });

  it('mỗi mặt hàng cộng một suất cước', () => {
    // Bỏ phụ trội đa mã: cước tính thẳng 3 × 3,500,000 = 10,500,000 VND
    const pricing = calculateOrderPricing(
      [
        { itemId: 1, quantity: 2, unitPriceEur: 50 },
        { itemId: 2, quantity: 3, unitPriceEur: 60 },
        { itemId: 3, quantity: 1, unitPriceEur: 100 },
      ],
      {
        exchangeRate: 32500,
        shippingFee: 3500000,
      }
    );

    expect(pricing.shippingFee).toBe(10500000);
    expect(pricing.customsFee).toBe(0);
  });

  it('should generate PO order code with PO-YYYY-XXXX format', async () => {
    const code = await generateOrderCode();
    const currentYear = new Date().getFullYear();
    expect(code).toMatch(new RegExp(`^PO-${currentYear}-\\d{4}$`));
  });

  describe('calculateSellingPriceFromMargin (Gross Margin vs Markup)', () => {
    it('should calculate selling price using Gross Margin formula', () => {
      // Cost: 700,000 VND, Margin: 30% -> Selling = 700,000 / (1 - 0.3) = 1,000,000 VND
      const selling = calculateSellingPriceFromMargin(700000, 30, 'MARGIN');
      expect(selling).toBe(1000000);

      // Cost: 1,000,000 VND, Margin: 30% -> Selling = 1,000,000 / 0.7 = 1,428,571 VND
      const selling2 = calculateSellingPriceFromMargin(1000000, 30, 'MARGIN');
      expect(selling2).toBe(1428571);
    });

    it('should calculate selling price using Markup formula', () => {
      // Cost: 700,000 VND, Markup: 30% -> Selling = 700,000 * (1 + 0.3) = 910,000 VND
      const selling = calculateSellingPriceFromMargin(700000, 30, 'MARKUP');
      expect(selling).toBe(910000);

      // Cost: 1,000,000 VND, Markup: 50% -> Selling = 1,500,000 VND
      const selling2 = calculateSellingPriceFromMargin(1000000, 50, 'MARKUP');
      expect(selling2).toBe(1500000);
    });

    it('should return 0 when cost is 0 or negative', () => {
      expect(calculateSellingPriceFromMargin(0, 30, 'MARGIN')).toBe(0);
      expect(calculateSellingPriceFromMargin(-500, 30, 'MARGIN')).toBe(0);
    });

    it('should guard against margin >= 100%', () => {
      // Guard: when rate >= 1 in MARGIN mode, returns costPrice * 2
      expect(calculateSellingPriceFromMargin(500000, 100, 'MARGIN')).toBe(1000000);
    });
  });

  describe('Dynamic Volume Discount Tiers in calculateOrderPricing', () => {
    it('should apply custom tiers when provided', () => {
      const customTiers = [
        { min: 1, max: 5, rate: 0.05 },
        { min: 6, max: 99999, rate: 0.15 },
      ];

      const pricing = calculateOrderPricing(
        [{ itemId: 1, quantity: 10, unitPriceEur: 100 }],
        {
          exchangeRate: 32500,
          volumeDiscountTiers: customTiers,
        }
      );

      // 10 items * €100 * 32,500 = 32,500,000 VND
      // Custom discount: 15% * 32,500,000 = 4,875,000 VND
      expect(pricing.discountRate).toBe(0.15);
      expect(pricing.discountVnd).toBe(4875000);
    });
  });
});

describe('Nhãn trạng thái phiếu mua', () => {
  it('bỏ số thứ tự bước khi hiện thành thẻ trạng thái', () => {
    // "7. Đã nhập kho" đứng một mình đọc như một con số lạc vào
    expect(orderStatusLabel('STOCKED')).toBe('Đã nhập kho');
    expect(orderStatusLabel('REQUESTED')).toBe('Yêu cầu đặt hàng');
    expect(orderStatusLabel('COMPLETED')).toBe('Hoàn tất');
  });

  it('trạng thái ngoài quy trình vốn không có số thì giữ nguyên', () => {
    expect(orderStatusLabel('CANCELLED')).toBe('Đã hủy');
  });

  it('mã lạ thì trả lại chính nó, không ném lỗi', () => {
    expect(orderStatusLabel('KHONG_CO_THAT')).toBe('KHONG_CO_THAT');
  });

  it('cấu hình giá mặc định VAT 8% tự động', async () => {
    const { SparePartPricingConfigSchema } = await import('@/server/modules/spare-parts/types');
    const parsed = SparePartPricingConfigSchema.parse({});
    expect(parsed.defaultVatRate).toBe(8);
  });

  it('tính giá bán theo quy tắc: Margin + Phí vận chuyển + Phí khác', () => {
    // Giá vốn: 100€ * 32,500 = 3,250,000 VND
    // Margin: 30% -> base selling price = 3,250,000 / (1 - 0.3) = 4,642,857 VND
    // Phí VC: 3,500,000 VND
    // Phí khác: 1,000,000 VND
    // Đơn giá bán = 4,642,857 + 3,500,000 + 1,000,000 = 9,142,857 VND
    const baseCost = 3250000;
    const baseSellingPrice = calculateSellingPriceFromMargin(baseCost, 30, 'MARGIN');
    const shippingFee = 3500000;
    const otherFee = 1000000;
    const quantity = 1;

    const freightPerUnit = Math.round(shippingFee / quantity);
    const otherPerUnit = Math.round(otherFee / quantity);
    const sellingPerUnit = baseSellingPrice + freightPerUnit + otherPerUnit;

    expect(baseSellingPrice).toBe(4642857);
    expect(freightPerUnit).toBe(3500000);
    expect(otherPerUnit).toBe(1000000);
    expect(sellingPerUnit).toBe(9142857);
  });
});
