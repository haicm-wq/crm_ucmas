-- ============================================================
-- MIGRATION: RPC để cập nhật hàng loạt level_code của Lead và sản phẩm liên quan
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

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

  -- Phân quyền chỉnh sửa kho L0
  IF auth_permission_group() = 'center' THEN
    RAISE EXCEPTION 'Tài khoản Trung tâm không có quyền thao tác trên kho L0';
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.level_group IS DISTINCT FROM 'L0' THEN
      RAISE EXCEPTION 'Quyền telesale chỉ được sửa lead trong kho L0';
    END IF;
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
    COALESCE(p_note, 'Cập nhật trực tiếp từ kho L0'),
    v_lead.assigned_center,
    'manual'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_lead_level_and_products TO anon, authenticated;

-- Tái nạp schema cache
NOTIFY pgrst, 'reload schema';
