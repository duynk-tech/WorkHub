# Google SSO

## Triển khai

1. Triển khai migration `20260927010000_google_sso` bằng `npm run db:deploy` sau khi sao lưu DB theo quy trình vận hành. Migration chỉ thêm bảng `ExternalIdentity`, không thay đổi dữ liệu nhân sự.
2. Cấu hình `APP_URL` là origin HTTPS chính thức, `AUTH_SECRET` ít nhất 32 ký tự và `APP_ENCRYPTION_KEY` hợp lệ.
3. Trong Google Cloud, tạo OAuth client loại **Web application**, cấu hình consent screen và người dùng thử nếu ứng dụng ở chế độ testing.
4. Khai báo Authorized redirect URI: `https://<domain>/api/auth/google/callback`.
5. Quản trị viên vào **Settings → SSO**, nhập Client ID/Client Secret, miền Workspace tùy chọn, bật và lưu.
6. Người dùng đăng nhập WorkHub bằng mật khẩu, vào **Hồ sơ cá nhân → Tài khoản Google**, xác nhận mật khẩu rồi chọn Google cần liên kết.
7. Đăng xuất, thử **Đăng nhập bằng Google**. Mỗi Google subject chỉ liên kết với một User, mỗi User chỉ có một Google identity.

## Quy tắc

- Không tự tạo nhân sự, không tự ghép email, không tự cấp vai trò.
- Kiểm tra state, nonce, PKCE, chữ ký Google, issuer/audience/expiry và email_verified. Workspace dùng claim `hd`.
- Người nghỉ việc, user vô hiệu hóa hoặc đang khóa không đăng nhập được.
- Hủy liên kết yêu cầu mật khẩu hiện tại. Đăng nhập mật khẩu vẫn được giữ để khôi phục khi SSO tắt/lỗi.
- Access/refresh token Google không được lưu; secret client mã hóa trong SystemSetting.
- Không gửi Client Secret cho người khác hoặc đưa vào mã nguồn/log.

Tài liệu giao thức: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Kiểm chứng

Unit tests kiểm tra state một lần, redirect an toàn, nonce, miền Workspace, email đã xác minh và chữ ký/audience của ID token. Kiểm thử OAuth đầu cuối cần client và domain thực tế; chưa được xác nhận chỉ bằng unit tests.
