-- ============================================================
-- UCMAS CRM — RPC FUNCTIONS (Business Logic)
-- Chạy file này SAU supabase_rls.sql
-- Frontend gọi qua: supabase.rpc('tên_function', { params })
-- ============================================================

-- ============================================================
-- RPC: UPDATE LEAD (validation + notifications)
-- ============================================================
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
  -- Get current lead
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

  -- Set session vars for trigger
  PERFORM set_config('app.current_user_id', auth.uid()::text, true);
  IF p_note IS NOT NULL AND p_note != '' THEN
    PERFORM set_config('app.level_change_note', p_note, true);
  END IF;

  -- Build dynamic UPDATE: CASE WHEN pattern ensures explicit NULL can be set
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

  -- Reload lead after update (triggers have fired)
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  v_new_level := v_lead.level_code;
  v_new_center := v_lead.assigned_center;
  v_new_staff := v_lead.assigned_staff;

  -- Notification: milestone reached
  IF v_lead.is_milestone AND v_new_level IS DISTINCT FROM v_old_level THEN
    -- Notify center manager
    IF v_new_center IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, lead_id, message)
      SELECT p.id, 'milestone', p_lead_id,
        '🎯 ' || v_lead.full_name || ' đạt mốc ' || v_new_level || '!'
      FROM profiles p WHERE p.center_id = v_new_center AND p.is_manager = true AND p.is_active = true;
    END IF;
  END IF;

  -- Notification: handoff (L2.2B mới bàn giao)
  IF v_new_level = 'L2.2B' AND v_old_level != 'L2.2B' AND v_new_center IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, lead_id, message)
    SELECT p.id, 'handoff', p_lead_id,
      '📋 Bàn giao: ' || v_lead.full_name || ' (' || v_lead.lead_code || ') đã hẹn học thử!'
    FROM profiles p WHERE p.center_id = v_new_center AND p.is_active = true;
  END IF;

  -- Notification: new assignment
  IF v_new_staff IS NOT NULL AND v_new_staff IS DISTINCT FROM v_old_staff THEN
    INSERT INTO notifications (user_id, type, lead_id, message)
    VALUES (v_new_staff, 'assignment', p_lead_id,
      '👤 Bạn được phân công lead: ' || v_lead.full_name || ' (' || v_lead.lead_code || ')');
  END IF;

  SELECT to_jsonb(v_lead) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: BULK ASSIGN (L0 → L1 + gán trung tâm)
-- ============================================================
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

-- ============================================================
-- RPC: BULK CREATE LEADS (paste/upload hàng loạt)
-- ============================================================
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
        -- Notify staff of existing leads
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

