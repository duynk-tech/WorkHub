import { redirect } from 'next/navigation';

/**
 * Đường dẫn tắt trực tiếp cho phân hệ "Bảo dưỡng".
 * Chuyển hướng người dùng thẳng tới tab Bảo hành, bảo dưỡng của phân hệ Khách hàng.
 */
export default function MaintenancePage() {
  redirect('/customers?tab=care');
}
