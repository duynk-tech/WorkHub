export const CUSTOMER_TABS = [
  { key: 'overview', label: 'Tổng quan', views: [{ key: 'overview', label: 'Tổng quan' }] },
  { key: 'transactions', label: 'Giao dịch', views: [{ key: 'orders', label: 'Đơn hàng' }, { key: 'quotations', label: 'Báo giá' }] },
  { key: 'products', label: 'Sản phẩm', views: [{ key: 'machines', label: 'Thiết bị' }, { key: 'parts', label: 'Phụ tùng' }] },
  { key: 'debt', label: 'Công nợ', views: [{ key: 'payments', label: 'Thanh toán' }, { key: 'customer-report', label: 'Đối soát & Báo cáo' }] },
  { key: 'profile', label: 'Hồ sơ', views: [{ key: 'profile', label: 'Thông tin' }, { key: 'contacts', label: 'Liên hệ' }, { key: 'locations', label: 'Chi nhánh' }, { key: 'care', label: 'Chăm sóc' }, { key: 'tickets', label: 'Dịch vụ' }] },
] as const;
export type CustomerView = typeof CUSTOMER_TABS[number]['views'][number]['key'];
export function resolveCustomerView(tab: string | null, view: string | null): CustomerView {
  const group = CUSTOMER_TABS.find(t => t.key === tab);
  if (group) return group.views.find(v => v.key === view)?.key ?? group.views[0].key;
  return CUSTOMER_TABS.flatMap(t => [...t.views]).find(v => v.key === tab)?.key ?? 'overview';
}
export function customerTabForView(view: CustomerView) {
  return CUSTOMER_TABS.find(t => t.views.some(v => v.key === view))!;
}
