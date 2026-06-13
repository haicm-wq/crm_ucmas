-- ============================================================
-- MIGRATION: Custom Fields Support for Leads & Sync RPCs
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột custom_fields vào bảng leads để lưu giá trị các trường tùy chỉnh
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- 2. Khởi tạo cấu hình danh sách trường tùy chỉnh trong system_settings
INSERT INTO system_settings (key, value) VALUES
  ('crm_custom_fields', '[]')
ON CONFLICT (key) DO NOTHING;

-- 3. Tạo/Cập nhật chính sách RLS cho system_settings để người dùng đăng nhập có thể đọc cấu hình trường
DROP POLICY IF EXISTS "settings_authenticated_select" ON system_settings;
CREATE POLICY "settings_authenticated_select" ON system_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Cập nhật hàm rpc_update_lead để hỗ trợ cập nhật trường custom_fields
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

  -- Kiểm tra quyền chỉnh sửa
  IF auth_permission_group() = 'center' THEN
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_group = 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình và đã vượt qua mức L0';
    END IF;
  ELSIF auth_permission_group() = 'marketing' THEN
    -- Nếu marketing có level cap, kiểm tra xem level của lead có vượt quá cấp phép không
    IF auth_level_cap() IS NOT NULL AND level_rank(v_lead.level_group) > level_rank(auth_level_cap()) THEN
      RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead ở cấp độ này';
    END IF;
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
    custom_fields       = CASE WHEN p_changes ? 'custom_fields' THEN (p_changes->'custom_fields')::jsonb ELSE custom_fields END
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

-- 5. Cập nhật hàm rpc_get_leads_for_outbound_sync để trả về cột custom_fields
CREATE OR REPLACE FUNCTION rpc_get_leads_for_outbound_sync(
  p_last_sync_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  lead_code VARCHAR,
  full_name VARCHAR,
  phone VARCHAR,
  child_name VARCHAR,
  child_birth_year INTEGER,
  address TEXT,
  level_code VARCHAR,
  center_name VARCHAR,
  staff_name VARCHAR,
  source_type VARCHAR,
  ad_campaign VARCHAR,
  interested_products TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  sheet_out_row INTEGER,
  custom_fields JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.lead_code,
    l.full_name,
    l.phone,
    l.child_name,
    l.child_birth_year,
    l.address,
    l.level_code,
    c.name AS center_name,
    p.full_name AS staff_name,
    l.source_type,
    l.ad_campaign,
    l.interested_products,
    l.created_at,
    l.updated_at,
    l.sheet_out_row,
    l.custom_fields
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.sheet_out_row IS NULL 
     OR l.updated_at > COALESCE(p_last_sync_at, '1970-01-01'::timestamptz);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_get_leads_for_outbound_sync TO anon, authenticated;

-- 6. Cập nhật hàm rpc_sync_inbound để nhận và ghi vào cột custom_fields từ Sheets
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

  -- Kiểm tra row_hash trùng (chống ghi trùng)
  v_row_hash := encode(digest(
    COALESCE(p_full_name,'') || '|' || COALESCE(p_phone,'') || '|' ||
    COALESCE(p_child_birth_year::text,'') || '|' || COALESCE(p_address,'') || '|' ||
    'L0' || '|' || '|',
    'sha256'), 'hex');

  IF EXISTS (SELECT 1 FROM sync_log WHERE row_hash = v_row_hash AND status = 'success' AND direction = 'inbound') THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'duplicate_hash');
  END IF;

  -- Tạo lead mới
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
