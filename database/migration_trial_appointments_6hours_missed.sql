-- ============================================================
-- Migration: Cập nhật view Lịch hẹn (Bỏ lỡ sau 6 tiếng) & Trigger ghi lịch sử hoạt động
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Cập nhật view v_trial_appointments
DROP VIEW IF EXISTS v_trial_appointments;

CREATE OR REPLACE VIEW v_trial_appointments 
WITH (security_invoker = true) AS
SELECT
  l.id, l.lead_code, l.full_name, l.phone, l.child_birth_year, l.child_name, l.address,
  l.source_type,
  l.interested_products,
  l.assigned_center, c.name AS center_name,
  l.assigned_staff, p.full_name AS sale_name,
  l.level_code, l.level_group, l.trial_appointment_at, l.appointment_booked_at,
  CASE
    WHEN l.entered_l3_at IS NOT NULL      THEN 'attended'
    WHEN l.level_code = 'L2.3'            THEN 'cancelled'
    WHEN l.trial_appointment_at + INTERVAL '6 hours' < NOW() 
         AND l.entered_l3_at IS NULL 
         AND l.entered_l4_at IS NULL 
         AND l.level_group NOT IN ('L3', 'L4') THEN 'missed'
    ELSE 'scheduled'
  END AS appt_status,
  (SELECT status FROM appointment_reminders WHERE lead_id = l.id AND role = 'sale') AS sale_remind_status,
  (SELECT status FROM appointment_reminders WHERE lead_id = l.id AND role = 'center') AS center_remind_status
FROM leads l
LEFT JOIN centers  c ON l.assigned_center = c.id
LEFT JOIN profiles p ON l.assigned_staff  = p.id
WHERE l.trial_appointment_at IS NOT NULL;

-- 2. Trigger ghi lịch sử hoạt động đổi lịch hẹn trên bảng leads
DROP TRIGGER IF EXISTS trg_log_appointment_changes ON leads;
DROP FUNCTION IF EXISTS fn_log_appointment_changes();

CREATE OR REPLACE FUNCTION fn_log_appointment_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_actor_name VARCHAR(100);
  v_time_str VARCHAR(30);
  v_old_time_str VARCHAR(30);
  v_msg TEXT;
