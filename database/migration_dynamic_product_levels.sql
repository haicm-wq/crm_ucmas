-- ============================================================
-- MIGRATION: Cấu hình Level động theo sản phẩm (Dynamic Levels Per Product)
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. TẠO CÁC BẢNG MỚI
CREATE TABLE IF NOT EXISTS products (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(50) UNIQUE NOT NULL,
    name       VARCHAR(255) NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_levels (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code VARCHAR(50) NOT NULL REFERENCES products(code) ON DELETE CASCADE,
    level_code   VARCHAR(20) NOT NULL,
    label        VARCHAR(255) NOT NULL,
    color        VARCHAR(7) NOT NULL DEFAULT '#6B7280',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_code, level_code)
);

CREATE TABLE IF NOT EXISTS lead_product_levels (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    product_code VARCHAR(50) NOT NULL REFERENCES products(code) ON DELETE CASCADE,
    level_code   VARCHAR(20) NOT NULL,
    entered_at   JSONB NOT NULL DEFAULT '{}'::jsonb, -- Lưu mốc thời gian { "L1": "timestamp", ... }
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lead_id, product_code)
);

-- Thêm cột product_code vào bảng lịch sử đổi level
ALTER TABLE lead_level_history ADD COLUMN IF NOT EXISTS product_code VARCHAR(50) REFERENCES products(code) ON DELETE SET NULL;

-- 2. SEED DỮ LIỆU BAN ĐẦU CHO 4 SẢN PHẨM MẶC ĐỊNH
INSERT INTO products (code, name) VALUES
  ('UCMAS', 'UCMAS'),
  ('UCKID', 'UCKID'),
  ('ROBOT', 'ROBOT'),
  ('TRẠI HÈ', 'TRẠI HÈ')
ON CONFLICT (code) DO NOTHING;

-- 3. HÀM SEED LEVEL MẶC ĐỊNH CHO TỪNG SẢN PHẨM
CREATE OR REPLACE FUNCTION tmp_seed_product_levels() RETURNS VOID AS $$
DECLARE
  p_code RECORD;
  lvl RECORD;
  levels_def JSONB;
BEGIN
  -- Định nghĩa các level mặc định của hệ thống
  levels_def := '[
    {"code": "L0", "label": "Data đầu vào", "color": "#6B7280", "sort": 0},
    {"code": "L1", "label": "Đã có đủ 3 thông tin", "color": "#F59E0B", "sort": 10},
    {"code": "L1.2", "label": "Không nghe máy", "color": "#EF4444", "sort": 11},
    {"code": "L1.3", "label": "Dừng chăm sóc", "color": "#EF4444", "sort": 12},
    {"code": "L2.2A", "label": "Suy nghĩ thêm", "color": "#3B82F6", "sort": 20},
    {"code": "L2.2B", "label": "Đã hẹn lịch học thử", "color": "#3B82F6", "sort": 21},
    {"code": "L2.2O", "label": "Đã gửi test online", "color": "#3B82F6", "sort": 22},
    {"code": "L2.2OS", "label": "Đã hoàn thành test", "color": "#3B82F6", "sort": 23},
    {"code": "L2.3", "label": "Dừng chăm sóc", "color": "#EF4444", "sort": 24},
    {"code": "L3.O", "label": "Tư vấn trực tuyến", "color": "#10B981", "sort": 30},
    {"code": "L3.1", "label": "Đã học thử", "color": "#10B981", "sort": 31},
    {"code": "L3.3", "label": "Dừng chăm sóc", "color": "#EF4444", "sort": 32},
    {"code": "L4.1", "label": "Đóng phí 1 khóa", "color": "#15803D", "sort": 40},
    {"code": "L4.2", "label": "Đóng phí 2 khóa", "color": "#15803D", "sort": 41},
    {"code": "L4.3", "label": "Đóng phí 3 khóa", "color": "#15803D", "sort": 42},
    {"code": "L4.4", "label": "Đóng phí 4 khóa", "color": "#15803D", "sort": 43},
    {"code": "L4.5", "label": "Đóng phí 5 khóa", "color": "#15803D", "sort": 44},
    {"code": "L4.6", "label": "Đóng phí 6 khóa", "color": "#15803D", "sort": 45},
    {"code": "L4.7", "label": "Đóng phí 7 khóa", "color": "#15803D", "sort": 46},
    {"code": "L4.8", "label": "Đóng phí 8 khóa", "color": "#15803D", "sort": 47},
    {"code": "L4.9", "label": "Đóng phí 9 khóa", "color": "#15803D", "sort": 48},
    {"code": "L4.10", "label": "Đóng phí 10 khóa", "color": "#15803D", "sort": 49},
    {"code": "L4.11", "label": "Đóng phí 11 khóa", "color": "#15803D", "sort": 50},
    {"code": "L4.12", "label": "Đóng phí 12 khóa", "color": "#15803D", "sort": 51},
    {"code": "L4.13", "label": "Đóng phí 13 khóa", "color": "#15803D", "sort": 52},
    {"code": "L5", "label": "Lên cấp", "color": "#6366F1", "sort": 60},
    {"code": "L6", "label": "Giới thiệu học viên", "color": "#8B5CF6", "sort": 70}
  ]'::jsonb;

  FOR p_code IN SELECT code FROM products
  LOOP
    FOR lvl IN SELECT * FROM jsonb_array_elements(levels_def)
    LOOP
      INSERT INTO product_levels (product_code, level_code, label, color, sort_order)
      VALUES (p_code.code, lvl.value->>'code', lvl.value->>'label', lvl.value->>'color', (lvl.value->>'sort')::int)
      ON CONFLICT (product_code, level_code) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT tmp_seed_product_levels();
