-- ============================================================
-- RPC: TẠO USER MỚI (chỉ admin được gọi)
-- Chạy file này trên Supabase SQL Editor SAU 3 file chính
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_create_user(
  p_email VARCHAR,
  p_password VARCHAR,
  p_full_name VARCHAR,
  p_permission_group VARCHAR DEFAULT 'center',
  p_center_id UUID DEFAULT NULL,
  p_can_view_l0_pool BOOLEAN DEFAULT FALSE,
  p_center_access_mode VARCHAR DEFAULT 'own'
) RETURNS JSONB AS $$
DECLARE
  v_caller_group VARCHAR;
  v_new_user_id UUID;
BEGIN
  -- Check caller is admin
  SELECT permission_group INTO v_caller_group
  FROM public.profiles WHERE id = auth.uid();
  
  IF v_caller_group != 'admin' THEN
    RAISE EXCEPTION 'Chỉ admin mới được tạo tài khoản';
  END IF;

  -- Validate
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'Email không được để trống';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Mật khẩu phải có ít nhất 6 ký tự';
  END IF;

  -- Create auth user via Supabase internal function
  v_new_user_id := extensions.uuid_generate_v4();
  
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    'authenticated',
    'authenticated',
    NOW(),
    NOW(),
    '',
    ''
  );

  -- Create identity record
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    v_new_user_id,
    p_email,
    jsonb_build_object('sub', v_new_user_id::text, 'email', p_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- Update profile (trigger đã tạo profile tự động)
  UPDATE public.profiles SET
    full_name = p_full_name,
    permission_group = p_permission_group,
    center_id = p_center_id,
    can_view_l0_pool = p_can_view_l0_pool,
    center_access_mode = p_center_access_mode,
    is_active = true
  WHERE id = v_new_user_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'user_id', v_new_user_id,
    'email', p_email,
    'full_name', p_full_name
  );
  
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'error', 'message', 'Email đã tồn tại');
WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
