# 📝 Nhật ký thay đổi (CHANGELOG) — UCMAS CRM

Tài liệu này lưu trữ toàn bộ lịch sử các phiên bản cập nhật, nâng cấp tính năng, sửa lỗi và cải tiến giao diện của hệ thống UCMAS CRM.

---

## 💡 Hướng dẫn ghi nhật ký thay đổi mới

Mỗi khi bạn thực hiện chỉnh sửa ứng dụng hoặc chạy migration database mới, hãy thêm một mục mới ở **đầu danh sách dưới đây** theo định dạng sau:

```markdown
## [Phiên bản / Ngày cập nhật] - Tiêu đề ngắn gọn của thay đổi
### 🚀 Tính năng mới
- Mô tả tính năng mới 1
- Mô tả tính năng mới 2

### 🔧 Cải tiến & Tối ưu hóa
- Mô tả phần tối ưu hóa code/giao diện

### 🐞 Sửa lỗi (Bug Fixes)
- Mô tả lỗi đã được sửa và cách xử lý
```

---

## Lịch sử các phiên bản cập nhật

## [1.6.0] - 2026-06-19
### 🚀 Tính năng mới
- **Quy trình L1 Kho kiểm (`L1.KK`)**: Thay thế hoàn toàn cơ chế kho `L0` cũ bằng `L1.KK`. Lead đầu vào được đồng bộ từ Sheet quảng cáo sẽ mặc định lưu ở trạng thái `L1.KK` để phân luồng xử lý riêng cho Telesale.
- **Trường dữ liệu Fanpage**: Thêm cột `fanpage` vào bảng `leads` để quản lý nguồn lead đổ về từ các chiến dịch Facebook Ads trực quan hơn.

### 🔧 Cải tiến & Tối ưu hóa
- **Mặc định sản phẩm quan tâm**: Tự động gán `interested_products = ARRAY['UCMAS']` tại trigger `fn_normalize_lead()` nếu trường này trống, ngăn ngừa lỗi lead không hiển thị trên các báo cáo phân tích sản phẩm.
- **Tối ưu hóa UI/UX**:
  - Tăng kích thước cỡ chữ hiển thị (20% - 30%) trong các danh sách (Lead Pool, Leads List, Calendar) giúp dễ đọc hơn.
  - Căn chỉnh lại chiều rộng các cột hiển thị trong danh sách Lead, thu gọn cột Họ tên phụ huynh và hỗ trợ tiêu đề cột hiển thị trên 2 hàng.
  - Bổ sung bộ lọc theo "Sale đặt lịch phụ trách" trong phần lọc nâng cao của Lịch hẹn học thử.
  - Tăng chiều cao các ô Calendar để thông tin hẹn học thử trực quan hơn.

### 🐞 Sửa lỗi (Bug Fixes)
- **Sửa lỗi CTE Scope (`leads_with_milestones`)**: Khắc phục lỗi `relation "leads_with_milestones" does not exist` trong hàm `rpc_report_funnel()` bằng cách gộp các truy vấn rời rạc sử dụng CTE thành một câu lệnh `SELECT` duy nhất.
- **Sửa lỗi nạp chồng Hàm (`function not unique`)**: Bổ sung signature cụ thể cho danh sách kiểu tham số đầu vào trong câu lệnh `GRANT EXECUTE` của các hàm báo cáo nhằm tránh lỗi nạp chồng hàm trên PostgreSQL/Supabase.
- **Sửa lỗi báo cáo L1-L4 bằng 0**: Thêm truy vấn tự động Backfill dữ liệu mốc thời gian riêng biệt cho UCMAS/UCKID dựa trên mốc thời gian chung, giúp số liệu báo cáo hiển thị chính xác ngay lập tức.

---

## [1.5.0] - 2026-06-15
### 🚀 Tính năng mới
- **Thùng rác Lead (`migration_lead_trash.sql`)**: 
  - Tích hợp tính năng xóa mềm (Soft delete) bằng cách đánh dấu trường `is_deleted = true`.
  - Cung cấp trang **Thùng rác** cho phép tìm kiếm, lọc và khôi phục (Restore) lead bị xóa nhầm.
  - Chỉ tài khoản có quyền `admin` mới được thực hiện dọn dẹp vĩnh viễn (Hard delete / Purge) dữ liệu trong thùng rác.