DROP FUNCTION tmp_seed_product_levels();

-- 4. DI CƯ DỮ LIỆU CŨ TỪ BẢNG LEADS SANG LEAD_PRODUCT_LEVELS
CREATE OR REPLACE FUNCTION tmp_migrate_lead_levels() RETURNS VOID AS $$
DECLARE
  r_lead RECORD;
  p_code TEXT;
  v_level VARCHAR(20);
  v_entered_at JSONB;
BEGIN
  FOR r_lead IN SELECT * FROM leads
  LOOP
    -- Nếu không có sản phẩm quan tâm, bỏ qua
    IF r_lead.interested_products IS NULL OR cardinality(r_lead.interested_products) = 0 THEN
      CONTINUE;
    END IF;

    -- Xây dựng mốc thời gian động từ lead cũ
    v_entered_at := '{}'::jsonb;
    IF r_lead.entered_l0_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L0}', to_jsonb(r_lead.entered_l0_at)); END IF;
    IF r_lead.entered_l1_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L1}', to_jsonb(r_lead.entered_l1_at)); END IF;
    IF r_lead.entered_l2_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L2}', to_jsonb(r_lead.entered_l2_at)); END IF;
    IF r_lead.entered_l3_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L3}', to_jsonb(r_lead.entered_l3_at)); END IF;
    IF r_lead.entered_l4_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L4}', to_jsonb(r_lead.entered_l4_at)); END IF;
    IF r_lead.entered_l5_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L5}', to_jsonb(r_lead.entered_l5_at)); END IF;
    IF r_lead.entered_l6_at IS NOT NULL THEN v_entered_at := jsonb_set(v_entered_at, '{L6}', to_jsonb(r_lead.entered_l6_at)); END IF;

    FOREACH p_code IN ARRAY r_lead.interested_products
    LOOP
      -- Xác định level cho từng sản phẩm
      v_level := r_lead.level_code;
      
      -- Nếu level là L4 và l4_type không chứa sản phẩm này, hạ xuống L3.1
      IF r_lead.level_code ~ '^L4' THEN
        IF p_code = 'UCMAS' AND (r_lead.l4_type IS NULL OR r_lead.l4_type !~ 'UCMAS') THEN
          v_level := 'L3.1';
        ELSIF p_code = 'UCKID' AND (r_lead.l4_type IS NULL OR r_lead.l4_type !~ 'UCKID') THEN
          v_level := 'L3.1';
        ELSIF p_code NOT IN ('UCMAS', 'UCKID') THEN
          v_level := 'L3.1';
        END IF;
      END IF;

      -- Lưu mốc thời gian riêng cho UCMAS/UCKID L4
      IF v_level ~ '^L4' THEN
        IF p_code = 'UCMAS' AND r_lead.entered_l4_ucmas_at IS NOT NULL THEN
          v_entered_at := jsonb_set(v_entered_at, ARRAY[v_level::text], to_jsonb(r_lead.entered_l4_ucmas_at));
        ELSIF p_code = 'UCKID' AND r_lead.entered_l4_uckid_at IS NOT NULL THEN
          v_entered_at := jsonb_set(v_entered_at, ARRAY[v_level::text], to_jsonb(r_lead.entered_l4_uckid_at));
        END IF;
      END IF;

      INSERT INTO lead_product_levels (lead_id, product_code, level_code, entered_at)
      VALUES (r_lead.id, p_code, v_level, v_entered_at)
      ON CONFLICT (lead_id, product_code) DO UPDATE
      SET level_code = EXCLUDED.level_code,
          entered_at = lead_product_levels.entered_at || EXCLUDED.entered_at;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT tmp_migrate_lead_levels();
