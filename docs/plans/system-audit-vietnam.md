# Rà soát WorkHub và lộ trình vận hành tại Việt Nam

Ngày: 27/09/2026. Đây là rà soát mã nguồn và kiểm thử tự động; chưa phải nghiệm thu toàn bộ giao diện, dịch vụ Google/Zalo thật hoặc chứng nhận tuân thủ. Đọc cùng `workhub-completion.md`. Không reset dữ liệu trong đợt này.

## Kết luận

WorkHub đã có nền tảng quản lý công việc, nhân sự, phép/công, khách hàng, bán/mua, kho, thiết bị, bảo trì và tích hợp. Chưa đủ căn cứ coi là hệ thống kế toán hay tính lương hoàn chỉnh. Ưu tiên độ đúng chứng từ và phân quyền trước mở rộng dashboard.

## Phát hiện và thay đổi thực hiện

| Mức | Bằng chứng trong code | Kết quả |
|---|---|---|
| P1 | `reports/page.tsx` chỉ yêu cầu đăng nhập; registry không gán quyền từng báo cáo | Đã thêm kiểm tra MENU_REPORTS và quyền task/attendance/leave/inventory/customer-management tại danh mục; chọn tab trái quyền rơi về tab được phép |
| P1 | `deleteCustomerOrder` gọi delete trực tiếp | Đã giới hạn đơn DRAFT/PENDING không tiền, trả hàng, allocation, phiếu kho; kiểm tra và xóa cùng Serializable transaction |
| P1 | `spare-parts/report.ts` không lọc trạng thái phiếu kho | Đã chỉ lấy COMPLETED; phiếu chờ duyệt/từ chối không vào tổng phát sinh |
| P1 | Thành tiền dòng bằng 0 bị thay bằng số lượng × giá | Đã giữ giá trị 0, bảo toàn chiết khấu 100% |
| P1 | VAT và số đơn tính cả dòng không gắn kho | Đã đồng bộ phạm vi; VAT cấp đơn phân bổ theo tỷ trọng tiền hàng kho trên hàng+cước, không phải báo cáo kê khai thuế |
| P1 | Chi phí xuất khác lấy giá PO hiện hành | Đã lấy unitCost ghi sổ của dòng phiếu; chứng từ cũ thiếu unitCost vẫn cần đối soát |

## Rủi ro còn lại cần xử lý

1. **Giá vốn hàng bán lịch sử:** báo cáo còn lấy giá PO mới nhất/giá danh mục cho đơn bán. Cần ledger giá vốn, liên kết dòng xuất–dòng bán, nhận/giao từng đợt và hoàn trả đảo theo giá gốc. Không tự suy diễn giá vốn chứng từ cũ. Tiêu chí: nhập giá mới không đổi lợi nhuận tháng đã khóa.
2. **Tồn cuối kỳ:** trường closingStock đang lấy tồn hiện tại. Cần số dư đầu kỳ được xác nhận + phát sinh đã ghi sổ đến cuối kỳ; chỉ hồi dựng khi lịch sử đầy đủ. Tiêu chí: đầu + nhập − xuất = cuối theo kho/mặt hàng, chuyển kho không tăng tổng tồn.
3. **Doanh thu:** hiện lọc ngày đơn và chỉ loại CANCELLED; cần tách giá trị đặt hàng, đã giao/nghiệm thu, doanh thu quản trị, hóa đơn, tiền thu. Chưa tự thay chính sách ghi nhận trên dữ liệu đang có. Tiêu chí: đơn chưa giao không lẫn doanh thu thực hiện; hàng trả tính theo ngày phát sinh.
4. **Chứng từ:** idempotency, void/reversal thay xóa, khóa kỳ, lý do điều chỉnh và audit actor. Kiểm tra thêm xóa khách/NCC/mặt hàng theo cascade vì có thể bỏ qua guard xóa đơn. Tiêu chí: mọi kênh Web/AI/MCP giữ cùng quy tắc, chạy đồng thời không trừ tiền/tồn hai lần.
5. **Quyền:** quyền công nợ tạm dùng FEATURE_CUSTOMER_MANAGE; cần quyền tài chính riêng và scope chi nhánh/người phụ trách. Overview báo cáo còn hiển thị KPI nhiều lĩnh vực, cần thống nhất quyền trường dữ liệu. Tiêu chí: kiểm thử user tự truy cập URL/server action/export ở từng vai trò.
6. **Demo:** nút Clear chạy full seed cũ, script business-demo chạy riêng; dữ liệu F&B cũ có phiếu không dòng và đơn thiếu liên kết kho. Cần một pipeline demo, kiểm tra tổng/chi tiết và foreign keys, kết quả từng bước, không tự chạy migration từ nút UI. Tiêu chí: clear+nạp một lần đủ các báo cáo và chạy lại không nhân bản.

## Ma trận nghiệp vụ cần hoàn thiện

