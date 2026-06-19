# UCMAS CRM — Hệ thống Quản lý Khách hàng (13 Trung tâm Hà Nội)

Hệ thống CRM đồng bộ thời gian thực (realtime) được thiết kế riêng cho chuỗi 13 trung tâm UCMAS tại Hà Nội. 

Hệ thống cho phép phòng Marketing (tập trung) thu thập và phân phối lead vào kho kiểm chung L1.KK, phân phối cho các trung tâm (phân tán), theo dõi lịch hẹn học thử, đóng học phí (L4 UCKID / L4 UCMAS) và đồng bộ hai chiều thời gian thực với Google Sheets.

---

## 📌 Kiến trúc hệ thống

Hệ thống hoạt động theo mô hình **Serverless** trực tiếp từ Frontend Client gọi đến Supabase, kết hợp với các trigger/hàm thủ tục lưu sẵn (RPC/Triggers) phía database để xử lý nghiệp vụ phức tạp, bảo đảm toàn vẹn dữ liệu.

```
┌──────────────────────────┐             ┌─────────────────────────────┐
│    Vite + React SPA      │────────────▶│     Supabase Client         │
│ (Vanilla CSS, Recharts,  │◀────────────│ (Auth, Realtime, DB, RLS)   │
│      FullCalendar)       │             └──────────────┬──────────────┘
│   (Giao diện Premium)    │                            │
└──────────────────────────┘                            ▼
┌──────────────────────────┐             ┌─────────────────────────────┐
│    Google Sheets         │◀────────────│      Google Apps Script     │
│ (SHEET_IN & SHEET_OUT)   │────────────▶│   (HMAC SHA256, Auto-Sync)  │
└──────────────────────────┘             └─────────────────────────────┘
```

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

* **Frontend**: React 18, React Router v6, Vanilla CSS (Thiết kế Glassmorphism & Dark Mode hiện đại), Recharts (Biểu đồ báo cáo), FullCalendar (Lịch hẹn học thử trực quan), React Hot Toast (Thông báo UI).
* **Backend & Database**: Supabase (PostgreSQL 15 + pgcrypto), Row-Level Security (RLS), Realtime Publications (Realtime WebSocket).
* **Google Sheets Sync**: Google Apps Script (GAS) chạy kích hoạt tự động bằng Time-Driven Trigger kết hợp Custom Menu trên Sheet.

---

## 📂 Cấu trúc thư mục dự án

```
ucmas-crm/
├── CHANGELOG.md               # Nhật ký thay đổi và lịch sử cập nhật ứng dụng
├── README.md                  # Hướng dẫn và mô tả hệ thống
├── apps-script/
│   └── sheet_in_trigger.gs    # Google Apps Script đồng bộ 2 chiều (Sheet <-> CRM)
├── database/
│   ├── supabase_schema.sql    # Khởi tạo bảng, chỉ mục (Index) & Sequence
│   ├── supabase_rls.sql       # Phân quyền Row-Level Security nâng cao
│   ├── supabase_rpc.sql       # Các thủ tục lưu sẵn (RPC) cho nghiệp vụ chính
│   ├── supabase_create_user.sql # RPC tạo người dùng an toàn
│   └── migration_*.sql        # Các bản nâng cấp (Custom Fields, Reminders, L4 types, Trash Bin...)
└── frontend/                  # Source code giao diện React SPA
    ├── src/
    │   ├── components/        # UI components (leads, settings, layout, calendar, reminders)
    │   ├── config/            # Cấu hình hệ thống (levels.js)
    │   ├── contexts/          # Quản lý AuthContext & SharedDataProvider
    │   ├── hooks/             # Custom hooks (useShared)
    │   ├── lib/               # Supabase client initialization
    │   ├── pages/             # Các trang chức năng chính (Dashboard, Leads, Reports, Trash...)
    │   └── services/          # API wrapper định nghĩa các cuộc gọi Supabase
    └── vite.config.js         # Cấu hình đóng gói Vite
```

---

## 📊 Hệ thống Cấp độ (Levels) & Quy trình Nghiệp vụ

Quy trình quản lý lead đã được nâng cấp thay thế kho `L0` cũ bằng **`L1.KK` (L1 Kho kiểm)** để chuyển luồng xử lý đầu vào về bộ phận Telesale chuyên nghiệp.

