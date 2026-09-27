# Hồ sơ khách hàng — triển khai theo bước 1–6

## Quy ước giao diện

Theo yêu cầu người dùng: dùng màu, độ rộng, font/cỡ chữ và cách thiết kế hiện tại; tái sử dụng tabs/tab, Card, StatCard, Field, Input, Select, Button, Modal và bảng mua hàng. Không thiết kế một bộ style riêng cho từng tab. Tab chính có nhãn ngắn; bộ chọn phụ bên trong; trạng thái nằm trong URL.

## Kết quả triển khai

1. **Bố cục:** sửa lại 5 tab chính theo style tab chung. Header tách thông tin và thao tác; ghi chú vào Hồ sơ; KPI dùng StatCard chung.
2. **Sản phẩm:** Thiết bị/Phụ tùng dùng cùng bảng. Phụ tùng có Theo giao dịch/Theo mặt hàng; trả hàng nối orderItemId; hàng cũ thiếu mã kho không tự gộp theo tên. Mã đơn mở đúng đơn và bung chi tiết. Lưu tab vào URL và hỗ trợ Back/Forward.
3. **Công nợ:** `customerInsights` dùng chung cho đầu trang, chi tiết và tổng hợp service. Tách tiền chưa phân bổ từ allocationVersion=1; phiếu cũ và đơn lệch phân bổ được đếm để đối soát. Có thao tác phân bổ tiền dư vào đơn cùng khách, giới hạn dư tiền/dư nợ và kiểm tra snapshot chống bấm lặp; transaction Serializable, audit và kiểm tra quyền server.
4. **Hồ sơ:** thêm loại khách, tên pháp lý, MST, địa chỉ/email hóa đơn, điều khoản thanh toán và người phụ trách. Liên hệ nhiều người, sửa liên hệ, một người chính theo thao tác transaction. Chi nhánh tiếp tục dùng màn hiện hành; thông tin hóa đơn được đọc lại ở form đơn bán. Chặn xóa khách đã có nghiệp vụ/lịch sử, dùng Ngừng giao dịch.
5. **Chăm sóc/báo cáo:** thêm lịch chăm sóc có kênh, nội dung, người phụ trách, hạn hẹn, sửa lịch chưa hoàn thành và đánh dấu hoàn thành. Có công nợ hiện tại, mua phụ tùng, đơn chưa hoàn tất, thiết bị cần bảo trì/bảo hành. Bộ lọc ngày theo ngày đơn cho mua hàng/đơn mở. Xuất CSV công nợ/phụ tùng toàn khách có kiểm tra quyền export, audit và chống công thức CSV.
6. **Nghiệm thu:** TypeScript, unit/regression và build; migration local, kiểm tra quan hệ bằng transaction rollback; HTTP khách hàng chưa đăng nhập trả 307. UI theo vai trò/desktop/mobile **chưa nghiệm thu trực quan** vì công cụ macOS đang chờ Accessibility và Screen Recording sau hai lần thử. Không coi bước 6 hoàn tất toàn bộ.

## Database

Migration: `20260928010000_customer_workspace`, tạo CustomerProfile/CustomerContact/CustomerCareActivity. Đã áp dụng vào DB local workhub tại 127.0.0.1 sau backup `backups/workhub-before-customer-workspace-1790509316299.sql`. Migrate status up to date. Không chạy reset/clean/seed trong đợt này. Clean demo được bổ sung thứ tự xóa ba bảng mới, chưa thực thi clean.

## Giới hạn cần phân biệt

- Báo cáo công nợ hiện tại, chưa phải sổ đối chiếu đầu kỳ/phát sinh/cuối kỳ lịch sử. Không suy diễn phân bổ phiếu thu cũ.
- Lịch sử phụ tùng dùng đơn đã giao/hoàn tất; chưa có ledger giao từng đợt. Số trả chỉ chính xác khi phiếu trả nối đúng orderItemId; tiền dòng trong lịch sử vẫn theo đơn gốc.
- Danh sách chăm sóc là dữ liệu nội bộ, không tự gửi Zalo/email; lịch theo nhân sự hoạt động hiện tại. Không tích hợp nhà cung cấp hóa đơn điện tử trong đợt này.
- Giữ mô hình quyền khách hàng hiện tại (quyền module), chưa bổ sung scope khách theo nhân viên/chi nhánh. Profile/contact/care có guard chống sửa ID của khách khác và audit thao tác.
- Chưa có gộp khách trùng, đóng kỳ công nợ, audit từng giá trị trường hay snapshot thông tin hóa đơn lịch sử. Các mục này không được tự đánh dấu hoàn thành.
- Chưa push/deploy remote. Các thay đổi từ những lượt trước trong working tree được giữ nguyên.

## Kết quả cuối

- 452 tests / 62 files đạt; TypeScript đạt.
- Production build bản cuối đạt với `WORKHUB_BUILD_DIR=.next-verify npm run build`. Một lần build mặc định bị thiếu file trace do thư mục `.next` dùng chung; thêm tùy chọn thư mục build để tách kiểm tra khỏi dev. Thư mục kiểm tra được gitignore; thay đổi tự động của Next vào tsconfig đã hoàn nguyên.
- Dữ liệu local DEMO-CUS-001 đối chiếu: tổng đơn 1.458.000, đã thu 1.458.000, nợ 0, tiền chưa phân bổ 0, một dòng phụ tùng, không lệch allocation.
- Browser smoke desktop/mobile và kiểm thử cạnh tranh nhiều kết nối MySQL thật còn cần làm; không thay bằng kết quả mock unit tests.
