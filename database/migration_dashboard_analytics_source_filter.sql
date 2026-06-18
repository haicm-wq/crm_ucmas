-- ============================================================
-- Migration: Thêm tham số p_source_type vào rpc_dashboard_analytics
-- Cho phép Dashboard lọc theo nguồn PULL, PUSH hoặc tổng hợp (NULL = tất cả)
-- ============================================================

-- Xóa phiên bản cũ (4 tham số) để tránh lỗi "function name is not unique"
DROP FUNCTION IF EXISTS rpc_dashboard_analytics(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[]);

CREATE OR REPLACE FUNCTION rpc_dashboard_analytics(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_ids UUID[] DEFAULT NULL,
  p_product_codes TEXT[] DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL  -- 'PULL', 'PUSH', NULL = tất cả
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
  v_l1_unprocessed BIGINT;
  v_followup_needed BIGINT;
  v_by_level_code JSONB;
  v_by_center_detailed JSONB;
BEGIN
  v_from := COALESCE(p_from, '1970-01-01'::timestamptz);
  v_to := COALESCE(p_to, '2100-01-01'::timestamptz);

  IF p_center_ids IS NOT NULL AND array_length(p_center_ids, 1) = 1 THEN
    SELECT row_to_json(c)::jsonb INTO v_center FROM centers c WHERE id = p_center_ids[1];
  ELSIF auth_permission_group() = 'center' THEN
    SELECT row_to_json(c)::jsonb INTO v_center FROM centers c WHERE id = auth_center_id();
  END IF;

  WITH filtered_leads AS (
    SELECT l.*
    FROM leads l
    WHERE
      CASE 
        WHEN auth_permission_group() = 'admin' THEN TRUE
        WHEN auth_permission_group() = 'lead_telesale' THEN TRUE
        WHEN auth_permission_group() = 'telesale' THEN 
          (l.assigned_staff = auth.uid() OR l.level_group = 'L0' OR l.level_code = 'L1.KK')
        WHEN auth_permission_group() = 'center' THEN 
          l.assigned_center = auth_center_id() AND l.level_group != 'L0' AND l.level_code != 'L1.KK'
        WHEN auth_permission_group() = 'marketing' THEN (
          ((l.level_group = 'L0' OR l.level_code = 'L1.KK') AND auth_can_view_l0() = true)
          OR (
            l.level_group != 'L0' AND l.level_code != 'L1.KK'
            AND (auth_level_cap() IS NULL OR level_rank(l.level_group) <= level_rank(auth_level_cap()))
            AND (auth_center_mode() = 'all' OR l.assigned_center = ANY(auth_allowed_centers()))
          )
        )
        ELSE FALSE
      END
      AND (p_center_ids IS NULL OR cardinality(p_center_ids) = 0 OR l.assigned_center = ANY(p_center_ids))
      AND (p_product_codes IS NULL OR cardinality(p_product_codes) = 0 OR l.interested_products @> p_product_codes)
      AND (p_source_type IS NULL OR l.source_type = p_source_type)  -- Lọc theo nguồn
  ),
  leads_with_milestones AS (
    SELECT 
      l.*,
      (l.entered_l0_at >= v_from AND l.entered_l0_at <= v_to) AS is_l0_in_period,
      
      -- L1: Chỉ bao gồm L1.2, L1.3 và các level group cao hơn (L2, L3, L4...) trong kỳ
      (
        CASE 
          WHEN p_product_codes IS NOT NULL AND cardinality(p_product_codes) > 0 THEN (
            (NOT ('UCMAS' = ANY(p_product_codes)) OR (l.entered_l1_ucmas_at >= v_from AND l.entered_l1_ucmas_at <= v_to))
            AND
            (NOT ('UCKID' = ANY(p_product_codes)) OR (l.entered_l1_uckid_at >= v_from AND l.entered_l1_uckid_at <= v_to))
            AND
            (
              NOT EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
              OR (l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to)
            )
          )
          ELSE (
            ('UCMAS' = ANY(l.interested_products) AND l.entered_l1_ucmas_at >= v_from AND l.entered_l1_ucmas_at <= v_to)
            OR
            ('UCKID' = ANY(l.interested_products) AND l.entered_l1_uckid_at >= v_from AND l.entered_l1_uckid_at <= v_to)
            OR
            (NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
             AND l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to)
          )
        END
        AND (
          l.level_code IN ('L1.2', 'L1.3')
          OR l.level_group IN ('L2', 'L3', 'L4', 'L5', 'L6')
        )
      ) AS is_l1_in_period,
      
      -- L2: Chỉ bao gồm L2.2A, L2.2B, L2.3 và các level group cao hơn (L3, L4...) trong kỳ
      (
        CASE 
          WHEN p_product_codes IS NOT NULL AND cardinality(p_product_codes) > 0 THEN (
            (NOT ('UCMAS' = ANY(p_product_codes)) OR (l.entered_l2_ucmas_at >= v_from AND l.entered_l2_ucmas_at <= v_to))
            AND
            (NOT ('UCKID' = ANY(p_product_codes)) OR (l.entered_l2_uckid_at >= v_from AND l.entered_l2_uckid_at <= v_to))
            AND
            (
              NOT EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
              OR (l.entered_l2_at >= v_from AND l.entered_l2_at <= v_to)
            )
          )
          ELSE (
            ('UCMAS' = ANY(l.interested_products) AND l.entered_l2_ucmas_at >= v_from AND l.entered_l2_ucmas_at <= v_to)
            OR
            ('UCKID' = ANY(l.interested_products) AND l.entered_l2_uckid_at >= v_from AND l.entered_l2_uckid_at <= v_to)
            OR
            (NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
             AND l.entered_l2_at >= v_from AND l.entered_l2_at <= v_to)
          )
        END
        AND (
          l.level_code IN ('L2.2A', 'L2.2B', 'L2.3')
          OR l.level_group IN ('L3', 'L4', 'L5', 'L6')
        )
      ) AS is_l2_in_period,
      
      -- L3: Chỉ bao gồm L3.1, L3.3 và các level group cao hơn (L4...) trong kỳ
      (
        CASE 
          WHEN p_product_codes IS NOT NULL AND cardinality(p_product_codes) > 0 THEN (
            (NOT ('UCMAS' = ANY(p_product_codes)) OR (l.entered_l3_ucmas_at >= v_from AND l.entered_l3_ucmas_at <= v_to))
            AND
            (NOT ('UCKID' = ANY(p_product_codes)) OR (l.entered_l3_uckid_at >= v_from AND l.entered_l3_uckid_at <= v_to))
            AND
            (
              NOT EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
              OR (l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
            )
          )
          ELSE (
            ('UCMAS' = ANY(l.interested_products) AND l.entered_l3_ucmas_at >= v_from AND l.entered_l3_ucmas_at <= v_to)
            OR
            ('UCKID' = ANY(l.interested_products) AND l.entered_l3_uckid_at >= v_from AND l.entered_l3_uckid_at <= v_to)
            OR
            (NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
             AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
          )
        END
        AND (
          l.level_code IN ('L3.1', 'L3.3')
          OR l.level_group IN ('L4', 'L5', 'L6')
        )
      ) AS is_l3_in_period,
      
      -- L4: Chỉ bao gồm các level con của L4 trong kỳ
      (
        CASE 
          WHEN p_product_codes IS NOT NULL AND cardinality(p_product_codes) > 0 THEN (
            (NOT ('UCMAS' = ANY(p_product_codes)) OR (l.entered_l4_ucmas_at >= v_from AND l.entered_l4_ucmas_at <= v_to))
            AND
            (NOT ('UCKID' = ANY(p_product_codes)) OR (l.entered_l4_uckid_at >= v_from AND l.entered_l4_uckid_at <= v_to))
            AND
            (
              NOT EXISTS (SELECT 1 FROM unnest(p_product_codes) p WHERE p NOT IN ('UCMAS', 'UCKID'))
              OR (l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to)
            )
          )
          ELSE (
            ('UCMAS' = ANY(l.interested_products) AND l.entered_l4_ucmas_at >= v_from AND l.entered_l4_ucmas_at <= v_to)
            OR
            ('UCKID' = ANY(l.interested_products) AND l.entered_l4_uckid_at >= v_from AND l.entered_l4_uckid_at <= v_to)
            OR
            (NOT ('UCMAS' = ANY(l.interested_products) OR 'UCKID' = ANY(l.interested_products))
             AND l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to)
          )
        END
        AND (
          l.level_group IN ('L4', 'L5', 'L6')
        )
      ) AS is_l4_in_period,
      
      (l.entered_l5_at >= v_from AND l.entered_l5_at <= v_to) AS is_l5_in_period,
      (l.entered_l6_at >= v_from AND l.entered_l6_at <= v_to) AS is_l6_in_period
    FROM filtered_leads l
  )
  SELECT 
    (SELECT COUNT(*) FROM leads_with_milestones WHERE is_l1_in_period),
    (SELECT jsonb_build_array(
      jsonb_build_object('level_group', 'L0', 'count', COUNT(*) FILTER (WHERE is_l0_in_period)),
      jsonb_build_object('level_group', 'L1', 'count', COUNT(*) FILTER (WHERE is_l1_in_period)),
      jsonb_build_object('level_group', 'L2', 'count', COUNT(*) FILTER (WHERE is_l2_in_period)),
      jsonb_build_object('level_group', 'L3', 'count', COUNT(*) FILTER (WHERE is_l3_in_period)),
      jsonb_build_object('level_group', 'L4', 'count', COUNT(*) FILTER (WHERE is_l4_in_period)),
      jsonb_build_object('level_group', 'L5', 'count', COUNT(*) FILTER (WHERE is_l5_in_period)),
      jsonb_build_object('level_group', 'L6', 'count', COUNT(*) FILTER (WHERE is_l6_in_period))
     ) FROM leads_with_milestones),
    (SELECT COALESCE(jsonb_agg(row_to_json(src_t)), '[]'::jsonb) FROM (
      SELECT source_type, COUNT(*) as count 
      FROM leads_with_milestones 
      WHERE is_l1_in_period
      GROUP BY source_type
     ) src_t),
    (SELECT COALESCE(jsonb_agg(row_to_json(ctr_t)), '[]'::jsonb) FROM (
      SELECT c.name as center_name, c.code as center_code, COUNT(l.id) as count
      FROM leads_with_milestones l JOIN centers c ON l.assigned_center = c.id
      WHERE l.is_l1_in_period
      GROUP BY c.name, c.code ORDER BY count DESC
     ) ctr_t),
    (SELECT COALESCE(jsonb_agg(row_to_json(mil_t)), '[]'::jsonb) FROM (
      SELECT id, lead_code, full_name, level_code, last_level_change_at
      FROM leads_with_milestones
      WHERE is_milestone = true AND (last_level_change_at >= v_from AND last_level_change_at <= v_to)
      ORDER BY last_level_change_at DESC LIMIT 10
     ) mil_t),
    (SELECT COUNT(*) FROM leads_with_milestones
     WHERE trial_appointment_at >= v_from AND trial_appointment_at <= v_to),
    (SELECT row_to_json(conv_t)::jsonb FROM (
      SELECT
        COUNT(*) FILTER (WHERE is_l1_in_period) as contacted,
        COUNT(*) FILTER (WHERE is_l2_in_period) as booked,
        COUNT(*) FILTER (WHERE is_l3_in_period) as trialed,
        COUNT(*) FILTER (WHERE is_l4_in_period) as paid
      FROM leads_with_milestones
     ) conv_t),
    (SELECT COALESCE(jsonb_agg(row_to_json(perf_t)), '[]'::jsonb) FROM (
      SELECT p.full_name as staff_name, 
             COUNT(l.id) FILTER (WHERE l.is_l1_in_period) as total_leads,
             COUNT(l.id) FILTER (WHERE l.is_l4_in_period) as paid_leads
      FROM leads_with_milestones l
      LEFT JOIN profiles p ON l.assigned_staff = p.id
      GROUP BY p.full_name
     ) perf_t),
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
     ) appt_t),
    (SELECT COUNT(*) FROM filtered_leads WHERE level_code = 'L1' AND (auth_permission_group() != 'telesale' OR assigned_staff = auth.uid())),
    (SELECT COUNT(*) FROM filtered_leads WHERE (level_code IN ('L1.2', 'L2.2A', 'L2.3', 'L3.3') OR (next_followup_at IS NOT NULL AND next_followup_at <= NOW())) AND (auth_permission_group() != 'telesale' OR assigned_staff = auth.uid())),
    (SELECT COALESCE(jsonb_agg(row_to_json(lvl_t)), '[]'::jsonb) FROM (
      SELECT level_code, COUNT(*) as count 
      FROM filtered_leads 
      GROUP BY level_code
     ) lvl_t),
    (SELECT COALESCE(jsonb_agg(row_to_json(det_c)), '[]'::jsonb) FROM (
      SELECT 
        c.id AS center_id,
        c.name AS center_name,
        c.code AS center_code,
        
        -- PUSH Metrics
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PUSH' AND l.is_l1_in_period), 0) AS push_l1,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PUSH' AND l.is_l2_in_period), 0) AS push_l2,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PUSH' AND l.is_l3_in_period), 0) AS push_l3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PUSH' AND l.is_l4_in_period), 0) AS push_l4,
        
        -- PULL Metrics
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PULL' AND l.is_l0_in_period), 0) AS pull_l0,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PULL' AND l.is_l1_in_period), 0) AS pull_l1,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PULL' AND l.is_l2_in_period), 0) AS pull_l2,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PULL' AND l.is_l3_in_period), 0) AS pull_l3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.source_type = 'PULL' AND l.is_l4_in_period), 0) AS pull_l4,
        
        -- TỔNG Metrics
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period), 0) AS total_l0,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l1_in_period), 0) AS total_l1,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l2_in_period), 0) AS total_l2,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l3_in_period), 0) AS total_l3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l4_in_period), 0) AS total_l4,
        
        -- BÁO CÁO TỒN
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L1.2'), 0) AS ton_l1_2,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L1.3'), 0) AS ton_l1_3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L2.2A'), 0) AS ton_l2_2a,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L2.2B'), 0) AS ton_l2_2b,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L2.3'), 0) AS ton_l2_3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L3.1'), 0) AS ton_l3_1,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L3.3'), 0) AS ton_l3_3,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L4.1'), 0) AS ton_l4_1,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code = 'L4.2'), 0) AS ton_l4_2,
        COALESCE(COUNT(l.id) FILTER (WHERE l.is_l0_in_period AND l.level_code ~ '^L4\.' AND l.level_code != 'L4.1' AND l.level_code != 'L4.2'), 0) AS ton_l4_3_plus
      FROM centers c
      LEFT JOIN leads_with_milestones l ON l.assigned_center = c.id
      WHERE c.is_active = true
        AND (p_center_ids IS NULL OR cardinality(p_center_ids) = 0 OR c.id = ANY(p_center_ids))
      GROUP BY c.id, c.name, c.code
      ORDER BY c.name
     ) det_c)
  INTO 
    v_total, v_funnel, v_by_source, v_by_center, v_milestones,
    v_appt_today, v_conversion, v_staff_perf, v_pending_appts,
    v_l1_unprocessed, v_followup_needed, v_by_level_code,
    v_by_center_detailed;

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
    'pendingAppointments', v_pending_appts,
    'l1Unprocessed', v_l1_unprocessed,
    'followupNeeded', v_followup_needed,
    'byLevelCode', v_by_level_code,
    'byCenterDetailed', v_by_center_detailed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_dashboard_analytics TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
