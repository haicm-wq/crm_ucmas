-- ============================================================
-- MIGRATION: Outbound Sync Settings & RPC Function
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Khởi tạo các khóa cấu hình system_settings cho chiều xuất
INSERT INTO system_settings (key, value) VALUES
  ('sheet_out_id', ''),
  ('sheet_out_tab_name', ''),
  ('sheet_out_field_mapping', ''),
  ('sheet_out_sync_enabled', 'false'),
  ('sheet_out_last_sync_at', ''),
  ('sheet_out_last_sync_result', ''),
  ('sheet_out_last_sync_detail', '')
ON CONFLICT (key) DO NOTHING;

-- Dọn dẹp chính sách cũ trên system_settings để tạo mới mở rộng
DROP POLICY IF EXISTS "settings_anon_read_sync" ON system_settings;
DROP POLICY IF EXISTS "settings_anon_write_sync" ON system_settings;
DROP POLICY IF EXISTS "settings_anon_update_sync" ON system_settings;

-- 2. RLS: Cho phép Apps Script (anon key) đọc/ghi cấu hình chiều xuất
CREATE POLICY "settings_anon_read_sync" ON system_settings
  FOR SELECT
  USING (
    key IN (
      'sync_enabled', 'sync_interval', 'last_sync_at', 'sheet_field_mapping', 'sheet_columns_auto', 'last_sync_result', 'last_sync_detail',
      'sheet_out_id', 'sheet_out_tab_name', 'sheet_out_field_mapping', 'sheet_out_sync_enabled', 'sheet_out_last_sync_at', 'sheet_out_last_sync_result', 'sheet_out_last_sync_detail'
    )
  );

CREATE POLICY "settings_anon_write_sync" ON system_settings
  FOR INSERT
  WITH CHECK (
    key IN (
      'last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto',
      'sheet_out_last_sync_at', 'sheet_out_last_sync_result', 'sheet_out_last_sync_detail'
    )
  );

CREATE POLICY "settings_anon_update_sync" ON system_settings
  FOR UPDATE
  USING (
    key IN (
      'last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto',
      'sheet_out_last_sync_at', 'sheet_out_last_sync_result', 'sheet_out_last_sync_detail'
    )
  )
  WITH CHECK (
    key IN (
      'last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto',
      'sheet_out_last_sync_at', 'sheet_out_last_sync_result', 'sheet_out_last_sync_detail'
    )
  );

-- 3. Tạo hàm RPC cập nhật sheet_out_row hàng loạt
CREATE OR REPLACE FUNCTION rpc_update_sheet_out_rows(
  p_updates JSONB -- định dạng [{ "id": "...", "sheet_row": 5 }]
) RETURNS VOID AS $$
BEGIN
  UPDATE leads l
  SET sheet_out_row = (u.item->>'sheet_row')::int
  FROM jsonb_array_elements(p_updates) AS u(item)
  WHERE l.id = (u.item->>'id')::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_sheet_out_rows TO anon, authenticated;

-- 4. Tạo hàm RPC lấy danh sách lead phục vụ đồng bộ chiều xuất
CREATE OR REPLACE FUNCTION rpc_get_leads_for_outbound_sync(
  p_last_sync_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  lead_code VARCHAR,
  full_name VARCHAR,
  phone VARCHAR,
  child_name VARCHAR,
  child_birth_year INTEGER,
  address TEXT,
  level_code VARCHAR,
  center_name VARCHAR,
  staff_name VARCHAR,
  source_type VARCHAR,
  ad_campaign VARCHAR,
  interested_products TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  sheet_out_row INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.lead_code,
    l.full_name,
    l.phone,
    l.child_name,
    l.child_birth_year,
    l.address,
    l.level_code,
    c.name AS center_name,
    p.full_name AS staff_name,
    l.source_type,
    l.ad_campaign,
    l.interested_products,
    l.created_at,
    l.updated_at,
    l.sheet_out_row
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.sheet_out_row IS NULL 
     OR l.updated_at > COALESCE(p_last_sync_at, '1970-01-01'::timestamptz);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_get_leads_for_outbound_sync TO anon, authenticated;
