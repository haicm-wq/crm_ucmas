-- ============================================================
-- MIGRATION: Fix rpc_sync_inbound parameters mismatch & reload schema cache
-- Chạy file này trên Supabase SQL Editor để cập nhật hệ thống
-- ============================================================

-- 1. Dọn dẹp các phiên bản cũ của hàm
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

-- 2. Tạo lại hàm rpc_sync_inbound với đầy đủ 11 tham số (bao gồm cả p_custom_fields)
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

-- 3. Phân quyền thực thi
GRANT EXECUTE ON FUNCTION rpc_sync_inbound TO anon, authenticated;

-- 4. Reload schema cache cho Supabase
NOTIFY pgrst, 'reload schema';
