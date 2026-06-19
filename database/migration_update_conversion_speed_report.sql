-- ============================================================
-- MIGRATION: Cập nhật báo cáo Tốc độ chuyển đổi (Conversion Speed Report)
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_report_time_in_stage(p_center_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
BEGIN
  RETURN (
    SELECT row_to_json(t)::jsonb
    FROM (SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (first_processed_at - entered_l0_at))/3600),1) as l1_kk_first_process,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l1_at - entered_l0_at))/3600),1) as l1_kk_to_l1,
      ROUND(AVG(EXTRACT(EPOCH FROM (appointment_booked_at - entered_l1_at))/3600),1) as l1_to_l2_2b,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l3_at - entered_l1_at))/3600),1) as l1_to_l3,
      ROUND(AVG(EXTRACT(EPOCH FROM (entered_l4_at - entered_l1_at))/3600),1) as l1_to_l4
    FROM leads
    WHERE (p_center_id IS NULL OR assigned_center = p_center_id)) t
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
