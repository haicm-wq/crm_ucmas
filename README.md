# UCMAS CRM — Hệ thống Quản lý Khách hàng (13 Trung tâm Hà Nội)

Hệ thống CRM đồng bộ thời gian thực (realtime) được thiết kế riêng cho chuỗi 13 trung tâm UCMAS tại Hà Nội. 

Hệ thống cho phép phòng Marketing (tập trung) thu thập và phân phối lead vào kho chung L0, phân phối cho các trung tâm (phân tán), theo dõi lịch hẹn học thử, đóng học phí (L4 UCKID / L4 UCMAS) và đồng bộ hai chiều thời gian thực với Google Sheets.

---

## 📌 Kiến trúc hệ thống

Hệ thống hoạt động theo mô hình **Serverless** trực tiếp từ Frontend Client gọi đến Supabase, kết hợp với các trigger/hàm thủ tục lưu sẵn (RPC/Triggers) phía database để xử lý nghiệp vụ phức tạp, bảo đảm toàn vẹn dữ liệu.

```
┌──────────────────────────┐             ┌─────────────────────────────┐
│    Vite + React SPA      │────────────▶│     Supabase Client         │
│ (TailwindCSS, Recharts,  │◀────────────│ (Auth, Realtime, DB, RLS)   │
│      FullCalendar)       │             └──────────────┬──────────────┘
└──────────────────────────┘                            │
                                                        ▼
┌──────────────────────────┐             ┌─────────────────────────────┐
│    Google Sheets         │◀────────────│      Google Apps Script     │
│ (SHEET_IN & SHEET_OUT)   │────────────▶│   (HMAC SHA256, Auto-Sync)  │
└──────────────────────────┘             └─────────────────────────────┘
```

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

* **Frontend**: React 18, React Router v6, Tailwind CSS, Recharts (Biểu đồ báo cáo), FullCalendar (Lịch hẹn học thử trực quan), React Hot Toast (Thông báo UI).
* **Backend & Database**: Supabase (PostgreSQL 15 + pgcrypto), Row-Level Security (RLS), Realtime Publications (Realtime WebSocket).
* **Google Sheets Sync**: Google Apps Script (GAS) chạy kích hoạt tự động bằng Time-Driven Trigger kết hợp Custom Menu trên Sheet.

---

## 📂 Cấu trúc thư mục dự án

```
ucmas-crm/
├── apps-script/
│   └── sheet_in_trigger.gs        # Google Apps Script đồng bộ 2 chiều (Sheet <-> CRM)
├── database/
│   ├── supabase_schema.sql        # Khởi tạo bảng, chỉ mục (Index) & Sequence
│   ├── supabase_rls.sql           # Phân quyền Row-Level Security nâng cao
│   ├── supabase_rpc.sql           # Các thủ tục lưu sẵn (RPC) cho nghiệp vụ chính
│   ├── supabase_create_user.sql   # RPC tạo người dùng an toàn
│   └── migration_*.sql            # Các bản nâng cấp (Custom Fields, Reminders, L4 types)
└── frontend/                      # Source code giao diện React SPA
    ├── src/
    │   ├── components/            # UI components (leads, settings, layout, calendar)
    │   ├── config/                # Cấu hình hệ thống (levels.js)
    │   ├── contexts/              # Quản lý AuthContext & SharedDataProvider
    │   ├── hooks/                 # Custom hooks (useShared)
    │   ├── lib/                   # Supabase client initialization
    │   ├── pages/                 # Các trang chức năng chính
    │   └── services/              # API wrapper định nghĩa các cuộc gọi Supabase
    └── tailwind.config.js         # Cấu hình Tailwind CSS
```

---

## 📊 Hệ thống Cấp độ (Levels) & Quy trình Nghiệp vụ

