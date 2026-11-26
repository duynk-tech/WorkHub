-- =============================================================================
-- WorkHub — Cấu hình Supabase pg_cron + pg_net (MIỄN PHÍ trên Supabase Free)
-- =============================================================================
-- Hướng dẫn:
-- 1. Vào Supabase Dashboard -> Database -> Extensions -> bật `pg_cron` và `pg_net`.
-- 2. Mở SQL Editor, thay <YOUR_VERCEL_DOMAIN> và <YOUR_CRON_SECRET> bên dưới rồi chạy.
--
-- Lưu ý múi giờ:
-- pg_cron chạy theo giờ UTC. Lịch bên dưới đã được quy đổi từ Asia/Ho_Chi_Minh (UTC+7):
--   - 08:00 ICT -> 01:00 UTC
--   - 08:30 ICT -> 01:30 UTC
--   - 01:30 ICT -> 18:30 UTC (ngày hôm trước)
-- =============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Helper xóa job cũ nếu chạy lại script nhiều lần
do $$
declare
  job_name text;
begin
  foreach job_name in array array[
    'workhub-outbox',
    'workhub-task-reminders',
    'workhub-overdue-tasks',
    'workhub-daily-digest',
    'workhub-approval-sla',
    'workhub-attendance-rollup'
  ] loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end $$;

-- 1. Đẩy hàng đợi thông báo Zalo (mỗi 2 phút)
select cron.schedule(
  'workhub-outbox',
  '*/2 * * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/outbox',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- 2. Nhắc việc sắp đến hạn (mỗi 15 phút)
select cron.schedule(
  'workhub-task-reminders',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/task-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- 3. Nhắc duyệt quá hạn SLA (mỗi giờ)
select cron.schedule(
  'workhub-approval-sla',
  '0 * * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/approval-sla',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- 4. Bản tin buổi sáng (08:00 giờ Việt Nam = 01:00 UTC)
select cron.schedule(
  'workhub-daily-digest',
  '0 1 * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/daily-digest',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- 5. Cảnh báo công việc quá hạn (08:30 giờ Việt Nam = 01:30 UTC)
select cron.schedule(
  'workhub-overdue-tasks',
  '30 1 * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/overdue-tasks',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- 6. Chốt công ngày hôm trước (01:30 giờ Việt Nam = 18:30 UTC)
select cron.schedule(
  'workhub-attendance-rollup',
  '30 18 * * *',
  $$
  select net.http_get(
    url := 'https://<YOUR_VERCEL_DOMAIN>/api/cron/attendance-rollup',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>')
  );
  $$
);

-- Kiểm tra danh sách job đã tạo:
select jobid, jobname, schedule, active from cron.job order by jobname;