| Mã | Mô tả | Nhóm (Group) | Badge Màu | Đặc điểm & Ràng buộc |
|----|-------|:---:|-----------|-----------------------|
| `L1.KK` | **L1 Kho kiểm (Telesale Pool)** | L1 | Chàm đậm | Kho lead đầu vào chưa xử lý. Chỉ Admin, Lead Telesale, Telesale & Marketing thấy. Chưa gán về trung tâm đích. |
| `L1` | Đã có đủ thông tin liên hệ | L1 | Vàng | Bắt buộc phải có Số điện thoại (`phone`). Phải được gán Trung tâm. |
| `L1.2` | Gọi không nghe máy | L1 | Đỏ | Trạng thái tạm thời của Telesale/Trung tâm, cần gọi lại sau. |
| `L1.3` | Dừng chăm sóc (Sai số/Không học) | L1 | Đỏ | Dừng ở mức L1. Badge đỏ nhận biết, không chặn chuyển đi/lại. |
| `L2.2A`| Suy nghĩ thêm | L2 | Xanh dương | Khách hàng tiềm năng cần chăm sóc thêm. |
| `L2.2B`| **Đã hẹn lịch học thử** | L2 | Xanh dương | ⭐ **Mốc Milestone + Bàn giao**. Bắt buộc nhập Ngày giờ hẹn (`trial_appointment_at`). Tự động thông báo tới Trung tâm. |
| `L2.2O`| Đã gửi bài test online | L2 | Xanh dương | Milestone phụ hỗ trợ đánh giá năng lực từ xa. |
| `L2.2OS`| Đã hoàn thành bài test | L2 | Xanh dương | Milestone phụ. |
| `L2.3` | Dừng chăm sóc (Hết nhu cầu) | L2 | Đỏ | Trạng thái dừng ở giai đoạn L2. |
| `L3.O` | Đã tư vấn trực tuyến | L3 | Xanh lá | Milestone phụ. |
| `L3.1` | **Đã tham gia học thử** | L3 | Xanh lá | ⭐ **Mốc Milestone**. Xác nhận đã đến test/học thử trực tiếp tại trung tâm. |
| `L3.3` | Dừng chăm sóc sau học thử | L3 | Đỏ | Trạng thái dừng ở giai đoạn L3. |
| `L4.1` - `L4.13` | **Đóng học phí 1 - 13 khóa** | L4 | Xanh lá đậm | ⭐ **Mốc Milestone**. Chốt đóng học phí. Bắt buộc nhập Mã học sinh (`student_code`) và Học phí đóng (`revenue`). Hỗ trợ tích chọn loại sản phẩm đóng phí ở `l4_type` ('L4 UCKID', 'L4 UCMAS' hoặc cả hai). |
| `L5` | Lên cấp | L5 | Indigo | Học viên học tiếp lên cấp độ cao hơn. |
| `L6` | Học viên giới thiệu (Referral) | L6 | Tím | Được giới thiệu từ học viên khác. |

---

## 🔐 Phân quyền & Bảo mật (Row-Level Security)

Hệ thống phân chia làm 5 nhóm quyền chính trong bảng `profiles` (Kế thừa từ `auth.users` của Supabase):

1. **ADMIN (`admin`)**:
   - Toàn quyền đọc, ghi, cập nhật và xóa toàn bộ dữ liệu.
   - Quản trị tài khoản nhân viên, cấu hình trung tâm, cài đặt Google Sheets, dọn dẹp vĩnh viễn Thùng rác.
2. **LEAD TELESALE (`lead_telesale`)**:
   - Quản lý đội ngũ Telesale.
   - Xem toàn bộ lead trong kho kiểm `L1.KK`, phân bổ lead cho Telesale và xem báo cáo hiệu suất của toàn đội.
3. **TELESALE (`telesale`)**:
   - Xem kho lead chưa gán `L1.KK` để nhận chăm sóc.
   - Chỉ được xem/sửa những lead được gán cho chính mình hoặc các lead trong kho kiểm chung.
4. **MARKETING (`marketing`)**:
   - Được xem kho `L1.KK` (nếu bật `can_view_l0_pool`).
   - Thực hiện nghiệp vụ gán lead hàng loạt về 13 trung tâm (`bulk-assign`).
   - Giới hạn quyền xem/sửa lead dựa trên cấu hình chặn cấp độ (`level_access_cap`) và trung tâm được phép (`allowed_center_ids`).
