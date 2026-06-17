# UCMAS VIETNAM — HƯỚNG DẪN XÂY DỰNG HỆ THỐNG CRM (BẢN HOÀN CHỈNH)

> **Tài liệu này là nguồn sự thật duy nhất (single source of truth)** để AI (Google Antigravity / Jules / Cursor / Lovable) xây dựng toàn bộ hệ thống CRM cho chuỗi 13 trung tâm UCMAS tại Hà Nội. Tài liệu đã tự chứa đầy đủ — không cần tham chiếu tài liệu nào khác.
>
> **Hai trụ cột xuyên suốt:**
> 1. **Toàn vẹn dữ liệu xuyên tầng** — mọi trường suy diễn do DB trigger tính; thay đổi 1 trường thì các trường phụ thuộc tự cập nhật đúng trong cùng transaction.
> 2. **Tự động hóa vận hành** — đồng bộ Google Sheets realtime 2 chiều, ghi mốc thời gian từng Level, tự thông báo bàn giao Sale → Trung tâm, lịch hẹn học thử trực quan dùng chung.

---

## MỤC LỤC

1. [Bối cảnh kinh doanh](#1-bối-cảnh-kinh-doanh)
2. [Luồng vận hành end-to-end](#2-luồng-vận-hành-end-to-end)
3. [Hệ thống Level / Trạng thái](#3-hệ-thống-level--trạng-thái)
4. [Nguyên tắc toàn vẹn dữ liệu](#4-nguyên-tắc-toàn-vẹn-dữ-liệu)
5. [Mô hình dữ liệu chi tiết](#5-mô-hình-dữ-liệu-chi-tiết)
6. [Ma trận liên kết & cascade](#6-ma-trận-liên-kết--cascade)
7. [Tầng Database — functions, triggers, view](#7-tầng-database--functions-triggers-view)
8. [Phân quyền & Phòng ban](#8-phân-quyền--phòng-ban)
9. [Tầng Backend — service & scope](#9-tầng-backend--service--scope)
10. [Tầng API](#10-tầng-api)
11. [Đồng bộ Google Sheets realtime 2 chiều](#11-đồng-bộ-google-sheets-realtime-2-chiều)
12. [Lịch hẹn học thử trực quan](#12-lịch-hẹn-học-thử-trực-quan)
13. [Thông báo & bàn giao](#13-thông-báo--bàn-giao)
14. [Báo cáo](#14-báo-cáo)
15. [Tầng Frontend](#15-tầng-frontend)
16. [Tổng hợp Validation](#16-tổng-hợp-validation)
17. [Tech Stack & Deliverables](#17-tech-stack--deliverables)
18. [Thứ tự triển khai](#18-thứ-tự-triển-khai)
19. [Bộ kiểm thử nghiệm thu](#19-bộ-kiểm-thử-nghiệm-thu)

---

## 1. Bối cảnh kinh doanh

Xây dựng **CRM web đầy đủ** cho UCMAS Vietnam — chuỗi giáo dục toán tư duy trẻ em với **13 cơ sở tại Hà Nội**, quản lý lead học viên qua pipeline nhiều cấp với 2 nguồn dữ liệu và quy trình tập trung → phân tán.

### 1.1 13 trung tâm

Cầu Giấy · Đội Cấn · Đông Anh · Hà Đông · Hàng Chuối · Linh Đàm · Đền Lừ · Phương Mai · Thanh Trì · Tây Hồ · Trung Hòa · Mỹ Đình · Trung Kính.

### 1.2 Hai nguồn dữ liệu

- **PULL**: Tổng công ty (HQ) chạy quảng cáo → lead từ mọi kênh đổ chung về **1 file Google Sheet** → auto-import lên CRM vào **kho chung L0** → Sale lọc, nâng L1, gán trung tâm.
- **PUSH**: Trung tâm tự tạo lead (giới thiệu, walk-in) — gán trung tâm ngay từ đầu.

---

## 2. Luồng vận hành end-to-end

```
[Các kênh Marketing] ──► 1 Google Sheet chung (SHEET_IN)
                                  │ auto-import realtime
                                  ▼
                         CRM — Kho chung L0
                                  │
        ┌─────────────────────────┴──────────────────────────┐
        │  GIAI ĐOẠN 1 — SALE ĐẶT LỊCH (Phòng Marketing)      │
        │  Phụ trách: L0 → L1 → (L2.2A/L2.2O/L2.2OS) → L2.2B  │
        │  Mục tiêu: liên hệ, chăm sóc, ĐẶT LỊCH HỌC THỬ       │
        └─────────────────────────┬──────────────────────────┘
                                  │ Chuyển lên L2.2B "Đã hẹn lịch học thử"
                                  ▼
                  ⚡ TỰ ĐỘNG THÔNG BÁO cho trung tâm sở hữu data
                  📅 Buổi hẹn hiện lên LỊCH HẸN dùng chung
                                  │
        ┌─────────────────────────┴──────────────────────────┐
        │  GIAI ĐOẠN 2 — BỘ PHẬN TRUNG TÂM                    │
        │  Phụ trách: L2.2B → L3 (học thử) → L4 (đóng phí)     │
        └─────────────────────────────────────────────────────┘
```

- **Sale đặt lịch** (nhóm `marketing`): vận hành từ `L0` đến `L2.2B`.
- **Bộ phận trung tâm** (nhóm `center`): tiếp nhận từ `L2.2B` trở đi.
- `L2.2B` là **điểm bàn giao**: đích của Sale, khởi đầu của Trung tâm.
- Kho chung **L0 chỉ Admin & Marketing thấy**; Trung tâm chỉ thấy data của mình **từ L1 trở lên**.

---

## 3. Hệ thống Level / Trạng thái

Triển khai **chính xác** toàn bộ. `level_group` = tiền tố số (L2.2O → L2).

| Mã | Mô tả | `level_group` | Màu badge | Loại |
|----|-------|:---:|-----------|------|
| `L0` | Data đầu vào (kho chung) | L0 | Xám nhạt | Khởi đầu |
| `L1` | Đã có đủ 3 thông tin (SĐT, năm sinh con, địa chỉ) | L1 | Xanh dương nhạt | Cơ bản |
| `L1.2` | Đã gọi nhưng không nghe máy / thuê bao / bận — gọi lại sau | L1 | Xám | Chờ |
| `L1.3` | Dừng chăm sóc (Sai số, không đăng ký, trẻ con) | L1 | Đỏ | Level thường |
| `L2.2A` | Đã gọi, suy nghĩ thêm, gọi lại sau | L2 | Vàng | Chờ |
| `L2.2B` | **Đã hẹn lịch học thử** | L2 | Cam đậm | ⭐ Milestone + 🔔 Bàn giao |
| `L2.2O` | Đã gửi bài test online | L2 | Cam đậm | ⭐ Milestone |
| `L2.2OS` | Đã hoàn thành bài test online | L2 | Cam đậm | ⭐ Milestone |
| `L2.3` | Dừng chăm sóc (Hết nhu cầu) | L2 | Đỏ | Level thường |
| `L3.O` | Đã tham gia tư vấn trực tuyến | L3 | Cam đậm | ⭐ Milestone |
| `L3.1` | Đã tham gia học thử | L3 | Xanh lá | Tiến triển |
| `L3.3` | Dừng chăm sóc (Hết nhu cầu) | L3 | Đỏ | Level thường |
| `L4.1` … `L4.13` | Đóng học phí 1 … 13 khóa | L4 | Xanh lá đậm dần | Chốt |
| `L5` | Lên cấp | L5 | Xanh dương | VIP |
| `L6` | Học viên giới thiệu học viên khác | L6 | Tím | Referral |

> **Lưu ý:** `L1.3`, `L2.3`, `L3.3` ("Dừng chăm sóc") là **level khách hàng bình thường** — chuyển đổi tự do, **không** có logic chặn, **không** loại khỏi database, **không** làm mờ. Badge để màu đỏ chỉ nhằm dễ nhận biết.

**Hằng số dùng chung** (`config/levels.js`):

```javascript
const MILESTONE_LEVELS = ['L2.2B', 'L2.2O', 'L2.2OS', 'L3.O']; // dùng để thông báo
const HANDOFF_LEVEL    = 'L2.2B';                              // bàn giao Sale → Trung tâm
// KHÔNG có khái niệm terminal.

function getLevelGroup(code) {
  const m = code.match(/^L(\d)/);
  return m ? 'L' + m[1] : 'L0';
}
function getPaidCourses(code) {
  const m = code.match(/^L4\.(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
```

---

## 4. Nguyên tắc toàn vẹn dữ liệu

### 4.1 Ba loại trường

| Loại | Ai được ghi | Ví dụ |
|------|-------------|-------|
| **Nguồn** | Service layer (user/sync nhập) | `level_code`, `phone`, `assigned_center`, `trial_appointment_at` |
| **Suy diễn (computed)** | CHỈ DB trigger | `level_group`, `is_milestone`, `paid_courses_count` |
| **Mốc thời gian (derived)** | CHỈ DB trigger | `entered_lX_at`, `appointment_booked_at`, `handed_off_at`, `last_level_change_at`, `updated_at` |

**Quy tắc vàng:** trường computed & derived **không bao giờ** được ghi tay từ API hay sync. DB trigger luôn tính lại từ trường nguồn → dù thay đổi đến từ giao diện, API, hay Google Sheets, dữ liệu suy diễn luôn nhất quán tuyệt đối.

### 4.2 Sơ đồ phụ thuộc

```
level_code ──► level_group, is_milestone, paid_courses_count   (computed)
           ──► last_level_change_at                            (timestamp)
           ──► entered_lX_at (theo nhóm, đóng dấu lần đầu)      (timestamp)
           ──► appointment_booked_at + handed_off_at (khi = L2.2B)
           ──► INSERT lead_level_history                        (audit)
           ──► (milestone) notification; (L2.2B) bàn giao trung tâm

assigned_center ──► ràng buộc: chỉ set khi level_group ≠ L0
                ──► notification cho Center khi gán mới
phone/child_birth_year/address ──► ràng buộc: đủ cả 3 trước khi > L0
note mới ──► last_contact_at = NOW()
```

### 4.3 Bảo vệ 3 lớp

1. **DB constraint + trigger** (lớp cuối, không bypass được).
2. **Service layer transaction** (set biến phiên `app.current_user_id` cho trigger biết "ai").
3. **Frontend validation** (UX, báo lỗi sớm).

---

## 5. Mô hình dữ liệu chi tiết

> Yêu cầu: PostgreSQL 15, `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

### 5.1 `departments` (phòng ban)

```sql
CREATE TABLE departments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(30) UNIQUE NOT NULL,   -- ADMIN / MARKETING / CENTERS
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 `centers` (13 trung tâm)

```sql
CREATE TABLE centers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(20) UNIQUE NOT NULL,
    name       VARCHAR(255) NOT NULL,
    address    TEXT,
    manager_id UUID,
    phone      VARCHAR(20),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 `sub_departments` (bộ phận)

```sql
CREATE TABLE sub_departments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    code          VARCHAR(40) UNIQUE NOT NULL,   -- DIGITAL / SALE_BOOKING / CENTER_CAU_GIAY...
    name          VARCHAR(255) NOT NULL,
    center_id     UUID REFERENCES centers(id) ON DELETE SET NULL, -- nếu là bộ phận trung tâm
    default_permission_group VARCHAR(20)
                  CHECK (default_permission_group IN ('admin','marketing','center')),
    default_level_cap   VARCHAR(5),
    default_center_mode VARCHAR(10) DEFAULT 'all'
                  CHECK (default_center_mode IN ('all','specific','own')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subdept_dept   ON sub_departments(department_id);
CREATE INDEX idx_subdept_center ON sub_departments(center_id);
```

### 5.4 `users`

```sql
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name          VARCHAR(255) NOT NULL,
    email              VARCHAR(255) UNIQUE NOT NULL,
    password           VARCHAR(255) NOT NULL,             -- bcrypt
    department_id      UUID REFERENCES departments(id)     ON DELETE SET NULL,
    sub_department_id  UUID REFERENCES sub_departments(id) ON DELETE SET NULL,

    permission_group   VARCHAR(20) NOT NULL DEFAULT 'center'
                       CHECK (permission_group IN ('admin','marketing','center')),
    is_manager         BOOLEAN NOT NULL DEFAULT FALSE,

    -- Thuộc tính phạm vi
    can_view_l0_pool   BOOLEAN NOT NULL DEFAULT FALSE,
    level_access_cap   VARCHAR(5),                          -- NULL = không giới hạn
    center_access_mode VARCHAR(10) NOT NULL DEFAULT 'own'
                       CHECK (center_access_mode IN ('all','specific','own')),
    allowed_center_ids UUID[],
    center_id          UUID REFERENCES centers(id) ON DELETE SET NULL,

    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_perm_center CHECK (
      (permission_group = 'center'
         AND center_id IS NOT NULL AND center_access_mode = 'own'
         AND can_view_l0_pool = FALSE)
      OR (permission_group = 'admin'
         AND can_view_l0_pool = TRUE AND center_access_mode = 'all')
      OR (permission_group = 'marketing')
    ),
    CONSTRAINT chk_specific_centers CHECK (
      center_access_mode <> 'specific'
      OR (allowed_center_ids IS NOT NULL AND array_length(allowed_center_ids,1) >= 1)
    ),
    CONSTRAINT chk_level_cap CHECK (
      level_access_cap IS NULL OR
      level_access_cap IN ('L0','L1','L2','L3','L4','L5','L6')
    )
);

ALTER TABLE centers
  ADD CONSTRAINT fk_center_manager
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;
```

### 5.5 `leads` — bảng trung tâm

```sql
CREATE TABLE leads (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name            VARCHAR(255) NOT NULL,
    phone                VARCHAR(20),
    child_birth_year     INTEGER,
    address              TEXT,
    source_type          VARCHAR(10) NOT NULL DEFAULT 'PULL'
                         CHECK (source_type IN ('PULL','PUSH')),
    ad_campaign          VARCHAR(255),

    -- Trạng thái
    level_code           VARCHAR(20) NOT NULL DEFAULT 'L0',
    level_group          VARCHAR(5)  NOT NULL DEFAULT 'L0',   -- computed
    is_milestone         BOOLEAN     NOT NULL DEFAULT FALSE,  -- computed
    paid_courses_count   INTEGER     NOT NULL DEFAULT 0,      -- computed

    -- Quan hệ
    assigned_center      UUID REFERENCES centers(id) ON DELETE SET NULL,
    assigned_staff       UUID REFERENCES users(id)   ON DELETE SET NULL,

    -- Lịch hẹn
    trial_appointment_at TIMESTAMPTZ,                          -- nguồn (Sale nhập)
    next_followup_at     TIMESTAMPTZ,

    -- Mốc thời gian Level (derived — trigger đóng dấu)
    entered_l0_at         TIMESTAMPTZ,   -- "Thời gian vào hệ thống"
    entered_l1_at         TIMESTAMPTZ,
    entered_l2_at         TIMESTAMPTZ,
    entered_l3_at         TIMESTAMPTZ,
    entered_l4_at         TIMESTAMPTZ,
    entered_l5_at         TIMESTAMPTZ,
    entered_l6_at         TIMESTAMPTZ,
    appointment_booked_at TIMESTAMPTZ,   -- khi đạt L2.2B lần đầu
    handed_off_at         TIMESTAMPTZ,   -- = appointment_booked_at
    last_level_change_at  TIMESTAMPTZ,
    last_contact_at       TIMESTAMPTZ,

    tags                 TEXT[],

    -- Đồng bộ Google Sheets
    external_source      VARCHAR(20) NOT NULL DEFAULT 'system', -- system / sheet_in
    sheet_in_row         INTEGER,
    sheet_out_row        INTEGER,
    row_hash             VARCHAR(64),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_center_requires_l1 CHECK (
      level_group = 'L0' OR assigned_center IS NOT NULL
    ),
    CONSTRAINT chk_l1_requires_info CHECK (
      level_group = 'L0' OR
      (phone IS NOT NULL AND child_birth_year IS NOT NULL AND address IS NOT NULL)
    ),
    CONSTRAINT chk_birth_year CHECK (
      child_birth_year IS NULL OR
      (child_birth_year >= 2015 AND child_birth_year <= EXTRACT(YEAR FROM NOW()))
    )
);

CREATE INDEX idx_leads_level_group ON leads(level_group);
CREATE INDEX idx_leads_center      ON leads(assigned_center);
CREATE INDEX idx_leads_staff       ON leads(assigned_staff);
CREATE INDEX idx_leads_followup    ON leads(next_followup_at);
CREATE INDEX idx_leads_appt        ON leads(trial_appointment_at);
CREATE INDEX idx_leads_entered_l2  ON leads(entered_l2_at);
CREATE INDEX idx_leads_entered_l3  ON leads(entered_l3_at);
CREATE INDEX idx_leads_entered_l4  ON leads(entered_l4_at);
CREATE UNIQUE INDEX idx_leads_phone_uniq ON leads(phone) WHERE phone IS NOT NULL;
```

> `phone` UNIQUE (bỏ qua NULL) = **khóa nghiệp vụ** để sync nhận diện lead trùng → upsert thay vì tạo mới.

### 5.6 `lead_level_history` — audit append-only

```sql
CREATE TABLE lead_level_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    changed_by  UUID REFERENCES users(id),
    from_level  VARCHAR(20),
    to_level    VARCHAR(20) NOT NULL,
    note        TEXT,
    center_id   UUID REFERENCES centers(id),
    source      VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual / api / sheet_sync
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llh_lead    ON lead_level_history(lead_id);
CREATE INDEX idx_llh_created ON lead_level_history(created_at DESC);
CREATE INDEX idx_llh_to      ON lead_level_history(to_level);
CREATE RULE llh_no_update AS ON UPDATE TO lead_level_history DO INSTEAD NOTHING;
CREATE RULE llh_no_delete AS ON DELETE TO lead_level_history DO INSTEAD NOTHING;
```

### 5.7 `lead_notes`

```sql
CREATE TABLE lead_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id  UUID REFERENCES users(id),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_lead ON lead_notes(lead_id, created_at DESC);
```

### 5.8 `sync_log`

```sql
CREATE TABLE sync_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction     VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
    lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
    sheet_name    VARCHAR(100),
    sheet_row     INTEGER,
    row_hash      VARCHAR(64),
    payload       JSONB,
    status        VARCHAR(20) NOT NULL DEFAULT 'success'
                  CHECK (status IN ('success','failed','skipped')),
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_synclog_hash ON sync_log(row_hash);
CREATE INDEX idx_synclog_lead ON sync_log(lead_id, created_at DESC);
```

### 5.9 `notifications`

```sql
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(40) NOT NULL,  -- milestone / overdue / new_assignment / handoff_appointment
    lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);
```

---

## 6. Ma trận liên kết & cascade

| Khi thay đổi… | Tự động cập nhật… | Cơ chế | Tầng |
|---------------|-------------------|--------|------|
| `level_code` | `level_group`, `is_milestone`, `paid_courses_count` | Trigger BEFORE | DB |
| `level_code` | `last_level_change_at`, `entered_lX_at` (lần đầu) | Trigger BEFORE | DB |
| `level_code` = L2.2B | `appointment_booked_at`, `handed_off_at` | Trigger BEFORE | DB |
| `level_code` | INSERT `lead_level_history` | Trigger AFTER | DB |
| `level_code` → milestone | `notifications` cho staff + manager | Service afterCommit | Backend |
| `level_code` = L2.2B | Thông báo **mọi user trung tâm sở hữu** + hiện trên Lịch hẹn | Service + realtime | Backend |
| bất kỳ field `leads` | `updated_at`, `row_hash`; enqueue OUTBOUND sync | Trigger + NOTIFY | DB+Backend |
| thêm `lead_notes` | `leads.last_contact_at = NOW()` | Trigger AFTER INSERT | DB |
| `assigned_center` | thông báo Manager trung tâm mới | Service | Backend |
| xóa `users` | `leads.assigned_staff → NULL` | FK SET NULL | DB |
| xóa `centers` | `leads.assigned_center → NULL`, `users.center_id → NULL` | FK SET NULL | DB |
| xóa `leads` | CASCADE xóa notes + history | FK CASCADE | DB |
| INBOUND sheet sửa | upsert `leads` theo `phone`; level đổi → ghi history | Sync → Service | Backend |
| bất kỳ thay đổi `leads` | ghi dòng vào SHEET_OUT (realtime) | OUTBOUND worker | Backend |

---

## 7. Tầng Database — functions, triggers, view

### 7.1 Hàm tính hạng Level

```sql
CREATE OR REPLACE FUNCTION level_rank(g VARCHAR) RETURNS INT AS $$
  SELECT CASE g
    WHEN 'L0' THEN 0 WHEN 'L1' THEN 1 WHEN 'L2' THEN 2 WHEN 'L3' THEN 3
    WHEN 'L4' THEN 4 WHEN 'L5' THEN 5 WHEN 'L6' THEN 6 ELSE 0 END;
$$ LANGUAGE sql IMMUTABLE;
```

### 7.2 Trigger chuẩn hóa + đóng dấu mốc (BEFORE INSERT/UPDATE)

```sql
CREATE OR REPLACE FUNCTION fn_normalize_lead() RETURNS TRIGGER AS $$
BEGIN
    -- Computed fields
    NEW.level_group := 'L' || COALESCE(substring(NEW.level_code FROM '^L(\d)'), '0');
    NEW.is_milestone := NEW.level_code IN ('L2.2B','L2.2O','L2.2OS','L3.O');

    IF NEW.level_code ~ '^L4\.\d+' THEN
        NEW.paid_courses_count := (substring(NEW.level_code FROM '^L4\.(\d+)'))::int;
    ELSE
        NEW.paid_courses_count := 0;
    END IF;

    -- last_level_change_at
    IF TG_OP = 'INSERT' THEN
        NEW.last_level_change_at := NOW();
    ELSIF NEW.level_code IS DISTINCT FROM OLD.level_code THEN
        NEW.last_level_change_at := NOW();
    END IF;

    NEW.updated_at := NOW();

    -- "Thời gian vào hệ thống"
    IF TG_OP = 'INSERT' THEN
        NEW.entered_l0_at := COALESCE(NEW.entered_l0_at, NOW());
    END IF;

    -- Đóng dấu mốc nhóm Level hiện tại (lần đầu, idempotent)
    CASE NEW.level_group
        WHEN 'L1' THEN NEW.entered_l1_at := COALESCE(NEW.entered_l1_at, NOW());
        WHEN 'L2' THEN NEW.entered_l2_at := COALESCE(NEW.entered_l2_at, NOW());
        WHEN 'L3' THEN NEW.entered_l3_at := COALESCE(NEW.entered_l3_at, NOW());
        WHEN 'L4' THEN NEW.entered_l4_at := COALESCE(NEW.entered_l4_at, NOW());
        WHEN 'L5' THEN NEW.entered_l5_at := COALESCE(NEW.entered_l5_at, NOW());
        WHEN 'L6' THEN NEW.entered_l6_at := COALESCE(NEW.entered_l6_at, NOW());
        ELSE NULL;
    END CASE;

    -- Mốc đặt lịch + bàn giao (đạt L2.2B lần đầu)
    IF NEW.level_code = 'L2.2B' AND NEW.appointment_booked_at IS NULL THEN
        NEW.appointment_booked_at := NOW();
        NEW.handed_off_at         := NOW();
    END IF;

    -- row_hash (chống ghi trùng khi sync)
    NEW.row_hash := encode(digest(
        COALESCE(NEW.full_name,'') || '|' || COALESCE(NEW.phone,'') || '|' ||
        COALESCE(NEW.child_birth_year::text,'') || '|' || COALESCE(NEW.address,'') || '|' ||
        NEW.level_code || '|' || COALESCE(NEW.assigned_center::text,'') || '|' ||
        COALESCE(NEW.trial_appointment_at::text,''),
        'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_lead
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_normalize_lead();
```

### 7.3 Trigger ghi lịch sử Level (AFTER INSERT/UPDATE)

```sql
CREATE OR REPLACE FUNCTION fn_log_level_change() RETURNS TRIGGER AS $$
DECLARE
    actor UUID;
    src   VARCHAR(20);
BEGIN
    actor := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
    src   := COALESCE(NULLIF(current_setting('app.sync_source', true), ''), 'manual');

    IF TG_OP = 'INSERT' THEN
        INSERT INTO lead_level_history(lead_id, changed_by, from_level, to_level, center_id, source)
        VALUES (NEW.id, actor, NULL, NEW.level_code, NEW.assigned_center, src);
    ELSIF NEW.level_code IS DISTINCT FROM OLD.level_code THEN
        INSERT INTO lead_level_history(lead_id, changed_by, from_level, to_level, center_id, source)
        VALUES (NEW.id, actor, OLD.level_code, NEW.level_code, NEW.assigned_center, src);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_level_change
    AFTER INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_log_level_change();
```

### 7.4 Trigger cập nhật `last_contact_at`

```sql
CREATE OR REPLACE FUNCTION fn_touch_last_contact() RETURNS TRIGGER AS $$
BEGIN
    UPDATE leads SET last_contact_at = NOW() WHERE id = NEW.lead_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_contact
    AFTER INSERT ON lead_notes
    FOR EACH ROW EXECUTE FUNCTION fn_touch_last_contact();
```

### 7.5 Trigger phát tín hiệu OUTBOUND sync

```sql
CREATE OR REPLACE FUNCTION fn_notify_lead_change() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('lead_changed',
      json_build_object('lead_id', NEW.id, 'row_hash', NEW.row_hash, 'op', TG_OP)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_lead_change
    AFTER INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_notify_lead_change();
```

### 7.6 View lịch hẹn học thử

```sql
CREATE OR REPLACE VIEW v_trial_appointments AS
SELECT
  l.id, l.full_name, l.phone, l.child_birth_year,
  l.assigned_center, c.name AS center_name,
  l.assigned_staff, u.full_name AS sale_name,
  l.level_code, l.level_group, l.trial_appointment_at, l.appointment_booked_at,
  CASE
    WHEN l.entered_l3_at IS NOT NULL      THEN 'attended'
    WHEN l.level_code = 'L2.3'            THEN 'cancelled'
    WHEN l.trial_appointment_at < NOW()   THEN 'missed'
    ELSE 'scheduled'
  END AS appt_status
FROM leads l
LEFT JOIN centers c ON l.assigned_center = c.id
LEFT JOIN users   u ON l.assigned_staff  = u.id
WHERE l.trial_appointment_at IS NOT NULL;
```

---

## 8. Phân quyền & Phòng ban

### 8.1 Cây tổ chức

```
ADMIN (admin)
PHÒNG MARKETING
   ├── Digital                     (marketing — cấu hình Level cap + trung tâm)
   └── Sale đặt lịch & trực page    (marketing — thường cap L2)
KHỐI TRUNG TÂM
   └── 13 bộ phận (center) — mỗi bộ phận gắn 1 center, chỉ xem L1+ của mình
```

### 8.2 Ba nhóm quyền

| Nhóm | Kho L0 | Data L1+ | Phạm vi trung tâm | Phạm vi Level |
|------|:------:|:--------:|-------------------|---------------|
| `admin` | ✓ | ✓ | Tất cả | Tất cả |
| `marketing` | ✓ (nếu `can_view_l0_pool`) | ✓ | `all` / `specific` (cấu hình) | đến `level_access_cap` (cấu hình) |
| `center` | ✗ | ✓ (chỉ trung tâm mình) | Cố định = mình | **chỉ L1+** |

**Quy tắc kho chung L0:** chỉ `admin` & `marketing` thấy L0. Vì lead L0 có `assigned_center = NULL`, nhóm `center` (lọc theo center + loại L0) **tự động không bao giờ** thấy L0.

### 8.3 Quyền hành động

| Hành động | admin | marketing | center staff | center manager |
|-----------|:-----:|:---------:|:------------:|:--------------:|
| Xem kho L0 | ✓ | ✓ | ✗ | ✗ |
| Nâng L0→L1 + gán trung tâm | ✓ | ✓ | ✗ | ✗ |
| Chăm sóc L1+ (đổi status, ghi chú) | ✓ | ✓ (scope) | ✓ (mình) | ✓ (mình) |
| Phân công nội bộ trung tâm | ✓ | ✗ | ✗ | ✓ |
| Quản trị user / phòng ban / sync | ✓ | ✗ | ✗ | ✗ |

---

## 9. Tầng Backend — service & scope

### 9.1 Scope danh sách lead

```javascript
// middleware/leadScope.js
function applyLeadScope(query, user) {
  switch (user.permission_group) {
    case 'admin':
      return query;
    case 'center':
      return query.where('leads.assigned_center', user.center_id)
                  .whereNot('leads.level_group', 'L0');
    case 'marketing':
      return query.where(function () {
        if (user.can_view_l0_pool) this.orWhere('leads.level_group', 'L0');
        this.orWhere(function () {
          this.whereNot('leads.level_group', 'L0');
          if (user.level_access_cap)
            this.whereRaw('level_rank(leads.level_group) <= level_rank(?)', [user.level_access_cap]);
          if (user.center_access_mode === 'specific') {
            const ids = user.allowed_center_ids || [];
            ids.length ? this.whereIn('leads.assigned_center', ids) : this.whereRaw('1=0');
          }
        });
      });
    default:
      return query.whereRaw('1=0');
  }
}
```

### 9.2 Service cập nhật lead (transaction + actor cho trigger)

```javascript
// services/leadService.js
const { MILESTONE_LEVELS, HANDOFF_LEVEL } = require('../config/levels');

async function updateLead(leadId, changes, userId, { syncSource = 'manual', note = null } = {}) {
  return await db.transaction(async (trx) => {
    await trx.raw(`SET LOCAL app.current_user_id = ?`, [userId || '']);
    await trx.raw(`SET LOCAL app.sync_source = ?`, [syncSource]);

    const lead = await trx('leads').where({ id: leadId }).first();
    if (!lead) throw new AppError('Lead không tồn tại', 404);

    const newLevel = changes.level_code ?? lead.level_code;

    // Validation chuyển level
    if (newLevel !== lead.level_code) {
      const willGroup = newLevel === 'L0' ? 'L0' : 'L' + newLevel.match(/^L(\d)/)[1];
      if (willGroup !== 'L0') {
        const phone = changes.phone ?? lead.phone;
        const year  = changes.child_birth_year ?? lead.child_birth_year;
        const addr  = changes.address ?? lead.address;
        if (!phone || !year || !addr)
          throw new AppError('Cần đủ SĐT, năm sinh con và địa chỉ trước khi nâng level', 422);
      }
      if (newLevel === 'L2.2B') {
        const appt = changes.trial_appointment_at ?? lead.trial_appointment_at;
        if (!appt) throw new AppError('Cần nhập ngày giờ hẹn học thử khi đặt lịch (L2.2B)', 422);
      }
    }

    // KHÔNG truyền computed/derived vào changes
    const [updated] = await trx('leads').where({ id: leadId }).update({ ...changes }).returning('*');

    if (note && newLevel !== lead.level_code) {
      await trx('lead_level_history')
        .where({ lead_id: leadId, to_level: newLevel })
        .orderBy('created_at','desc').limit(1).update({ note });
    }

    trx.afterCommit(async () => {
      if (MILESTONE_LEVELS.includes(newLevel) && newLevel !== lead.level_code)
        await notificationService.sendMilestoneAlert(updated);
      if (newLevel === HANDOFF_LEVEL && lead.level_code !== HANDOFF_LEVEL)
        await notificationService.notifyCenterHandoff(updated);
      if (changes.assigned_center && changes.assigned_center !== lead.assigned_center)
        await notificationService.notifyNewAssignment(updated);
      // OUTBOUND sync tự chạy nhờ pg_notify('lead_changed')
    });

    return updated;
  });
}
```

> `changes` **không bao giờ** chứa: `level_group`, `is_milestone`, `paid_courses_count`, `row_hash`, `updated_at`, `last_level_change_at`, `entered_*_at`, `appointment_booked_at`, `handed_off_at`. DB trigger tự lo.

---

## 10. Tầng API

| Method & Endpoint | Mô tả | Quyền |
|-------------------|-------|-------|
| `POST /api/auth/login` | Đăng nhập, trả JWT | Public |
| `GET /api/leads` | Danh sách + filter + phân trang (scope theo role) | Mọi role |
| `POST /api/leads` | Tạo lead | hq/sale/admin |
| `GET /api/leads/:id` | Chi tiết | Theo scope |
| `PATCH /api/leads/:id` | Cập nhật (gồm đổi level, đặt lịch) | Theo scope |
| `GET /api/leads/:id/level-history` | Lịch sử Level | Theo scope |
| `POST /api/leads/:id/notes` | Thêm ghi chú | Theo scope |
| `POST /api/leads/bulk-assign` | Gán hàng loạt trung tâm | marketing/admin |
| `POST /api/leads/import` | Import CSV | marketing/admin |
| `GET /api/appointments` | Lịch hẹn học thử (calendar) | admin/marketing/center |
| `GET /api/dashboard/hq` | Dashboard HQ | admin/marketing |
| `GET /api/dashboard/center/:id` | Dashboard trung tâm | manager center |
| `GET /api/reports/*` | Báo cáo | admin/manager |
| `GET /api/notifications` | Thông báo của tôi | Mọi role |
| `GET /api/departments` · `POST` · `POST /:id/sub` | Quản lý phòng ban | admin |
| `GET /api/users` · `POST` · `PATCH /:id/permissions` | Quản lý user & quyền | admin |
| `POST /api/sync/inbound` | Webhook nhận từ SHEET_IN (HMAC) | Signed |
| `GET /api/sync/status` · `POST /api/sync/reconcile` | Trạng thái / đối soát sync | admin |

---

## 11. Đồng bộ Google Sheets realtime 2 chiều

Hai sheet **tách biệt** để tránh vòng lặp.

| Luồng | Hướng | Sheet | Cơ chế | Độ trễ |
|-------|-------|-------|--------|--------|
| INBOUND | Sheet → Hệ thống | `SHEET_IN` | Apps Script `onChange` → webhook | 1–5s |
| OUTBOUND | Hệ thống → Sheet | `SHEET_OUT` | `pg_notify` → Sheets API | <1s |
| Đối soát | hai chiều | cả hai | Cron 2 phút (lưới an toàn) | 2 phút |

**Chống vòng lặp 3 lớp:** (1) hai sheet khác nhau; (2) `row_hash` idempotency tra `sync_log`; (3) cờ `external_source`.

### 11.1 Mapping cột

```javascript
// SHEET_IN: A=lead_id_marker(ẩn), B=full_name, C=phone, D=child_birth_year,
//           E=address, F=source_type, G=ad_campaign, H=level_code, I=trial_appointment_at
const SHEET_OUT_MAP = {
  A:'id', B:'full_name', C:'phone', D:'child_birth_year', E:'address',
  F:'source_type', G:'level_code', H:'level_group', I:'paid_courses_count',
  J:'assigned_center_name', K:'assigned_staff_name',
  L:'entered_l0_at', M:'entered_l1_at', N:'entered_l2_at',
  O:'appointment_booked_at', P:'trial_appointment_at',
  Q:'entered_l3_at', R:'entered_l4_at', S:'last_level_change_at', T:'updated_at',
};
```

### 11.2 INBOUND — Apps Script (gắn vào SHEET_IN)

```javascript
const WEBHOOK_URL = 'https://crm.ucmas.vn/api/sync/inbound';
const SHARED_SECRET = 'KEY_BI_MAT';

function onChangeTrigger(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== 'SHEET_IN') return;
  const row = sheet.getActiveRange().getRow();
  if (row < 2) return;
  const v = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const payload = { sheet:'SHEET_IN', row, values: {
    lead_id_marker:v[0], full_name:v[1], phone:String(v[2]), child_birth_year:v[3],
    address:v[4], source_type:v[5]||'PULL', ad_campaign:v[6],
    level_code:v[7]||'L0', trial_appointment_at:v[8]||null
  }, ts: Date.now() };
  const sig = Utilities.computeHmacSha256Signature(JSON.stringify(payload), SHARED_SECRET);
  const sigHex = sig.map(b => ('0'+(b & 0xff).toString(16)).slice(-2)).join('');
  UrlFetchApp.fetch(WEBHOOK_URL, { method:'post', contentType:'application/json',
    payload: JSON.stringify(payload), headers:{ 'X-Signature': sigHex }, muteHttpExceptions:true });
}
```

**Worker INBOUND:** verify HMAC → tính `row_hash` → tra `sync_log` (bỏ qua nếu trùng) → upsert theo `phone` qua `leadService` với `syncSource='sheet_sync'` → ghi `sync_log`.

### 11.3 OUTBOUND — `LISTEN lead_changed` → Sheets API

Backend `LISTEN lead_changed`; mỗi tín hiệu: nếu `row_hash` chưa từng đẩy (tra `sync_log`) → ghi/append dòng vào SHEET_OUT theo `sheet_out_row` (append thì lưu lại số dòng) → ghi `sync_log`.

### 11.4 Cấu hình (Settings — admin)

`SHEET_IN_ID`, `SHEET_OUT_ID`, Service Account JSON (Editor cho cả 2 sheet), `SHARED_SECRET`; nút "Kiểm tra kết nối / Đối soát ngay / Đẩy lại toàn bộ"; hiển thị thời gian sync cuối + log lỗi.

---

## 12. Lịch hẹn học thử trực quan

**Trang "Lịch hẹn học thử"** — dùng chung cho **Sale đặt lịch và bộ phận trung tâm**.

### 12.1 Scope lịch hẹn (rộng hơn scope lead — bỏ level cap)

```javascript
function applyAppointmentScope(query, user) {
  switch (user.permission_group) {
    case 'admin':  return query;
    case 'center': return query.where('assigned_center', user.center_id);
    case 'marketing':
      if (user.center_access_mode === 'specific') {
        const ids = user.allowed_center_ids || [];
        return ids.length ? query.whereIn('assigned_center', ids) : query.whereRaw('1=0');
      }
      return query;
    default: return query.whereRaw('1=0');
  }
}
```

> Bỏ level cap ở màn lịch để Sale (cap L2) vẫn thấy buổi hẹn mình đặt có diễn ra (lên L3) hay không.

### 12.2 API

```
GET /api/appointments?from=&to=&center_id=&status=
```
Truy vấn `v_trial_appointments`, lọc khoảng ngày + (tùy chọn) trung tâm/trạng thái, áp `applyAppointmentScope`.

### 12.3 Giao diện

- FullCalendar (React): Tháng/Tuần/Ngày/Danh sách, mặc định Tuần.
- Màu sự kiện theo `appt_status`: `scheduled` xanh dương · `attended` xanh lá · `missed` cam · `cancelled` xám.
- Mỗi event: giờ hẹn · tên khách · năm sinh con · trung tâm · Sale đặt lịch · badge trạng thái. Click → mở chi tiết lead.
- Widget "Hôm nay" trên Dashboard. Lọc theo trung tâm/trạng thái.
- **Realtime:** đặt lịch mới (L2.2B) hoặc lên L3 → calendar 2 bên tự cập nhật qua WebSocket.

---

## 13. Thông báo & bàn giao

### 13.1 Thông báo bàn giao tại L2.2B

```javascript
// services/notificationService.js
async function notifyCenterHandoff(lead) {
  if (!lead.assigned_center) return;
  const recipients = await db('users')
    .where({ center_id: lead.assigned_center, is_active: true, permission_group: 'center' });
  if (!recipients.length) return;
  const center = await db('centers').where({ id: lead.assigned_center }).first();
  const apptText = lead.trial_appointment_at
    ? `lúc ${formatDateTime(lead.trial_appointment_at)}` : '(chưa rõ giờ — liên hệ Sale)';
  const message = `🔔 Lịch hẹn học thử mới tại ${center.name}: ${lead.full_name} `
    + `(SĐT ${lead.phone}, con sinh ${lead.child_birth_year}) đã đặt lịch ${apptText}. `
    + `Vui lòng tiếp nhận chăm sóc.`;
  await db('notifications').insert(recipients.map(u => ({
    user_id:u.id, type:'handoff_appointment', lead_id:lead.id, message })));
  recipients.forEach(u => realtime.emitToUser(u.id, 'notification',
    { type:'handoff_appointment', lead, message }));
}
```

### 13.2 Các thông báo khác

| Sự kiện | Người nhận |
|---------|-----------|
| Lead đạt L2.2B (đặt lịch) | **Mọi user trung tâm sở hữu** (handoff) |
| Lead đạt L2.2O / L2.2OS / L3.O | Nhân viên phụ trách + Manager trung tâm |
| HQ/Marketing gán L1 mới cho trung tâm | Manager trung tâm |
| Follow-up quá hạn | Nhân viên phụ trách |

---

## 14. Báo cáo

**Tốc độ phễu (time-in-stage) — tận dụng mốc thời gian:**

```sql
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (entered_l1_at - entered_l0_at))/3600),1) AS gio_l0_l1,
  ROUND(AVG(EXTRACT(EPOCH FROM (entered_l2_at - entered_l1_at))/3600),1) AS gio_l1_l2,
  ROUND(AVG(EXTRACT(EPOCH FROM (appointment_booked_at - entered_l2_at))/3600),1) AS gio_l2_hen,
  ROUND(AVG(EXTRACT(EPOCH FROM (entered_l3_at - appointment_booked_at))/3600),1) AS gio_hen_hocthu,
  ROUND(AVG(EXTRACT(EPOCH FROM (entered_l4_at - entered_l3_at))/3600),1) AS gio_hocthu_dongphi
FROM leads;
```

**Tỷ lệ chốt sau bàn giao theo trung tâm (L2.2B → L4):**

```sql
SELECT c.name AS trung_tam,
  COUNT(*) FILTER (WHERE l.appointment_booked_at IS NOT NULL) AS nhan_ban_giao,
  COUNT(*) FILTER (WHERE l.entered_l3_at IS NOT NULL)         AS da_hoc_thu,
  COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL)         AS da_dong_phi,
  ROUND(100.0*COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL)
        / NULLIF(COUNT(*) FILTER (WHERE l.appointment_booked_at IS NOT NULL),0),1) AS ty_le_chot_pct
FROM leads l JOIN centers c ON l.assigned_center=c.id
GROUP BY c.name ORDER BY ty_le_chot_pct DESC NULLS LAST;
```

Thêm: phễu L0→L6 + tỷ lệ chuyển đổi, PULL vs PUSH theo chiến dịch, hiệu suất Sale đặt lịch, so sánh 13 trung tâm. Export CSV + PDF.

---

## 15. Tầng Frontend

- **React SPA + Tailwind**, toàn bộ Tiếng Việt, responsive (tablet/desktop, mobile horizontal scroll), Dark mode.
- **Sidebar:** Dashboard · Kho L0 · Danh sách lead · **Lịch hẹn học thử** · Trung tâm · Báo cáo · Cài đặt.
- **Bảng lead:** cột (Tên, SĐT, Năm sinh con, Trạng thái, Trung tâm, NV, Liên hệ cuối, Follow-up, Nguồn); filter/sort/search; status inline; badge màu theo Mục 3; dòng milestone (L2.2B/L2.2O/L2.2OS/L3.O) nền cam nhạt. **Không** làm mờ dòng "dừng chăm sóc".
- **Side panel 3 tab:** Thông tin (edit + validation) · Ghi chú (timeline) · Lịch sử Level (timeline read-only).
- **Realtime WebSocket:** mọi cập nhật (kể cả từ sync Sheet) phản ánh ngay, không F5.
- Computed/derived field chỉ hiển thị, không cho sửa.

---

## 16. Tổng hợp Validation

| Điều kiện | Quy tắc | Thực thi |
|-----------|---------|----------|
| Nâng > L0 | Đủ `phone` + `child_birth_year` + `address` | DB + Service |
| Gán trung tâm | Chỉ khi > L0 | DB + Service |
| Đặt `L2.2B` | Bắt buộc nhập `trial_appointment_at` | Service |
| Số điện thoại | 10 chữ số, bắt đầu `0`, UNIQUE | DB + Service |
| Năm sinh con | 2015 ≤ x ≤ năm hiện tại | DB |
| Computed/derived | Không bao giờ ghi tay | Kiến trúc + trigger |
| `lead_level_history` | Chỉ INSERT | DB RULE |
| Kho L0 | Chỉ admin & marketing; center bị chặn tầng DB (`can_view_l0_pool=FALSE` + scope loại L0) | DB + scope |
| `center_access_mode='specific'` | Phải có `allowed_center_ids` | DB |

---

## 17. Tech Stack & Deliverables

| Layer | Công nghệ |
|-------|-----------|
| Frontend | React (SPA) + Tailwind + FullCalendar + socket.io-client |
| Backend | Node.js + Express + Knex |
| Realtime | socket.io + PostgreSQL LISTEN/NOTIFY |
| Queue | BullMQ + Redis |
| Database | PostgreSQL 15 + pgcrypto |
| Google Sheets | googleapis (Sheets API v4) + Service Account + Apps Script |
| Auth | JWT + role middleware |
| Charts | Recharts |
| Export | csv-stringify + pdfmake |
| DevOps | docker-compose (frontend + backend + postgres + redis) |

```
ucmas-crm/
├── frontend/
├── backend/
│   ├── config/      (levels.js, sheetMapping.js)
│   ├── services/    (leadService, notificationService)
│   ├── middleware/  (auth, leadScope, appointmentScope)
│   ├── workers/     (inboundWorker, outboundListener, outboundWorker)
│   ├── jobs/        (reconcile.js)
│   └── routes/
├── database/
│   └── schema.sql   (bảng + FK + functions + triggers + RULE + view + seed)
├── apps-script/
│   └── sheet_in_trigger.gs
├── docker-compose.yml
└── README.md
```

### Seed bắt buộc (`schema.sql`)

```sql
-- Phòng ban
INSERT INTO departments (code,name) VALUES
  ('ADMIN','Ban quản trị'),('MARKETING','Phòng Marketing'),('CENTERS','Khối Trung tâm');

-- 13 trung tâm
INSERT INTO centers (code,name) VALUES
  ('CAU_GIAY','Cầu Giấy'),('DOI_CAN','Đội Cấn'),('DONG_ANH','Đông Anh'),
  ('HA_DONG','Hà Đông'),('HANG_CHUOI','Hàng Chuối'),('LINH_DAM','Linh Đàm'),
  ('DEN_LU','Đền Lừ'),('PHUONG_MAI','Phương Mai'),('THANH_TRI','Thanh Trì'),
  ('TAY_HO','Tây Hồ'),('TRUNG_HOA','Trung Hòa'),('MY_DINH','Mỹ Đình'),
  ('TRUNG_KINH','Trung Kính');

-- Bộ phận Marketing
INSERT INTO sub_departments (department_id,code,name,default_permission_group,default_level_cap,default_center_mode)
SELECT id,'DIGITAL','Digital','marketing',NULL,'all' FROM departments WHERE code='MARKETING';
INSERT INTO sub_departments (department_id,code,name,default_permission_group,default_level_cap,default_center_mode)
SELECT id,'SALE_BOOKING','Sale đặt lịch & trực page','marketing','L2','all' FROM departments WHERE code='MARKETING';

-- 13 bộ phận trung tâm
INSERT INTO sub_departments (department_id,code,name,center_id,default_permission_group,default_center_mode)
SELECT d.id,'CENTER_'||c.code,c.name,c.id,'center','own'
FROM centers c CROSS JOIN departments d WHERE d.code='CENTERS';

-- 1 system user (cho sync) + 5 user demo mỗi nhóm quyền
-- 20 lead mẫu trải đều L0→L4.x; mỗi lead 2-3 dòng lead_level_history; vài lead có trial_appointment_at
```

---

## 18. Thứ tự triển khai

1. **Database**: bảng → FK → functions (`level_rank`, `fn_normalize_lead`, `fn_log_level_change`, `fn_touch_last_contact`, `fn_notify_lead_change`) → triggers → RULE → view → seed. Test: đổi `level_code` thủ công, kiểm tra computed + mốc thời gian + history tự ghi.
2. **Service layer**: `createLead`/`updateLead` (transaction + biến phiên) + validation + scope.
3. **Auth + API**: JWT, middleware scope theo role.
4. **Phân quyền & phòng ban**: `applyLeadScope`, `applyAppointmentScope`, quản lý user/dept.
5. **Sync engine**: INBOUND webhook + OUTBOUND listener + sync_log + reconcile. Test idempotency & chống lặp.
6. **Lịch hẹn + Thông báo + Realtime** (WebSocket).
7. **Dashboard + Báo cáo + Export**.
8. **Frontend** hoàn thiện.

---

## 19. Bộ kiểm thử nghiệm thu

1. Tạo lead L0 → `entered_l0_at` set = thời gian tạo. Nâng L0→L1→L2.2A → `entered_l1_at`, `entered_l2_at` set đúng.
2. Nâng > L0 thiếu 1 trong 3 thông tin → bị chặn 422.
3. Chuyển L2.2A→L2.2B **không** nhập giờ hẹn → chặn 422. Có giờ hẹn → `appointment_booked_at`+`handed_off_at` set; **mọi user trung tâm sở hữu nhận thông báo**; buổi hẹn hiện trên calendar 2 bên realtime.
4. Lead lùi L2.2B→L2.2A rồi tiến lại → `entered_l2_at`, `appointment_booked_at` **giữ mốc đầu**.
5. Chuyển sang `L2.3`/`L1.3`/`L3.3` rồi chuyển ngược lên — **không** bị chặn, không cần quyền đặc biệt; lead vẫn xuất hiện đầy đủ trong list/báo cáo/sync.
6. User `center` Cầu Giấy: **không** thấy L0, **không** thấy trung tâm khác, **chỉ** thấy L1+ của Cầu Giấy.
7. User `marketing` Sale (cap L2, 3 trung tâm): thấy toàn bộ kho L0 + L1/L2 của 3 trung tâm; **không** thấy L3+; trên calendar vẫn thấy outcome buổi hẹn.
8. Sửa 1 ô trên SHEET_IN → lead cập nhật trên CRM trong vài giây (idempotent, không tạo trùng). Đổi lead trên CRM → SHEET_OUT cập nhật <1s. Không xảy ra vòng lặp.
9. Đạt L3 → calendar đổi event sang `attended`; quá giờ chưa đến → `missed`.
10. Báo cáo time-in-stage và tỷ lệ chốt theo trung tâm trả số liệu hợp lệ.

---

*Kết thúc tài liệu. Ưu tiên tuyệt đối: toàn vẹn dữ liệu (computed/derived do DB trigger), mọi thay đổi qua service transaction, sync có idempotency + chống lặp, kho L0 và data trung tâm cô lập đúng phân quyền.*
