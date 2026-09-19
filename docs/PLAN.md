# WorkHub — Kế hoạch xây dựng hệ thống Quản lý Công việc & Nghỉ phép

> Task + Leave + Approval + Attendance, code-first, tự cài đặt DB.
> Stack chốt: **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Prisma + MySQL 8**
> Kênh thông báo: **Zalo Bot API** · Workflow: **Engine cấu hình đa bước** · Chấm công: **Web check-in + Zalo + Import máy chấm công + HR nhập tay**

---

## 1. Mục tiêu & phạm vi

| Module | Nội dung chính | Ưu tiên |
|---|---|---|
| Tổ chức | Phòng ban phân cấp (cây n-level), chức danh, nhân sự, tài khoản | P0 |
| Phân quyền | Role + Permission matrix (MENU_/FEATURE_) + Data scope theo cây phòng ban | P0 |
| Công việc | Giao việc, theo dõi, subtask, checklist, bình luận, file, nhắc việc | P0 |
| Nghỉ phép | Loại phép, quỹ phép, đơn từ, workflow duyệt động, lịch nghỉ | P0 (trọng tâm) |
| Duyệt (Approval) | Engine workflow đa bước dùng chung cho Leave/OT/Task/Adjustment | P0 |
| Chấm công | Check-in web/Zalo, import máy chấm công, HR chỉnh sửa, đối soát ca | P1 |
| Zalo Bot | Gửi nhắc việc/thông báo duyệt, nhận lệnh chat, liên kết tài khoản | P1 |
| MCP | MCP server trả dữ liệu hệ thống cho AI chat, quản lý API key/webhook | P1 |
| Báo cáo | Attendance, Task, Leave, Hiệu suất phòng ban; export Excel/PDF; lịch gửi | P1 |
| Cấu hình | Zalo Bot, workflow, ngày lễ, ca làm việc, mẫu thông báo, MCP client | P0/P1 |

**Nguyên tắc code-first:** toàn bộ schema định nghĩa trong `prisma/schema.prisma`; không viết SQL tay. Lần chạy đầu tiên hệ thống **tự tạo database, tự migrate, tự seed** dữ liệu khởi tạo.

---

## 2. Kiến trúc tổng thể

```
workhub/
├─ prisma/
│  ├─ schema.prisma            # nguồn sự thật duy nhất của DB
│  ├─ migrations/              # sinh bởi prisma migrate dev
│  └─ seed/                    # seed theo module (permissions, roles, leave types, holidays…)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login, /install          # trang cài đặt lần đầu
│  │  ├─ (app)/dashboard, tasks, leaves, attendance, org, reports, settings
│  │  └─ api/
│  │     ├─ auth/[...nextauth]
│  │     ├─ zalo/webhook          # nhận sự kiện Zalo Bot
│  │     ├─ mcp/route.ts          # MCP Streamable HTTP endpoint
│  │     ├─ webhooks/outbound     # đăng ký webhook ra ngoài
│  │     └─ cron/[job]            # trigger job (bảo vệ bằng CRON_SECRET)
│  ├─ server/
│  │  ├─ modules/                 # org, task, leave, workflow, attendance, report, notify
│  │  │   └─ <module>/{service.ts, repository.ts, dto.ts, policy.ts}
│  │  ├─ auth/                    # session, guard, permission check, data-scope filter
│  │  ├─ workflow/                # engine: resolver, evaluator, runner
│  │  ├─ notify/                  # channel adapters (zalo-bot, in-app, email)
│  │  ├─ mcp/                     # tool registry, auth, mapping sang service layer
│  │  └─ jobs/                    # scheduler: reminder, digest, SLA, rollup
│  ├─ components/ui/              # design system Tailwind (Button, Table, Dialog, Tree…)
│  └─ lib/                        # prisma client, crypto, date, excel, pdf, validation
├─ scripts/setup.ts               # CLI wizard cài đặt
├─ docker-compose.yml             # mysql:8 + app, chạy 1 lệnh
└─ .env.example
```

