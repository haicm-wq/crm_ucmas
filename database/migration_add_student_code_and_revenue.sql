-- ============================================================
-- MIGRATION: Bổ sung Mã học sinh (student_code) & Doanh thu (tuition_fee + material_fee)
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Thêm các cột mới vào bảng leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS student_code TEXT DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tuition_fee BIGINT DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS material_fee BIGINT DEFAULT 0;

-- 2. Cập nhật Trigger Function fn_normalize_lead()
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

    -- Chuẩn hóa mặc định cho học phí & nguyên học liệu
    NEW.tuition_fee := COALESCE(NEW.tuition_fee, 0);
    NEW.material_fee := COALESCE(NEW.material_fee, 0);

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

-- 3. Cập nhật rpc_update_lead() hỗ trợ ghi nhận các cột mới
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
    l1_kk_note          = CASE WHEN p_changes ? 'l1_kk_note' THEN (p_changes->>'l1_kk_note')::text ELSE l1_kk_note END,
    student_code        = CASE WHEN p_changes ? 'student_code' THEN NULLIF((p_changes->>'student_code')::text, '') ELSE student_code END,
    tuition_fee         = CASE WHEN p_changes ? 'tuition_fee' THEN COALESCE((p_changes->>'tuition_fee')::bigint, 0) ELSE tuition_fee END,
    material_fee        = CASE WHEN p_changes ? 'material_fee' THEN COALESCE((p_changes->>'material_fee')::bigint, 0) ELSE material_fee END
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

-- 4. Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
