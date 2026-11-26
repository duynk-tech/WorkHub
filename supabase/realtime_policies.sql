-- ============================================================================
-- Không gian 3D — RLS cho Supabase Realtime (private channels)
-- Chạy 1 lần trong Supabase SQL Editor.
--
-- Kênh:
--   space:<sceneCode>  — Presence + Broadcast (move, bubble)
--                        anon + authenticated được NGHE; chỉ authenticated được GỬI/TRACK
--   dm:<employeeId>    — tin nhắn 1-1, chỉ server (service role) gửi;
--                        chỉ đúng nhân viên có JWT employee_id = <employeeId> được nghe
--
-- JWT nhân viên do server WorkHub ký (SUPABASE_JWT_SECRET) với claim `employee_id`.
-- ============================================================================

-- RLS trên realtime.messages đã được Supabase bật sẵn; role `postgres` không phải owner nên
-- KHÔNG chạy `alter table realtime.messages enable row level security` (lỗi 42501).

drop policy if exists "space3d_read_scene" on realtime.messages;
create policy "space3d_read_scene"
on realtime.messages
for select
to anon, authenticated
using (
  realtime.topic() like 'space:%'
  and realtime.messages.extension in ('broadcast', 'presence')
);

drop policy if exists "space3d_write_scene" on realtime.messages;
create policy "space3d_write_scene"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'space:%'
  and realtime.messages.extension in ('broadcast', 'presence')
  -- nhân viên (employee_id) hoặc khách tham quan có token tạm (guest_key)
  and (coalesce(auth.jwt() ->> 'employee_id', '') <> '' or coalesce(auth.jwt() ->> 'guest_key', '') <> '')
);

drop policy if exists "space3d_read_own_dm" on realtime.messages;
create policy "space3d_read_own_dm"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'dm:' || (auth.jwt() ->> 'employee_id')
  and realtime.messages.extension = 'broadcast'
);

-- Kênh trả lời cho khách tham quan: gchat:<guestKey> — guestKey là chuỗi ngẫu nhiên 160-bit chỉ khách đó biết.
-- Chỉ server (service role) gửi; anon/authenticated được NGHE nếu biết đúng tên kênh.
drop policy if exists "space3d_read_guest_chat" on realtime.messages;
create policy "space3d_read_guest_chat"
on realtime.messages
for select
to anon, authenticated
using (
  realtime.topic() like 'gchat:%'
  and length(realtime.topic()) >= 38
  and realtime.messages.extension = 'broadcast'
);
