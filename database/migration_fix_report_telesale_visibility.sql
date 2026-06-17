-- ============================================================
-- MIGRATION: Cho phép Telesale xem đầy đủ báo cáo & Bổ sung chỉ số L0, tỷ lệ L1/L0
-- Chạy file này trên Supabase SQL Editor
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
        CASE 
          WHEN auth_permission_group() = 'admin' THEN TRUE
          WHEN auth_permission_group() = 'lead_telesale' THEN TRUE
          WHEN auth_permission_group() = 'telesale' THEN TRUE -- Xem toàn bộ leaderboard
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
        AND (p_center_id IS NULL OR l.assigned_center = p_center_id)
    ),
    leads_flags AS (
      SELECT 
        l.id,
        l.assigned_staff,
        
        -- L0: Vào kho L0 trong kỳ
        (l.entered_l0_at >= v_from AND l.entered_l0_at <= v_to) AS is_l0,

        -- L1: Chỉ tính L1.2, L1.3 và cao hơn
        (
          (
            l.entered_l1_ucmas_at >= v_from AND l.entered_l1_ucmas_at <= v_to
            OR l.entered_l1_uckid_at >= v_from AND l.entered_l1_uckid_at <= v_to
            OR l.entered_l1_at >= v_from AND l.entered_l1_at <= v_to
          )
          AND (
            l.level_code IN ('L1.2', 'L1.3')
            OR l.level_group IN ('L2', 'L3', 'L4', 'L5', 'L6')
          )
        ) AS is_l1,
        
        -- L2: Chỉ tính L2.2A, L2.2B, L2.3 và cao hơn
        (
          (l.appointment_booked_at >= v_from AND l.appointment_booked_at <= v_to)
          AND (
            l.level_code IN ('L2.2A', 'L2.2B', 'L2.3')
            OR l.level_group IN ('L3', 'L4', 'L5', 'L6')
          )
        ) AS is_l2_booked,
        
        -- L3_1: Đã học thử L3.1
        (
          (
            (l.level_code = 'L3.1' AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
            OR EXISTS (
              SELECT 1 FROM lead_level_history h 
              WHERE h.lead_id = l.id AND h.to_level = 'L3.1' 
                AND h.created_at >= v_from AND h.created_at <= v_to
            )
          )
          AND (
            l.level_code IN ('L3.1', 'L3.3')
            OR l.level_group IN ('L4', 'L5', 'L6')
          )
        ) AS is_l3_1,
        
        -- L3_3: Dừng chăm sóc sau học thử L3.3
        (
          (
            (l.level_code = 'L3.3' AND l.entered_l3_at >= v_from AND l.entered_l3_at <= v_to)
            OR EXISTS (
              SELECT 1 FROM lead_level_history h 
              WHERE h.lead_id = l.id AND h.to_level = 'L3.3' 
                AND h.created_at >= v_from AND h.created_at <= v_to
            )
          )
          AND (
            l.level_code IN ('L3.1', 'L3.3')
            OR l.level_group IN ('L4', 'L5', 'L6')
          )
        ) AS is_l3_3,
        
        -- L4: Con L4
        (
          (
            l.entered_l4_ucmas_at >= v_from AND l.entered_l4_ucmas_at <= v_to
            OR l.entered_l4_uckid_at >= v_from AND l.entered_l4_uckid_at <= v_to
            OR l.entered_l4_at >= v_from AND l.entered_l4_at <= v_to
          )
          AND (
            l.level_group IN ('L4', 'L5', 'L6')
          )
        ) AS is_l4
      FROM filtered_leads l
      WHERE l.assigned_staff IS NOT NULL
    )
    SELECT 
      p.full_name as sale_name,
      COUNT(lf.id) FILTER (WHERE lf.is_l0) as l0_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l1) as l1_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l2_booked) as l2_booked_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l3_1) as l3_attended_count,
      COUNT(lf.id) FILTER (WHERE lf.is_l3_1 OR lf.is_l3_3 OR lf.is_l4) as l3_total_count,
      ROUND(100.0 * COUNT(lf.id) FILTER (WHERE lf.is_l1) 
            / NULLIF(COUNT(lf.id) FILTER (WHERE lf.is_l0), 0), 1) as l1_l0_rate,
      ROUND(100.0 * COUNT(lf.id) FILTER (WHERE lf.is_l2_booked) 
            / NULLIF(COUNT(lf.id) FILTER (WHERE lf.is_l1), 0), 1) as l2_l1_rate,
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

GRANT EXECUTE ON FUNCTION rpc_report_booking_sale_performance TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