DROP FUNCTION tmp_migrate_lead_levels();

-- 5. TRIGGER TỰ ĐỘNG TẠO LEAD_PRODUCT_LEVELS KHI THÊM MỚI/CẬP NHẬT PRODUCTS
CREATE OR REPLACE FUNCTION fn_sync_lead_product_levels() RETURNS TRIGGER AS $$
DECLARE
  p_code TEXT;
  v_default_level VARCHAR(20) := 'L0';
BEGIN
  -- Khi lead có interested_products, tự động đồng bộ sang bảng trạng thái level
  IF NEW.interested_products IS NOT NULL AND cardinality(NEW.interested_products) > 0 THEN
    -- Nếu là lead mới hoặc được cập nhật lên cấp cao hơn L0
    IF NEW.level_code IS DISTINCT FROM 'L0' THEN
      v_default_level := NEW.level_code;
    END IF;

    FOREACH p_code IN ARRAY NEW.interested_products
    LOOP
      INSERT INTO lead_product_levels (lead_id, product_code, level_code, entered_at)
      VALUES (NEW.id, p_code, v_default_level, jsonb_build_object(v_default_level, NOW()))
      ON CONFLICT (lead_id, product_code) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_lead_product_levels ON leads;
CREATE OR REPLACE TRIGGER trg_sync_lead_product_levels
  AFTER INSERT OR UPDATE OF interested_products, level_code ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_sync_lead_product_levels();

-- 6. PHÂN QUYỀN VÀ RLS CHO CÁC BẢNG MỚI
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_product_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "products_admin" ON products;
CREATE POLICY "products_admin" ON products FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.permission_group = 'admin'
  )
);

DROP POLICY IF EXISTS "product_levels_select" ON product_levels;
CREATE POLICY "product_levels_select" ON product_levels FOR SELECT USING (true);

DROP POLICY IF EXISTS "product_levels_admin" ON product_levels;
CREATE POLICY "product_levels_admin" ON product_levels FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.permission_group = 'admin'
  )
);

DROP POLICY IF EXISTS "lpl_select" ON lead_product_levels;
CREATE POLICY "lpl_select" ON lead_product_levels FOR SELECT USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_product_levels.lead_id)
);

DROP POLICY IF EXISTS "lpl_write" ON lead_product_levels;
CREATE POLICY "lpl_write" ON lead_product_levels FOR ALL USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_product_levels.lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_levels TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lead_product_levels TO anon, authenticated;

