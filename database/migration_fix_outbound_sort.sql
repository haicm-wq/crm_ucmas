-- ============================================================
-- MIGRATION: Fix Outbound Sync sorting (A-Z) & add L4 sub-milestones
-- Chạy file này trên Supabase SQL Editor để cập nhật hệ thống
-- ============================================================

DROP FUNCTION IF EXISTS rpc_get_leads_for_outbound_sync(TIMESTAMPTZ);

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
  sheet_out_row INTEGER,
  custom_fields JSONB,
  l4_type VARCHAR,
  entered_l1_at TIMESTAMPTZ,
  entered_l2_at TIMESTAMPTZ,
  entered_l3_at TIMESTAMPTZ,
  entered_l4_at TIMESTAMPTZ,
  entered_l4_uckid_at TIMESTAMPTZ,
  entered_l4_ucmas_at TIMESTAMPTZ
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
    l.sheet_out_row,
    l.custom_fields,
    l.l4_type,
    l.entered_l1_at,
    l.entered_l2_at,
    l.entered_l3_at,
    l.entered_l4_at,
    l.entered_l4_uckid_at,
    l.entered_l4_ucmas_at
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.sheet_out_row IS NULL 
     OR l.updated_at > COALESCE(p_last_sync_at, '1970-01-01'::timestamptz)
  ORDER BY l.lead_code ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_get_leads_for_outbound_sync TO anon, authenticated;
