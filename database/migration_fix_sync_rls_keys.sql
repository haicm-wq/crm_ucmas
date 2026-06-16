-- ============================================================
-- MIGRATION: Fix RLS read policy on system_settings for Google Apps Script (anon role)
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Xóa chính sách SELECT cũ của anon nếu tồn tại
DROP POLICY IF EXISTS "settings_anon_read_sync" ON system_settings;

-- 2. Tạo lại chính sách SELECT bổ sung thêm 'sheet_tab_name' và 'crm_custom_fields'
CREATE POLICY "settings_anon_read_sync" ON system_settings
  FOR SELECT
  USING (
    key IN (
      'sync_enabled',
      'sync_interval',
      'last_sync_at',
      'sheet_field_mapping',
      'sheet_tab_name',          -- Cho phép Apps Script đọc tên tab sheet nhập cấu hình từ CRM
      'sheet_columns_auto',
      'last_sync_result',
      'last_sync_detail',
      'sheet_out_id',
      'sheet_out_tab_name',
      'sheet_out_field_mapping',
      'sheet_out_sync_enabled',
      'sheet_out_last_sync_at',
      'sheet_out_last_sync_result',
      'sheet_out_last_sync_detail',
      'crm_custom_fields'        -- Cho phép Apps Script đọc cấu hình trường tùy chỉnh
    )
  );

-- 3. Reload schema cache cho Supabase
NOTIFY pgrst, 'reload schema';
