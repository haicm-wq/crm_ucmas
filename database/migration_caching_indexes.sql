-- ============================================================
-- UCMAS CRM — MIGRATION CACHING & OPTIMIZATION INDEXES
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Tối ưu hóa cho LeadsPage (Danh sách Lead - loại trừ L0, sắp xếp theo created_at giảm dần)
-- Partial index này giúp PostgreSQL bỏ qua toàn bộ L0 leads khi load danh sách chính, giảm dung lượng scan cực lớn
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_non_l0_created
  ON leads(created_at DESC) WHERE level_group != 'L0';

-- 2. Tối ưu hóa cho danh sách lịch sử chăm sóc (lead_level_history)
-- Bổ sung index kết hợp (composite index) để tăng tốc khi hiển thị dòng thời gian chăm sóc của từng lead
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llh_lead_created_desc
  ON lead_level_history(lead_id, created_at DESC);

-- 3. Tối ưu hóa truy vấn v_trial_appointments (Lịch hẹn học thử)
-- Partial index chỉ quét các lead có lịch hẹn (trial_appointment_at IS NOT NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_trial_appt_not_null
  ON leads(trial_appointment_at DESC) WHERE trial_appointment_at IS NOT NULL;