| Nhóm | Phần cần bổ sung/kiểm chứng | Điều kiện nghiệm thu |
|---|---|---|
| Mua hàng | Danh mục NCC thay chuỗi tên, đề nghị mua, duyệt ngân sách, giao từng đợt, trả NCC, cước/thuế nhập khẩu và tỷ giá | PO–nhận hàng–hóa đơn–chi tiền đối soát được, không nhập quá lượng còn lại |
| Bán hàng | Hiệu lực/phiên bản báo giá, duyệt chiết khấu, hạn mức nợ, giữ tồn, giao từng đợt, đổi/trả và hoàn tiền | Tiền hàng/CK/cước/VAT/tổng khớp từng dòng và chứng từ gốc |
| Tiền/công nợ | Cọc/dư chưa phân bổ, tái phân bổ, tài khoản tiền mặt/ngân hàng, đối soát sao kê | Số dư đầu + thu − chi = cuối; tuổi nợ và dư khách/NCC đối chiếu được |
| Kho | Ledger bất biến, kiểm kê và duyệt chênh lệch, serial/lô nếu cần, giá vốn lịch sử, khóa kỳ | Tồn thực tế/tồn sổ/tồn giữ/tồn khả dụng tách rõ |
| Thiết bị/dịch vụ | Lịch bảo trì, serial/bảo hành, phụ tùng thay, công kỹ thuật, hợp đồng thuê và tiền cọc | Doanh thu–chi phí–lãi theo máy/hợp đồng; nhắc hết hạn và nghiệm thu |
| Công việc | Phụ thuộc và chu kỳ cha-con, nghiệm thu, thời gian thực tế, việc lặp, bàn giao | Tiến độ đồng nhất Web/MCP/Zalo; báo cáo quá hạn theo ngày chốt |
| HR | Hợp đồng và hiệu lực điều chuyển, onboarding/offboarding, lịch sử ca, hồ sơ riêng tư | Nghỉ việc thu hồi truy cập và bàn giao tài sản/công việc/phê duyệt |
| Công/phép | Duyệt OT, bổ sung công có chứng cứ, công tác, phép chuyển năm, khóa bảng công | Phân biệt có mặt/công hợp lệ/OT duyệt; mở kỳ có quyền và lý do |
| AI/Zalo/SSO | Xác nhận ghi theo thao tác, queue/retry/dead-letter, thu hồi token, rate limit phân tán | Không vượt quyền người dùng, chống phát lại, log che secret, kiểm thử dịch vụ thật |
| Vận hành | Backup và thử restore, log tập trung, cảnh báo lỗi, migration staging, quản lý secret | Phục hồi thử thành công; migration lỗi dừng triển khai |

## Báo cáo cần thiết (đề xuất, chưa triển khai mới)

Hiện registry có 5 báo cáo: công việc, nhập–bán–lãi gộp, công nợ khách, chấm công, nghỉ phép. Mỗi báo cáo mới cần lọc thời gian/đơn vị/người phụ trách, quyền xem và xuất ở server, dòng tổng đối chiếu chi tiết, liên kết chứng từ và ghi rõ ngày dữ liệu.

| Ưu tiên | Báo cáo | Công thức/nguồn và người dùng |
|---|---|---|
| P1 | Đối soát chất lượng dữ liệu | Đơn không dòng, phiếu kho không dòng, thiếu liên kết, tổng lệch, paidAmount khác allocation; kế toán/quản trị xử lý ngoại lệ |
| P1 | Sổ thu–chi và tiền chưa phân bổ | Phiếu theo paidAt; tách tiền mặt/ngân hàng, cọc, hoàn tiền, hủy; kế toán/thủ quỹ |
| P1 | Phải thu/phải trả và tuổi nợ | Đầu kỳ + phát sinh − thanh toán − giảm trừ; trong hạn/1–30/31–60/61–90/>90/ngày hạn chưa xác định; kế toán/kinh doanh |
| P1 | Nhập–xuất–tồn tại ngày chốt | Theo kho/mã/lô/serial nếu có; số dư mở đầu đã xác nhận + ledger; kho/kế toán |
| P1 | Doanh thu–giá vốn–lãi gộp | Theo chứng từ giao/nghiệm thu, dòng hàng, khách, nhân viên, chi nhánh; VAT tách riêng; lãnh đạo |
| P2 | Đơn mua/bán chưa hoàn tất | Đặt–giao/nhận–còn lại, trễ cam kết, tồn giữ, thiếu hàng; mua hàng/kinh doanh |
| P2 | Tồn chậm luân chuyển và đề nghị mua | Ngày phát sinh gần nhất, số ngày tồn, mức tối thiểu, lead time; cần quy tắc lô/FIFO nếu muốn tuổi tồn chính xác |
| P2 | Thuế/hóa đơn đối soát | Đơn–giao–hóa đơn–thanh toán; phân nhóm thuế suất, điều chỉnh/thay thế; không coi tổng VAT đơn hàng là tờ khai |
| P2 | Bảo trì/bảo hành/thuê | Sắp đến hạn, lần sửa lại, linh kiện/công, lãi từng máy/hợp đồng |
| P2 | Công việc và tải nhân sự | Backlog tại ngày chốt, đúng hạn theo completedAt/dueDate, thời gian xử lý, tải và chờ duyệt; phân biệt cohort tạo mới với việc tồn |
| P2 | Bảng công và OT đã duyệt | Ngày công hợp lệ/thiếu công/phép/công tác/OT, khóa tháng, file đầu vào lương |
| P2 | HR và hồ sơ đến hạn | Tăng/giảm người, thử việc/hợp đồng/bàn giao, quỹ phép và tài sản chưa trả |
| P3 | Dự báo và hiệu quả | Dòng tiền dự kiến, doanh số mục tiêu, hoa hồng, chuyển đổi báo giá; triển khai sau khi dữ liệu gốc đáng tin |

