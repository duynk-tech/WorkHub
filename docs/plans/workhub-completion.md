# Kế hoạch hoàn thiện WorkHub

Ngày bắt đầu: 2026-09-27. Phạm vi được người dùng yêu cầu: bảo mật (bao gồm AI Agent và Zalo), Google SSO, Settings theo tab, mua/bán/kho/công nợ/doanh số, Công việc, HR, phê duyệt và UI.

## Nguyên tắc triển khai

- Giữ nguyên thay đổi chưa commit của người dùng; không reset hay ghi đè chúng.
- Mỗi bước có kiểm tra hồi quy và ghi kết quả thực tế tại tài liệu này.
- Chứng từ đã ghi nhận phải điều chỉnh/đảo có truy vết; không tự sửa dữ liệu lịch sử.
- Không chạy seed, reset hoặc migration dữ liệu thật trong quá trình kiểm thử.
- Quyền và phạm vi dữ liệu được kiểm tra tại server ở mọi kênh Web, MCP, AI và Zalo.
- Các mục dưới đây là backlog đã thống nhất về phạm vi; chỉ đánh dấu hoàn thành sau khi kiểm chứng.

## 1. Bảo mật nền tảng và tích hợp — đang thực hiện

- [ ] Đăng nhập: redirect nội bộ, session, khóa tài khoản, nghỉ việc, thu hồi phiên khi đổi/reset mật khẩu.
- [ ] Settings: allowlist key theo nhóm, schema validation, quyền đọc/ghi, mã hóa secret, audit đã che dữ liệu nhạy cảm.
- [ ] Zalo: bắt buộc webhook secret, chặn phát lại, giới hạn payload, liên kết dùng một lần, tài khoản hoạt động, bảo vệ lịch sử trò chuyện.
- [ ] AI Agent: quyền công cụ tại thời điểm thực thi, giới hạn thao tác ghi, không tự cấp quyền cho người chưa có tài khoản, không thực thi JavaScript tùy ý trên server.
- [ ] Custom HTTP tools: chặn SSRF/redirect nội bộ, giới hạn response/timeout, bảo vệ secret, schema tham số, quyền sử dụng từng công cụ.
- [ ] Rà MCP/OpenAPI, upload/media, cron, setup, webhook outbound, dependency và security headers.
- [ ] Test âm: giả mạo context, tài khoản khóa/nghỉ việc, webhook thiếu secret/trùng sự kiện, công cụ vượt quyền, URL nguy hiểm.

## 2. Mua — bán — kho — công nợ

- [ ] Lưu chi tiết phân bổ thu/chi vào đơn; đảo đúng phân bổ gốc; quản lý cọc/dư tiền.
- [ ] Transaction cho phiếu tiền, đơn, trả hàng và kho; chống request trùng và cạnh tranh đồng thời.
- [ ] Thống nhất công thức công nợ NCC/khách, trừ hàng trả, kiểm tra chủ sở hữu chứng từ.
- [ ] Trả hàng theo lượng đã giao trừ lượng đã trả; giới hạn hoàn tiền; đảo kho khi hủy.
- [ ] State machine đơn mua/bán; không sửa tự do đơn đã nhập/xuất/thu/chi.
- [ ] Nhận/giao từng đợt, kiểm hàng, trả NCC, giữ tồn, tồn khả dụng, serial và bàn giao.
- [ ] Danh mục NCC, chi phí bên thứ ba, tỷ giá và phân bổ giá vốn từng lần nhập.
- [ ] Phiên bản báo giá, duyệt giá/chiết khấu, hạn mức công nợ, luồng thuê/ký gửi/dịch vụ.

## 3. Báo cáo và điều hành

