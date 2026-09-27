import { expect, it } from 'vitest';
import { CUSTOMER_TABS, customerTabForView, resolveCustomerView } from '@/lib/customer-tabs';
it('giữ 5 nhóm và nhận đúng liên kết sản phẩm/đơn hàng', () => {
  expect(CUSTOMER_TABS).toHaveLength(5);
  expect(resolveCustomerView('products', 'parts')).toBe('parts');
  expect(customerTabForView('orders').key).toBe('transactions');
});
it('hỗ trợ liên kết cũ và xử lý tab không hợp lệ', () => {
  expect(resolveCustomerView('machines', null)).toBe('machines');
  expect(resolveCustomerView('products', 'payments')).toBe('machines');
  expect(resolveCustomerView('unknown', null)).toBe('overview');
});