-- 7. RPC: CẬP NHẬT LEVEL SẢN PHẨM CỦA LEAD
CREATE OR REPLACE FUNCTION rpc_update_lead_product_level(
  p_lead_id UUID,
  p_product_code VARCHAR,
  p_level_code VARCHAR,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_old_level VARCHAR(20);
  v_result JSONB;
  v_actor UUID;
BEGIN
  -- Lấy lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead không tồn tại';
  END IF;

  -- Kiểm tra quyền chỉnh sửa
  IF auth_permission_group() = 'center' THEN
    IF v_lead.assigned_center IS DISTINCT FROM auth_center_id() OR v_lead.level_group = 'L0' THEN
      RAISE EXCEPTION 'Bạn chỉ có quyền cập nhật lead thuộc trung tâm của mình';
    END IF;
  ELSIF auth_permission_group() != 'marketing' AND auth_permission_group() != 'admin' THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa lead';
  END IF;

  -- Lấy level cũ
  SELECT level_code INTO v_old_level 
  FROM lead_product_levels 
  WHERE lead_id = p_lead_id AND product_code = p_product_code;

  v_actor := auth.uid();

  -- Cập nhật level cho sản phẩm
  INSERT INTO lead_product_levels (lead_id, product_code, level_code, entered_at)
  VALUES (
    p_lead_id, 
    p_product_code, 
    p_level_code, 
    jsonb_build_object(p_level_code, NOW())
  )
  ON CONFLICT (lead_id, product_code) DO UPDATE
  SET level_code = p_level_code,
      entered_at = lead_product_levels.entered_at || jsonb_build_object(p_level_code, NOW()),
      updated_at = NOW();

  -- Ghi lịch sử đổi level
  INSERT INTO lead_level_history (lead_id, changed_by, from_level, to_level, note, center_id, source, product_code)
  VALUES (
    p_lead_id,
    v_actor,
    v_old_level,
    p_level_code,
    p_note,
    v_lead.assigned_center,
    'manual',
    p_product_code
  );

  -- Cập nhật level_code của lead bằng level có sort_order cao nhất trong các sản phẩm để tương thích ngược
  UPDATE leads l
  SET level_code = COALESCE(
        (SELECT lpl.level_code 
         FROM lead_product_levels lpl
         JOIN product_levels pl ON lpl.product_code = pl.product_code AND lpl.level_code = pl.level_code
         WHERE lpl.lead_id = p_lead_id
         ORDER BY pl.sort_order DESC
         LIMIT 1),
        l.level_code
      ),
      updated_at = NOW()
  WHERE id = p_lead_id;

  -- Nếu sản phẩm là UCMAS hoặc UCKID và level là L4, đồng bộ ngược về các cột cũ của bảng leads
  IF p_product_code = 'UCMAS' AND p_level_code ~ '^L4' THEN
    UPDATE leads SET 
      l4_type = CASE WHEN l4_type ~ 'UCKID' THEN 'L4 UCKID, L4 UCMAS' ELSE 'L4 UCMAS' END,
      entered_l4_ucmas_at = NOW()
    WHERE id = p_lead_id;
  ELSIF p_product_code = 'UCKID' AND p_level_code ~ '^L4' THEN
    UPDATE leads SET 
      l4_type = CASE WHEN l4_type ~ 'UCMAS' THEN 'L4 UCKID, L4 UCMAS' ELSE 'L4 UCKID' END,
      entered_l4_uckid_at = NOW()
    WHERE id = p_lead_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'product_code', p_product_code, 'level_code', p_level_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_update_lead_product_level TO anon, authenticated;

-- 8. RPC HỖ TRỢ XUẤT SHEET (TƯƠNG THÍCH NGƯỢC)
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
    COALESCE(
      (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      (SELECT (entered_at->>'L1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id LIMIT 1),
      l.entered_l1_at
    ) AS entered_l1_at,
    COALESCE(
      (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      (SELECT (entered_at->>'L2')::timestamptz FROM lead_product_levels WHERE lead_id = l.id LIMIT 1),
      l.entered_l2_at
    ) AS entered_l2_at,
    COALESCE(
      (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      (SELECT (entered_at->>'L3')::timestamptz FROM lead_product_levels WHERE lead_id = l.id LIMIT 1),
      l.entered_l3_at
    ) AS entered_l3_at,
    COALESCE(
      (SELECT (entered_at->>'L4.1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l4_at
    ) AS entered_l4_at,
    COALESCE(
      (SELECT (entered_at->>'L4.1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCKID'),
      l.entered_l4_uckid_at
    ) AS entered_l4_uckid_at,
    COALESCE(
      (SELECT (entered_at->>'L4.1')::timestamptz FROM lead_product_levels WHERE lead_id = l.id AND product_code = 'UCMAS'),
      l.entered_l4_ucmas_at
    ) AS entered_l4_ucmas_at
  FROM leads l
  LEFT JOIN centers c ON l.assigned_center = c.id
  LEFT JOIN profiles p ON l.assigned_staff = p.id
  WHERE l.sheet_out_row IS NULL 
     OR l.updated_at > COALESCE(p_last_sync_at, '1970-01-01'::timestamptz)
  ORDER BY l.lead_code ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_get_leads_for_outbound_sync TO anon, authenticated;

-- Tái nạp lại schema cache của Supabase PostgREST
NOTIFY pgrst, 'reload schema';
