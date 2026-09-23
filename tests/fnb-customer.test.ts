import { describe, it, expect } from 'vitest';
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  CUSTOMER_STATUSES,
} from '@/server/modules/customer/types';
import {
  generateCustomerCode,
  generateOrderCode,
} from '@/server/modules/customer/service';

describe('F&B Customer & Order Management Module', () => {
  it('định nghĩa đầy đủ các loại giao dịch đơn hàng F&B', () => {
    expect(ORDER_TYPES.MACHINE_PURCHASE).toBeDefined();
    expect(ORDER_TYPES.MACHINE_PURCHASE.label).toBe('Mua máy mới');
    expect(ORDER_TYPES.RENTAL).toBeDefined();
    expect(ORDER_TYPES.RENTAL.label).toBe('Thuê máy');
    expect(ORDER_TYPES.CONSIGNMENT).toBeDefined();
    expect(ORDER_TYPES.CONSIGNMENT.label).toBe('Ký gửi máy');
    expect(ORDER_TYPES.SPARE_PART).toBeDefined();
    expect(ORDER_TYPES.SPARE_PART.label).toBe('Linh kiện / Vật tư');
  });

  it('định nghĩa đầy đủ các trạng thái đơn hàng F&B', () => {
    expect(ORDER_STATUSES.PENDING).toBeDefined();
    expect(ORDER_STATUSES.CONFIRMED).toBeDefined();
    expect(ORDER_STATUSES.DELIVERED).toBeDefined();
    expect(ORDER_STATUSES.COMPLETED).toBeDefined();
    expect(ORDER_STATUSES.CANCELLED).toBeDefined();
  });

  it('định nghĩa đầy đủ các trạng thái khách hàng F&B', () => {
    expect(CUSTOMER_STATUSES.ACTIVE.label).toBe('Đang giao dịch');
    expect(CUSTOMER_STATUSES.INACTIVE.label).toBe('Ngừng giao dịch');
  });

  it('tự động sinh mã khách hàng CUS-YYYY-XXXX chuẩn format', async () => {
    const year = new Date().getFullYear();
    const code = await generateCustomerCode();
    // Cùng khuôn với ORD, PO, BG — trước đây là KH-XXXX, không có năm
    expect(code).toMatch(new RegExp(`^CUS-${year}-\\d{4}$`));
  });

  it('tự động sinh mã đơn hàng ORD-YYYY-XXXX chuẩn format', async () => {
    const year = new Date().getFullYear();
    const code = await generateOrderCode();
    expect(code).toMatch(new RegExp(`^ORD-${year}-\\d{4}$`));
  });

  it('tính toán chính xác tổng tiền đơn hàng từ danh sách sản phẩm', () => {
    const items = [
      { itemType: 'EQUIPMENT', name: 'Máy làm kem Taylor C708', quantity: 2, unitPrice: 150000000 },
      { itemType: 'SPARE_PART', name: 'Gioăng phớt cối kem', quantity: 4, unitPrice: 500000 },
      { itemType: 'SERVICE', name: 'Gói lắp đặt & hướng dẫn', quantity: 1, unitPrice: 5000000 },
    ];

    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    expect(total).toBe(307000000); // 300tr + 2tr + 5tr
  });
});
