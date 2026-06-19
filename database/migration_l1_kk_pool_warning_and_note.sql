-- ============================================================
-- MIGRATION: Chuyển đổi sang L1 Kho kiểm (L1.KK) & Cập nhật logic cảnh báo quá 3 tiếng
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột ghi chú kho kiểm l1_kk_note vào bảng leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS l1_kk_note TEXT DEFAULT NULL;

-- 2. Thay đổi giá trị mặc định của level_code và level_group khi tạo mới lead
ALTER TABLE leads ALTER COLUMN level_code SET DEFAULT 'L1.KK';
ALTER TABLE leads ALTER COLUMN level_group SET DEFAULT 'L1';

-- 3. Cập nhật lại các CHECK constraints
ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_center_requires_l1;
ALTER TABLE leads ADD CONSTRAINT chk_center_requires_l1 CHECK (
  level_group = 'L0' OR level_code = 'L1.KK' OR assigned_center IS NOT NULL
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_l1_requires_info;
ALTER TABLE leads ADD CONSTRAINT chk_l1_requires_info CHECK (
  level_group = 'L0' OR level_code = 'L1.KK' OR phone IS NOT NULL
);

-- 4. Recreate trigger function fn_normalize_lead()
CREATE OR REPLACE FUNCTION fn_normalize_lead() RETURNS TRIGGER AS $$
BEGIN
    -- Computed fields
    NEW.level_group := 'L' || COALESCE(substring(NEW.level_code FROM '^L(\d)'), '1');
    IF NEW.level_group != 'L4' THEN
        NEW.l4_type := NULL;
    END IF;
    NEW.is_milestone := NEW.level_code IN ('L2.2B','L2.2O','L2.2OS','L3.O');

    IF NEW.level_code ~ '^L4\.\d+' THEN
        NEW.paid_courses_count := (substring(NEW.level_code FROM '^L4\.(\d+)'))::int;
    ELSE
        NEW.paid_courses_count := 0;
    END IF;

    -- Tự động gán thời gian xử lý lần đầu cho L1.KK (thay vì L0)
    IF TG_OP = 'INSERT' THEN
        IF NEW.level_code IS DISTINCT FROM 'L1.KK' THEN
            NEW.first_processed_at := NOW();
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.level_code IS DISTINCT FROM 'L1.KK' AND OLD.level_code = 'L1.KK' AND NEW.first_processed_at IS NULL THEN
            NEW.first_processed_at := NOW();
        ELSIF NEW.l1_kk_note IS DISTINCT FROM OLD.l1_kk_note AND NEW.l1_kk_note IS NOT NULL AND NEW.l1_kk_note != '' AND NEW.first_processed_at IS NULL THEN
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
$$ LANGUAGE plpgsql SET search_path = public, extensions;

-- 5. Tạo RPC rpc_fetch_l1_kk_unprocessed_count() đếm số lead kho kiểm trễ
CREATE OR REPLACE FUNCTION rpc_fetch_l1_kk_unprocessed_count()
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM leads
  WHERE level_code = 'L1.KK'
    AND (l1_kk_note IS NULL OR TRIM(l1_kk_note) = '')
    AND created_at < NOW() - INTERVAL '3 hours';
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_fetch_l1_kk_unprocessed_count TO anon, authenticated;

-- 6. Dọn dẹp và cập nhật hàm rpc_sync_inbound()
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc 
        WHERE proname = 'rpc_sync_inbound'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE';
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_sync_inbound(
  p_full_name TEXT,
  p_phone TEXT,
  p_child_birth_year INT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT 'PULL',
  p_ad_campaign TEXT DEFAULT NULL,
  p_child_name TEXT DEFAULT NULL,
  p_interested_products TEXT[] DEFAULT NULL,
  p_sheet_name TEXT DEFAULT NULL,
  p_sheet_row INT DEFAULT NULL,
  p_custom_fields JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_existing INT;
  v_lead leads%ROWTYPE;
  v_row_hash TEXT;
BEGIN
  PERFORM set_config('app.sync_source', 'sheet_sync', true);

  -- Check trùng SĐT
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT COUNT(*) INTO v_existing FROM leads WHERE phone = p_phone;
    IF v_existing > 0 THEN
      INSERT INTO notifications (user_id, type, lead_id, message)
      SELECT DISTINCT p.id, 'phone_reinterest', ol.id,
        '📞 SĐT ' || p_phone || ' quan tâm lại! Data mới: "' || p_full_name || '". Lead cũ: "' || ol.full_name || '" (' || ol.lead_code || ') — ' || ol.level_code
      FROM leads ol
      JOIN profiles p ON (p.id = ol.assigned_staff OR (p.center_id = ol.assigned_center AND p.is_manager))
      WHERE ol.phone = p_phone AND ol.assigned_center IS NOT NULL AND p.is_active = true;

      INSERT INTO sync_log (direction, sheet_name, sheet_row, status, error_message)
      VALUES ('inbound', p_sheet_name, p_sheet_row, 'skipped',
        'SĐT ' || p_phone || ' đã có ' || v_existing || ' lead — đã thông báo quan tâm lại');

      RETURN jsonb_build_object('status', 'skipped', 'reason', 'phone_reinterest', 'phone', p_phone, 'existing_count', v_existing);
    END IF;
  END IF;

  -- Kiểm tra row_hash trùng với level_code mặc định là L1.KK
  v_row_hash := encode(digest(
    COALESCE(p_full_name,'') || '|' || COALESCE(p_phone,'') || '|' ||
    COALESCE(p_child_birth_year::text,'') || '|' || COALESCE(p_address,'') || '|' ||
    'L1.KK' || '|' || '' || '|' || '' || '|' || COALESCE(p_child_name,''),
    'sha256'), 'hex');

  IF EXISTS (SELECT 1 FROM sync_log WHERE row_hash = v_row_hash AND status = 'success' AND direction = 'inbound') THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'duplicate_hash');
  END IF;

  -- Tạo lead mới (mặc định level_code là L1.KK)
  INSERT INTO leads (full_name, phone, child_birth_year, child_name, address, source_type, ad_campaign, interested_products, external_source, sheet_in_row, custom_fields)
  VALUES (p_full_name, NULLIF(p_phone, ''), p_child_birth_year, p_child_name, p_address, COALESCE(p_source_type, 'PULL'), p_ad_campaign, p_interested_products, 'sheet_in', p_sheet_row, p_custom_fields)
  RETURNING * INTO v_lead;

  -- Log success
  INSERT INTO sync_log (direction, lead_id, sheet_name, sheet_row, row_hash, status)
  VALUES ('inbound', v_lead.id, p_sheet_name, p_sheet_row, v_row_hash, 'success');

  RETURN jsonb_build_object('status', 'success', 'lead_id', v_lead.id, 'lead_code', v_lead.lead_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION rpc_sync_inbound TO anon, authenticated;

-- 7. Cập nhật rpc_fetch_l0_pool() lấy cả các lead trong kho kiểm và nháp
CREATE OR REPLACE FUNCTION rpc_fetch_l0_pool()
RETURNS SETOF leads AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM leads
  WHERE level_code IN ('L0', 'L1.KK', 'L0.R', 'L0.K')
  ORDER BY (level_code = 'L1.KK') DESC, created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_fetch_l0_pool TO anon, authenticated;

-- 8. Cập nhật rpc_bulk_assign() hỗ trợ gán L1.KK sang L1
CREATE OR REPLACE FUNCTION rpc_bulk_assign(
  p_lead_ids UUID[],
  p_center_id UUID,
  p_staff_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_success INT := 0;
  v_staff_id UUID;
BEGIN
  -- Kiểm tra quyền gán lead
  IF auth_permission_group() NOT IN ('admin', 'marketing', 'telesale', 'lead_telesale') THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này';
  END IF;

  -- Nếu là telesale, họ chỉ được tự gán cho chính mình.
  IF auth_permission_group() = 'telesale' THEN
    v_staff_id := auth.uid();
  ELSE
    v_staff_id := p_staff_id;
  END IF;

  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  -- Cập nhật hàng loạt (Set-based)
  WITH updated AS (
    UPDATE leads SET
      level_code = CASE WHEN level_code IN ('L0', 'L1.KK') THEN 'L1' ELSE level_code END,
      assigned_center = p_center_id,
      assigned_staff = COALESCE(v_staff_id, assigned_staff)
    WHERE id = ANY(p_lead_ids)
      AND (level_code IN ('L0', 'L1.KK', 'L0.R', 'L0.K') OR auth_permission_group() IN ('admin', 'marketing', 'lead_telesale'))
    RETURNING id, full_name
  )
  SELECT COUNT(*) INTO v_success FROM updated;

  -- Tạo thông báo hàng loạt gửi tới nhân viên được gán hoặc quản lý trung tâm
  IF v_staff_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, lead_id, message)
    SELECT DISTINCT v_staff_id, 'assignment', u.id,
      '👤 Bạn được phân công lead: ' || u.full_name
    FROM (
      SELECT id, full_name FROM leads WHERE id = ANY(p_lead_ids)
    ) u;
  ELSE
    INSERT INTO notifications (user_id, type, lead_id, message)
    SELECT DISTINCT p.id, 'assignment', u.id,
      '📥 Lead mới được gán về trung tâm: ' || u.full_name
    FROM profiles p
    CROSS JOIN (
      SELECT id, full_name FROM leads WHERE id = ANY(p_lead_ids)
    ) u
    WHERE p.center_id = p_center_id AND p.is_manager = true AND p.is_active = true;
  END IF;

  RETURN jsonb_build_object(
    'success', v_success,
    'failed', cardinality(p_lead_ids) - v_success,
    'errors', '[]'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_bulk_assign TO anon, authenticated;

-- 9. Cập nhật rpc_update_lead() hỗ trợ l1_kk_note và check quyền L1.KK
CREATE OR REPLACE FUNCTION rpc_update_lead(
  p_lead_id UUID,
  p_changes JSONB,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_old_level VARCHAR(20);
  v_new_level VARCHAR(20);
  v_old_center UUID;
  v_new_center UUID;
  v_old_staff UUID;
  v_new_staff UUID;
  v_result JSONB;
BEGIN
  -- Lấy lead hiện tại
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead không tồn tại';
  END IF;

  -- Kiểm tra nếu có thay đổi trường source_type (Nguồn) mà không phải admin
  IF p_changes ? 'source_type' AND (p_changes->>'source_type') IS DISTINCT FROM (v_lead.source_type) THEN
    IF auth_permission_group() != 'admin' THEN
      RAISE EXCEPTION 'Chỉ có admin mới có quyền thay đổi trường Nguồn';
    END IF;
  END IF;

  -- Kiểm tra quyền chỉnh sửa
  IF auth_permission_group() = 'center' THEN
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_code IN ('L0', 'L1.KK', 'L0.R', 'L0.K') THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình và đã vượt qua kho kiểm';
    END IF;
  ELSIF auth_permission_group() = 'marketing' THEN
    IF auth_level_cap() IS NOT NULL AND level_rank(v_lead.level_group) > level_rank(auth_level_cap()) THEN
      RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead ở cấp độ này';
    END IF;
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.assigned_staff IS DISTINCT FROM auth.uid() AND v_lead.level_code NOT IN ('L0', 'L1.KK', 'L0.R', 'L0.K') THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead được gán cho mình hoặc trong kho kiểm';
    END IF;
  ELSIF auth_permission_group() = 'lead_telesale' THEN
    -- Lead telesale có toàn quyền sửa đổi leads của các trung tâm và kho kiểm
  ELSIF auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead';
  END IF;

  v_old_level := v_lead.level_code;
  v_old_center := v_lead.assigned_center;
  v_old_staff := v_lead.assigned_staff;

  -- Đặt biến phiên cho trigger
  PERFORM set_config('app.current_user_id', auth.uid()::text, true);
  IF p_note IS NOT NULL AND p_note != '' THEN
    PERFORM set_config('app.level_change_note', p_note, true);
  END IF;

  -- Cập nhật động
  UPDATE leads SET
    full_name           = CASE WHEN p_changes ? 'full_name' THEN (p_changes->>'full_name')::varchar ELSE full_name END,
    phone               = CASE WHEN p_changes ? 'phone' THEN NULLIF((p_changes->>'phone')::varchar, '') ELSE phone END,
    child_birth_year    = CASE WHEN p_changes ? 'child_birth_year' THEN (p_changes->>'child_birth_year')::int ELSE child_birth_year END,
    address             = CASE WHEN p_changes ? 'address' THEN (p_changes->>'address')::text ELSE address END,
    level_code          = CASE WHEN p_changes ? 'level_code' THEN (p_changes->>'level_code')::varchar ELSE level_code END,
    assigned_center     = CASE WHEN p_changes ? 'assigned_center' THEN (p_changes->>'assigned_center')::uuid ELSE assigned_center END,
    assigned_staff      = CASE WHEN p_changes ? 'assigned_staff' THEN (p_changes->>'assigned_staff')::uuid ELSE assigned_staff END,
    trial_appointment_at = CASE WHEN p_changes ? 'trial_appointment_at' THEN (p_changes->>'trial_appointment_at')::timestamptz ELSE trial_appointment_at END,
    next_followup_at    = CASE WHEN p_changes ? 'next_followup_at' THEN (p_changes->>'next_followup_at')::timestamptz ELSE next_followup_at END,
    source_type         = CASE WHEN p_changes ? 'source_type' THEN (p_changes->>'source_type')::varchar ELSE source_type END,
    ad_campaign         = CASE WHEN p_changes ? 'ad_campaign' THEN (p_changes->>'ad_campaign')::varchar ELSE ad_campaign END,
    interested_products = CASE
                            WHEN p_changes ? 'interested_products' AND (p_changes->'interested_products') IS NOT DISTINCT FROM 'null'::jsonb THEN NULL
                            WHEN p_changes ? 'interested_products' THEN ARRAY(SELECT jsonb_array_elements_text(p_changes->'interested_products'))
                            ELSE interested_products
                          END,
    l4_type             = CASE WHEN p_changes ? 'l4_type' THEN NULLIF((p_changes->>'l4_type')::varchar, '') ELSE l4_type END,
    entered_l0_at       = CASE WHEN p_changes ? 'entered_l0_at' THEN (p_changes->>'entered_l0_at')::timestamptz ELSE entered_l0_at END,
    entered_l1_at       = CASE WHEN p_changes ? 'entered_l1_at' THEN (p_changes->>'entered_l1_at')::timestamptz ELSE entered_l1_at END,
    entered_l2_at       = CASE WHEN p_changes ? 'entered_l2_at' THEN (p_changes->>'entered_l2_at')::timestamptz ELSE entered_l2_at END,
    entered_l3_at       = CASE WHEN p_changes ? 'entered_l3_at' THEN (p_changes->>'entered_l3_at')::timestamptz ELSE entered_l3_at END,
    entered_l4_at       = CASE WHEN p_changes ? 'entered_l4_at' THEN (p_changes->>'entered_l4_at')::timestamptz ELSE entered_l4_at END,
    entered_l4_uckid_at = CASE WHEN p_changes ? 'entered_l4_uckid_at' THEN (p_changes->>'entered_l4_uckid_at')::timestamptz ELSE entered_l4_uckid_at END,
    entered_l4_ucmas_at = CASE WHEN p_changes ? 'entered_l4_ucmas_at' THEN (p_changes->>'entered_l4_ucmas_at')::timestamptz ELSE entered_l4_ucmas_at END,
    child_name          = CASE WHEN p_changes ? 'child_name' THEN (p_changes->>'child_name')::varchar ELSE child_name END,
    custom_fields       = CASE WHEN p_changes ? 'custom_fields' THEN (p_changes->'custom_fields')::jsonb ELSE custom_fields END,
    l1_kk_note          = CASE WHEN p_changes ? 'l1_kk_note' THEN (p_changes->>'l1_kk_note')::text ELSE l1_kk_note END
  WHERE id = p_lead_id;

  -- Lấy thông tin sau cập nhật
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  v_new_level := v_lead.level_code;
  v_new_center := v_lead.assigned_center;
  v_new_staff := v_lead.assigned_staff;

  -- Tạo thông báo mốc level quan trọng
  IF v_lead.is_milestone AND v_new_level IS DISTINCT FROM v_old_level THEN
    IF v_new_center IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, lead_id, message)
      SELECT p.id, 'milestone', p_lead_id,
        '🎯 ' || v_lead.full_name || ' đạt mốc ' || v_new_level || '!'
      FROM profiles p WHERE p.center_id = v_new_center AND p.is_manager = true AND p.is_active = true;
    END IF;
  END IF;

  -- Bàn giao L2.2B học thử
  IF v_new_level = 'L2.2B' AND v_old_level != 'L2.2B' AND v_new_center IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, lead_id, message)
    SELECT p.id, 'handoff', p_lead_id,
      '📋 Bàn giao: ' || v_lead.full_name || ' (' || v_lead.lead_code || ') đã hẹn học thử!'
    FROM profiles p WHERE p.center_id = v_new_center AND p.is_active = true;
  END IF;

  -- Gán nhân viên mới phụ trách
  IF v_new_staff IS NOT NULL AND v_new_staff IS DISTINCT FROM v_old_staff THEN
    INSERT INTO notifications (user_id, type, lead_id, message)
    VALUES (v_new_staff, 'assignment', p_lead_id,
      '👤 Bạn được phân công lead: ' || v_lead.full_name || ' (' || v_lead.lead_code || ')');
  END IF;

  SELECT to_jsonb(v_lead) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_lead TO anon, authenticated;

-- 10. Cập nhật rpc_update_lead_level_and_products() check quyền L1.KK
CREATE OR REPLACE FUNCTION rpc_update_lead_level_and_products(
  p_lead_id UUID,
  p_level_code VARCHAR,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_actor UUID;
  v_old_level VARCHAR(20);
BEGIN
  -- Lấy lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead không tồn tại';
  END IF;

  -- Phân quyền chỉnh sửa kho kiểm
  IF auth_permission_group() = 'center' THEN
    RAISE EXCEPTION 'Tài khoản Trung tâm không có quyền thao tác trên kho kiểm';
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.level_code NOT IN ('L0', 'L1.KK', 'L0.R', 'L0.K') THEN
      RAISE EXCEPTION 'Quyền telesale chỉ được sửa lead trong kho kiểm';
    END IF;
  ELSIF auth_permission_group() = 'lead_telesale' THEN
    -- Lead telesale có toàn quyền sửa đổi leads
  ELSIF auth_permission_group() != 'marketing' AND auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead';
  END IF;

  v_old_level := v_lead.level_code;
  v_actor := auth.uid();

  -- Đặt biến phiên cho trigger ghi lịch sử
  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  -- 1. Cập nhật bảng leads
  UPDATE leads
  SET level_code = p_level_code,
      updated_at = NOW()
  WHERE id = p_lead_id;

  -- 2. Cập nhật bảng lead_product_levels cho tất cả sản phẩm quan tâm của lead
  IF v_lead.interested_products IS NOT NULL AND cardinality(v_lead.interested_products) > 0 THEN
    INSERT INTO lead_product_levels (lead_id, product_code, level_code, entered_at)
    SELECT p_lead_id, prod, p_level_code, jsonb_build_object(p_level_code, NOW())
    FROM unnest(v_lead.interested_products) AS prod
    ON CONFLICT (lead_id, product_code) DO UPDATE
    SET level_code = p_level_code,
        entered_at = lead_product_levels.entered_at || jsonb_build_object(p_level_code, NOW()),
        updated_at = NOW();
  END IF;

  -- 3. Ghi lịch sử đổi level
  INSERT INTO lead_level_history (lead_id, changed_by, from_level, to_level, note, center_id, source)
  VALUES (
    p_lead_id,
    v_actor,
    v_old_level,
    p_level_code,
    COALESCE(p_note, 'Cập nhật trực tiếp từ kho kiểm'),
    v_lead.assigned_center,
    'manual'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_lead_level_and_products TO anon, authenticated;

-- 11. Cập nhật rpc_update_lead_product_level() check quyền L1.KK
CREATE OR REPLACE FUNCTION rpc_update_lead_product_level(
  p_lead_id UUID,
  p_product_code VARCHAR,
  p_level_code VARCHAR,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_old_level VARCHAR(20);
  v_result JSONB;
  v_actor UUID;
BEGIN
  -- Lấy lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead không tồn tại';
  END IF;

  -- Kiểm tra quyền chỉnh sửa
  IF auth_permission_group() = 'center' THEN
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_code IN ('L0', 'L1.KK', 'L0.R', 'L0.K') THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình';
    END IF;
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.assigned_staff IS DISTINCT FROM auth.uid() AND v_lead.level_code NOT IN ('L0', 'L1.KK', 'L0.R', 'L0.K') THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead được gán cho mình hoặc trong kho kiểm';
    END IF;
  ELSIF auth_permission_group() = 'lead_telesale' THEN
    -- Lead telesale có toàn quyền sửa đổi
  ELSIF auth_permission_group() != 'marketing' AND auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead';
  END IF;

  -- Lấy level cũ
  SELECT level_code INTO v_old_level 
  FROM lead_product_levels 
  WHERE lead_id = p_lead_id AND product_code = p_product_code;

  v_actor := auth.uid();

  -- Cập nhật level cho sản phẩm
  INSERT INTO lead_product_levels (lead_id, product_code, level_code, entered_at)
  VALUES (
    p_lead_id, 
    p_product_code, 
    p_level_code, 
    jsonb_build_object(p_level_code, NOW())
  )
  ON CONFLICT (lead_id, product_code) DO UPDATE
  SET level_code = p_level_code,
      entered_at = lead_product_levels.entered_at || jsonb_build_object(p_level_code, NOW()),
      updated_at = NOW();

  -- Ghi lịch sử đổi level
  INSERT INTO lead_level_history (lead_id, changed_by, from_level, to_level, note, center_id, source, product_code)
  VALUES (
    p_lead_id,
    v_actor,
    v_old_level,
    p_level_code,
    p_note,
    v_lead.assigned_center,
    'manual',
    p_product_code
  );

  -- Cập nhật level_code của lead bằng level có sort_order cao nhất trong các sản phẩm để tương thích ngược
  UPDATE leads l
  SET level_code = COALESCE(
        (SELECT lpl.level_code 
         FROM lead_product_levels lpl
         JOIN product_levels pl ON lpl.product_code = pl.product_code AND lpl.level_code = pl.level_code
         WHERE lpl.lead_id = p_lead_id
         ORDER BY pl.sort_order DESC
         LIMIT 1),
        l.level_code
      ),
      updated_at = NOW()
  WHERE id = p_lead_id;

  -- Nếu sản phẩm là UCMAS hoặc UCKID và level là L4, đồng bộ ngược về các cột cũ của bảng leads
  IF p_product_code = 'UCMAS' AND p_level_code ~ '^L4' THEN
    UPDATE leads SET 
      l4_type = CASE WHEN l4_type ~ 'UCKID' THEN 'L4 UCKID, L4 UCMAS' ELSE 'L4 UCMAS' END,
      entered_l4_ucmas_at = NOW()
    WHERE id = p_lead_id;
  ELSIF p_product_code = 'UCKID' AND p_level_code ~ '^L4' THEN
    UPDATE leads SET 
      l4_type = CASE WHEN l4_type ~ 'UCMAS' THEN 'L4 UCKID, L4 UCMAS' ELSE 'L4 UCKID' END,
      entered_l4_uckid_at = NOW()
    WHERE id = p_lead_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'product_code', p_product_code, 'level_code', p_level_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_lead_product_level TO anon, authenticated;

-- 12. Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
