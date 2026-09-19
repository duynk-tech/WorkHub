# Sổ tay vận hành WorkHub

## Kiểm tra sức khỏe hệ thống

```bash
curl -s http://localhost:3000/api/health
# {"ok":true,"database":"up","time":"..."}
```

## Sự cố thường gặp

### Đơn nghỉ phép bị kẹt, không ai duyệt được
Nguyên nhân phổ biến: bước duyệt không tìm được người (nhân sự chưa có quản lý trực tiếp, phòng ban chưa gán trưởng đơn vị).

1. Mở **Quy trình duyệt → Mô phỏng**, chọn đúng người nộp đơn và số ngày để xem bước nào không ra người duyệt.
2. Bổ sung quản lý trực tiếp ở **Nhân sự**, hoặc trưởng đơn vị ở **Phòng ban**.
3. Với đơn đang kẹt: tài khoản có quyền `FEATURE_LEAVE_FORCE_CLOSE` hủy đơn để nhân sự nộp lại.
4. Phòng ngừa: bật *Bỏ qua nếu không tìm được người duyệt* trên các bước không bắt buộc.

### Không nhận được thông báo Zalo
```bash
npm run job outbox      # đẩy hàng đợi thủ công và xem lỗi trả về
```
Kiểm tra theo thứ tự: công tắc **Zalo Bot** đã bật · bot token đúng (nút *Gửi tin thử*) · nhân sự đã liên kết Zalo (Hồ sơ cá nhân) · thời điểm gửi không rơi vào giờ im lặng · bảng `NotificationOutbox` cột `error`.

Tin thất bại được thử lại theo lũy tiến 2 → 4 → 8 → 16 → 32 phút, tối đa 5 lần rồi chuyển `FAILED`.

### Bảng công thiếu dữ liệu
```bash
npm run job attendance-rollup    # chốt công ngày hôm trước
```
Hoặc bấm **Chốt công hôm nay** ở màn hình Chấm công. Job bỏ qua các bản ghi đã được HR chỉnh tay (`editedById` khác null) nên không ghi đè điều chỉnh thủ công.

### Cây phòng ban hiển thị sai cấp
Bấm **Kiểm tra cây** ở màn hình Phòng ban — hệ thống dò sai lệch `path`/`level` và dựng lại từ gốc.

### Quỹ phép lệch số
Quỹ phép thay đổi ở ba thời điểm: nộp đơn (giữ chỗ `pendingDays`), duyệt xong (chuyển sang `usedDays`), hủy/từ chối (hoàn lại). Nếu nghi ngờ lệch, đối chiếu tổng `totalDays` các đơn `APPROVED` trong năm với `usedDays` của nhân sự đó; HR chỉnh lại tại **Nghỉ phép → Quỹ phép nhân sự**.

## Sao lưu và phục hồi

```bash
# Sao lưu
mysqldump -u <user> -p --single-transaction --routines workhub > workhub-$(date +%F).sql

# Phục hồi
mysql -u <user> -p workhub < workhub-2026-09-19.sql
```

Nên sao lưu hằng ngày và giữ tối thiểu 14 bản. Lưu riêng file `.env` — mất `APP_ENCRYPTION_KEY` sẽ không giải mã được bot token và MCP key đã lưu (phải nhập lại).

## Nâng cấp phiên bản

```bash
git pull
npm install
npx prisma migrate deploy
npm run db:seed        # idempotent: bổ sung quyền/mẫu thông báo mới
npm run build
pm2 restart workhub workhub-scheduler   # hoặc docker compose up -d --build
```

## Thêm quyền mới cho tính năng mới

1. Khai báo trong `src/lib/permissions.ts` (mã, tên, nhóm, phân loại).
2. Gán mặc định cho các vai trò hệ thống phù hợp trong `SYSTEM_ROLES`.
3. Chạy `npm run db:seed` — quyền mới được thêm, vai trò hệ thống đồng bộ lại.
4. Dùng `requirePermission('MA_QUYEN')` ở Server Action và `can(ctx, 'MA_QUYEN')` để ẩn/hiện nút.

## Theo dõi

- **Nhật ký hệ thống** (`/settings/audit`): ai làm gì, khi nào, từ nguồn nào.
- **Nhật ký gọi MCP** (`/settings/integrations`): công cụ nào được gọi, thành công hay lỗi.
- Bảng `ZaloInboundLog`: toàn bộ tin nhắn bot nhận được và phản hồi tương ứng.
