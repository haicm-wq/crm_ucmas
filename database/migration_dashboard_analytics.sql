-- ============================================================
-- MIGRATION: Nâng cấp Dashboard và Báo cáo Sản phẩm động
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Hàm phân tích Dashboard động: rpc_dashboard_analytics
CREATE OR REPLACE FUNCTION rpc_dashboard_analytics(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_ids UUID[] DEFAULT NULL,
  p_product_codes TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_center JSONB := NULL;
  v_total BIGINT;
  v_funnel JSONB;
  v_by_source JSONB;
  v_by_center JSONB;
  v_milestones JSONB;
  v_appt_today BIGINT;
  v_conversion JSONB;
  v_staff_perf JSONB;
  v_pending_appts JSONB;
BEGIN
  -- Chuẩn hóa khoảng thời gian lọc (mặc định vô cực nếu NULL)
  v_from := COALESCE(p_from, '1970-01-01'::timestamptz);
  v_to := COALESCE(p_to, '2100-01-01'::timestamptz);

  -- Lấy thông tin trung tâm nếu chỉ lọc 1 trung tâm hoặc tài khoản center bị cố định
  IF p_center_ids IS NOT NULL AND array_length(p_center_ids, 1) = 1 THEN
    SELECT row_to_json(c)::jsonb INTO v_center FROM centers c WHERE id = p_center_ids[1];
  ELSIF auth_permission_group() = 'center' THEN
    SELECT row_to_json(c)::jsonb INTO v_center FROM centers c WHERE id = auth_center_id();
  END IF;

  -- Thực hiện gom nhóm dữ liệu trong CTE đã được lọc theo RLS
  WITH filtered_leads AS (
    SELECT l.*
    FROM leads l
    WHERE
      -- Quy tắc phân quyền Row Level Security (RLS)
      CASE 
        WHEN auth_permission_group() = 'admin' THEN TRUE
        WHEN auth_permission_group() = 'center' THEN 
          l.assigned_center = auth_center_id() AND l.level_group != 'L0'
        WHEN auth_permission_group() = 'marketing' THEN (
          (l.level_group = 'L0' AND auth_can_view_l0() = true)
          OR (
            l.level_group != 'L0'
            AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
            AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
          )
        )
        ELSE FALSE
      END
      -- Lọc danh sách trung tâm
      AND (p_center_ids IS NULL OR cardinality(p_center_ids) = 0 OR l.assigned_center = ANY(p_center_ids))
      -- Lọc danh sách sản phẩm quan tâm
      AND (p_product_codes IS NULL OR cardinality(p_product_codes) = 0 OR l.interested_products && p_product_codes)
  ),
  leads_with_milestones AS (
    SELECT 
      l.*,
      -- Xác định các lead đạt mốc thời gian trong khoảng lọc
      (l.entered_l0_at >= v_from AND l.entered_l0_at <= v_to) AS is_l0_in_period,
      (
        (('UCMAS' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l1_ucmas_at >= v_from AND l.entered_l1_ucmas_at <= v_to)
        OR
        (('UCKID' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l1_uckid_at >= v_from AND l.entered_l1_uckid_at <= v_to)
        OR
        (
          EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
          AND l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to
        )
        OR
        (
          (p_product_codes IS NULL OR cardinality(p_product_codes) = 0)
          AND NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
          AND l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to
        )
      ) AS is_l1_in_period,
      (
        (('UCMAS' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l2_ucmas_at >= v_from AND l.entered_l2_ucmas_at <= v_to)
        OR
        (('UCKID' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l2_uckid_at >= v_from AND l.entered_l2_uckid_at <= v_to)
        OR
        (
          EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
          AND l.entered_l2_at >= v_from AND l.entered_l2_at <= v_to
        )
        OR
        (
          (p_product_codes IS NULL OR cardinality(p_product_codes) = 0)
          AND NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
          AND l.entered_l2_at >= v_from AND l.entered_l2_at <= v_to
        )
      ) AS is_l2_in_period,
      (
        (('UCMAS' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l3_ucmas_at >= v_from AND l.entered_l3_ucmas_at <= v_to)
        OR
        (('UCKID' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l3_uckid_at >= v_from AND l.entered_l3_uckid_at <= v_to)
        OR
        (
          EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
          AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to
        )
        OR
        (
          (p_product_codes IS NULL OR cardinality(p_product_codes) = 0)
          AND NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
          AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to
        )
      ) AS is_l3_in_period,
      (
        (('UCMAS' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l4_ucmas_at >= v_from AND l.entered_l4_ucmas_at <= v_to)
        OR
        (('UCKID' = ANY(p_product_codes) OR p_product_codes IS NULL OR cardinality(p_product_codes) = 0) 
          AND l.entered_l4_uckid_at >= v_from AND l.entered_l4_uckid_at <= v_to)
        OR
        (
          EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
          AND l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to
        )
        OR
        (
          (p_product_codes IS NULL OR cardinality(p_product_codes) = 0)
          AND NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
          AND l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to
        )
      ) AS is_l4_in_period,
      (l.entered_l5_at >= v_from AND l.entered_l5_at <= v_to) AS is_l5_in_period,
      (l.entered_l6_at >= v_from AND l.entered_l6_at <= v_to) AS is_l6_in_period
    FROM filtered_leads l
  )
  SELECT 
    -- 1. Tổng lead
    (SELECT COUNT(*) FROM leads_with_milestones WHERE is_l0_in_period),
    
    -- 2. Biểu đồ phễu chuyển đổi
    (SELECT jsonb_build_array(
      jsonb_build_object('level_group', 'L0', 'count', COUNT(*) FILTER (WHERE is_l0_in_period)),
      jsonb_build_object('level_group', 'L1', 'count', COUNT(*) FILTER (WHERE is_l1_in_period)),
      jsonb_build_object('level_group', 'L2', 'count', COUNT(*) FILTER (WHERE is_l2_in_period)),
      jsonb_build_object('level_group', 'L3', 'count', COUNT(*) FILTER (WHERE is_l3_in_period)),
      jsonb_build_object('level_group', 'L4', 'count', COUNT(*) FILTER (WHERE is_l4_in_period)),
      jsonb_build_object('level_group', 'L5', 'count', COUNT(*) FILTER (WHERE is_l5_in_period)),
      jsonb_build_object('level_group', 'L6', 'count', COUNT(*) FILTER (WHERE is_l6_in_period))
     ) FROM leads_with_milestones),
     
    -- 3. Phân bố nguồn
    (SELECT COALESCE(jsonb_agg(row_to_json(src_t)), '[]'::jsonb) FROM (
      SELECT source_type, COUNT(*) as count 
      FROM leads_with_milestones 
      WHERE is_l0_in_period
      GROUP BY source_type
     ) src_t),
     
    -- 4. Phân bố trung tâm
    (SELECT COALESCE(jsonb_agg(row_to_json(ctr_t)), '[]'::jsonb) FROM (
      SELECT c.name as center_name, c.code as center_code, COUNT(l.id) as count
      FROM leads_with_milestones l JOIN centers c ON l.assigned_center = c.id
      WHERE l.is_l0_in_period
      GROUP BY c.name, c.code ORDER BY count DESC
     ) ctr_t),
     
    -- 5. Các mốc gần đây
    (SELECT COALESCE(jsonb_agg(row_to_json(mil_t)), '[]'::jsonb) FROM (
      SELECT id, lead_code, full_name, level_code, last_level_change_at
      FROM leads_with_milestones
      WHERE is_milestone = true AND (last_level_change_at >= v_from AND last_level_change_at <= v_to)
      ORDER BY last_level_change_at DESC LIMIT 10
     ) mil_t),
     
    -- 6. Hẹn hôm nay / Lịch hẹn trong kỳ
    (SELECT COUNT(*) FROM leads_with_milestones
     WHERE trial_appointment_at >= v_from AND trial_appointment_at <= v_to),
     
    -- 7. Chỉ số conversion
    (SELECT row_to_json(conv_t)::jsonb FROM (
      SELECT
        COUNT(*) FILTER (WHERE is_l1_in_period) as contacted,
        COUNT(*) FILTER (WHERE appointment_booked_at >= v_from AND appointment_booked_at <= v_to) as booked,
        COUNT(*) FILTER (WHERE is_l3_in_period) as trialed,
        COUNT(*) FILTER (WHERE is_l4_in_period) as paid
      FROM leads_with_milestones
     ) conv_t),
     
    -- 8. Hiệu suất nhân viên (salePerformance)
    (SELECT COALESCE(jsonb_agg(row_to_json(perf_t)), '[]'::jsonb) FROM (
      SELECT p.full_name as staff_name, 
             COUNT(l.id) FILTER (WHERE l.is_l0_in_period) as total_leads,
             COUNT(l.id) FILTER (WHERE l.is_l4_in_period) as paid_leads
      FROM leads_with_milestones l
      LEFT JOIN profiles p ON l.assigned_staff = p.id
      GROUP BY p.full_name
     ) perf_t),
     
    -- 9. Lịch hẹn sắp tới trong kỳ (pendingAppointments)
    (SELECT COALESCE(jsonb_agg(row_to_json(appt_t)), '[]'::jsonb) FROM (
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
      FROM leads_with_milestones l
      LEFT JOIN centers  c ON l.assigned_center = c.id
      LEFT JOIN profiles p ON l.assigned_staff  = p.id
      WHERE l.trial_appointment_at IS NOT NULL
        AND l.trial_appointment_at >= v_from AND l.trial_appointment_at <= v_to
        AND (
          CASE
            WHEN l.entered_l3_at IS NOT NULL      THEN 'attended'
            WHEN l.level_code = 'L2.3'            THEN 'cancelled'
            WHEN l.trial_appointment_at < NOW()   THEN 'missed'
            ELSE 'scheduled'
          END = 'scheduled'
        )
      ORDER BY l.trial_appointment_at ASC LIMIT 10
     ) appt_t)
  INTO 
    v_total, v_funnel, v_by_source, v_by_center, v_milestones,
    v_appt_today, v_conversion, v_staff_perf, v_pending_appts;

  RETURN jsonb_build_object(
    'center', v_center,
    'total', v_total,
    'funnel', v_funnel,
    'bySource', v_by_source,
    'byCenter', v_by_center,
    'recentMilestones', v_milestones,
    'todayAppointments', v_appt_today,
    'conversion', v_conversion,
    'staffPerformance', v_staff_perf,
    'pendingAppointments', v_pending_appts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Hàm báo cáo hiệu suất đặt lịch Sale: rpc_report_booking_sale_performance
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_booking_sale_performance(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  v_from := COALESCE(p_from, '1970-01-01'::timestamptz);
  v_to := COALESCE(p_to, '2100-01-01'::timestamptz);

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result
  FROM (
    WITH filtered_leads AS (
      SELECT l.*
      FROM leads l
      WHERE
        -- RLS
        CASE 
          WHEN auth_permission_group() = 'admin' THEN TRUE
          WHEN auth_permission_group() = 'center' THEN 
            l.assigned_center = auth_center_id() AND l.level_group != 'L0'
          WHEN auth_permission_group() = 'marketing' THEN (
            (l.level_group = 'L0' AND auth_can_view_l0() = true)
            OR (
              l.level_group != 'L0'
              AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
              AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
            )
          )
          ELSE FALSE
        END
        -- Center filter
        AND (p_center_id IS NULL OR l.assigned_center = p_center_id)
    ),
    leads_flags AS (
      SELECT 
        l.id,
        l.assigned_staff,
        -- L1 in period
        (
          l.entered_l1_ucmas_at >= v_from AND l.entered_l1_ucmas_at <= v_to
          OR l.entered_l1_uckid_at >= v_from AND l.entered_l1_uckid_at <= v_to
          OR l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to
        ) AS is_l1,
        -- L2.2B in period (appointment_booked_at)
        (l.appointment_booked_at >= v_from AND l.appointment_booked_at <= v_to) AS is_l2_booked,
        -- L3.1 in period
        (
          (l.level_code = 'L3.1' AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
          OR EXISTS (
            SELECT 1 FROM lead_level_history h 
            WHERE h.lead_id = l.id AND h.to_level = 'L3.1' 
              AND h.created_at >= v_from AND h.created_at <= v_to
          )
        ) AS is_l3_1,
        -- L3.3 in period
        (
          (l.level_code = 'L3.3' AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
          OR EXISTS (
            SELECT 1 FROM lead_level_history h 
            WHERE h.lead_id = l.id AND h.to_level = 'L3.3' 
              AND h.created_at >= v_from AND h.created_at <= v_to
          )
        ) AS is_l3_3,
        -- L4 in period
        (
          l.entered_l4_ucmas_at >= v_from AND l.entered_l4_ucmas_at <= v_to
          OR l.entered_l4_uckid_at >= v_from AND l.entered_l4_uckid_at <= v_to
          OR l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to
        ) AS is_l4
      FROM filtered_leads l
      WHERE l.assigned_staff IS NOT NULL
    )
    SELECT 
      p.full_name as sale_name,
      COUNT(lf.id) FILTER (WHERE lf.is_l1) as l1_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l2_booked) as l2_booked_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l3_1) as l3_attended_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l3_1 OR lf.is_l3_3 OR lf.is_l4) as l3_total_count,
      
      -- Tỷ lệ L2.2B/L1
      ROUND(100.0 * COUNT(lf.id) FILTER (WHERE lf.is_l2_booked) 
            / NULLIF(COUNT(lf.id) FILTER (WHERE lf.is_l1), 0), 1) as l2_l1_rate,
            
      -- Tỷ lệ L3/L1
      ROUND(100.0 * COUNT(lf.id) FILTER (WHERE lf.is_l3_1 OR lf.is_l3_3 OR lf.is_l4) 
            / NULLIF(COUNT(lf.id) FILTER (WHERE lf.is_l1), 0), 1) as l3_l1_rate
    FROM leads_flags lf
    JOIN profiles p ON lf.assigned_staff = p.id
    GROUP BY p.full_name
    ORDER BY l2_booked_count DESC
  ) t;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. Hàm báo cáo sản phẩm riêng biệt: rpc_report_product_analytics
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_report_product_analytics(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_id UUID DEFAULT NULL,
  p_product_code TEXT DEFAULT 'UCMAS'
) RETURNS JSONB AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_funnel JSONB;
  v_details JSONB;
BEGIN
  v_from := COALESCE(p_from, '1970-01-01'::timestamptz);
  v_to := COALESCE(p_to, '2100-01-01'::timestamptz);

  -- A. Tính toán phễu rút gọn tùy biến (Logic 2)
  WITH filtered_leads AS (
    SELECT l.*
    FROM leads l
    WHERE
      -- RLS
      CASE 
        WHEN auth_permission_group() = 'admin' THEN TRUE
        WHEN auth_permission_group() = 'center' THEN 
          l.assigned_center = auth_center_id() AND l.level_group != 'L0'
        WHEN auth_permission_group() = 'marketing' THEN (
          (l.level_group = 'L0' AND auth_can_view_l0() = true)
          OR (
            l.level_group != 'L0'
            AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
            AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
          )
        )
        ELSE FALSE
      END
      -- Center filter
      AND (p_center_id IS NULL OR l.assigned_center = p_center_id)
      -- Product filter
      AND (p_product_code = ANY(l.interested_products))
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT id) FILTER (WHERE 
        CASE 
          WHEN p_product_code = 'UCMAS' THEN entered_l1_ucmas_at >= v_from AND entered_l1_ucmas_at <= v_to
          WHEN p_product_code = 'UCKID' THEN entered_l1_uckid_at >= v_from AND entered_l1_uckid_at <= v_to
          ELSE entered_l1_at >= v_from AND entered_l1_at <= v_to
        END
      ) as l1_count,
      COUNT(DISTINCT id) FILTER (WHERE 
        CASE 
          WHEN p_product_code = 'UCMAS' THEN entered_l2_ucmas_at >= v_from AND entered_l2_ucmas_at <= v_to
          WHEN p_product_code = 'UCKID' THEN entered_l2_uckid_at >= v_from AND entered_l2_uckid_at <= v_to
          ELSE entered_l2_at >= v_from AND entered_l2_at <= v_to
        END
      ) as l2_count,
      COUNT(DISTINCT id) FILTER (WHERE 
        CASE 
          WHEN p_product_code = 'UCMAS' THEN 
            (entered_l3_ucmas_at >= v_from AND entered_l3_ucmas_at <= v_to)
            OR (entered_l4_ucmas_at >= v_from AND entered_l4_ucmas_at <= v_to)
          WHEN p_product_code = 'UCKID' THEN 
            (entered_l3_uckid_at >= v_from AND entered_l3_uckid_at <= v_to)
            OR (entered_l4_uckid_at >= v_from AND entered_l4_uckid_at <= v_to)
          ELSE 
            (entered_l3_at >= v_from AND entered_l3_at <= v_to)
            OR (entered_l4_at >= v_from AND entered_l4_at <= v_to)
        END
      ) as l3_count,
      COUNT(DISTINCT id) FILTER (WHERE 
        CASE 
          WHEN p_product_code = 'UCMAS' THEN entered_l4_ucmas_at >= v_from AND entered_l4_ucmas_at <= v_to
          WHEN p_product_code = 'UCKID' THEN entered_l4_uckid_at >= v_from AND entered_l4_uckid_at <= v_to
          ELSE entered_l4_at >= v_from AND entered_l4_at <= v_to
        END
      ) as l4_count
    FROM filtered_leads
  )
  SELECT jsonb_build_array(
    jsonb_build_object('level', 'L1', 'count', l1_count),
    jsonb_build_object('level', 'L2', 'count', l2_count),
    jsonb_build_object('level', 'L3', 'count', l3_count),
    jsonb_build_object('level', 'L4', 'count', l4_count)
  ) INTO v_funnel FROM stats;

  -- B. Tính toán chi tiết sự chuyển đổi các level con (Logic 1)
  SELECT COALESCE(jsonb_agg(row_to_json(t_details)), '[]'::jsonb) INTO v_details
  FROM (
    WITH transitions AS (
      -- Lead L0 được khởi tạo/update trong kỳ
      SELECT 'L0'::varchar as level_code, l.id as lead_id
      FROM leads l
      WHERE p_product_code = ANY(l.interested_products)
        AND l.entered_l0_at >= v_from AND l.entered_l0_at <= v_to
        AND (p_center_id IS NULL OR l.assigned_center = p_center_id)
        AND (
          -- RLS
          CASE 
            WHEN auth_permission_group() = 'admin' THEN TRUE
            WHEN auth_permission_group() = 'center' THEN 
              l.assigned_center = auth_center_id() AND l.level_group != 'L0'
            WHEN auth_permission_group() = 'marketing' THEN (
              (l.level_group = 'L0' AND auth_can_view_l0() = true)
              OR (
                l.level_group != 'L0'
                AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
                AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
              )
            )
            ELSE FALSE
          END
        )
      UNION ALL
      -- Lịch sử chuyển dịch các level khác được ghi nhận trong kỳ
      SELECT h.to_level as level_code, h.lead_id
      FROM lead_level_history h
      JOIN leads l ON h.lead_id = l.id
      WHERE (h.product_code = p_product_code OR (h.product_code IS NULL AND p_product_code = ANY(l.interested_products)))
        AND h.created_at >= v_from AND h.created_at <= v_to
        AND (p_center_id IS NULL OR l.assigned_center = p_center_id)
        AND (
          -- RLS
          CASE 
            WHEN auth_permission_group() = 'admin' THEN TRUE
            WHEN auth_permission_group() = 'center' THEN 
              l.assigned_center = auth_center_id() AND l.level_group != 'L0'
            WHEN auth_permission_group() = 'marketing' THEN (
              (l.level_group = 'L0' AND auth_can_view_l0() = true)
              OR (
                l.level_group != 'L0'
                AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
                AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
              )
            )
            ELSE FALSE
          END
        )
    ),
    transition_counts AS (
      SELECT level_code, COUNT(DISTINCT lead_id) as count
      FROM transitions
      GROUP BY level_code
    )
    SELECT pl.level_code, pl.label, pl.color, COALESCE(tc.count, 0) as count
    FROM product_levels pl
    LEFT JOIN transition_counts tc ON pl.level_code = tc.level_code
    WHERE pl.product_code = p_product_code
    ORDER BY pl.sort_order
  ) t_details;

  RETURN jsonb_build_object(
    'funnel', v_funnel,
    'details', v_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cập nhật hàm trigger ghi lịch sử để tránh lỗi ép kiểu UUID rỗng do rò rỉ session từ connection pool
CREATE OR REPLACE FUNCTION fn_log_level_change() RETURNS TRIGGER AS $$
DECLARE
    actor UUID;
    src   VARCHAR(20);
    lvl_note TEXT;
    v_user_id_text TEXT;
BEGIN
    -- Only log on INSERT or when level_code actually changes
    IF TG_OP = 'UPDATE' AND NEW.level_code = OLD.level_code THEN
        RETURN NEW;
    END IF;

    -- Read session variables set by RPC functions
    v_user_id_text := NULLIF(current_setting('app.current_user_id', true), '');
    actor := COALESCE(v_user_id_text::uuid, auth.uid());
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

-- Cấp quyền thực thi cho các hàm RPC
GRANT EXECUTE ON FUNCTION rpc_dashboard_analytics TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_report_booking_sale_performance TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_report_product_analytics TO anon, authenticated;

-- Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
