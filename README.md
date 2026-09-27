# WorkHub

Hệ thống quản lý **công việc · nghỉ phép · phê duyệt · chấm công** cho doanh nghiệp Việt Nam.
Code-first với Prisma + MySQL, tự cài đặt database, tích hợp Zalo Bot và MCP server cho trợ lý AI.

```
Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 + design system tự viết
Prisma 6 · MySQL 8 / MariaDB 10.6+ · Zalo Bot API · MCP (JSON-RPC 2.0)
```

---

## Cài đặt trong 1 lệnh

### Cách 1 — Trình cài đặt CLI (khuyến nghị cho máy có sẵn MySQL)

```bash
npm install
npm run setup
```

Wizard sẽ hỏi thông tin MySQL, **tự tạo database**, sinh khóa bảo mật, chạy migration, nạp dữ liệu khởi tạo và tạo tài khoản quản trị. Sau đó:

```bash
npm run dev          # phát triển
npm run scheduler    # tiến trình nhắc việc / chốt công (cửa sổ terminal khác)
```

### Cách 2 — Docker (không cần cài MySQL)

```bash
docker compose up -d
```

MySQL 8.4 + ứng dụng khởi động cùng nhau; entrypoint tự chờ DB, chạy migration và seed. Mở http://localhost:3000. Tạo tài khoản quản trị ở `/install`; không dùng mật khẩu mặc định trên môi trường dùng chung.

### Cách 3 — Trình cài đặt web

Nếu DATABASE_URL đã có sẵn (vd trên máy chủ), mở `/install`. Trình cài đặt 3 bước sẽ kiểm tra kết nối, nhận thông tin công ty, tạo tài khoản quản trị rồi tự khóa lại khi đã có tài khoản.

---

## Tính năng

| Nhóm | Nội dung |
|---|---|
| **Tổ chức** | Phòng ban phân cấp không giới hạn cấp (materialized path), chức danh có cấp bậc, hồ sơ nhân sự, chuỗi quản lý trực tiếp |
| **Phân quyền** | 45 quyền `MENU_*`/`FEATURE_*`, vai trò tùy chỉnh, **phạm vi dữ liệu** 5 mức (toàn công ty / cây phòng ban / phòng ban / chỉ định / bản thân) |
| **Công việc** | Giao việc, việc con, checklist tự tính tiến độ, bình luận, chấm giờ, nhật ký thay đổi, xem dạng bảng hoặc Kanban |
| **Nghỉ phép** | 7 loại nghỉ cấu hình được, quỹ phép theo năm, nghỉ nửa ngày, loại trừ ngày lễ và ngày nghỉ theo ca, chặn trùng lịch, giữ chỗ quỹ phép khi chờ duyệt |
| **Quy trình duyệt** | Engine đa bước dùng chung: 8 kiểu người duyệt, điều kiện theo dữ liệu đơn, duyệt tuần tự/song song, SLA, **mô phỏng trước khi lưu** |
| **Chấm công** | Check-in web có GPS, check-in qua Zalo, import máy chấm công, HR điều chỉnh có lưu vết, bảng công tháng, chốt công tự động |
| **Zalo Bot** | Nhắc việc, thông báo duyệt, liên kết tài khoản bằng mã, 11 lệnh chat, hàng đợi gửi có retry và giờ im lặng |
| **MCP** | 14 công cụ cho trợ lý AI, API key theo danh tính người dùng, chế độ chỉ đọc, giới hạn công cụ và IP, nhật ký gọi |
| **Báo cáo** | Chấm công, công việc, nghỉ phép; biểu đồ; xuất Excel nhiều sheet |
| **Hệ thống** | Cấu hình công ty/Zalo/nghỉ phép/ca làm việc/ngày lễ, nhật ký thao tác, webhook đi ra có ký HMAC |

---

## Cấu trúc dự án

```
prisma/
  schema.prisma          # nguồn sự thật duy nhất của database (34 model)
  seed/core.ts           # quyền, vai trò, loại nghỉ, ca làm việc, quy trình, mẫu thông báo
  seed/demo.ts           # cây phòng ban + 14 nhân sự + công việc mẫu
src/
  app/
    (app)/               # màn hình sau đăng nhập, layout chung có sidebar theo quyền
    login, install       # đăng nhập và trình cài đặt lần đầu
    api/zalo/webhook     # nhận sự kiện Zalo Bot
    api/mcp              # MCP server (JSON-RPC 2.0 over HTTP)
    api/cron/[job]       # chạy job từ cron ngoài, bảo vệ bằng CRON_SECRET
    api/reports/export   # xuất Excel
  server/
    auth/                # phiên đăng nhập, ngữ cảnh quyền, lọc phạm vi dữ liệu
    modules/<tên>/       # service (nghiệp vụ) + actions (Server Action)
    workflow/engine.ts   # resolver người duyệt · evaluator điều kiện · runner chuyển bước
    mcp/                 # xác thực API key + đăng ký công cụ
    jobs/                # nhắc việc, cảnh báo quá hạn, SLA, bản tin, chốt công, outbox
  components/ui/         # design system viết tay trên CSS variables
  lib/                   # prisma, date, crypto, enum tiếng Việt, danh mục quyền
scripts/
  setup.ts               # trình cài đặt CLI
  scheduler.ts           # tiến trình chạy job định kỳ
tests/                   # vitest — engine duyệt, tính công, quyền, tiện ích
```

