-- ============================================================
-- MIGRATION: Cập nhật quyền hiển thị báo cáo cho Telesale và Lead Telesale
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Cập nhật hàm rpc_report_product_analytics
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


-- 2. Cập nhật hàm rpc_report_booking_sale_performance
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
        -- Center filter
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
      
      -- Tỷ lệ L1/L0
      ROUND(100.0 * COUNT(lf.id) FILTER (WHERE lf.is_l1) 
            / NULLIF(COUNT(lf.id) FILTER (WHERE lf.is_l0), 0), 1) as l1_l0_rate,
      
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

-- Cấp quyền thực thi cho các hàm RPC
GRANT EXECUTE ON FUNCTION rpc_report_product_analytics TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_report_booking_sale_performance TO anon, authenticated;

-- Tải nạp lại PostgREST schema cache
NOTIFY pgrst, 'reload schema';