| Mã | Mô tả | Nhóm (Group) | Badge Màu | Đặc điểm & Ràng buộc |
|----|-------|:---:|-----------|-----------------------|
| `L0` | Data đầu vào (kho chung) | L0 | Xám nhạt | Chỉ Admin & Marketing thấy. Chưa có Trung tâm phụ trách. |
| `L1` | Đã có đủ thông tin liên hệ | L1 | Vàng | Bắt buộc phải có Số điện thoại (`phone`). Phải được gán Trung tâm. |
| `L1.2` | Gọi không nghe máy | L1 | Đỏ | Trạng thái tạm thời, cần gọi lại sau. |
| `L1.3` | Dừng chăm sóc (Sai số/Không học) | L1 | Đỏ | Badge đỏ để nhận biết, không chặn chuyển đi/lại. |
| `L2.2A`| Suy nghĩ thêm | L2 | Xanh dương | Khách hàng tiềm năng cần chăm sóc thêm. |
| `L2.2B`| **Đã hẹn lịch học thử** | L2 | Xanh dương | ⭐ **Mốc Milestone + Bàn giao**. Bắt buộc nhập Ngày giờ hẹn (`trial_appointment_at`). Tự động thông báo tới Trung tâm. |
| `L2.2O`| Đã gửi bài test online | L2 | Xanh dương | Milestone phụ. |
| `L2.2OS`| Đã hoàn thành bài test | L2 | Xanh dương | Milestone phụ. |
| `L2.3` | Dừng chăm sóc (Hết nhu cầu) | L2 | Đỏ | Trạng thái dừng ở giai đoạn L2. |
| `L3.O` | Đã tư vấn trực tuyến | L3 | Xanh lá | Milestone phụ. |
| `L3.1` | Đã tham gia học thử | L3 | Xanh lá | Học thử trực tiếp tại trung tâm. |
| `L3.3` | Dừng chăm sóc sau học thử | L3 | Đỏ | Trạng thái dừng ở giai đoạn L3. |
| `L4.1` - `L4.13` | Đóng học phí 1 - 13 khóa | L4 | Xanh lá đậm | Chốt đóng học phí. Hỗ trợ chọn phân loại `l4_type` ('L4 UCKID', 'L4 UCMAS' hoặc chọn cả hai). |
| `L5` | Lên cấp | L5 | Indigo | Học viên học tiếp lên cấp độ cao hơn. |
| `L6` | Học viên giới thiệu (Referral) | L6 | Tím | Được giới thiệu từ học viên khác. |

---

## 🔐 Phân quyền & Bảo mật (Row-Level Security)

Hệ thống phân chia làm 3 nhóm quyền chính trong bảng `profiles` (Kế thừa từ `auth.users` của Supabase):

1. **ADMIN (`admin`)**:
   - Toàn quyền đọc, ghi, cập nhật và xóa toàn bộ dữ liệu.
   - Quản trị tài khoản nhân viên, cấu hình trung tâm, cài đặt Google Sheets, trường dữ liệu động.
2. **MARKETING (`marketing`)**:
   - Được xem kho L0 (nếu bật `can_view_l0_pool`).
   - Thực hiện nghiệp vụ nâng L0 → L1 và gán về 13 trung tâm (`bulk-assign`).
   - Giới hạn quyền xem/sửa lead dựa trên cấu hình `level_access_cap` (Ví dụ: Chỉ được quản lý đến mức L2) và `allowed_center_ids` (Một số trung tâm được chỉ định).
3. **CENTER (`center`)**:
   - **Tuyệt đối không thấy kho L0**. Chỉ thấy lead đã gán về trung tâm của mình từ L1 trở lên.
   - Quản lý lịch hẹn, thêm ghi chú, trao đổi ý kiến và cập nhật trạng thái từ L1 trở đi.
   - Cấp Quản lý trung tâm (`is_manager = true`) được quyền phân công công việc cho nhân viên trong cơ sở của mình.

---

## 💾 Thiết kế Database & Tính toàn vẹn dữ liệu

Toàn bộ logic tính toán dữ liệu suy diễn và ghi mốc thời gian đều được đóng dấu ở mức cơ sở dữ liệu để bảo đảm dữ liệu luôn đúng nhất quán bất kể thay đổi từ Web UI hay từ Google Sheets.

### 1. Cơ chế Trigger tự động (`fn_normalize_lead`)
- **Tự động điền computed fields**: `level_group` (cắt từ prefix `level_code`), `is_milestone` (cho các mốc đặc biệt), `paid_courses_count` (lấy số khóa đóng phí từ L4.x).
- **Đóng dấu mốc thời gian (Idempotent)**: Tự động điền mốc `entered_l0_at` đến `entered_l6_at` lần đầu tiên đạt nhóm level đó. Đóng dấu `entered_l4_uckid_at` và `entered_l4_ucmas_at` dựa trên lựa chọn tích đa chọn ở cột `l4_type`.
- **Ghi nhận bàn giao**: Đóng dấu `appointment_booked_at` & `handed_off_at` khi đạt trạng thái đặt lịch `L2.2B` lần đầu.
- **Tạo mã băm chống trùng (`row_hash`)**: Sinh mã SHA256 dựa trên thông tin cốt lõi của Lead để Apps Script kiểm tra trùng lặp trước khi thực thi.

### 2. Ghi lịch sử hoạt động tự động (`fn_log_level_change`)
- Bảng `lead_level_history` là bảng **chỉ cho phép ghi (Append-only)** nhờ quy tắc RLS và PostgreSQL RULES (`llh_no_update`, `llh_no_delete`).
- Trigger tự động lưu vết sự thay đổi `from_level` → `to_level`, ghi nhận người thay đổi (`changed_by`), ghi chú lý do (`note`) và nguồn thay đổi (`source` = 'manual' / 'sheet_sync').