## Đặc thù Việt Nam và nguồn đối chiếu

Đây là yêu cầu thiết kế cần xác nhận theo loại doanh nghiệp và thời điểm áp dụng, không phải kết luận hệ thống đã đáp ứng pháp luật.

- Hóa đơn điện tử: cần tích hợp nhà cung cấp, trạng thái phát hành, mã/serial, ngày lập, điều chỉnh/thay thế và đối soát; bản in đơn bán không thay hóa đơn điện tử. Tham chiếu [Nghị định 70/2025/NĐ-CP](https://chinhphu.vn/?classid=1&docid=213179&orggroupid=2&pageid=27160) sửa quy định hóa đơn, chứng từ. Trước triển khai kiểm tra tiếp văn bản áp dụng mới nhất và quy trình của nhà cung cấp.
- VAT: cấu hình theo mặt hàng/dịch vụ, hiệu lực thời gian và chứng từ gốc; không hard-code 8% cho mọi nghiệp vụ. 8% hiện tại là dữ liệu demo. Cho phép trường hợp không chịu thuế/không kê khai khi có quy tắc kế toán xác nhận, không gộp thành 0%.
- Công/phép/OT: đối chiếu [Bộ luật Lao động 45/2019/QH14](https://datafiles.chinhphu.vn/cpp/files/vbpq/2019/12/45.signed.pdf) và văn bản hướng dẫn còn hiệu lực; ca đêm, nghỉ lễ, phép, thâm niên và OT là các quy tắc riêng. Chưa triển khai payroll/BHXH/TNCN chỉ bằng nhân số giờ chấm công với đơn giá.
- Dữ liệu nhân sự/khách: Luật [91/2025/QH15](https://chinhphu.vn/?classid=1&docid=214590&orggroupid=1&pageid=27160) về bảo vệ dữ liệu cá nhân; thiết kế phân quyền trường nhạy cảm, mục đích xử lý, lưu giữ/xóa, nhật ký truy cập và hạn chế dữ liệu đưa sang AI/Zalo.
- Dùng múi giờ Asia/Ho_Chi_Minh cho ngày nghiệp vụ; định dạng VND, số tiền bằng chữ, địa chỉ/MST/tài khoản ngân hàng và tên pháp lý trên chứng từ. Chốt chính sách làm tròn tiền trước khi nhập dữ liệu thật.

## Thứ tự triển khai

1. Sửa lỗi đã xác nhận trong đợt này; kiểm thử hồi quy. Chưa push/deploy.
2. Xây đối soát chỉ đọc và hợp nhất pipeline demo; chuẩn hóa dữ liệu cũ qua danh sách ngoại lệ có người duyệt.
3. Ledger và khóa kỳ, giá vốn lịch sử, tồn thời điểm; kiểm thử giao/nhận/trả/thu/chi đồng thời bằng DB thật.
4. Báo cáo P1, đối soát tổng với chứng từ, kiểm thử quyền và CSV.
5. Quy trình HR/công/phép/OT và thiết bị; báo cáo P2.
6. Kết nối hóa đơn/AI/Zalo thật, backup restore, smoke test desktop/mobile theo vai trò; sau đó mới triển khai thật.

Không đánh dấu hoàn tất toàn hệ thống chỉ vì unit tests/build thành công. Các mục chưa triển khai vẫn là backlog, đặc biệt ledger, hóa đơn điện tử, payroll và nghiệm thu dịch vụ ngoài.

## Kết quả kiểm tra đợt này

- TypeScript `tsc --noEmit`: đạt.
- Vitest: 433 tests / 58 files đạt (bao gồm kiểm tra xóa đơn, quyền danh mục báo cáo, doanh thu dòng chiết khấu 100%).
- Kiểm tra diff: đạt. Đổi nhãn VAT thành VAT phân bổ, cột CSV tồn thành Tồn hiện tại để phản ánh đúng phạm vi.
- Không sửa dữ liệu thật, không chạy migration/seed, chưa push/deploy; chưa nghiệm thu UI bằng trình duyệt hay kiểm thử cạnh tranh MySQL thật trong đợt này.
