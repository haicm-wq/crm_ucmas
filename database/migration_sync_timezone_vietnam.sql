-- ============================================================
-- MIGRATION: Đồng bộ múi giờ Việt Nam (GMT+7) cho rpc_dashboard_hq()
-- Chạy file này trên Supabase SQL Editor để cập nhật hàm đếm lịch hẹn trong ngày
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

  -- Đếm lịch hẹn ngày hôm nay theo giờ Việt Nam (GMT+7)
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

GRANT EXECUTE ON FUNCTION rpc_dashboard_hq() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
