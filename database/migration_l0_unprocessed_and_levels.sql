-- ============================================================
-- MIGRATION: L0 Pool Click-to-Edit, New Levels & 3h warning
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột first_processed_at vào bảng leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_processed_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Cập nhật fn_normalize_lead trigger function để tự động điền first_processed_at
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

    -- Tự động gán thời gian xử lý lần đầu
    IF TG_OP = 'INSERT' THEN
        IF NEW.level_code IS DISTINCT FROM 'L0' THEN
            NEW.first_processed_at := NOW();
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.level_code IS DISTINCT FROM 'L0' AND OLD.level_code = 'L0' AND NEW.first_processed_at IS NULL THEN
            NEW.first_processed_at := NOW();
        END IF;
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

-- 3. Tạo RPC: rpc_fetch_l0_pool()
CREATE OR REPLACE FUNCTION rpc_fetch_l0_pool()
RETURNS SETOF leads AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM leads
  WHERE level_group = 'L0'
  ORDER BY (level_code = 'L0') DESC, created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_fetch_l0_pool TO anon, authenticated;

-- 4. Seed các level mới (L1.KK, L0.R, L0.K) vào bảng product_levels
-- L1.KK: L1 Kho kiểm, sort_order: 15, color: amber (#F59E0B)
-- L0.R: Số rác, sort_order: 5, color: red (#EF4444)
-- L0.K: Khu vực khác, sort_order: 6, color: blue (#3B82F6)

INSERT INTO product_levels (product_code, level_code, label, color, sort_order)
SELECT p.code, 'L1.KK', 'L1 Kho kiểm', '#F59E0B', 15
FROM products p
ON CONFLICT (product_code, level_code) DO NOTHING;

INSERT INTO product_levels (product_code, level_code, label, color, sort_order)
SELECT p.code, 'L0.R', 'Số rác', '#EF4444', 5
FROM products p
ON CONFLICT (product_code, level_code) DO NOTHING;

INSERT INTO product_levels (product_code, level_code, label, color, sort_order)
SELECT p.code, 'L0.K', 'Khu vực khác', '#3B82F6', 6
FROM products p
ON CONFLICT (product_code, level_code) DO NOTHING;

-- Tái nạp schema cache
NOTIFY pgrst, 'reload schema';