**Nguyên tắc:** UI, lệnh chat Zalo và công cụ MCP đều gọi chung một tầng service. Một quy tắc nghiệp vụ (tính ngày phép, định tuyến duyệt, phạm vi dữ liệu) chỉ tồn tại ở một nơi.

---

## Lệnh thường dùng

```bash
npm run dev            # chạy phát triển
npm run build && npm start
npm run scheduler      # tiến trình job định kỳ
npm run job outbox     # chạy tay một job: outbox | task-reminders | overdue-tasks
                       #                    approval-sla | daily-digest | attendance-rollup
npm run db:migrate     # tạo migration mới sau khi sửa schema.prisma
npm run db:seed        # nạp lại dữ liệu hệ thống (idempotent)
npm run db:seed -- --demo  # dữ liệu HR/F&B mẫu hiện có
npm run db:seed:business-demo # thêm khách, kho, mặt hàng, PO, đơn bán và phiếu thu/chi demo
CONFIRM_DEMO_HR_OVERWRITE=YES npm run db:seed:hr-demo # thêm HR/demo; cập nhật hồ sơ NV001–NV014
npm run db:studio      # Prisma Studio
npm test               # vitest
```

Seed thương mại dùng mã `DEMO-`, có thể chạy lại để dựng lại các giao dịch demo, và giữ nguyên các chứng từ không mang mã demo. Seed HR cập nhật các nhân sự mẫu `NV001`–`NV014`; lệnh yêu cầu biến xác nhận để tránh chạy nhầm lên hồ sơ nhân sự thật. Không dùng `db:seed:clean`, `db:reset` hoặc cờ `--clean` trên database đang chứa dữ liệu cần giữ.

---

## Kết nối Zalo Bot

1. Tạo bot và lấy **bot token** trên trang quản trị Zalo Bot.
2. Vào **Cấu hình → Zalo Bot**: dán token, đặt webhook secret, bật công tắc, bấm *Gửi tin thử*.
3. Sao chép URL webhook (`https://<domain>/api/zalo/webhook`) dán vào cấu hình bot.
4. Mỗi nhân sự vào **Hồ sơ cá nhân → Lấy mã liên kết**, rồi nhắn `/lienket <mã>` cho bot.

**Lệnh chat:** `/viec` · `/xong <mã>` · `/nghi` · `/donnghi` · `/duyet` · `/duyet <mã> ok|no <lý do>` · `/checkin` · `/checkout` · `/baocao` · `/help`

Token và webhook secret được mã hóa AES-256-GCM bằng `APP_ENCRYPTION_KEY` trước khi lưu DB. Mọi lời gọi ra Zalo nằm sau `src/server/modules/notify/zalo.ts` — đổi sang Zalo OA chỉ cần thay file này.

---

## Kết nối trợ lý AI qua MCP

**Cấu hình → Tích hợp & MCP → Tạo API key**, chọn tài khoản đại diện và chế độ chỉ đọc. Key chỉ hiện một lần.

```json
{
  "mcpServers": {
    "workhub": {
      "type": "http",
      "url": "https://<domain>/api/mcp",
      "headers": { "Authorization": "Bearer whk_xxx.yyy" }
    }
  }
}
```

14 công cụ: `search_employees`, `get_department_tree`, `list_tasks`, `get_task`, `create_task`, `update_task_status`, `get_leave_balance`, `list_leave_requests`, `who_is_on_leave`, `submit_leave_request`, `list_pending_approvals`, `approve_request`, `attendance_summary`, `my_day`.

Mỗi key chạy dưới danh tính một tài khoản và **không bao giờ vượt quá quyền hoặc phạm vi dữ liệu của tài khoản đó**. Công cụ ghi dữ liệu bị chặn khi key ở chế độ chỉ đọc; mọi lượt gọi đều ghi nhật ký.

---

## Quy trình duyệt động

