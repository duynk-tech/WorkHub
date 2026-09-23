import { describe, it, expect } from 'vitest';
import { QUOTATION_STATUSES } from '@/server/modules/customer/types';
import { summarizeQuotation } from '@/server/modules/customer/service';

describe('Báo giá khách hàng', () => {
  it('định nghĩa đủ vòng đời trạng thái báo giá', () => {
    expect(QUOTATION_STATUSES.DRAFT.label).toBe('Nháp');
    expect(QUOTATION_STATUSES.SENT.label).toBe('Đã gửi khách');
    expect(QUOTATION_STATUSES.ACCEPTED.label).toBe('Khách đã duyệt');
    expect(QUOTATION_STATUSES.REJECTED.label).toBe('Khách từ chối');
    expect(QUOTATION_STATUSES.EXPIRED.label).toBe('Hết hiệu lực');
  });

  it('cộng tiền nhiều dòng không chiết khấu, không VAT', () => {
    const s = summarizeQuotation([
      { quantity: 1, unitPrice: 50_000_000 },
      { quantity: 2, unitPrice: 1_500_000 },
    ]);
    expect(s.gross).toBe(53_000_000);
    expect(s.discountAmount).toBe(0);
    expect(s.subtotal).toBe(53_000_000);
    expect(s.vatAmount).toBe(0);
    expect(s.totalAmount).toBe(53_000_000);
  });

  it('trừ chiết khấu theo dòng rồi mới tính VAT', () => {
    const s = summarizeQuotation(
      [
        { quantity: 1, unitPrice: 50_000_000, discountVnd: 2_000_000 },
        { quantity: 2, unitPrice: 1_500_000 },
      ],
      8,
    );
    expect(s.discountAmount).toBe(2_000_000);
    expect(s.subtotal).toBe(51_000_000);
    // VAT tính trên tiền sau chiết khấu, không phải trên giá gốc
    expect(s.vatAmount).toBe(4_080_000);
    expect(s.totalAmount).toBe(55_080_000);
  });

  it('chiết khấu lớn hơn giá trị dòng không làm tổng tiền âm', () => {
    const s = summarizeQuotation([{ quantity: 1, unitPrice: 1_000_000, discountVnd: 5_000_000 }], 10);
    expect(s.discountAmount).toBe(1_000_000);
    expect(s.subtotal).toBe(0);
    expect(s.totalAmount).toBe(0);
  });

  it('làm tròn tiền VAT về số nguyên đồng', () => {
    const s = summarizeQuotation([{ quantity: 3, unitPrice: 333_333 }], 8);
    expect(s.subtotal).toBe(999_999);
    expect(Number.isInteger(s.vatAmount)).toBe(true);
    expect(s.vatAmount).toBe(80_000);
  });

  it('cước vận chuyển là khoản riêng, cộng vào tạm tính rồi mới tính VAT', () => {
    const s = summarizeQuotation([{ quantity: 1, unitPrice: 10_000_000 }], 8, 4_500_000);
    expect(s.gross).toBe(10_000_000);
    expect(s.shippingFee).toBe(4_500_000);
    expect(s.subtotal).toBe(14_500_000);
    expect(s.vatAmount).toBe(1_160_000);
    expect(s.totalAmount).toBe(15_660_000);
  });

  it('chiết khấu tính trên tổng tiền hàng, không phải trên từng dòng', () => {
    const s = summarizeQuotation(
      [
        { quantity: 2, unitPrice: 10_000_000 },
        { quantity: 1, unitPrice: 5_000_000 },
      ],
      0,
      0,
      3, // 3% theo bậc sản lượng của cấu hình
    );
    expect(s.gross).toBe(25_000_000);
    expect(s.discountAmount).toBe(750_000);
    expect(s.totalAmount).toBe(24_250_000);
  });

  it('chiết khấu % và cước cùng có thì cước không bị chiết khấu', () => {
    const s = summarizeQuotation([{ quantity: 1, unitPrice: 10_000_000 }], 0, 4_500_000, 10);
    expect(s.discountAmount).toBe(1_000_000);
    expect(s.shippingFee).toBe(4_500_000);
    expect(s.totalAmount).toBe(13_500_000);
  });

  it('chiết khấu không vượt quá tổng tiền hàng', () => {
    const s = summarizeQuotation([{ quantity: 1, unitPrice: 1_000_000 }], 0, 0, 500);
    expect(s.discountAmount).toBe(1_000_000);
    expect(s.totalAmount).toBe(0);
  });

  it('cước âm bị bỏ qua, không làm giảm tổng tiền', () => {
    const s = summarizeQuotation([{ quantity: 1, unitPrice: 1_000_000 }], 0, -500_000);
    expect(s.shippingFee).toBe(0);
    expect(s.totalAmount).toBe(1_000_000);
  });

  it('tách bạch rõ ràng tổng tiền hàng, tiền chiết khấu và tiền hàng sau chiết khấu', () => {
    // 2 linh kiện * 5,000,000đ = 10,000,000đ; chiết khấu 10%
    const s = summarizeQuotation([{ quantity: 2, unitPrice: 5_000_000 }], 0, 0, 10);
    expect(s.gross).toBe(10_000_000);
    expect(s.discountAmount).toBe(1_000_000);
    // Tiền hàng sau chiết khấu: 10tr - 1tr = 9tr
    const goodsTotal = s.gross - s.discountAmount;
    expect(goodsTotal).toBe(9_000_000);
    expect(s.totalAmount).toBe(9_000_000);
  });

  it('báo giá rỗng cho tổng bằng 0', () => {
    const s = summarizeQuotation([], 10);
    expect(s.totalAmount).toBe(0);
  });
});
