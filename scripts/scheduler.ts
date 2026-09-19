/**
 * Tiến trình chạy job định kỳ của WorkHub — chạy: npm run scheduler
 *
 * Tách khỏi tiến trình web để khi chạy nhiều instance Next.js không bị gửi trùng thông báo.
 * Nếu triển khai trên nền tảng có cron riêng (Vercel Cron, cron hệ thống, n8n),
 * có thể bỏ tiến trình này và gọi GET /api/cron/<job> kèm CRON_SECRET.
 */
import 'dotenv/config';
import cron from 'node-cron';
import { JOBS, type JobName } from '../src/server/jobs';

const TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

const SCHEDULE: { expr: string; job: JobName; label: string }[] = [
  { expr: '*/2 * * * *', job: 'outbox', label: 'Đẩy hàng đợi thông báo Zalo' },
  { expr: '*/15 * * * *', job: 'task-reminders', label: 'Nhắc việc sắp đến hạn' },
  { expr: '30 8 * * *', job: 'overdue-tasks', label: 'Cảnh báo việc quá hạn' },
  { expr: '0 8 * * *', job: 'daily-digest', label: 'Bản tin buổi sáng' },
  { expr: '0 * * * *', job: 'approval-sla', label: 'Nhắc duyệt quá hạn SLA' },
  { expr: '30 1 * * *', job: 'attendance-rollup', label: 'Chốt công ngày hôm trước' },
];

const stamp = () => new Date().toLocaleString('vi-VN', { timeZone: TZ });

async function runJob(name: JobName, label: string) {
  try {
    const result = await JOBS[name]();
    console.log(`[${stamp()}] ✓ ${label}: ${result.message}`);
  } catch (e) {
    console.error(`[${stamp()}] ✗ ${label} lỗi:`, e instanceof Error ? e.message : e);
  }
}

// Cho phép chạy thủ công một job: npm run scheduler -- outbox
const manual = process.argv[2] as JobName | undefined;
if (manual) {
  if (!JOBS[manual]) {
    console.error(`Không có job "${manual}". Các job khả dụng: ${Object.keys(JOBS).join(', ')}`);
    process.exit(1);
  }
  runJob(manual, manual).then(() => process.exit(0));
} else {
  console.log(`WorkHub scheduler khởi động (múi giờ ${TZ})`);
  for (const item of SCHEDULE) {
    cron.schedule(item.expr, () => runJob(item.job, item.label), { timezone: TZ });
    console.log(`  • ${item.expr.padEnd(14)} ${item.label}`);
  }
  console.log('Đang chạy… nhấn Ctrl+C để dừng.\n');
}