BEGIN
  v_actor := COALESCE(current_setting('app.current_user_id', true)::uuid, auth.uid());
  IF v_actor IS NULL THEN
    SELECT id, full_name INTO v_actor, v_actor_name FROM profiles ORDER BY created_at ASC LIMIT 1;
  ELSE
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor;
  END IF;

  -- Format time in Vietnam timezone
  IF NEW.trial_appointment_at IS NOT NULL THEN
    v_time_str := to_char(NEW.trial_appointment_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  END IF;
  IF OLD.trial_appointment_at IS NOT NULL THEN
    v_old_time_str := to_char(OLD.trial_appointment_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  END IF;

  IF TG_OP = 'INSERT' AND NEW.trial_appointment_at IS NOT NULL THEN
    v_msg := 'Hệ thống: Lịch hẹn mới đã được đặt lúc ' || v_time_str || ' (bởi ' || COALESCE(v_actor_name, 'nhân viên') || ').';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.trial_appointment_at IS NULL AND NEW.trial_appointment_at IS NOT NULL THEN
      v_msg := 'Hệ thống: Lịch hẹn mới đã được đặt lúc ' || v_time_str || ' (bởi ' || COALESCE(v_actor_name, 'nhân viên') || ').';
    ELSIF OLD.trial_appointment_at IS NOT NULL AND NEW.trial_appointment_at IS NOT NULL AND OLD.trial_appointment_at != NEW.trial_appointment_at THEN
      v_msg := 'Hệ thống: Lịch hẹn đã được đổi từ ' || v_old_time_str || ' sang ' || v_time_str || ' (bởi ' || COALESCE(v_actor_name, 'nhân viên') || ').';
    ELSIF OLD.trial_appointment_at IS NOT NULL AND NEW.trial_appointment_at IS NULL THEN
      v_msg := 'Hệ thống: Lịch hẹn lúc ' || v_old_time_str || ' đã bị xóa (bởi ' || COALESCE(v_actor_name, 'nhân viên') || ').';
    END IF;
  END IF;

  IF v_msg IS NOT NULL THEN
    INSERT INTO appointment_comments (lead_id, author_id, content, created_at)
    VALUES (NEW.id, v_actor, v_msg, NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_appointment_changes
AFTER INSERT OR UPDATE OF trial_appointment_at ON leads
FOR EACH ROW
EXECUTE FUNCTION fn_log_appointment_changes();

-- 3. Trigger ghi lịch sử nhắc lịch trên bảng appointment_reminders
DROP TRIGGER IF EXISTS trg_log_reminder_changes ON appointment_reminders;
DROP FUNCTION IF EXISTS fn_log_reminder_changes();

CREATE OR REPLACE FUNCTION fn_log_reminder_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_actor_name VARCHAR(100);
  v_role_str VARCHAR(50);
  v_msg TEXT;
BEGIN
  v_actor := COALESCE(NEW.updated_by, auth.uid());
  IF v_actor IS NULL THEN
    SELECT id, full_name INTO v_actor, v_actor_name FROM profiles ORDER BY created_at ASC LIMIT 1;
  ELSE
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor;
  END IF;

  v_role_str := CASE WHEN NEW.role = 'sale' THEN 'Sale' ELSE 'Trung tâm' END;

  IF TG_OP = 'INSERT' OR OLD.status != NEW.status OR COALESCE(OLD.note, '') != COALESCE(NEW.note, '') THEN
    IF NEW.status = 'reminded' THEN
      v_msg := 'Hệ thống: ' || COALESCE(v_actor_name, 'Nhân viên') || ' cập nhật nhắc lịch (' || v_role_str || ') -> Đã nhắc lịch.';
    ELSIF NEW.status = 'failed' THEN
      v_msg := 'Hệ thống: ' || COALESCE(v_actor_name, 'Nhân viên') || ' cập nhật nhắc lịch (' || v_role_str || ') -> Chưa nhắc được.';
      IF NEW.note IS NOT NULL AND NEW.note != '' THEN
        v_msg := v_msg || ' Lý do: ' || NEW.note;
      END IF;
    ELSIF NEW.status = 'pending' THEN
      v_msg := 'Hệ thống: ' || COALESCE(v_actor_name, 'Nhân viên') || ' cập nhật nhắc lịch (' || v_role_str || ') -> Chờ nhắc.';
    END IF;

    IF v_msg IS NOT NULL THEN
      INSERT INTO appointment_comments (lead_id, author_id, content, created_at)
      VALUES (NEW.lead_id, v_actor, v_msg, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_reminder_changes
AFTER INSERT OR UPDATE ON appointment_reminders
FOR EACH ROW
EXECUTE FUNCTION fn_log_reminder_changes();

-- 4. Ngăn chặn trùng lặp thông báo hệ thống về lịch bị bỏ lỡ
DROP TRIGGER IF EXISTS trg_prevent_duplicate_missed_comment ON appointment_comments;
DROP FUNCTION IF EXISTS fn_prevent_duplicate_missed_comment();

CREATE OR REPLACE FUNCTION fn_prevent_duplicate_missed_comment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content LIKE 'Hệ thống: Lịch hẹn đã bị bỏ lỡ%' OR NEW.content LIKE 'Hệ thống: Lịch hẹn bị bỏ lỡ%' THEN
    IF EXISTS (
      SELECT 1 FROM appointment_comments 
      WHERE lead_id = NEW.lead_id 
        AND (content LIKE 'Hệ thống: Lịch hẹn đã bị bỏ lỡ%' OR content LIKE 'Hệ thống: Lịch hẹn bị bỏ lỡ%')
    ) THEN
      -- Bỏ qua dòng insert này bằng cách trả về NULL
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prevent_duplicate_missed_comment
BEFORE INSERT ON appointment_comments
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_duplicate_missed_comment();

NOTIFY pgrst, 'reload schema';
