-- ============================================================
-- MIGRATION: Hỗ trợ Reset mật khẩu người dùng
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_reset_user_password(
  p_user_id UUID,
  p_new_password VARCHAR
) RETURNS JSONB AS $$
DECLARE
  v_caller_group VARCHAR;
BEGIN
  -- Kiểm tra xem người gọi có phải là admin không
  SELECT permission_group INTO v_caller_group
  FROM public.profiles WHERE id = auth.uid();
  
  IF v_caller_group IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Chỉ admin mới có quyền reset mật khẩu';
  END IF;

  -- Cập nhật mật khẩu trong bảng auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Reset mật khẩu thành công');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION rpc_reset_user_password TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