### 3. Trao đổi liên lạc (Sale ↔ Trung tâm)
- **Lịch nhắc hẹn (`appointment_reminders`)**: Cho phép nhân viên Sale và nhân viên Trung tâm cập nhật trạng thái nhắc lịch độc lập ('pending', 'reminded', 'failed') cùng ghi chú cho từng lịch hẹn.
- **Bình luận trao đổi (`appointment_comments`)**: Giao diện chat trực tiếp tích hợp ngay trong panel chi tiết lịch hẹn để hai bộ phận Marketing và Trung tâm tương tác realtime qua Supabase Realtime.

---

## 🔄 Hệ thống đồng bộ Google Sheets 2 chiều

Hệ thống sử dụng file Google Apps Script (`apps-script/sheet_in_trigger.gs`) để kết nối an toàn với Supabase thông qua REST API và RPC, đảm bảo hiệu năng tối ưu:

### 1. Chiều Nhập (Sheet_In ➔ CRM)
- GAS thực hiện đọc hàng loạt (Batch read) trên sheet quảng cáo `SHEET_IN`.
- Duyệt qua các dòng chưa có trạng thái đồng bộ, gọi RPC `rpc_sync_inbound` để chèn vào CRM dưới dạng lead L0.
- **Kiểm soát trùng lặp**:
  - Nếu số điện thoại đã tồn tại trên hệ thống, CRM không tạo lead mới mà sẽ bắn thông báo "Trùng SĐT / Quan tâm lại" (`phone_reinterest`) cho nhân viên đang phụ trách lead cũ.
  - Sử dụng `row_hash` để loại bỏ các dòng gửi trùng lặp.
- GAS ghi nhận kết quả hàng loạt (Batch write status) vào cột cuối "Trạng thái cập nhật CRM" để tránh quét lại ở phiên tiếp theo.

### 2. Chiều Xuất (CRM ➔ Sheet_Out)
- GAS định kỳ gọi RPC `rpc_get_leads_for_outbound_sync` truyền mốc thời gian chạy cuối cùng để lấy các lead được cập nhật mới trên CRM.
- GAS ghi đè thông tin lên dòng tương ứng trên `SHEET_OUT` (Tra cứu nhanh theo dòng đã lưu `sheet_out_row` hoặc đối soát quét theo cột `Mã Lead` nếu dòng bị thay đổi do sắp xếp). Lead mới hoàn toàn sẽ được chèn thêm vào cuối trang.
- Sau khi đồng bộ thành công, GAS gửi danh sách dòng vừa ghi về CRM thông qua RPC `rpc_update_sheet_out_rows` để lưu vết dòng tương ứng, tránh việc ghi đè sai lệch.

---

## 🚀 Hướng dẫn cài đặt & Triển khai

### 1. Thiết lập Supabase Database
1. Tạo một dự án mới trên [Supabase](https://supabase.com).
2. Vào phần **SQL Editor**, tạo và chạy lần lượt các file SQL theo thứ tự:
   - `database/supabase_schema.sql` (Khởi tạo cấu trúc dữ liệu cơ bản)
   - `database/supabase_rls.sql` (Thiết lập chính sách bảo mật RLS cho các vai trò)
   - `database/supabase_rpc.sql` (Nạp các hàm xử lý nghiệp vụ, Dashboard và báo cáo)
   - Chạy các file `database/migration_*.sql` tùy thuộc nhu cầu nâng cấp tính năng.
3. Kích hoạt tính năng **Supabase Realtime** cho các bảng `leads`, `notifications`, `lead_notes`, `appointment_comments` thông qua giao diện hoặc chạy lệnh SQL tương ứng trong schema.

### 2. Cài đặt và Chạy Frontend dự án
1. Di chuyển vào thư mục `frontend`:
   ```bash
   cd frontend
   ```
2. Tạo file `.env` bằng cách sao chép từ file mẫu:
   ```bash
   cp .env.example .env
   ```
3. Mở `.env` và điền thông tin dự án Supabase của bạn:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
4. Cài đặt các gói phụ thuộc và khởi chạy máy chủ phát triển cục bộ:
   ```bash
   npm install
   npm run dev
   ```

### 3. Cài đặt Google Apps Script trên Google Sheets
1. Mở trang Google Sheet của bạn (Ví dụ: Sheet nhận data quảng cáo).
2. Chọn **Extensions** (Tiện ích mở rộng) ➔ **Apps Script**.
3. Sao chép và dán toàn bộ nội dung trong file `apps-script/sheet_in_trigger.gs` vào khung soạn thảo của Apps Script.
4. Sửa cấu hình `SUPABASE_URL` và `SUPABASE_ANON_KEY` ở đầu tệp khớp với dự án Supabase của bạn.
5. Lưu lại dự án Apps Script, bấm chạy hàm `setupAutoSync` một lần để kích hoạt cơ chế trigger định kỳ tự động chạy mỗi 1 phút.
6. Quay lại trang tính Google Sheet, tải lại trang sẽ xuất hiện một menu tiện ích **⚡ CRM UCMAS** trên thanh công cụ để thực hiện đồng bộ thủ công nhanh khi cần.
