-- ============================================================
-- Migration: Thêm tham số p_source_type vào rpc_report_funnel
-- Cho phép lọc báo cáo theo nguồn PULL, PUSH hoặc tổng hợp (NULL = tất cả)
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_report_funnel(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_center_id UUID DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL  -- 'PULL', 'PUSH', NULL = tất cả
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
          AND (p_source_type IS NULL OR source_type = p_source_type)
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
    AND (p_center_id IS NULL OR assigned_center = p_center_id)
    AND (p_source_type IS NULL OR source_type = p_source_type)) t;

  RETURN jsonb_build_object('funnel', v_funnel, 'conversion', v_conv);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
