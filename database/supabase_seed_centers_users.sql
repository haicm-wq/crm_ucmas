-- ============================================================
-- SCRIPT: KHỞI TẠO HÀNG LOẠT 13 TÀI KHOẢN TRUNG TÂM
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  center_record RECORD;
  v_email VARCHAR;
  v_password VARCHAR := '123456';
  v_new_user_id UUID;
BEGIN
  -- Tạo bảng tạm để chứa thông tin map tài khoản trung tâm
  CREATE TEMP TABLE temp_center_users (
    code VARCHAR,
    username VARCHAR,
    name VARCHAR
  );
  
  INSERT INTO temp_center_users (code, username, name) VALUES
    ('CAU_GIAY', 'caugiay', 'Cầu Giấy'),
    ('DEN_LU', 'denlu', 'Đền Lừ'),
    ('DOI_CAN', 'doican', 'Đội Cấn'), -- Đã sửa đúng chính tả Đội Cấn
    ('DONG_ANH', 'donganh', 'Đông Anh'),
    ('HA_DONG', 'hadong', 'Hà Đông'),
    ('HANG_CHUOI', 'hangchuoi', 'Hàng Chuối'),
    ('LINH_DAM', 'linhdam', 'Linh Đàm'),
    ('MY_DINH', 'mydinh', 'Mỹ Đình'),
    ('PHUONG_MAI', 'phuongmai', 'Phương Mai'),
    ('TAY_HO', 'tayho', 'Tây Hồ'),
    ('THANH_TRI', 'thanhtri', 'Thanh Trì'),
    ('TRUNG_HOA', 'trunghoa', 'Trung Hòa'),
    ('TRUNG_KINH', 'trungkinh', 'Trung Kính');

  FOR center_record IN 
    SELECT t.code, t.username, t.name, c.id AS center_id 
    FROM temp_center_users t
    JOIN public.centers c ON c.code = t.code
  LOOP
    v_email := center_record.username || '@ucmas.local';
    
    -- Kiểm tra nếu tài khoản chưa tồn tại thì tạo mới
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      v_new_user_id := extensions.uuid_generate_v4();
      
      -- 1. Thêm bản ghi vào bảng auth.users
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
        v_email,
        extensions.crypt(v_password, extensions.gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', center_record.name),
        'authenticated',
        'authenticated',
        NOW(),
        NOW(),
        '',
        ''
      );

      -- 2. Thêm bản ghi vào bảng auth.identities
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
        v_email,
        jsonb_build_object('sub', v_new_user_id::text, 'email', v_email),
        'email',
        NOW(),
        NOW(),
        NOW()
      );

      -- 3. Cập nhật phân quyền trên bảng public.profiles (được tự động insert rỗng bởi trigger auth user)
      UPDATE public.profiles SET
        full_name = center_record.name,
        permission_group = 'center',
        center_id = center_record.center_id,
        can_view_l0_pool = false,
        center_access_mode = 'own',
        is_active = true
      WHERE id = v_new_user_id;

      RAISE NOTICE 'Đã tạo thành công tài khoản cho trung tâm % (%)', center_record.name, v_email;
    ELSE
      -- Nếu tài khoản đã tồn tại, chỉ cập nhật quyền trên profiles
      SELECT id INTO v_new_user_id FROM auth.users WHERE email = v_email;
      
      UPDATE public.profiles SET
        full_name = center_record.name,
        permission_group = 'center',
        center_id = center_record.center_id,
        can_view_l0_pool = false,
        center_access_mode = 'own',
        is_active = true
      WHERE id = v_new_user_id;
      
      RAISE NOTICE 'Tài khoản % đã tồn tại, đã cập nhật thông tin profile.', v_email;
    END IF;
  END LOOP;

  -- Cleanup: Sửa lỗi Database error querying schema khi các cột trong auth.users bị NULL
  DECLARE
    col RECORD;
    query_str TEXT;
  BEGIN
    FOR col IN 
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name IN ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'email_change', 'reauthentication_token')
    LOOP
      query_str := 'UPDATE auth.users SET ' || quote_ident(col.column_name) || ' = '''' WHERE ' || quote_ident(col.column_name) || ' IS NULL;';
      EXECUTE query_str;
    END LOOP;

    FOR col IN 
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
        AND column_name IN ('is_sso_user', 'is_anonymous')
    LOOP
      query_str := 'UPDATE auth.users SET ' || quote_ident(col.column_name) || ' = false WHERE ' || quote_ident(col.column_name) || ' IS NULL;';
      EXECUTE query_str;
    END LOOP;
  END;

  DROP TABLE temp_center_users;
END $$;