### 🔧 Cải tiến & Tối ưu hóa
- Tối ưu hóa quyền RLS cho phép Telesale được xem các lead nằm trong thùng rác do chính mình quản lý trước đó.

---

## [1.4.0] - 2026-06-08
### 🚀 Tính năng mới
- **Phân loại L4 đa sản phẩm (`migration_l4_multiple_types.sql`)**:
  - Hỗ trợ lưu trữ thông tin phân loại đóng phí L4 đa sản phẩm qua cột `l4_type` (cho phép chọn 'L4 UCKID', 'L4 UCMAS' hoặc cả hai).
  - Tách biệt các cột lưu trữ mốc thời gian chốt học phí riêng cho từng sản phẩm: `entered_l4_ucmas_at` và `entered_l4_uckid_at`.
- **Mã học sinh & Doanh thu học phí (`migration_add_student_code_and_revenue.sql`)**:
  - Bổ sung cột `student_code` (Mã học sinh) và `revenue` (Doanh thu đóng phí) vào bảng `leads` để quản lý tài chính cơ bản.
  - Ràng buộc: Khi lead đạt mức L4 (Đã đóng phí), giao diện bắt buộc người dùng nhập Mã học sinh và số tiền học phí.

---

## [1.3.0] - 2026-05-25
### 🚀 Tính năng mới
- **Phân quyền vai trò Telesale & Lead Telesale (`migration_permission_telesale.sql`)**:
  - Bổ sung nhóm quyền mới `telesale` và `lead_telesale` trong bảng `profiles`.
  - Thiết lập chính sách bảo mật RLS chi tiết: Telesale chỉ được quyền xem các lead do mình phụ trách hoặc lead chưa được phân bổ trong kho kiểm.
  - Tích hợp chức năng phân bổ lead (Assign) từ Lead Telesale cho các Telesale cấp dưới.
- **Báo cáo Hiệu suất Telesale**:
  - Bổ sung hàm `rpc_report_booking_sale_performance()` tính toán tỷ lệ chuyển đổi từ lead nhận vào, liên hệ thành công, đặt lịch hẹn và chốt phí cho từng nhân viên.

---

## [1.2.0] - 2026-05-10
### 🚀 Tính năng mới
- **Trường dữ liệu tùy biến JSONB (`migration_custom_fields.sql`)**:
  - Bổ sung cột `custom_fields` kiểu dữ liệu JSONB vào bảng `leads` để lưu trữ các thông tin mở rộng.
  - Cập nhật hàm `rpc_sync_inbound` để tiếp nhận dữ liệu custom từ Google Sheets và tự động lưu trữ mà không cần thay đổi cấu trúc bảng database.
  - Cập nhật UI thiết lập Google Sheets cho phép kéo thả/ánh xạ (mapping) các cột tùy ý trên Sheet vào trường `custom_fields` tương ứng trong CRM.

---

## [1.1.0] - 2026-05-02
### 🚀 Tính năng mới
- **Nhắc nhở lịch hẹn học thử (`migration_appointment_reminders.sql`)**:
  - Tự động sinh danh sách lịch nhắc chăm sóc khi lead chuyển sang trạng thái `L2.2B` (Đặt lịch hẹn).
  - Cho phép cập nhật trạng thái nhắc lịch chăm sóc: Chưa nhắc, Đã nhắc, Thất bại kèm lý do.
- **Hệ thống bình luận Realtime (`appointment_comments`)**:
  - Cho phép Telesale và nhân viên quản lý tại các Trung tâm bình luận, phản hồi trực tiếp ngay trên chi tiết lịch hẹn học thử của lead.
  - Dữ liệu bình luận được đồng bộ realtime WebSocket thông qua cơ chế Realtime Publication của Supabase.

---

## [1.0.0] - 2026-04-15
### 🚀 Tính năng mới
- **Khởi tạo hệ thống**:
  - Thiết lập cấu trúc cơ sở dữ liệu gốc: các bảng `leads`, `centers`, `profiles`, `notifications`, `sync_log`.
  - Phân quyền Row-Level Security (RLS) cơ bản cho Admin, Marketing, Center.
  - Viết Apps Script `sheet_in_trigger.gs` đồng bộ 2 chiều qua REST API.
  - Xây dựng giao diện React SPA hiển thị danh sách Lead, Lịch hẹn Calendar, Quản lý tài khoản và Báo cáo phễu cơ bản.
