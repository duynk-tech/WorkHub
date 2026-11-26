import { cachedSettings, getSetting } from '@/server/modules/settings/service';
import { DISABLED_REPORTS_KEY, sanitizeDisabledKeys } from './registry';

/**
 * Đọc danh sách báo cáo bị tắt (cache 5 phút, tự làm mới khi lưu cấu hình).
 */
export async function getDisabledReportKeys(): Promise<string[]> {
  return cachedSettings('disabled-reports', async () =>
    sanitizeDisabledKeys(await getSetting<unknown>(DISABLED_REPORTS_KEY, [])),
  );
}
