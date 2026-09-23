import { getSetting } from '@/server/modules/settings/service';
import { DISABLED_REPORTS_KEY, sanitizeDisabledKeys } from './registry';

/**
 * Đọc danh sách báo cáo bị tắt.
 *
 * Lưu danh sách bị TẮT chứ không phải danh sách được bật: báo cáo thêm mới về
 * sau sẽ tự hiện, thay vì im lặng vắng mặt ở những hệ thống đã cấu hình từ trước.
 */
export async function getDisabledReportKeys(): Promise<string[]> {
  return sanitizeDisabledKeys(await getSetting<unknown>(DISABLED_REPORTS_KEY, []));
}