- [ ] Phân biệt giá trị đơn, doanh thu quản trị, VAT, doanh thu thuần, tiền thu, công nợ và lãi gộp.
- [ ] Giá vốn lịch sử từ chứng từ xuất; nhập giá mới không sửa lợi nhuận kỳ cũ.
- [ ] Tồn cuối kỳ theo thời điểm; tiền thu theo ngày phiếu; hàng trả theo ngày phát sinh.
- [ ] Một tầng tổng hợp dùng chung Dashboard/Bán hàng/Khách hàng/Báo cáo; drill-down chứng từ.
- [ ] Đối soát tiền/kho/đơn; tuổi nợ, PO trễ, đơn chậm giao, tồn lâu và người phụ trách kinh doanh.

## 4. Công việc và phê duyệt

- [ ] Thống nhất status/progress/completedAt; checklist thêm/xóa/toggle tính lại tiến độ.
- [ ] Validate ngày, trạng thái, người nhận và vòng lặp cha-con; transaction cập nhật.
- [ ] Nghiệm thu theo reviewer; lý do bị chặn; mở lại có lịch sử.
- [ ] Giới hạn tổng giờ/ngày; sửa/hủy time log; việc lặp/mẫu và bàn giao.
- [ ] Liên kết việc với khách/đơn/máy/bảo trì; báo cáo đúng hạn và khối lượng.
- [ ] Workflow chống duyệt lặp/tự duyệt trái chính sách; ủy quyền, phiên bản, SLA và chuyển cấp.

## 5. Nhân sự — nghỉ phép — chấm công

- [ ] Vòng đời nhân sự: tiếp nhận/thử việc/chính thức/điều chuyển/nghỉ việc/bàn giao.
- [ ] Lịch sử phòng ban/chức danh/quản lý/ca có ngày hiệu lực; hồ sơ/hợp đồng và quyền riêng tư.
- [ ] Đồng bộ khóa quyền Web/SSO/MCP/Zalo; bàn giao việc, tài sản và phê duyệt.
- [ ] Phép qua năm, trùng nửa ngày, giữ chỗ đồng thời, duyệt/hủy idempotent; tính lại công khi hủy phép.
- [ ] Ca qua đêm, công ngày lễ/cuối tuần, nghỉ nửa ngày, không tạo vắng trước ngày vào làm.
- [ ] Tách giờ có mặt/công hợp lệ/OT duyệt; bổ sung công, công tác, import chống trùng.
- [ ] Khóa bảng công tháng, mở lại có quyền/lý do, giữ dữ liệu gốc và xuất đầu vào tính lương.

## 6. Google SSO và Settings

- [ ] Google OIDC: state/nonce/PKCE, xác minh token, liên kết bằng sub, tài khoản đã cấp và đang hoạt động.
- [ ] Settings SSO: enable/client ID/secret mã hóa/callback/domain Workspace/test/hướng dẫn.
- [ ] Liên kết lần đầu phải xác thực tài khoản WorkHub; không tự tạo nhân sự hoặc cấp vai trò.
- [ ] Tabs: Công ty, Giao diện, Chứng từ, SSO, Zalo, Nghỉ phép, Ca, Ngày lễ, Báo cáo, Dữ liệu.
- [ ] Tách component, quyền server, URL/Back/Forward, dirty state, loading/error; hợp nhất cấu hình trùng.

## 7. UI và nghiệm thu toàn hệ thống

- [ ] Label ngắn, tiếng Việt thống nhất; giải thích ở hint, nút có tên rõ.
- [ ] Desktop/mobile, dark/light, bàn phím, focus, bảng rộng/modal/tên dài.
- [ ] Empty/loading/error/success nhất quán; chống submit lặp; không mất dữ liệu khi đổi tab.
- [ ] Kiểm thử TypeScript/build/unit/integration; browser smoke theo vai trò và các luồng chính.
- [ ] Tài liệu triển khai, cấu hình, migration và giới hạn được kiểm chứng.

## Ngoài đợt nền tảng

Tính lương đầy đủ, bảo hiểm/thuế, tuyển dụng, KPI/hoa hồng chuyên sâu cần bộ quy tắc nghiệp vụ riêng trước khi triển khai.

## Nhật ký thực hiện

