-- ============================================================
-- MIGRATION: Fix RLS for v_trial_appointments View
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- Drop the old view first
DROP VIEW IF EXISTS v_trial_appointments;

-- Recreate view with security_invoker = true (yêu cầu PostgreSQL 15+)
CREATE OR REPLACE VIEW v_trial_appointments 
WITH (security_invoker = true) AS
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
FROM leads l
LEFT JOIN centers  c ON l.assigned_center = c.id
LEFT JOIN profiles p ON l.assigned_staff  = p.id
WHERE l.trial_appointment_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
