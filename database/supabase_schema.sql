-- ============================================================
-- UCMAS CRM — SUPABASE SCHEMA
-- Chạy file này đầu tiên trên Supabase SQL Editor
-- Đã chuyển từ `users` → `profiles` (liên kết auth.users)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1.1 departments (phòng ban)
CREATE TABLE departments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(30) UNIQUE NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 centers (13 trung tâm)
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

-- 1.3 sub_departments (bộ phận)
CREATE TABLE sub_departments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    code          VARCHAR(40) UNIQUE NOT NULL,
    name          VARCHAR(255) NOT NULL,
    center_id     UUID REFERENCES centers(id) ON DELETE SET NULL,
    default_permission_group VARCHAR(20)
                  CHECK (default_permission_group IN ('admin','marketing','center')),
    default_level_cap   VARCHAR(5),
    default_center_mode VARCHAR(10) DEFAULT 'all'
                  CHECK (default_center_mode IN ('all','specific','own')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subdept_dept   ON sub_departments(department_id);
CREATE INDEX idx_subdept_center ON sub_departments(center_id);

-- 1.4 profiles (thay thế users — liên kết auth.users của Supabase)
CREATE TABLE profiles (
    id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name          VARCHAR(255) NOT NULL DEFAULT '',
    email              VARCHAR(255) NOT NULL DEFAULT '',
    department_id      UUID REFERENCES departments(id)     ON DELETE SET NULL,
    sub_department_id  UUID REFERENCES sub_departments(id) ON DELETE SET NULL,

    permission_group   VARCHAR(20) NOT NULL DEFAULT 'center'
                       CHECK (permission_group IN ('admin','marketing','center')),
    is_manager         BOOLEAN NOT NULL DEFAULT FALSE,

    can_view_l0_pool   BOOLEAN NOT NULL DEFAULT FALSE,
    level_access_cap   VARCHAR(5),
    center_access_mode VARCHAR(10) NOT NULL DEFAULT 'own'
                       CHECK (center_access_mode IN ('all','specific','own')),
    allowed_center_ids UUID[],
    center_id          UUID REFERENCES centers(id) ON DELETE SET NULL,

    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK center manager
ALTER TABLE centers
  ADD CONSTRAINT fk_center_manager
  FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Sequence cho mã Lead (LD-00001)
CREATE SEQUENCE lead_code_seq START WITH 1;

-- 1.5 leads (bảng trung tâm)
CREATE TABLE leads (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code            VARCHAR(10) NOT NULL DEFAULT '',
    full_name            VARCHAR(255) NOT NULL,
    phone                VARCHAR(20),
    child_birth_year     INTEGER,
    address              TEXT,
    source_type          VARCHAR(10) NOT NULL DEFAULT 'PULL'
                         CHECK (source_type IN ('PULL','PUSH')),
    ad_campaign          VARCHAR(255),

    -- Trạng thái
    level_code           VARCHAR(20) NOT NULL DEFAULT 'L0',
    level_group          VARCHAR(5)  NOT NULL DEFAULT 'L0',
    is_milestone         BOOLEAN     NOT NULL DEFAULT FALSE,
    paid_courses_count   INTEGER     NOT NULL DEFAULT 0,

    -- Quan hệ
    assigned_center      UUID REFERENCES centers(id)  ON DELETE SET NULL,
    assigned_staff       UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Lịch hẹn
    trial_appointment_at TIMESTAMPTZ,
    next_followup_at     TIMESTAMPTZ,

    -- Mốc thời gian Level (trigger đóng dấu)
    entered_l0_at         TIMESTAMPTZ,
    entered_l1_at         TIMESTAMPTZ,
    entered_l2_at         TIMESTAMPTZ,
    entered_l3_at         TIMESTAMPTZ,
    entered_l4_at         TIMESTAMPTZ,
    entered_l5_at         TIMESTAMPTZ,
    entered_l6_at         TIMESTAMPTZ,
    appointment_booked_at TIMESTAMPTZ,
    handed_off_at         TIMESTAMPTZ,
    last_level_change_at  TIMESTAMPTZ,
    last_contact_at       TIMESTAMPTZ,

    tags                 TEXT[],
    interested_products  TEXT[],
    l4_type              VARCHAR(20) CHECK (l4_type IN ('L4 UCKID', 'L4 UCMAS')),
    entered_l4_uckid_at  TIMESTAMPTZ,
    entered_l4_ucmas_at  TIMESTAMPTZ,
    child_name           VARCHAR(255),

    -- Đồng bộ Google Sheets
    external_source      VARCHAR(20) NOT NULL DEFAULT 'system',
    sheet_in_row         INTEGER,
    sheet_out_row        INTEGER,
    row_hash             VARCHAR(64),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_center_requires_l1 CHECK (
      level_group = 'L0' OR assigned_center IS NOT NULL
    ),
    CONSTRAINT chk_l1_requires_info CHECK (
      level_group = 'L0' OR phone IS NOT NULL
    ),
    CONSTRAINT chk_birth_year CHECK (
      child_birth_year IS NULL OR
      (child_birth_year >= 2010 AND child_birth_year <= 2030)
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
CREATE INDEX idx_leads_phone       ON leads(phone);
CREATE UNIQUE INDEX idx_leads_code ON leads(lead_code);

-- 1.6 lead_level_history (audit append-only)
CREATE TABLE lead_level_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    changed_by  UUID REFERENCES profiles(id),
    from_level  VARCHAR(20),
    to_level    VARCHAR(20) NOT NULL,
    note        TEXT,
    center_id   UUID REFERENCES centers(id),
    source      VARCHAR(20) NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llh_lead    ON lead_level_history(lead_id);
CREATE INDEX idx_llh_created ON lead_level_history(created_at DESC);
CREATE INDEX idx_llh_to      ON lead_level_history(to_level);

-- 1.7 lead_notes
CREATE TABLE lead_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id  UUID REFERENCES profiles(id),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_lead ON lead_notes(lead_id, created_at DESC);

-- 1.8 sync_log
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

-- 1.9 notifications
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type       VARCHAR(40) NOT NULL,
    lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);

-- 1.10 system_settings
CREATE TABLE system_settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT,
    updated_by UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. RULES (append-only for lead_level_history)
-- ============================================================

CREATE RULE llh_no_update AS ON UPDATE TO lead_level_history DO INSTEAD NOTHING;
CREATE RULE llh_no_delete AS ON DELETE TO lead_level_history DO INSTEAD NOTHING;

-- ============================================================
-- 3. FUNCTIONS
-- ============================================================

-- 3.1 Level rank function
CREATE OR REPLACE FUNCTION level_rank(g VARCHAR) RETURNS INT AS $$
  SELECT CASE g
    WHEN 'L0' THEN 0 WHEN 'L1' THEN 1 WHEN 'L2' THEN 2 WHEN 'L3' THEN 3
    WHEN 'L4' THEN 4 WHEN 'L5' THEN 5 WHEN 'L6' THEN 6 ELSE 0 END;
$$ LANGUAGE sql IMMUTABLE;

-- 3.2a Generate lead_code trigger function (BEFORE INSERT)
CREATE OR REPLACE FUNCTION fn_generate_lead_code() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
        NEW.lead_code := 'LD-' || LPAD(nextval('lead_code_seq')::text, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.2b Normalize lead trigger function (BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION fn_normalize_lead() RETURNS TRIGGER AS $$
BEGIN
    -- Computed fields
    NEW.level_group := 'L' || COALESCE(substring(NEW.level_code FROM '^L(\d)'), '0');
    IF NEW.level_group != 'L4' THEN
        NEW.l4_type := NULL;
    END IF;
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
        WHEN 'L4' THEN 
            NEW.entered_l4_at := COALESCE(NEW.entered_l4_at, NOW());
            IF NEW.l4_type = 'L4 UCKID' THEN
                NEW.entered_l4_uckid_at := COALESCE(NEW.entered_l4_uckid_at, NOW());
            ELSIF NEW.l4_type = 'L4 UCMAS' THEN
                NEW.entered_l4_ucmas_at := COALESCE(NEW.entered_l4_ucmas_at, NOW());
            END IF;
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
        COALESCE(NEW.trial_appointment_at::text,'') || '|' || COALESCE(NEW.child_name,''),
        'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.3 Log level change function (AFTER INSERT/UPDATE)
CREATE OR REPLACE FUNCTION fn_log_level_change() RETURNS TRIGGER AS $$
DECLARE
    actor UUID;
    src   VARCHAR(20);
    lvl_note TEXT;
BEGIN
    -- Only log on INSERT or when level_code actually changes
    IF TG_OP = 'UPDATE' AND NEW.level_code = OLD.level_code THEN
        RETURN NEW;
    END IF;

    -- Read session variables set by RPC functions
    -- current_setting(key, true) returns NULL if not set — no exception needed
    actor := COALESCE(current_setting('app.current_user_id', true)::uuid, auth.uid());
    src := COALESCE(NULLIF(current_setting('app.sync_source', true), ''), 'manual');
    lvl_note := current_setting('app.level_change_note', true);

    INSERT INTO lead_level_history (lead_id, changed_by, from_level, to_level, note, center_id, source)
    VALUES (
        NEW.id,
        actor,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.level_code ELSE NULL END,
        NEW.level_code,
        lvl_note,
        NEW.assigned_center,
        src
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4 Touch last_contact_at when a note is added
CREATE OR REPLACE FUNCTION fn_touch_last_contact() RETURNS TRIGGER AS $$
BEGIN
    UPDATE leads SET last_contact_at = NOW() WHERE id = NEW.lead_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

CREATE TRIGGER trg_generate_lead_code
    BEFORE INSERT ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_generate_lead_code();

CREATE TRIGGER trg_normalize_lead
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_normalize_lead();

CREATE TRIGGER trg_log_level_change
    AFTER INSERT OR UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_log_level_change();

CREATE TRIGGER trg_touch_contact
    AFTER INSERT ON lead_notes
    FOR EACH ROW EXECUTE FUNCTION fn_touch_last_contact();

-- ============================================================
-- 5. VIEW
-- ============================================================

CREATE OR REPLACE VIEW v_trial_appointments AS
SELECT
  l.id, l.full_name, l.phone, l.child_birth_year,
  l.assigned_center, c.name AS center_name,
  l.assigned_staff, p.full_name AS sale_name,
  l.level_code, l.level_group, l.trial_appointment_at, l.appointment_booked_at,
  CASE
    WHEN l.entered_l3_at IS NOT NULL      THEN 'attended'
    WHEN l.level_code = 'L2.3'            THEN 'cancelled'
    WHEN l.trial_appointment_at < NOW()   THEN 'missed'
    ELSE 'scheduled'
  END AS appt_status
FROM leads l
LEFT JOIN centers  c ON l.assigned_center = c.id
LEFT JOIN profiles p ON l.assigned_staff  = p.id
WHERE l.trial_appointment_at IS NOT NULL;

-- ============================================================
-- 6. ENABLE REALTIME (Supabase)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE lead_notes;

-- ============================================================
-- 7. SEED DATA
-- ============================================================

-- 7.1 Phòng ban
INSERT INTO departments (code, name) VALUES
  ('ADMIN', 'Ban quản trị'),
  ('MARKETING', 'Phòng Marketing'),
  ('CENTERS', 'Khối Trung tâm');

-- 7.2 13 trung tâm
INSERT INTO centers (code, name) VALUES
  ('CAU_GIAY', 'Cầu Giấy'),
  ('DOI_CAN', 'Đội Cấn'),
  ('DONG_ANH', 'Đông Anh'),
  ('HA_DONG', 'Hà Đông'),
  ('HANG_CHUOI', 'Hàng Chuối'),
  ('LINH_DAM', 'Linh Đàm'),
  ('DEN_LU', 'Đền Lừ'),
  ('PHUONG_MAI', 'Phương Mai'),
  ('THANH_TRI', 'Thanh Trì'),
  ('TAY_HO', 'Tây Hồ'),
  ('TRUNG_HOA', 'Trung Hòa'),
  ('MY_DINH', 'Mỹ Đình'),
  ('TRUNG_KINH', 'Trung Kính');

-- 7.3 Bộ phận Marketing
INSERT INTO sub_departments (department_id, code, name, default_permission_group, default_level_cap, default_center_mode)
SELECT id, 'DIGITAL', 'Digital', 'marketing', NULL, 'all' FROM departments WHERE code = 'MARKETING';

INSERT INTO sub_departments (department_id, code, name, default_permission_group, default_level_cap, default_center_mode)
SELECT id, 'SALE_BOOKING', 'Sale đặt lịch & trực page', 'marketing', 'L2', 'all' FROM departments WHERE code = 'MARKETING';

-- 7.4 13 bộ phận trung tâm
INSERT INTO sub_departments (department_id, code, name, center_id, default_permission_group, default_center_mode)
SELECT d.id, 'CENTER_' || c.code, c.name, c.id, 'center', 'own'
FROM centers c CROSS JOIN departments d WHERE d.code = 'CENTERS';

-- 7.5 Default system settings
INSERT INTO system_settings (key, value) VALUES
  ('sheet_in_id', ''),
  ('sheet_out_id', ''),
  ('sheet_shared_secret', 'dev_secret'),
  ('sheet_service_account_json', ''),
  ('sync_enabled', 'false'),
  ('reconcile_interval_minutes', '2');

-- ============================================================
-- LƯU Ý: Demo users phải tạo qua Supabase Auth Dashboard
-- hoặc dùng supabase_seed_users.sql (chạy riêng)
-- ============================================================
-- Sau khi tạo users trên Supabase Auth Dashboard, chạy:
-- UPDATE profiles SET permission_group='admin', is_manager=true, can_view_l0_pool=true, center_access_mode='all'
-- WHERE email = 'admin@ucmas.vn';
-- v.v.
