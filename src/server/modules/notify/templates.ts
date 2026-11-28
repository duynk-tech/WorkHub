import { prisma } from '@/lib/prisma';

/**
 * Mẫu thông báo của các tính năng mới. DB cũ (đã seed trước) không có các mẫu này,
 * nên notify() tự tạo khi gặp mã chưa tồn tại — không cần chạy lại seed trên production.
 * Admin vẫn sửa nội dung được ở Cài đặt → Mẫu thông báo; đã có thì không ghi đè.
 */
export const BUILTIN_TEMPLATES: Record<string, { name: string; title: string; bodyTemplate: string; variables: string[] }> = {
  LOW_STOCK: {
    name: 'Cảnh báo tồn kho thấp',
    title: '{{count}} mặt hàng sắp hết kho',
    bodyTemplate: '📦 {{count}} mặt hàng đang ở dưới ngưỡng an toàn:\n{{items}}\n\nMở Kho để tạo đơn đặt hàng gợi ý: {{link}}',
    variables: ['count', 'items', 'link'],
  },
  DEBT_REMINDER_STAFF: {
    name: 'Nhắc thu công nợ (nhân viên)',
    title: 'Đơn {{orderCode}} quá hạn {{days}} ngày',
    bodyTemplate: '💰 Khách {{customer}} còn nợ {{amount}} của đơn {{orderCode}}, đã quá hạn {{days}} ngày.\n\nXem đơn: {{link}}',
    variables: ['customer', 'amount', 'orderCode', 'days', 'link'],
  },
  REPORT_SCHEDULE: {
    name: 'Báo cáo định kỳ',
    title: '{{reportName}} — {{period}}',
    bodyTemplate: '📊 Báo cáo "{{reportName}}" kỳ {{period}} đã sẵn sàng.\n\nXem trong hệ thống: {{link}}',
    variables: ['reportName', 'period', 'link'],
  },
};

export async function ensureBuiltinTemplate(code: string) {
  const def = BUILTIN_TEMPLATES[code];
  if (!def) return null;
  return prisma.notificationTemplate.upsert({
    where: { code },
    update: {},
    create: { code, name: def.name, channel: 'IN_APP', title: def.title, bodyTemplate: def.bodyTemplate, variablesJson: def.variables },
  });
}