Mỗi bước khai báo: **người duyệt** (quản lý trực tiếp / quản lý cấp N / trưởng đơn vị / trưởng đơn vị cấp trên / theo vai trò / theo cấp bậc chức danh / người cụ thể / HR), **điều kiện chạy** (vd `Số ngày nghỉ > 3`), **chế độ** (tuần tự, song song tất cả, song song một người), **SLA** và quy tắc bỏ qua.

Quy trình mặc định khi cài đặt:

```
Nộp đơn → Quản lý trực tiếp (SLA 24h)
        → Giám đốc (chỉ khi > 3 ngày, song song một người duyệt, SLA 48h)
        → HR xác nhận (SLA 24h)
        → Duyệt xong: trừ quỹ phép, ghi bảng công, báo Zalo cho người nộp
```

Nút **Mô phỏng** hiển thị chuỗi người duyệt thật với dữ liệu giả định trước khi lưu — tránh cấu hình sai gây kẹt đơn.

---

## Chạy job định kỳ

Cách 1 — tiến trình riêng: `npm run scheduler`
Cách 2 — cron hệ thống gọi HTTP:

```cron
*/2  * * * *  curl -s "https://<domain>/api/cron/outbox?secret=$CRON_SECRET"
*/15 * * * *  curl -s "https://<domain>/api/cron/task-reminders?secret=$CRON_SECRET"
30 8 * * *    curl -s "https://<domain>/api/cron/overdue-tasks?secret=$CRON_SECRET"
0 8 * * *     curl -s "https://<domain>/api/cron/daily-digest?secret=$CRON_SECRET"
0 * * * *     curl -s "https://<domain>/api/cron/approval-sla?secret=$CRON_SECRET"
30 1 * * *    curl -s "https://<domain>/api/cron/attendance-rollup?secret=$CRON_SECRET"
```

Chạy nhiều instance web thì chỉ dùng **một** nguồn lịch để tránh gửi trùng (hàng đợi outbox có khóa chống trùng theo `dedupeKey`, nhưng job vẫn nên chạy một nơi).

---

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|:--:|---|
| `DATABASE_URL` | ✓ | `mysql://user:pass@host:3306/workhub` |
| `SHADOW_DATABASE_URL` | | Chỉ cần khi tạo migration mới |
| `AUTH_SECRET` | ✓ | Khóa ký JWT phiên đăng nhập (≥ 32 ký tự) |
| `APP_ENCRYPTION_KEY` | ✓ | Khóa AES-256-GCM mã hóa secret trong DB |
| `CRON_SECRET` | | Bảo vệ `/api/cron/*` |
| `APP_URL` | ✓ | Dùng trong link thông báo và URL webhook |
| `APP_NAME` | | Tên hiển thị, mặc định `WorkHub` |
| `TZ` | | Mặc định `Asia/Ho_Chi_Minh` |

---

## Bảo mật

- Mật khẩu băm bcrypt (cost 11); khóa tài khoản 10 phút sau 5 lần sai.
- Phiên đăng nhập JWT trong cookie `httpOnly` + `SameSite=Lax`, hết hạn 7 ngày.
- **Mọi kiểm tra quyền chạy ở server** (`requirePermission`) — ẩn nút trên UI chỉ là lớp phụ.
- Phạm vi dữ liệu áp dụng tự động ở tầng truy vấn, không phụ thuộc màn hình gọi.
- Secret trong DB mã hóa AES-256-GCM; MCP key chỉ lưu SHA-256 + prefix.
- Webhook Zalo xác thực secret và chống xử lý trùng theo `messageId`.
- `AuditLog` ghi lại mọi thao tác nhạy cảm kèm IP và nguồn (Web/Zalo/MCP).

---

## Khác biệt so với bản kế hoạch ban đầu

- **Xác thực:** dùng JWT tự quản bằng `jose` thay cho Auth.js v5 (bản beta) — ít phụ thuộc, kiểm soát rõ luồng khóa tài khoản và đổi mật khẩu.
- **Băm mật khẩu:** `bcryptjs` (thuần JS) thay argon2 để cài đặt chạy được ở mọi môi trường không có trình biên dịch native.
- **MCP:** hiện thực trực tiếp JSON-RPC 2.0 theo đặc tả thay vì dùng adapter của SDK — tránh vướng mắc khi ghép transport vào Route Handler của Next.
- **Scheduler:** chạy như tiến trình riêng (`npm run scheduler`) thay vì hook trong tiến trình web, vì `node-cron` không bundle được cho edge runtime và cách này an toàn hơn khi chạy nhiều instance.
- **Zalo Bot API:** endpoint và định dạng payload đã được viết theo tài liệu công khai và bọc trong một adapter duy nhất; cần đối chiếu lại với tài liệu hiện hành khi đấu nối bot thật.