**Luồng xử lý chuẩn:** `Server Action / Route Handler` → `policy.ts` (kiểm tra permission + data scope) → `service.ts` (business rule, transaction) → `repository.ts` (Prisma) → phát `DomainEvent` → `notify` + `audit`.
Tách services khỏi HTTP giúp **MCP tool, Zalo command và UI dùng chung một tầng nghiệp vụ** — không nhân bản logic.

**Thư viện chính:** Auth.js v5 (credentials + JWT), zod, react-hook-form, TanStack Query + Table, recharts, date-fns, exceljs, @react-pdf/renderer, @modelcontextprotocol/sdk, argon2, node-cron.

---

## 3. Mô hình dữ liệu (Prisma → MySQL 8)

### 3.1 Tổ chức & phân quyền
```
Department   id, code, name, parentId→Department, path("/1/4/9/"), level, sortOrder,
             managerId→Employee, phone, email, costCenter, isActive, description
Position     id, code, name, rankLevel   # dùng cho định tuyến duyệt theo cấp bậc
Employee     id, code, fullName, email, phone, zaloUserId, avatarUrl,
             departmentId, positionId, managerId→Employee, joinDate, leaveDate,
             employmentType, status, workShiftId, gender, dob
User         id, employeeId(1-1), username, passwordHash, isActive, lastLoginAt,
             mustChangePassword, locale, theme
Role         id, code, name, isSystem, dataScope(ALL|DEPT_TREE|DEPT|SELF|CUSTOM), sortOrder
Permission   code(PK), name, group, category(MENU|FEATURE), sortOrder
RolePermission(roleId, permissionCode)   UserRole(userId, roleId)
RoleDeptScope(roleId, departmentId)      # cho dataScope = CUSTOM
```
**Cây phòng ban:** `parentId` + `path`/`level` materialized. Truy vấn nhánh con bằng `path LIKE '/1/4/%'` (index prefix, rất nhanh) hoặc `WITH RECURSIVE` của MySQL 8 khi cần cây đầy đủ. Service `moveDepartment()` cập nhật lại `path` toàn nhánh trong transaction và chặn vòng lặp. Đây là bản nâng cấp của mô hình phẳng trong project tham khảo, cộng thêm phân cấp quản lý qua `Employee.managerId` (giống `get_profile_hierarchy` bên đó).

**Data scope:** mọi truy vấn danh sách đi qua helper `scopeFilter(user, 'departmentId')` sinh điều kiện Prisma tương ứng: toàn bộ / cây phòng ban của mình / đúng phòng ban / chỉ bản thân / danh sách tùy chọn.

### 3.2 Công việc
```
Task           id, code(TSK-2026-0001), title, description, departmentId, projectId?,
               creatorId, assigneeId, reviewerId, parentTaskId, priority, status,
               startDate, dueDate, completedAt, progress, estimateHours, actualHours,
               isRecurring, recurrenceRule(RRULE), tags, source(WEB|ZALO|MCP|IMPORT)
TaskWatcher / TaskChecklistItem / TaskComment / TaskAttachment / TaskTimeLog
TaskActivity   # audit: ai đổi gì, khi nào
TaskReminder   taskId, offsetMinutesBeforeDue | cronExpr, channels(JSON), targets, isActive
```
Trạng thái: `TODO → IN_PROGRESS → REVIEW → DONE`, kèm `BLOCKED`, `CANCELLED`.

