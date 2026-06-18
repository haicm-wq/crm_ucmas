-- ============================================================
-- Migration: Fix Trash Purge & Bypass-RLS Phone Duplicate Check
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Drop rule chặn delete trên bảng lead_level_history
-- Rule này xung đột với constraint ON DELETE CASCADE của foreign key leads(id),
-- làm cho trigger referential integrity của Postgres báo lỗi khi xóa vĩnh viễn lead.
-- Việc xóa rule là an toàn vì RLS mặc định không cho phép UPDATE/DELETE trên lead_level_history đối với role authenticated/anonymous.
DROP RULE IF EXISTS llh_no_delete ON lead_level_history;

-- 2. Tạo RPC rpc_check_phone để kiểm tra số điện thoại bỏ qua RLS (Security Definer)
-- Giúp tài khoản trung tâm kiểm tra chính xác SĐT đã tồn tại ở trung tâm khác hoặc ở kho L0.
CREATE OR REPLACE FUNCTION rpc_check_phone(p_phone TEXT)
RETURNS JSONB AS $$
DECLARE
  v_leads JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'lead_code', l.lead_code,
    'full_name', l.full_name,
    'child_birth_year', l.child_birth_year,
    'level_code', l.level_code,
    'level_group', l.level_group,
    'center_name', c.name,
    'staff_name', p.full_name
  )), '[]'::jsonb) INTO v_leads
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.phone = p_phone AND l.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'exists', jsonb_array_length(v_leads) > 0,
    'count', jsonb_array_length(v_leads),
    'leads', v_leads
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_check_phone TO authenticated;

NOTIFY pgrst, 'reload schema';