- 2026-09-27: Lưu kế hoạch tổng; bắt đầu bảo mật AI/Zalo và xác thực. Workspace có thay đổi sẵn ở các màn nghiệp vụ và kho; giữ nguyên.

### Bước 1A — thay đổi đã triển khai, đang nghiệm thu

- Zalo từ chối webhook chưa có secret; không nhận secret qua URL; giới hạn body 256 KiB, 20 tin/batch, 8.000 ký tự/tin; không thực thi khi claim sự kiện trùng hoặc lỗi.
- AI/Zalo/MCP không bỏ qua trạng thái tài khoản khóa/vô hiệu hóa hoặc nhân sự nghỉ việc; bỏ context quyền mặc định cho người chưa có tài khoản.
- AI chỉ gọi tool nằm trong danh sách được phép và qua kiểm tra đầy đủ; mặc định chỉ đọc (`AI_AGENT_ALLOW_WRITES=false`). Custom Tools chỉ dành cho admin.
- Vô hiệu hóa JavaScript tùy ý. HTTP tools/LLM dùng HTTPS, allowlist origin tại deployment, kiểm tra IP/DNS, pin IP cho kết nối TLS, không theo redirect, giới hạn response và timeout.
- Custom Tool credentials mã hóa khi lưu; cấu hình nội bộ không được trả qua Settings thông thường. Dữ liệu cũ được mã hóa ở lần lưu tiếp theo, chưa tự migration.
- Settings chặn key ngoài nhóm, validate giá trị, cập nhật cùng audit trong transaction; bảo vệ dữ liệu trang tích hợp theo quyền.
- Tách helper nghiệp vụ nghỉ phép khỏi Server Actions công khai: client không được truyền AuthContext hoặc gọi helper finalize trực tiếp.
- Session gắn phiên bản thông tin xác thực; đổi/reset mật khẩu vô hiệu phiên cũ. Sau triển khai người dùng phải đăng nhập lại vì cookie cũ chưa có version.
- Sửa redirect đăng nhập; sửa Permissions-Policy cho phép GPS cùng origin để chấm công hoạt động.

Giới hạn còn phải giải quyết: hàng đợi webhook bền vững/retry và rate limit phân tán; xác nhận thao tác ghi AI theo từng hành động; thu hồi MCP OAuth khi reset mật khẩu; phạm vi dữ liệu từng MCP tool; migration secret cũ; audit/log retention và các hạng mục bảo mật còn lại ở bước 1.

### Bước 1B / 6 — SSO và Settings

- Đã thêm migration ExternalIdentity, Google authorization-code flow với PKCE/state/nonce, xác minh ID token bằng jose/JWKS và kiểm tra Workspace.
- Liên kết Google qua mật khẩu hiện tại trong Hồ sơ cá nhân; không tự ghép email/cấp quyền; audit liên kết/đăng nhập/hủy liên kết.
- Settings có tab SSO và các tab Công ty/Giao diện/Chứng từ/Bán hàng/Dữ liệu tách từ tab Chung; trạng thái chưa lưu, tab cuộn ngang và Back/Forward.
- Đã có tài liệu `docs/google-sso.md`; chưa chạy migration vào DB đang cấu hình và chưa kiểm thử OAuth thật.
- Dependency đã được cập nhật/override có kiểm tra tương thích: Vitest 5 (Node >=22.12), PostCSS 8.5.28, deepmerge-ts 8, uuid 11. Npm audit sau cập nhật báo 0 lỗ hổng đã biết.

### Bước 2A — phân bổ tiền và an toàn tồn kho