### 3.3 Nghỉ phép
```
LeaveType      code, name, defaultDaysPerYear, isPaid, requiresAttachment,
               minAdvanceDays, maxConsecutiveDays, allowHalfDay, deductsBalance,
               workflowDefinitionId?, color, isActive, sortOrder
LeaveBalance   employeeId, year, standardDays, bonusDays, carriedOverDays,
               usedDays, pendingDays, remainingDays(computed), note   @@unique
LeaveRequest   code, employeeId, leaveTypeId, startDate, endDate, totalDays,
               durationType(FULL|AM|PM), reason, attachmentUrl, handoverToId,
               status(DRAFT|PENDING|APPROVED|REJECTED|CANCELLED),
               workflowInstanceId, submittedAt, closedAt
LeaveRequestDay  requestId, date, portion(1.0|0.5)   # phục vụ lịch nghỉ & chấm công
Holiday        date, name, isPaid, year
```
Quy tắc tính: trừ ngày lễ + ngày nghỉ theo `WorkShift`; nửa ngày = 0.5; `pendingDays` giữ chỗ khi nộp, chuyển sang `usedDays` khi duyệt xong, hoàn lại khi từ chối/hủy — thực hiện trong transaction có khóa hàng balance.

### 3.4 Workflow engine (dùng chung)
```
WorkflowDefinition  code, name, entityType(LEAVE|OT|TASK_CLOSE|ATTENDANCE_ADJUST),
                    version, isActive, appliesToJson  # điều kiện áp dụng: phòng ban, loại phép
WorkflowStep        definitionId, order, name,
                    approverType(DIRECT_MANAGER|DEPT_HEAD|DEPT_HEAD_OF_LEVEL|ROLE|POSITION|
                                 SPECIFIC_USER|HR|REQUESTER_MANAGER_CHAIN),
                    approverRefJson, mode(SEQUENTIAL|PARALLEL_ALL|PARALLEL_ANY),
                    conditionJson  # vd: {"field":"totalDays","op":">","value":3}
                    slaHours, allowDelegate, skipIfSameAsRequester, onRejectAction
WorkflowInstance    definitionId, entityType, entityId, status, currentStepOrder, startedAt
ApprovalTask        instanceId, stepId, approverId, status(PENDING|APPROVED|REJECTED|SKIPPED|
                    DELEGATED|EXPIRED), actedAt, comment, delegatedFromId, dueAt
WorkflowLog         instanceId, actorId, action, fromStatus, toStatus, payloadJson, createdAt
```
Engine gồm 3 phần: **resolver** (biến `approverType` thành danh sách người thật, leo cây `managerId`/`Department.managerId`), **evaluator** (chạy `conditionJson` để bỏ qua/chèn bước), **runner** (chuyển bước, phát sự kiện `ApprovalRequested` / `RequestApproved` / `RequestRejected`).
UI cấu hình: danh sách bước dạng bảng kéo thứ tự, mỗi bước là một form (loại người duyệt, điều kiện, SLA). Có nút **mô phỏng** — chọn một nhân sự + loại đơn để xem trước chuỗi người duyệt thực tế.

### 3.5 Chấm công
```
WorkShift          code, name, startTime, endTime, breakMinutes, lateToleranceMin,
                   workDays(bitmask), standardHours
OfficeLocation     name, lat, lng, radiusMeters, isActive          # geofence
AttendanceRecord   employeeId, workDate, checkInAt, checkOutAt, shiftId,
                   source(WEB|ZALO|IMPORT|MANUAL), checkInLat/Lng, checkInAddress,
                   checkOutLat/Lng, deviceInfo, lateMinutes, earlyLeaveMinutes,
                   workedMinutes, otMinutes, status(PRESENT|LATE|ABSENT|LEAVE|HOLIDAY|WFH|HALF),
                   note, editedById, editedAt      @@unique(employeeId, workDate)
AttendanceImportBatch  fileName, importedById, rowCount, okCount, errorCount, logJson
AttendanceAdjustment   recordId, requestedById, reason, proposedJson, workflowInstanceId, status
```
Job hằng đêm `attendanceRollup`: tạo bản ghi cho ngày làm việc còn thiếu, đánh dấu `LEAVE` theo `LeaveRequestDay` đã duyệt, `HOLIDAY` theo bảng ngày lễ, `ABSENT` cho phần còn lại, tính phút muộn/về sớm/OT.

