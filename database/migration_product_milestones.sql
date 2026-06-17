-- ============================================================
-- MIGRATION: Ghi nhận riêng mốc L1, L2, L3 cho UCMAS và UCKID
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Thêm các cột mốc thời gian riêng biệt vào bảng leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l1_ucmas_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l1_uckid_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l2_ucmas_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l2_uckid_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l3_ucmas_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entered_l3_uckid_at TIMESTAMPTZ;

-- 2. Cập nhật hàm trigger fn_normalize_lead()
CREATE OR REPLACE FUNCTION fn_normalize_lead() RETURNS TRIGGER AS $$
BEGIN
    -- Computed fields
    NEW.level_group := 'L' || COALESCE(substring(NEW.level_code FROM '^L(\d)'), '0');
    IF NEW.level_group != 'L4' THEN
        NEW.l4_type := NULL;
    END IF;
    NEW.is_milestone := NEW.level_code IN ('L2.2B','L2.2O','L2.2OS','L3.O');

    IF NEW.level_code ~ '^L4\.\d+' THEN
        NEW.paid_courses_count := (substring(NEW.level_code FROM '^L4\.(\d+)'))::int;
    ELSE
        NEW.paid_courses_count := 0;
    END IF;

    -- last_level_change_at
    IF TG_OP = 'INSERT' THEN
        NEW.last_level_change_at := NOW();
    ELSIF NEW.level_code IS DISTINCT FROM OLD.level_code THEN
        NEW.last_level_change_at := NOW();
    END IF;

    NEW.updated_at := NOW();

    -- "Thời gian vào hệ thống"
    IF TG_OP = 'INSERT' THEN
        NEW.entered_l0_at := COALESCE(NEW.entered_l0_at, NOW());
    END IF;

    -- Đóng dấu mốc nhóm Level hiện tại (lần đầu, idempotent)
    CASE NEW.level_group
        WHEN 'L1' THEN NEW.entered_l1_at := COALESCE(NEW.entered_l1_at, NOW());
        WHEN 'L2' THEN NEW.entered_l2_at := COALESCE(NEW.entered_l2_at, NOW());
        WHEN 'L3' THEN NEW.entered_l3_at := COALESCE(NEW.entered_l3_at, NOW());
        WHEN 'L4' THEN 
            NEW.entered_l4_at := COALESCE(NEW.entered_l4_at, NOW());
            -- Hỗ trợ tích chọn đồng thời cả hai hoặc một trong hai
            IF NEW.l4_type LIKE '%L4 UCKID%' THEN
                NEW.entered_l4_uckid_at := COALESCE(NEW.entered_l4_uckid_at, NOW());
            END IF;
            IF NEW.l4_type LIKE '%L4 UCMAS%' THEN
                NEW.entered_l4_ucmas_at := COALESCE(NEW.entered_l4_ucmas_at, NOW());
            END IF;
        WHEN 'L5' THEN NEW.entered_l5_at := COALESCE(NEW.entered_l5_at, NOW());
        WHEN 'L6' THEN NEW.entered_l6_at := COALESCE(NEW.entered_l6_at, NOW());
        ELSE NULL;
    END CASE;

    -- Đóng dấu mốc cho từng sản phẩm L1, L2, L3 độc lập dựa trên rank của level hiện tại
    IF level_rank(NEW.level_group) >= 1 THEN
        IF NEW.interested_products IS NOT NULL THEN
            IF 'UCMAS' = ANY(NEW.interested_products) THEN
                NEW.entered_l1_ucmas_at := COALESCE(NEW.entered_l1_ucmas_at, NOW());
            END IF;
            IF 'UCKID' = ANY(NEW.interested_products) THEN
                NEW.entered_l1_uckid_at := COALESCE(NEW.entered_l1_uckid_at, NOW());
            END IF;
        END IF;
    END IF;

    IF level_rank(NEW.level_group) >= 2 THEN
        IF NEW.interested_products IS NOT NULL THEN
            IF 'UCMAS' = ANY(NEW.interested_products) THEN
                NEW.entered_l2_ucmas_at := COALESCE(NEW.entered_l2_ucmas_at, NOW());
            END IF;
            IF 'UCKID' = ANY(NEW.interested_products) THEN
                NEW.entered_l2_uckid_at := COALESCE(NEW.entered_l2_uckid_at, NOW());
            END IF;
        END IF;
    END IF;

    IF level_rank(NEW.level_group) >= 3 THEN
        IF NEW.interested_products IS NOT NULL THEN
            IF 'UCMAS' = ANY(NEW.interested_products) THEN
                NEW.entered_l3_ucmas_at := COALESCE(NEW.entered_l3_ucmas_at, NOW());
            END IF;
            IF 'UCKID' = ANY(NEW.interested_products) THEN
                NEW.entered_l3_uckid_at := COALESCE(NEW.entered_l3_uckid_at, NOW());
            END IF;
        END IF;
    END IF;

    -- Mốc đặt lịch + bàn giao (đạt L2.2B lần đầu)
    IF NEW.level_code = 'L2.2B' AND NEW.appointment_booked_at IS NULL THEN
        NEW.appointment_booked_at := NOW();
        NEW.handed_off_at         := NOW();
    END IF;

    -- row_hash (chống ghi trùng khi sync)
    NEW.row_hash := encode(digest(
        COALESCE(NEW.full_name,'') || '|' || COALESCE(NEW.phone,'') || '|' ||
        COALESCE(NEW.child_birth_year::text,'') || '|' || COALESCE(NEW.address,'') || '|' ||
        NEW.level_code || '|' || COALESCE(NEW.assigned_center::text,'') || '|' ||
        COALESCE(NEW.trial_appointment_at::text,'') || '|' || COALESCE(NEW.child_name,''),
        'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 3. Cập nhật hàm rpc_get_leads_for_outbound_sync
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
  entered_l4_uckid_at TIMESTAMPTZ,
  entered_l4_ucmas_at TIMESTAMPTZ,
  entered_l1_ucmas_at TIMESTAMPTZ,
  entered_l1_uckid_at TIMESTAMPTZ,
  entered_l2_ucmas_at TIMESTAMPTZ,
  entered_l2_uckid_at TIMESTAMPTZ,
  entered_l3_ucmas_at TIMESTAMPTZ,
  entered_l3_uckid_at TIMESTAMPTZ
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
    COALESCE(
      (SELECT (entered_at->>'L4.1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCKID'),
      l.entered_l4_uckid_at
    ) AS entered_l4_uckid_at,
    COALESCE(
      (SELECT (entered_at->>'L4.1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l4_ucmas_at
    ) AS entered_l4_ucmas_at,
    COALESCE(
      (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l1_ucmas_at,
      CASE WHEN 'UCMAS' = ANY(l.interested_products) THEN l.entered_l1_at ELSE NULL END
    ) AS entered_l1_ucmas_at,
    COALESCE(
      (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCKID'),
      l.entered_l1_uckid_at,
      CASE WHEN 'UCKID' = ANY(l.interested_products) THEN l.entered_l1_at ELSE NULL END
    ) AS entered_l1_uckid_at,
    COALESCE(
      (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l2_ucmas_at,
      CASE WHEN 'UCMAS' = ANY(l.interested_products) THEN l.entered_l2_at ELSE NULL END
    ) AS entered_l2_ucmas_at,
    COALESCE(
      (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCKID'),
      l.entered_l2_uckid_at,
      CASE WHEN 'UCKID' = ANY(l.interested_products) THEN l.entered_l2_at ELSE NULL END
    ) AS entered_l2_uckid_at,
    COALESCE(
      (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l3_ucmas_at,
      CASE WHEN 'UCMAS' = ANY(l.interested_products) THEN l.entered_l3_at ELSE NULL END
    ) AS entered_l3_ucmas_at,
    COALESCE(
      (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCKID'),
      l.entered_l3_uckid_at,
      CASE WHEN 'UCKID' = ANY(l.interested_products) THEN l.entered_l3_at ELSE NULL END
    ) AS entered_l3_uckid_at
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.sheet_out_row IS NULL 
     OR l.updated_at > COALESCE(p_last_sync_at, '1970-01-01'::timestamptz)
  ORDER BY l.lead_code ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_get_leads_for_outbound_sync TO anon, authenticated;

-- 4. Bù đắp dữ liệu (backfill) cho các lead cũ
UPDATE public.leads
SET 
  entered_l1_ucmas_at = COALESCE(
    (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCMAS'),
    CASE WHEN 'UCMAS' = ANY(interested_products) THEN entered_l1_at ELSE NULL END
  ),
  entered_l1_uckid_at = COALESCE(
    (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCKID'),
    CASE WHEN 'UCKID' = ANY(interested_products) THEN entered_l1_at ELSE NULL END
  ),
  entered_l2_ucmas_at = COALESCE(
    (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCMAS'),
    CASE WHEN 'UCMAS' = ANY(interested_products) THEN entered_l2_at ELSE NULL END
  ),
  entered_l2_uckid_at = COALESCE(
    (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCKID'),
    CASE WHEN 'UCKID' = ANY(interested_products) THEN entered_l2_at ELSE NULL END
  ),
  entered_l3_ucmas_at = COALESCE(
    (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCMAS'),
    CASE WHEN 'UCMAS' = ANY(interested_products) THEN entered_l3_at ELSE NULL END
  ),
  entered_l3_uckid_at = COALESCE(
    (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = id AND product_code = 'UCKID'),
    CASE WHEN 'UCKID' = ANY(interested_products) THEN entered_l3_at ELSE NULL END
  )
WHERE interested_products IS NOT NULL AND cardinality(interested_products) > 0;

-- 5. Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