- Thêm bảng phân bổ phiếu thu/chi theo đơn và `allocationVersion`; phiếu mới lưu chính xác từng khoản phân bổ, không vượt dư nợ. Phần dư được trả về dưới dạng `unappliedAmount`; UI quản lý/tái phân bổ cọc còn phải làm.
- Đảo phiếu mới theo phân bổ đã lưu, trong transaction Serializable; phiếu tổng hợp cũ thiếu phân bổ bị chặn để đối soát, không suy đoán đơn cần trừ tiền. Hiện vẫn xóa phiếu sau audit đảo; mô hình chứng từ void bất biến còn trong backlog.
- Công nợ NCC dùng cùng cơ sở chi phí khi phân bổ; công nợ khách tính phần hàng trả.
- Cập nhật đơn bán và chi tiết cùng transaction; chặn sửa đơn đã xuất kho/thu tiền/trả hàng, chặn đổi khách.
- Phiếu kho từ chối số lượng không nguyên dương hoặc dòng mặt hàng trùng. Trừ tồn có điều kiện `quantity >= quantityRequested`; duyệt phiếu có claim trạng thái trong transaction để chống duyệt trùng.
- Chưa hoàn tất: idempotency key cho toàn bộ chứng từ, vòng đời đơn/hủy/trả hàng, bảo vệ xóa đơn, giá vốn lịch sử và số tiền thu Dashboard theo ngày phiếu.

### Bước 4A — Công việc

- Thống nhất status/progress/completedAt; hoàn thành phải qua quyền nghiệm thu, checklist và công việc con. Web/MCP/Zalo dùng chung helper chuyển trạng thái.
- Mở lại xóa completedAt; checklist thêm/xóa/toggle tính lại tiến độ và chặn sửa trên việc đóng.
- Validate enum, khoảng ngày, thời lượng, tự tham chiếu cha; time log kiểm tra tổng không quá 24 giờ/ngày trong transaction.
- Chưa hoàn tất: vòng lặp cha-con nhiều cấp, phạm vi người nhận đầy đủ, sửa/hủy time log, mẫu/việc lặp, bàn giao và workflow SLA.

### Bước 5A — HR/nghỉ phép/chấm công

- Validate nửa ngày và chính sách loại phép; hai nửa ngày khác buổi được phép cùng ngày. Kiểm tra trùng và quỹ phép lại trong transaction Serializable khi gửi.
- Duyệt/hủy dùng điều kiện trạng thái để tránh trừ/cộng quỹ lặp; tính lại công khi hủy thay vì xóa bản ghi chấm công.
- Đơn qua năm hiện yêu cầu tách theo từng năm; tự phân bổ quỹ qua năm chưa triển khai.
- Tính ca qua đêm, quy ngày công cho check-in sau nửa đêm và tìm bản ghi ca trước khi check-out muộn; giữ giờ có mặt ngày lễ nhưng không tự coi toàn bộ là OT duyệt.
- Nghỉ nửa ngày điều chỉnh giờ kỳ vọng; tổng hợp công theo ngày vào/nghỉ việc. Chưa có lịch sử ca theo ngày hiệu lực, quy trình duyệt OT hoặc khóa bảng công tháng.

### Triển khai và giới hạn kiểm chứng

- Hai migration mới: `20260927010000_google_sso`, `20260927020000_payment_allocations`. Đã generate Prisma Client và cập nhật version cache dev; **chưa áp dụng migration vào DB đang cấu hình**.
- Cần backup và kiểm tra migration trên bản sao DB trước khi chạy `npm run db:deploy` trong quy trình triển khai. Mã mới truy vấn bảng/cột phân bổ nên phải triển khai cùng schema tương ứng.
- Test cạnh tranh hiện dùng transaction mock để kiểm tra các điều kiện bảo vệ; chưa chứng minh hành vi khóa/deadlock bằng nhiều kết nối MySQL thật.
- Chưa nghiệm thu OAuth Google thật, Zalo OA thật hoặc browser theo từng vai trò. Không coi toàn bộ backlog đã hoàn thành.

Kết quả kiểm tra cuối đợt 2026-09-27: **426 tests / 56 files đạt**, `tsc --noEmit` đạt, production build đạt, `npm audit` báo **0 lỗ hổng đã biết**. Đây là kiểm tra mã/build, không thay thế nghiệm thu database và dịch vụ thật nêu trên.

### Triển khai local và seed demo — 2026-09-27