### 3.6 Thông báo, hệ thống, MCP
```
NotificationTemplate  code, channel(ZALO|IN_APP|EMAIL), title, bodyTemplate, variablesJson, isActive
NotificationOutbox    channel, recipientEmployeeId, zaloUserId, templateCode, payloadJson,
                      status(PENDING|SENT|FAILED|SKIPPED), attempts, sendAfter, sentAt, error
NotificationLog / InAppNotification(userId, title, body, link, readAt)
SystemSetting         key, valueJson, group, isSecret     # zalo.botToken, zalo.webhookSecret…
McpClient             name, keyHash, keyPrefix, scopesJson, actAsUserId, rateLimitPerMin,
                      allowedIps, lastUsedAt, expiresAt, isActive
OutboundWebhook       name, url, events(JSON), secret, isActive, lastStatus
AuditLog              actorId, entityType, entityId, action, diffJson, ip, userAgent, createdAt
ReportPreset / ReportSchedule / ReportSnapshot
FileAsset             path, mime, size, uploadedById, entityType, entityId
```
Secret (bot token, webhook secret, MCP key) mã hóa AES-256-GCM bằng `APP_ENCRYPTION_KEY`; MCP key chỉ lưu hash + prefix để hiển thị.

---

## 4. Tự cài đặt (code-first setup)

Ba đường vào, cùng một lõi `scripts/setup.ts`:

1. **`npm run setup`** — wizard CLI: hỏi thông tin MySQL → kiểm tra kết nối → `CREATE DATABASE IF NOT EXISTS` (mysql2, charset `utf8mb4`) → ghi `.env` → `prisma migrate deploy` → seed → hỏi tài khoản admin.
2. **Web installer `/install`** — khi chưa có admin: form 3 bước (kết nối DB → thông tin công ty → tài khoản admin), có nút *Test connection*, chạy migrate + seed qua Prisma programmatic API, sau đó tự khóa route lại.
3. **`docker compose up`** — dịch vụ `mysql:8` + `app`; entrypoint chờ MySQL healthy rồi `migrate deploy && seed && next start`. Chạy được ngay không cần cài MySQL trên máy.

**Seed mặc định:** danh mục ~60 permission (MENU_*/FEATURE_*), 4 role hệ thống (ADMIN / HR / MANAGER / EMPLOYEE) kèm data scope, cây phòng ban mẫu 3 cấp, 6 loại phép (Phép năm, Ốm, Không lương, Thai sản, Chế độ, Công tác), ngày lễ VN năm hiện tại, ca hành chính 8:00–17:30, 1 workflow nghỉ phép mặc định (Quản lý trực tiếp → HR, thêm bước Giám đốc nếu > 3 ngày), mẫu thông báo Zalo, tài khoản admin.
Seed viết **idempotent** (`upsert` theo `code`) để chạy lại an toàn sau mỗi lần nâng cấp.

---

## 5. Tích hợp Zalo Bot

**Cấu hình** (Cài đặt → Zalo Bot): bot token, webhook secret, bật/tắt từng loại thông báo, giờ im lặng (không gửi 22:00–07:00), nút *Gửi tin thử*. Hiển thị URL webhook để dán vào trang quản trị bot.

**Liên kết tài khoản:** nhân sự bấm "Liên kết Zalo" trên web → nhận mã 6 ký tự (hết hạn 10 phút) → nhắn `/lienket ABC123` cho bot → hệ thống lưu `Employee.zaloUserId`. Không có `zaloUserId` thì thông báo tự rơi về in-app.

**Thông báo đẩy ra (qua outbox + retry lũy tiến):**
- Giao việc mới / bị đổi người phụ trách / task bị chặn.
- Nhắc việc: trước hạn theo cấu hình (mặc định T-24h và 8:00 sáng ngày đến hạn), cảnh báo quá hạn hằng ngày.
- Đơn nghỉ phép mới → người duyệt ở bước hiện tại; nhắc lại khi quá SLA.
- Kết quả duyệt/từ chối → người nộp + người bàn giao công việc.
- Tổng hợp buổi sáng 8:00 cho quản lý: việc quá hạn, đơn chờ duyệt, ai nghỉ hôm nay.

