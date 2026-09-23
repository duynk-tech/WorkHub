import { describe, it, expect } from 'vitest';
import { nextSequentialCode } from '@/lib/code-sequence';

describe('Sinh mã chứng từ', () => {
  it('bắt đầu từ 0001 khi chưa có mã nào', () => {
    expect(nextSequentialCode('NK-2026-', [])).toBe('NK-2026-0001');
  });

  it('lấy số lớn nhất rồi cộng 1, không đếm số bản ghi', () => {
    // Đã xóa NK-2026-0002 → nếu đếm sẽ sinh trùng 0003, phải ra 0004
    expect(nextSequentialCode('NK-2026-', ['NK-2026-0001', 'NK-2026-0003'])).toBe('NK-2026-0004');
  });

  it('bỏ qua mã khác tiền tố và mã sai định dạng', () => {
    expect(
      nextSequentialCode('BG-2026-', ['ORD-2026-0099', 'BG-2026-0007', 'BG-2026-xxxx']),
    ).toBe('BG-2026-0008');
  });

  it('giữ đủ số 0 đứng đầu khi vượt 4 chữ số', () => {
    expect(nextSequentialCode('PO-2026-', ['PO-2026-9999'])).toBe('PO-2026-10000');
  });

  it('mã khách hàng dùng chung khuôn CUS-YYYY-XXXX', () => {
    expect(nextSequentialCode('CUS-2026-', [])).toBe('CUS-2026-0001');
    // Mã kiểu cũ (KH-, CUST-) không có tiền tố này nên không ảnh hưởng số đếm
    expect(
      nextSequentialCode('CUS-2026-', ['KH-0007', 'CUST-MAROU', 'CUS-2026-0003']),
    ).toBe('CUS-2026-0004');
  });
});
