import { describe, it, expect } from 'vitest';
import {
  REASON_CODES,
  reasonCodesFor,
  reasonNeedsApproval,
  weightedAverageCost,
} from '@/server/modules/spare-parts/types';

describe('Mã lý do nhập xuất kho', () => {
  it('phiếu ghi giảm tài sản bắt buộc qua duyệt', () => {
    expect(reasonNeedsApproval('SCRAP')).toBe(true);
    expect(reasonNeedsApproval('LIQUIDATION')).toBe(true);
    expect(reasonNeedsApproval('COUNT_SHORTAGE')).toBe(true);
    expect(reasonNeedsApproval('COUNT_SURPLUS')).toBe(true);
  });

  it('phiếu bán hàng và nhập hàng thường không cần duyệt', () => {
    expect(reasonNeedsApproval('SALE')).toBe(false);
    expect(reasonNeedsApproval('PO_RECEIPT')).toBe(false);
    expect(reasonNeedsApproval('REPAIR')).toBe(false);
    expect(reasonNeedsApproval(null)).toBe(false);
    expect(reasonNeedsApproval('KHONG_TON_TAI')).toBe(false);
  });

  it('dropdown chỉ đổ lý do đúng loại phiếu và bỏ mã dữ liệu cũ', () => {
    const inCodes = reasonCodesFor('IN').map((r) => r.code);
    const outCodes = reasonCodesFor('OUT').map((r) => r.code);
    expect(inCodes).toContain('PO_RECEIPT');
    expect(inCodes).not.toContain('SALE');
    expect(outCodes).toContain('SCRAP');
    expect(outCodes).not.toContain('OTHER');
    expect(REASON_CODES.OTHER).toBeDefined();
  });
});

describe('Giá vốn bình quân gia quyền', () => {
  it('trộn hai lô giá khác nhau theo tỷ trọng số lượng', () => {
    // 10 cái giá 100k + 10 cái giá 200k = 150k
    expect(weightedAverageCost(10, 100_000, 10, 200_000)).toBe(150_000);
    // 30 cái giá 100k + 10 cái giá 200k = 125k
    expect(weightedAverageCost(30, 100_000, 10, 200_000)).toBe(125_000);
  });

  it('kho đang rỗng thì lấy luôn giá lô nhập', () => {
    expect(weightedAverageCost(0, 0, 5, 300_000)).toBe(300_000);
  });

  it('lô nhập không khai giá thì giữ nguyên giá vốn cũ, không kéo về 0', () => {
    expect(weightedAverageCost(10, 100_000, 5, 0)).toBe(100_000);
  });

  it('làm tròn về số nguyên đồng', () => {
    expect(Number.isInteger(weightedAverageCost(3, 100_000, 4, 333_333))).toBe(true);
  });
});