**Lệnh chat vào:** `/viec` (việc của tôi), `/xong TSK-xxx`, `/nghi` (quỹ phép), `/xinnghi` (gửi link form), `/duyet` (danh sách chờ + `/duyet LR-xxx ok|no <lý do>`), `/checkin`, `/checkout`, `/baocao`, `/help`.
Webhook `/api/zalo/webhook`: xác thực chữ ký/secret → chống trùng theo `messageId` → đẩy vào hàng đợi xử lý → trả 200 nhanh. Mọi lệnh đều đi qua đúng tầng permission như trên web.

> Lưu ý: khả năng của Zalo Bot API (định dạng webhook, inline keyboard, giới hạn tần suất) cần kiểm chứng lại với tài liệu hiện hành ở đầu Phase 5. Toàn bộ code gọi Zalo nằm sau interface `NotificationChannel`, nên nếu phải đổi sang OA chỉ thay một adapter.

---

## 6. MCP Server

Endpoint **`/api/mcp`** (Streamable HTTP, `@modelcontextprotocol/sdk`), xác thực `Authorization: Bearer <mcp key>` → tra `McpClient` → chạy dưới danh tính `actAsUserId` với đầy đủ permission + data scope (client MCP **không** vượt quyền người dùng nó đại diện).

**Tools dự kiến:** `search_employees`, `get_department_tree`, `list_tasks`, `get_task`, `create_task`, `update_task_status`, `add_task_comment`, `get_leave_balance`, `list_leave_requests`, `submit_leave_request`, `list_pending_approvals`, `approve_request`, `attendance_summary`, `run_report`.
**Resources:** mô tả schema dữ liệu, danh mục phòng ban/loại phép để AI tự khám phá. **Prompts:** mẫu câu hỏi thường dùng.

Mọi tool gọi thẳng service layer ở §2 nên không lệch nghiệp vụ so với UI. Hành động ghi (`create_task`, `approve_request`) ghi `AuditLog` với `source=MCP` và có thể bật chế độ *chỉ đọc* cho từng key.

**UI quản lý** (Cài đặt → Tích hợp): tạo/thu hồi MCP key (chỉ hiện đầy đủ 1 lần), chọn scope + user đại diện, giới hạn IP/tần suất, xem nhật ký gọi gần nhất; đăng ký `OutboundWebhook` theo sự kiện kèm nút gửi thử.

---

## 7. Báo cáo

- **Chấm công:** bảng công tháng (nhân sự × ngày), tổng giờ làm/muộn/về sớm/OT, tỷ lệ đi muộn theo phòng ban, xuất Excel đúng mẫu chấm công.
- **Nghỉ phép:** quỹ phép còn lại toàn công ty, đơn theo loại/tháng/phòng ban, lịch nghỉ dạng calendar, cảnh báo phép sắp hết hạn cuối năm.
- **Công việc:** hoàn thành đúng hạn / trễ hạn, khối lượng theo người và phòng ban, thời gian trung bình xử lý, burndown theo tuần.
- **Tổng hợp quản lý:** dashboard theo cây phòng ban, tự cộng dồn từ phòng ban con lên.
- **Kỹ thuật:** report builder chọn chiều/chỉ số/bộ lọc → lưu `ReportPreset` → xuất Excel (exceljs) / PDF (@react-pdf/renderer) → `ReportSchedule` gửi định kỳ qua Zalo/email. Aggregate bằng SQL thô trên view khi cần hiệu năng.

---

## 8. Lộ trình triển khai

