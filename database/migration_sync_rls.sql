-- ============================================================
-- UCMAS CRM — SQL cần chạy trên Supabase SQL Editor
-- Cho phép Apps Script (dùng anon key) đọc/ghi system_settings
-- ============================================================

-- 1. Cho phép anon/service_role ĐỌC cấu hình sync
--    (Apps Script cần đọc: sync_enabled, sync_interval, sheet_field_mapping, last_sync_at)
CREATE POLICY "settings_anon_read_sync" ON system_settings
  FOR SELECT
  USING (
    key IN ('sync_enabled', 'sync_interval', 'last_sync_at', 'sheet_field_mapping', 'sheet_columns_auto')
  );

-- 2. Cho phép anon/service_role GHI kết quả sync
--    (Apps Script cần ghi: last_sync_at, last_sync_result, last_sync_detail, sheet_columns_auto)
CREATE POLICY "settings_anon_write_sync" ON system_settings
  FOR INSERT
  WITH CHECK (
    key IN ('last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto')
  );

CREATE POLICY "settings_anon_update_sync" ON system_settings
  FOR UPDATE
  USING (
    key IN ('last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto')
  )
  WITH CHECK (
    key IN ('last_sync_at', 'last_sync_result', 'last_sync_detail', 'sheet_columns_auto')
  );