5. **CENTER (`center`)**:
   - **Tuyệt đối không thấy kho kiểm L1.KK**. Chỉ thấy lead đã gán về trung tâm của mình từ L1 trở lên.
   - Quản lý lịch hẹn, bình luận trao đổi thông tin lịch hẹn học thử realtime.
   - Cấp Quản lý trung tâm (`is_manager = true`) được quyền phân công lead cho giáo viên/sale của cơ sở mình.

---

## ✨ Các tính năng nâng cao nổi bật

### 1. Thùng rác Lead (Lead Trash Bin)
- Cho phép xóa lead vào Thùng rác (đánh dấu `is_deleted = true`) thay vì xóa cứng khỏi cơ sở dữ liệu.
- Nhân viên có thể khôi phục lại lead nếu lỡ tay xóa. Chỉ tài khoản Admin mới có quyền dọn dẹp vĩnh viễn lead khỏi Thùng rác để bảo mật thông tin.

### 2. Phân loại L4 đa sản phẩm (UCMAS / UCKID)
- Hỗ trợ học viên đóng học phí cho nhiều chương trình cùng lúc.
- Lưu trữ riêng biệt các mốc thời gian chốt học phí (`entered_l4_ucmas_at`, `entered_l4_uckid_at`) phục vụ báo cáo doanh thu độc lập chính xác.

### 3. Trường dữ liệu tùy biến (Custom Fields)
- Hỗ trợ lưu trữ thông tin mở rộng động dưới dạng JSONB (`custom_fields`) từ các cột tùy chỉnh trên Google Sheets mà không cần thay đổi cấu trúc bảng database.

### 4. Lịch nhắc hẹn & Bình luận Realtime (Reminders & Realtime Chat)
- Tích hợp thông báo nhắc hẹn chăm sóc trực quan.
- Cho phép bộ phận Telesale/Marketing và Trung tâm trao đổi bình luận trực tiếp ngay trên từng lịch hẹn học thử của Lead qua hệ thống kết nối WebSocket realtime của Supabase.

---

## 💾 Thiết kế Database & Tính toàn vẹn dữ liệu

### 1. Cơ chế Trigger tự động (`fn_normalize_lead`)
- **Computed fields**: Tự động tính toán nhóm cấp độ (`level_group`), đánh dấu mốc quan trọng (`is_milestone`) và đếm số khóa đóng phí dựa trên `level_code`.
- **Đóng dấu mốc thời gian**: Tự động ghi nhận thời điểm đạt mốc sản phẩm tương ứng (`entered_l1_ucmas_at`, `entered_l2_ucmas_at`...) khi lead thay đổi trạng thái, đồng thời bỏ qua không đóng mốc L1 khi lead vẫn ở trong kho kiểm `L1.KK`.
- **Tạo mã băm chống trùng (`row_hash`)**: Sinh mã SHA256 dựa trên thông tin cốt lõi của Lead giúp kiểm soát dữ liệu trùng lặp khi đồng bộ từ Google Sheets.

### 2. Ghi lịch sử hoạt động tự động (`fn_log_level_change`)
- Tự động ghi nhận thông tin lịch sử thay đổi trạng thái của lead vào bảng append-only `lead_level_history` làm cơ sở đối soát và vẽ biểu đồ báo cáo phễu chuyển đổi lịch sử.

---

## 🔄 Hệ thống đồng bộ Google Sheets 2 chiều

Hệ thống sử dụng tệp Google Apps Script (`apps-script/sheet_in_trigger.gs`) để kết nối bảo mật:

1. **Chiều Nhập (Sheet_In ➔ CRM)**:
   - GAS đọc dữ liệu hàng loạt từ trang tính quảng cáo, gọi RPC `rpc_sync_inbound` đẩy lead vào kho kiểm `L1.KK`.
   - Kiểm soát trùng lặp SĐT tự động và gửi thông báo quan tâm lại (`phone_reinterest`) cho nhân viên phụ trách nếu lead đã có trong CRM.
2. **Chiều Xuất (CRM ➔ Sheet_Out)**:
   - GAS định kỳ gọi RPC `rpc_get_leads_for_outbound_sync` để lấy danh sách lead có thay đổi trạng thái.
   - Ghi đè thông tin lên dòng tương ứng trên `SHEET_OUT` (tra cứu theo `sheet_out_row` hoặc đối soát theo `Mã Lead`). Gửi kết quả cập nhật về CRM để cập nhật chỉ số dòng bằng RPC `rpc_update_sheet_out_rows`.