- Tạo bản dump DB trước khi thay schema tại `backups/workhub-before-migrations-2026-09-27T00-43-58.827Z.sql` (thư mục backup đã được thêm vào `.gitignore`).
- Đã chạy `prisma migrate deploy` trên DB local; cả migration Google identity và phân bổ thanh toán hoàn tất, `prisma migrate status` báo schema hiện hành.
- Docker entrypoint nay dừng nếu migration lỗi; bỏ `prisma db push` khỏi quá trình boot để tránh đồng bộ schema ngoài migration.
- Thêm `npm run db:seed:business-demo`: khách/kho/mặt hàng/PO/đơn bán/phiếu kho/thu chi, mã `DEMO-`, receipt và supplier payment có allocation. Dùng transaction khi ghi tồn và phân bổ; có thể chạy lại; mặc định chặn `NODE_ENV=production`.
- Thêm `npm run db:seed:hr-demo` với yêu cầu `CONFIRM_DEMO_HR_OVERWRITE=YES`; cập nhật nhân sự demo NV001–NV014, nhiệm vụ, 30 ngày công, phép và duyệt. Chuẩn hóa ngày chấm công và bỏ xung đột upsert trên MariaDB.
- Không import `prisma/seed/index.ts` như entrypoint khi gọi từ script khác; entrypoint giờ chỉ chạy khi trực tiếp gọi index.
- Seed đã chạy trên local DB: 2 khách, 3 mặt hàng, 2 PO, 2 đơn bán, 4 phiếu kho, 2 phiếu thu, 2 phiếu chi; tồn 17/10/6. Hai đơn bán và hai PO đều khớp số tiền đã ghi sổ với tổng phân bổ.
- HR demo đã chạy: 14 hồ sơ demo, 410 bản ghi chấm công, một đơn nghỉ riêng của seed mới và hai Công việc; dữ liệu seed HR/F&B hiện hành cũng đã nạp. Chạy lại seed kiểm tra được tính ổn định và không lỗi unique.
- Xác minh: migration deploy thành công, build production thành công, `tsc` qua; GET `/` chuyển 307 tới `/login`, GET `/login` trả 200. Không kết nối Google OAuth/Zalo thật.

Ghi chú: DB local ban đầu có dữ liệu demo nghiệp vụ sẵn, trong đó 14 nhân sự mã NV001–NV014 có hồ sơ tên/phòng ban khớp bộ demo trong repository. Seed HR đã được chạy theo đúng guard xác nhận; không chạy `clean`, `db:reset` hoặc truncate dữ liệu thật.

### Clear & seed demo local — 2026-09-27

- Người dùng yêu cầu rõ làm sạch và nạp bộ demo mới. Trước đó đã kiểm tra bảng, xác nhận DB local và tạo bản backup `backups/workhub-before-clear-demo-2026-09-27T03-19-12.101Z.sql`.
- Migration status up to date; không chạy lại migration trong hành động Clear vì deployment đã quản lý qua `prisma migrate deploy`.
- Sửa `cleanBusinessData` để xóa bảng allocation thu/chi, MCP clients và Google identities trước user/chứng từ cha; tránh orphan khi tắt foreign-key checks và TRUNCATE.
- Đã chạy `npm run db:seed:clean` thành công; giữ tài khoản ADMIN và SystemSetting theo thiết kế; nạp lại nhân sự demo, 8 tasks, chấm công, phép, thiết bị F&B, khách, kho, báo giá, đơn hàng và phiếu kho.
- Tiếp đó chạy `npm run db:seed:business-demo`: thêm 2 khách, 3 mặt hàng riêng, 2 PO, 2 đơn bán, phiếu nhập/xuất và phiếu thu/chi có allocation.
- Admin/password được bảo toàn; không đổi về `Workhub@123`. Bản seed in thông tin đăng nhập mặc định dù tài khoản ADMIN tồn tại là gây hiểu lầm; không sử dụng dòng đó làm password hiện tại.