-- ============================================================
-- RPC: SYNC INBOUND (từ Google Sheets — mapping động)
-- ============================================================
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
  p_sheet_row INT DEFAULT NULL
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
      -- Không tạo, chỉ thông báo quan tâm lại
      INSERT INTO notifications (user_id, type, lead_id, message)
      SELECT DISTINCT p.id, 'phone_reinterest', ol.id,
        '📞 SĐT ' || p_phone || ' quan tâm lại! Data mới: "' || p_full_name || '". Lead cũ: "' || ol.full_name || '" (' || ol.lead_code || ') — ' || ol.level_code
      FROM leads ol
      JOIN profiles p ON (p.id = ol.assigned_staff OR (p.center_id = ol.assigned_center AND p.is_manager))
      WHERE ol.phone = p_phone AND ol.assigned_center IS NOT NULL AND p.is_active = true;

      -- Log skipped
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

  -- Tạo lead mới (hỗ trợ thêm child_name + interested_products)
  INSERT INTO leads (full_name, phone, child_birth_year, child_name, address, source_type, ad_campaign, interested_products, external_source, sheet_in_row)
  VALUES (p_full_name, NULLIF(p_phone, ''), p_child_birth_year, p_child_name, p_address, COALESCE(p_source_type, 'PULL'), p_ad_campaign, p_interested_products, 'sheet_in', p_sheet_row)
  RETURNING * INTO v_lead;

  -- Log success
  INSERT INTO sync_log (direction, lead_id, sheet_name, sheet_row, row_hash, status)
  VALUES ('inbound', v_lead.id, p_sheet_name, p_sheet_row, v_row_hash, 'success');

  RETURN jsonb_build_object('status', 'success', 'lead_id', v_lead.id, 'lead_code', v_lead.lead_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: DASHBOARD HQ
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_dashboard_hq()
RETURNS JSONB AS $$
DECLARE
  v_total BIGINT;
  v_funnel JSONB;
  v_by_source JSONB;
  v_by_center JSONB;
  v_milestones JSONB;
  v_appt_today BIGINT;
  v_conversion JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total FROM leads;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_funnel
  FROM (SELECT level_group, COUNT(*) as count FROM leads GROUP BY level_group ORDER BY level_rank(level_group)) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_source
  FROM (SELECT source_type, COUNT(*) as count FROM leads GROUP BY source_type) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_center
  FROM (SELECT c.name as center_name, c.code as center_code, COUNT(l.id) as count
        FROM leads l JOIN centers c ON l.assigned_center = c.id
        GROUP BY c.name, c.code ORDER BY count DESC) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_milestones
  FROM (SELECT id, lead_code, full_name, level_code, last_level_change_at FROM leads
        WHERE is_milestone = true ORDER BY last_level_change_at DESC LIMIT 10) t;

  SELECT COUNT(*) INTO v_appt_today FROM leads
  WHERE (trial_appointment_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  SELECT row_to_json(t)::jsonb INTO v_conversion
  FROM (SELECT
    COUNT(*) FILTER (WHERE level_group != 'L0') as contacted,
    COUNT(*) FILTER (WHERE appointment_booked_at IS NOT NULL) as booked,
    COUNT(*) FILTER (WHERE entered_l3_at IS NOT NULL) as trialed,
    COUNT(*) FILTER (WHERE entered_l4_at IS NOT NULL) as paid
  FROM leads) t;

  RETURN jsonb_build_object(
    'total', v_total, 'funnel', v_funnel, 'bySource', v_by_source,
    'byCenter', v_by_center, 'recentMilestones', v_milestones,
    'todayAppointments', v_appt_today, 'conversion', v_conversion
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: DASHBOARD CENTER
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_dashboard_center(p_center_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_center JSONB;
  v_total BIGINT;
  v_funnel JSONB;
  v_staff_perf JSONB;
  v_pending_appts JSONB;
BEGIN
  SELECT row_to_json(c)::jsonb INTO v_center FROM centers c WHERE id = p_center_id;

  SELECT COUNT(*) INTO v_total FROM leads WHERE assigned_center = p_center_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_funnel
  FROM (SELECT level_group, COUNT(*) as count FROM leads
        WHERE assigned_center = p_center_id GROUP BY level_group ORDER BY level_rank(level_group)) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_staff_perf
  FROM (SELECT p.full_name as staff_name, COUNT(l.id) as total_leads,
        COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL) as paid_leads
        FROM leads l LEFT JOIN profiles p ON l.assigned_staff = p.id
        WHERE l.assigned_center = p_center_id GROUP BY p.full_name) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_pending_appts
  FROM (SELECT * FROM v_trial_appointments
        WHERE assigned_center = p_center_id AND appt_status = 'scheduled'
        ORDER BY trial_appointment_at LIMIT 10) t;

  RETURN jsonb_build_object('center', v_center, 'total', v_total, 'funnel', v_funnel,
    'staffPerformance', v_staff_perf, 'pendingAppointments', v_pending_appts);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT FUNNEL
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_funnel(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_funnel JSONB;
  v_conv JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_funnel
  FROM (SELECT level_group, COUNT(*) as count FROM leads
        WHERE (p_from IS NULL OR created_at >= p_from)
          AND (p_to IS NULL OR created_at <= p_to)
          AND (p_center_id IS NULL OR assigned_center = p_center_id)
        GROUP BY level_group ORDER BY level_rank(level_group)) t;

  SELECT row_to_json(t)::jsonb INTO v_conv
  FROM (SELECT
    COUNT(*) as total_l0,
    COUNT(*) FILTER (WHERE entered_l1_at IS NOT NULL) as reached_l1,
    COUNT(*) FILTER (WHERE entered_l2_at IS NOT NULL) as reached_l2,
    COUNT(*) FILTER (WHERE appointment_booked_at IS NOT NULL) as booked,
    COUNT(*) FILTER (WHERE entered_l3_at IS NOT NULL) as reached_l3,
    COUNT(*) FILTER (WHERE entered_l4_at IS NOT NULL) as reached_l4
  FROM leads
  WHERE (p_from IS NULL OR created_at >= p_from)
    AND (p_to IS NULL OR created_at <= p_to)
    AND (p_center_id IS NULL OR assigned_center = p_center_id)) t;

  RETURN jsonb_build_object('funnel', v_funnel, 'conversion', v_conv);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT CENTER CONVERSION
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_center_conversion()
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (SELECT c.name as trung_tam,
      COUNT(*) FILTER (WHERE l.appointment_booked_at IS NOT NULL) as nhan_ban_giao,
      COUNT(*) FILTER (WHERE l.entered_l3_at IS NOT NULL) as da_hoc_thu,
      COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL) as da_dong_phi,
      ROUND(100.0*COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL)
        / NULLIF(COUNT(*) FILTER (WHERE l.appointment_booked_at IS NOT NULL),0),1) as ty_le_chot_pct
    FROM leads l JOIN centers c ON l.assigned_center = c.id
    GROUP BY c.name ORDER BY ty_le_chot_pct DESC NULLS LAST) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT SALE PERFORMANCE
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_sale_performance()
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (SELECT p.full_name as sale_name, COUNT(l.id) as total_leads,
      COUNT(*) FILTER (WHERE l.level_code = 'L2.2B' OR l.entered_l3_at IS NOT NULL) as booked,
      COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL) as converted
    FROM leads l LEFT JOIN profiles p ON l.assigned_staff = p.id
    WHERE l.assigned_staff IS NOT NULL GROUP BY p.full_name ORDER BY converted DESC) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT CENTER COMPARISON
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_center_comparison()
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (SELECT c.name as center_name, c.code as center_code,
      COUNT(l.id) as total,
      COUNT(*) FILTER (WHERE l.entered_l3_at IS NOT NULL) as trialed,
      COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL) as paid,
      ROUND(100.0*COUNT(*) FILTER (WHERE l.entered_l4_at IS NOT NULL) / NULLIF(COUNT(*),0),1) as conversion_pct
    FROM leads l JOIN centers c ON l.assigned_center = c.id
    GROUP BY c.name, c.code ORDER BY conversion_pct DESC) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT SOURCE CAMPAIGN
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_source_campaign()
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (SELECT source_type, ad_campaign, COUNT(*) as count,
      COUNT(*) FILTER (WHERE entered_l4_at IS NOT NULL) as converted
    FROM leads GROUP BY source_type, ad_campaign ORDER BY count DESC) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: REPORT TIME IN STAGE
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_time_in_stage(p_center_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
BEGIN
  RETURN (
    SELECT row_to_json(t)::jsonb
    FROM (SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l1_at - entered_l0_at))/3600),1) as gio_l0_l1,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l2_at - entered_l1_at))/3600),1) as gio_l1_l2,
      ROUND(AVG(EXTRACT(EPOCH FROM (appointment_booked_at - entered_l2_at))/3600),1) as gio_l2_hen,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l3_at - appointment_booked_at))/3600),1) as gio_hen_hocthu,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l4_at - entered_l3_at))/3600),1) as gio_hocthu_dongphi
    FROM leads
    WHERE (p_center_id IS NULL OR assigned_center = p_center_id)) t
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
