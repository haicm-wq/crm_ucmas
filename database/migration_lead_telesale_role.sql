-- ============================================================
-- MIGRATION: Bổ sung nhóm quyền "Lead Sale đặt lịch" (lead_telesale)
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Cập nhật CHECK constraint trên bảng profiles và sub_departments để cho phép quyền 'lead_telesale'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_permission_group_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_permission_group_check CHECK (permission_group IN ('admin','marketing','center','telesale','lead_telesale'));

ALTER TABLE public.sub_departments DROP CONSTRAINT IF EXISTS sub_departments_default_permission_group_check;
ALTER TABLE public.sub_departments ADD CONSTRAINT sub_departments_default_permission_group_check CHECK (default_permission_group IN ('admin','marketing','center','telesale','lead_telesale'));


-- 2. Cập nhật RLS cho bảng leads đối với quyền Lead Telesale
-- Quyền Lead Telesale được xem toàn bộ leads của các trung tâm và kho L0 (tức là toàn bộ bảng leads)
DROP POLICY IF EXISTS "leads_lead_telesale_select" ON leads;
CREATE POLICY "leads_lead_telesale_select" ON leads FOR SELECT
  USING (
    auth_permission_group() = 'lead_telesale'
  );

DROP POLICY IF EXISTS "leads_lead_telesale_update" ON leads;
CREATE POLICY "leads_lead_telesale_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() = 'lead_telesale'
  );

DROP POLICY IF EXISTS "leads_lead_telesale_insert" ON leads;
CREATE POLICY "leads_lead_telesale_insert" ON leads FOR INSERT
  WITH CHECK (
    auth_permission_group() = 'lead_telesale'
  );


-- 3. Cập nhật RLS cho bảng appointment_reminders và appointment_comments để hỗ trợ lead_telesale
DROP POLICY IF EXISTS "reminders_insert" ON appointment_reminders;
CREATE POLICY "reminders_insert" ON appointment_reminders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.permission_group IN ('admin','marketing','center','telesale','lead_telesale'))
);

DROP POLICY IF EXISTS "reminders_update" ON appointment_reminders;
CREATE POLICY "reminders_update" ON appointment_reminders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.permission_group IN ('admin','marketing','center','telesale','lead_telesale'))
);

DROP POLICY IF EXISTS "comments_insert" ON appointment_comments;
CREATE POLICY "comments_insert" ON appointment_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.permission_group IN ('admin','marketing','center','telesale','lead_telesale'))
);


-- 4. Cập nhật hàm rpc_update_lead để hỗ trợ phân quyền lead_telesale (có quyền sửa mọi lead tương tự marketing)
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
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_group = 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình và đã vượt qua mức L0';
    END IF;
  ELSIF auth_permission_group() = 'marketing' THEN
    IF auth_level_cap() IS NOT NULL AND level_rank(v_lead.level_group) > level_rank(auth_level_cap()) THEN
      RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead ở cấp độ này';
    END IF;
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.assigned_staff IS DISTINCT FROM auth.uid() AND v_lead.level_group IS DISTINCT FROM 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead được gán cho mình hoặc trong kho L0';
    END IF;
  ELSIF auth_permission_group() = 'lead_telesale' THEN
    -- Lead telesale có toàn quyền sửa đổi leads của các trung tâm và L0, không cần giới hạn
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


-- 5. Cập nhật hàm rpc_update_lead_product_level để hỗ trợ phân quyền lead_telesale
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
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_group = 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình';
    END IF;
  ELSIF auth_permission_group() = 'telesale' THEN
    IF v_lead.assigned_staff IS DISTINCT FROM auth.uid() AND v_lead.level_group IS DISTINCT FROM 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead được gán cho mình hoặc trong kho L0';
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


-- 6. Cập nhật hàm rpc_bulk_assign để hỗ trợ phân quyền lead_telesale (có quyền gán cho bất kỳ ai tương tự admin/marketing)
CREATE OR REPLACE FUNCTION rpc_bulk_assign(
  p_lead_ids UUID[],
  p_center_id UUID,
  p_staff_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_success INT := 0;
  v_staff_id UUID;
END;
$$ LANGUAGE plpgsql;

-- Viết lại hàm rpc_bulk_assign hoàn chỉnh để tránh lỗi định nghĩa
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
  -- Admin, Marketing, và Lead Telesale có thể gán cho bất kỳ staff nào.
  IF auth_permission_group() = 'telesale' THEN
    v_staff_id := auth.uid();
  ELSE
    v_staff_id := p_staff_id;
  END IF;

  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  -- Cập nhật hàng loạt (Set-based)
  WITH updated AS (
    UPDATE leads SET
      level_code = CASE WHEN level_group = 'L0' THEN 'L1' ELSE level_code END,
      assigned_center = p_center_id,
      assigned_staff = COALESCE(v_staff_id, assigned_staff)
    WHERE id = ANY(p_lead_ids)
      AND (level_group = 'L0' OR auth_permission_group() IN ('admin', 'marketing', 'lead_telesale')) -- Telesale chỉ tự nhận lead L0
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


-- 7. Cập nhật hàm rpc_update_lead_level_and_products để hỗ trợ lead_telesale
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
    COALESCE(p_note, 'Cập nhật trực tiếp từ kho L0'),
    v_lead.assigned_center,
    'manual'
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
