-- ============================================================
-- Migration: Soft Delete / Thùng Rác cho Leads (Admin only)
-- ============================================================

-- 1. Thêm cột deleted_at và deleted_by vào bảng leads
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_deleted ON leads(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 2. Cập nhật RLS: Non-admin không thấy lead đã xóa
-- ============================================================

-- Leads Center: ẩn deleted
DROP POLICY IF EXISTS "leads_center_select" ON leads;
CREATE POLICY "leads_center_select" ON leads FOR SELECT
  USING (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
    AND level_group != 'L0'
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "leads_center_update" ON leads;
CREATE POLICY "leads_center_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
    AND level_group != 'L0'
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "leads_center_insert" ON leads;
CREATE POLICY "leads_center_insert" ON leads FOR INSERT
  WITH CHECK (
    auth_permission_group() = 'center'
    AND assigned_center = auth_center_id()
  );

-- Leads Marketing: ẩn deleted
DROP POLICY IF EXISTS "leads_marketing_select" ON leads;
CREATE POLICY "leads_marketing_select" ON leads FOR SELECT
  USING (
    auth_permission_group() = 'marketing'
    AND deleted_at IS NULL
    AND (
      (level_group = 'L0' AND auth_can_view_l0() = true)
      OR (
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

DROP POLICY IF EXISTS "leads_marketing_insert" ON leads;
CREATE POLICY "leads_marketing_insert" ON leads FOR INSERT
  WITH CHECK (auth_permission_group() = 'marketing');

DROP POLICY IF EXISTS "leads_marketing_update" ON leads;
CREATE POLICY "leads_marketing_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() = 'marketing'
    AND deleted_at IS NULL
    AND (
      level_group = 'L0'
      OR (
        auth_level_cap() IS NULL
        OR level_rank(level_group) <= level_rank(auth_level_cap())
      )
    )
  );

-- ============================================================
-- 3. Thêm policy cho lead_telesale và telesale (migration hiện tại)
-- ============================================================

DROP POLICY IF EXISTS "leads_telesale_select" ON leads;
CREATE POLICY "leads_telesale_select" ON leads FOR SELECT
  USING (
    auth_permission_group() IN ('telesale', 'lead_telesale')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "leads_telesale_insert" ON leads;
CREATE POLICY "leads_telesale_insert" ON leads FOR INSERT
  WITH CHECK (auth_permission_group() IN ('telesale', 'lead_telesale'));

DROP POLICY IF EXISTS "leads_telesale_update" ON leads;
CREATE POLICY "leads_telesale_update" ON leads FOR UPDATE
  USING (
    auth_permission_group() IN ('telesale', 'lead_telesale')
    AND deleted_at IS NULL
  );

-- ============================================================
-- 4. RPC: Soft delete (chuyển vào thùng rác)
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_soft_delete_leads(p_lead_ids UUID[])
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only admin can delete leads';
  END IF;

  UPDATE leads
  SET deleted_at = NOW(), deleted_by = auth.uid()
  WHERE id = ANY(p_lead_ids)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_soft_delete_leads TO authenticated;

-- ============================================================
-- 5. RPC: Khôi phục lead từ thùng rác
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_restore_leads(p_lead_ids UUID[])
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only admin can restore leads';
  END IF;

  UPDATE leads
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = ANY(p_lead_ids)
    AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('restored', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_restore_leads TO authenticated;

-- ============================================================
-- 6. RPC: Xóa vĩnh viễn tất cả lead trong thùng rác
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_purge_trash()
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only admin can purge trash';
  END IF;

  SELECT COUNT(*) INTO v_count FROM leads WHERE deleted_at IS NOT NULL;

  DELETE FROM leads WHERE deleted_at IS NOT NULL;

  RETURN jsonb_build_object('purged', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_purge_trash TO authenticated;

-- ============================================================
-- 7. RPC: Lấy danh sách lead trong thùng rác (admin only, qua RPC vì RLS ẩn)
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_fetch_trash(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_data JSONB;
  v_total BIGINT;
BEGIN
  IF auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM leads
  WHERE deleted_at IS NOT NULL
    AND (p_search IS NULL OR full_name ILIKE '%' || p_search || '%' OR phone ILIKE '%' || p_search || '%' OR lead_code ILIKE '%' || p_search || '%');

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_data
  FROM (
    SELECT
      l.id, l.lead_code, l.full_name, l.phone, l.child_birth_year,
      l.level_code, l.level_group, l.source_type,
      l.deleted_at, l.deleted_by,
      c.name  AS center_name,
      p.full_name AS deleted_by_name
    FROM leads l
    LEFT JOIN centers  c ON l.assigned_center = c.id
    LEFT JOIN profiles p ON l.deleted_by = p.id
    WHERE l.deleted_at IS NOT NULL
      AND (p_search IS NULL OR l.full_name ILIKE '%' || p_search || '%' OR l.phone ILIKE '%' || p_search || '%' OR l.lead_code ILIKE '%' || p_search || '%')
    ORDER BY l.deleted_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('data', v_data, 'total', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_fetch_trash TO authenticated;

NOTIFY pgrst, 'reload schema';