| Phase | Nội dung | Kết quả kiểm chứng được | Ước lượng |
|---|---|---|---|
| **0** | Scaffold Next 15 + Tailwind 4 + Prisma; docker-compose; `npm run setup`; `/install`; Auth.js đăng nhập; layout + design system | `docker compose up` → login được bằng admin vừa tạo | 2–3 ngày |
| **1** | Phòng ban phân cấp (tree UI, kéo thả, di chuyển nhánh), chức danh, nhân sự, tài khoản, Role/Permission matrix + data scope, menu động theo quyền | Tạo cây 3 cấp, gán quyền, user thường chỉ thấy dữ liệu phòng mình | 4–5 ngày |
| **2** | Module công việc: CRUD, subtask, checklist, bình luận, file, bộ lọc, bảng + kanban, audit | Giao việc, đổi trạng thái, lọc theo phòng ban/người | 4–5 ngày |
| **3** | Workflow engine + module nghỉ phép: loại phép, quỹ phép, đơn từ, duyệt đa bước, UI cấu hình workflow + mô phỏng, lịch nghỉ | Đơn 2 ngày đi 2 bước, đơn 5 ngày tự chèn bước Giám đốc | 5–7 ngày |
| **4** | Chấm công: ca làm việc, geofence, check-in web, import Excel máy chấm công, HR chỉnh sửa (có duyệt), job rollup hằng đêm | Bảng công tháng khớp với đơn nghỉ đã duyệt | 4–5 ngày |
| **5** | Notification engine (outbox + retry) và Zalo Bot: liên kết tài khoản, thông báo đẩy, lệnh chat, `/checkin` | Nhận tin giao việc và duyệt đơn ngay trong Zalo | 4–5 ngày |
| **6** | MCP server + quản lý API key + outbound webhook | Kết nối Claude tới `/api/mcp`, hỏi "ai nghỉ tuần này" ra đúng dữ liệu | 3–4 ngày |
| **7** | Báo cáo + dashboard + export Excel/PDF + lịch gửi báo cáo | Xuất bảng công tháng và báo cáo task đúng số liệu | 4–5 ngày |
| **8** | Hardening: audit log đầy đủ, rate limit, test (vitest cho engine/quyền/tính phép, Playwright smoke), tài liệu vận hành, backup | Bộ test xanh, có hướng dẫn cài đặt & vận hành | 3–4 ngày |

Tổng khoảng **7–9 tuần** làm tuần tự. Phase 0–3 là lõi dùng được ngay; 4–7 mở rộng.

---

## 9. Bảo mật & chất lượng

- Mật khẩu băm argon2id; session JWT httpOnly + SameSite; bắt đổi mật khẩu lần đầu.
- Kiểm tra quyền **ở server** cho mọi Server Action / API; UI ẩn nút chỉ là lớp phụ.
- Webhook Zalo: xác thực secret, chống replay theo `messageId`, rate limit theo IP.
- MCP key: hash lưu trữ, scope tối thiểu, hạn dùng, nhật ký gọi, thu hồi tức thì.
- Secret trong DB mã hóa AES-256-GCM; không log token; không đưa dữ liệu cá nhân lên query string.
- `AuditLog` cho mọi thao tác ghi nhạy cảm (duyệt, sửa công, đổi quyền, đổi cấu hình).
- Test: unit cho workflow resolver/evaluator, tính ngày phép, data-scope filter; e2e smoke luồng nghỉ phép và giao việc; seed DB riêng cho test.

## 10. Rủi ro & cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Zalo Bot API đổi/hạn chế tần suất | Adapter `NotificationChannel` + outbox retry; fallback in-app; có sẵn đường nâng cấp sang OA |
| Workflow cấu hình sai gây kẹt đơn | Nút mô phỏng trước khi lưu; ADMIN có quyền cưỡng chế chuyển bước; log đầy đủ |
| Di chuyển nhánh phòng ban làm hỏng `path` | Cập nhật trong transaction, chặn vòng lặp, có job kiểm tra tính toàn vẹn cây |
| Định dạng file máy chấm công khác nhau | Trình ánh xạ cột khi import + xem trước + báo lỗi theo dòng, lưu `ImportBatch` để rollback |
| Sai lệch quỹ phép khi duyệt đồng thời | Transaction + khóa hàng balance; job đối soát lại hằng đêm |
