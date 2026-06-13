-- ============================================================
-- MIGRATION: Security hardening & Performance optimizations
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Cập nhật chính sách RLS cho bảng appointment_comments và appointment_reminders
-- Chặn lỗi bảo mật cho phép chèn bình luận/nhắc lịch vào lead không thuộc quyền quản lý

DROP POLICY IF EXISTS "comments_insert" ON appointment_comments;
DROP POLICY IF EXISTS "reminders_insert" ON appointment_reminders;

CREATE POLICY "comments_insert" ON appointment_comments FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_comments.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

CREATE POLICY "reminders_insert" ON appointment_reminders FOR INSERT WITH CHECK (
  auth.uid() = updated_by
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_reminders.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);


-- 2. Cập nhật hàm rpc_update_lead: Thêm RLS validation kiểm tra quyền sửa lead
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
    child_name          = CASE WHEN p_changes ? 'child_name' THEN (p_changes->>'child_name')::varchar ELSE child_name END
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


-- 3. Cập nhật hàm rpc_bulk_assign: Chuyển từ Loop sang Set-based và thêm phân quyền check vai trò
CREATE OR REPLACE FUNCTION rpc_bulk_assign(
  p_lead_ids UUID[],
  p_center_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_success INT := 0;
BEGIN
  -- Kiểm tra quyền gán lead
  IF auth_permission_group() NOT IN ('admin', 'marketing') THEN
    RAISE EXCEPTION 'Chỉ admin hoặc marketing mới được gán lead hàng loạt';
  END IF;

  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  -- Cập nhật hàng loạt (Set-based)
  WITH updated AS (
    UPDATE leads SET
      level_code = CASE WHEN level_group = 'L0' THEN 'L1' ELSE level_code END,
      assigned_center = p_center_id
    WHERE id = ANY(p_lead_ids)
    RETURNING id, full_name
  )
  SELECT COUNT(*) INTO v_success FROM updated;

  -- Tạo thông báo hàng loạt gửi tới quản lý trung tâm
  INSERT INTO notifications (user_id, type, lead_id, message)
  SELECT DISTINCT p.id, 'assignment', u.id,
    '📥 Lead mới được gán về trung tâm: ' || u.full_name
  FROM profiles p
  CROSS JOIN (
    SELECT id, full_name FROM leads WHERE id = ANY(p_lead_ids)
  ) u
  WHERE p.center_id = p_center_id AND p.is_manager = true AND p.is_active = true;

  RETURN jsonb_build_object(
    'success', v_success,
    'failed', cardinality(p_lead_ids) - v_success,
    'errors', '[]'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Cập nhật hàm rpc_bulk_create_leads: Thêm quyền check vai trò
CREATE OR REPLACE FUNCTION rpc_bulk_create_leads(
  p_leads JSONB
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_lead leads%ROWTYPE;
  v_dups INT;
  v_success INT := 0;
  v_failed INT := 0;
  v_dup_count INT := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  -- Kiểm tra quyền tạo lead hàng loạt
  IF auth_permission_group() NOT IN ('admin', 'marketing') THEN
    RAISE EXCEPTION 'Chỉ admin hoặc marketing mới được import lead hàng loạt';
  END IF;

  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_leads)
  LOOP
    BEGIN
      -- Kiểm tra trùng SĐT
      v_dups := 0;
      IF v_item->>'phone' IS NOT NULL AND v_item->>'phone' != '' THEN
        SELECT COUNT(*) INTO v_dups FROM leads WHERE phone = v_item->>'phone';
      END IF;

      INSERT INTO leads (full_name, phone, child_name, child_birth_year, address, source_type, ad_campaign)
      VALUES (
        v_item->>'full_name',
        NULLIF(v_item->>'phone', ''),
        v_item->>'child_name',
        (v_item->>'child_birth_year')::int,
        v_item->>'address',
        COALESCE(v_item->>'source_type', 'PULL'),
        v_item->>'ad_campaign'
      )
      RETURNING * INTO v_lead;

      -- Thông báo trùng SĐT nếu có
      IF v_dups > 0 THEN
        v_dup_count := v_dup_count + 1;
        INSERT INTO notifications (user_id, type, lead_id, message)
        SELECT DISTINCT p.id, 'phone_reinterest', ol.id,
          '📞 SĐT ' || v_lead.phone || ' đã có ' || v_dups || ' lead. Data mới: "' || v_lead.full_name || '" (' || v_lead.lead_code || ')'
        FROM leads ol
        JOIN profiles p ON (p.id = ol.assigned_staff OR (p.center_id = ol.assigned_center AND p.is_manager))
        WHERE ol.phone = v_lead.phone AND ol.id != v_lead.id AND ol.assigned_center IS NOT NULL
          AND p.is_active = true;
      END IF;

      v_success := v_success + 1;
      v_results := v_results || jsonb_build_object(
        'success', true, 'lead_code', v_lead.lead_code, 'duplicate_phone', v_dups > 0
      );

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'success', false, 'name', v_item->>'full_name', 'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'message', 'Tạo hoàn tất: ' || v_success || ' thành công, ' || v_failed || ' lỗi, ' || v_dup_count || ' trùng SĐT',
    'success_count', v_success,
    'failed_count', v_failed,
    'dup_count', v_dup_count,
    'results', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
