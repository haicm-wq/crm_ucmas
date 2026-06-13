-- ============================================================
-- UCMAS CRM — ROW LEVEL SECURITY POLICIES
-- Chạy file này SAU supabase_schema.sql
-- ============================================================

-- Helper functions tối ưu: trả scalar thay vì row
-- (auth_profile() đã bỏ vì RETURNS composite type gây lỗi)
-- Dùng SET search_path vì SECURITY DEFINER functions cần explicit schema

CREATE OR REPLACE FUNCTION auth_permission_group()
RETURNS VARCHAR AS $$
  SELECT permission_group FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auth_center_id()
RETURNS UUID AS $$
  SELECT center_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auth_can_view_l0()
RETURNS BOOLEAN AS $$
  SELECT can_view_l0_pool FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auth_level_cap()
RETURNS VARCHAR AS $$
  SELECT level_access_cap FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auth_center_mode()
RETURNS VARCHAR AS $$
  SELECT center_access_mode FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auth_allowed_centers()
RETURNS UUID[] AS $$
  SELECT allowed_center_ids FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_level_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_departments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (auth_permission_group() = 'admin');

-- ============================================================
-- LEADS — Optimized: scalar helpers thay vì (auth_profile()).field mỗi row
-- ============================================================

-- Admin: full access
CREATE POLICY "leads_admin" ON leads FOR ALL
  USING (auth_permission_group() = 'admin');

-- Center: xem + sửa + tạo lead của trung tâm mình, trừ L0
CREATE POLICY "leads_center_select" ON leads FOR SELECT
  USING (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
    AND level_group != 'L0'
  );

CREATE POLICY "leads_center_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
    AND level_group != 'L0'
  );

-- Fix I3: Center cũng cần INSERT policy
CREATE POLICY "leads_center_insert" ON leads FOR INSERT
  WITH CHECK (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
  );

-- Marketing: đọc L0 pool (nếu có quyền) + L1+ theo level cap + center filter
CREATE POLICY "leads_marketing_select" ON leads FOR SELECT
  USING (
    auth_permission_group() = 'marketing'
    AND (
      -- L0 pool
      (level_group = 'L0' AND auth_can_view_l0() = true)
      OR
      -- L1+ with filters
      (
        level_group != 'L0'
        AND (
          auth_level_cap() IS NULL
          OR level_rank(level_group) <= level_rank(auth_level_cap())
        )
        AND (
          auth_center_mode() = 'all'
          OR assigned_center = ANY(auth_allowed_centers())
        )
      )
    )
  );

-- Marketing: insert
CREATE POLICY "leads_marketing_insert" ON leads FOR INSERT
  WITH CHECK (auth_permission_group() = 'marketing');

-- Marketing: update
CREATE POLICY "leads_marketing_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() = 'marketing'
    AND (
      level_group = 'L0'
      OR (
        auth_level_cap() IS NULL
        OR level_rank(level_group) <= level_rank(auth_level_cap())
      )
    )
  );

-- ============================================================
-- LEAD_LEVEL_HISTORY — follows lead access
-- ============================================================

CREATE POLICY "llh_select" ON lead_level_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_level_history.lead_id)
  );

CREATE POLICY "llh_insert" ON lead_level_history FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- LEAD_NOTES — follows lead access
-- ============================================================

CREATE POLICY "notes_select" ON lead_notes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_notes.lead_id)
  );

CREATE POLICY "notes_insert" ON lead_notes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_notes.lead_id)
  );

-- ============================================================
-- NOTIFICATIONS — chỉ thấy của mình
-- ============================================================

CREATE POLICY "notif_select" ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notif_update" ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "notif_insert" ON notifications FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- CENTERS — everyone reads, admin writes
-- ============================================================

CREATE POLICY "centers_select" ON centers FOR SELECT USING (true);

CREATE POLICY "centers_admin" ON centers FOR ALL
  USING (auth_permission_group() = 'admin');

-- ============================================================
-- DEPARTMENTS — everyone reads, admin writes
-- ============================================================

CREATE POLICY "dept_select" ON departments FOR SELECT USING (true);

CREATE POLICY "dept_admin" ON departments FOR ALL
  USING (auth_permission_group() = 'admin');

-- ============================================================
-- SUB_DEPARTMENTS — everyone reads, admin writes
-- ============================================================

CREATE POLICY "subdept_select" ON sub_departments FOR SELECT USING (true);

CREATE POLICY "subdept_admin" ON sub_departments FOR ALL
  USING (auth_permission_group() = 'admin');

-- ============================================================
-- SYSTEM_SETTINGS — admin only
-- ============================================================

CREATE POLICY "settings_admin" ON system_settings FOR ALL
  USING (auth_permission_group() = 'admin');

-- ============================================================
-- SYNC_LOG — admin only
-- ============================================================

CREATE POLICY "synclog_admin" ON sync_log FOR ALL
  USING (auth_permission_group() = 'admin');
