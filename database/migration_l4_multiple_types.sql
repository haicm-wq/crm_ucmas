-- ============================================================
-- MIGRATION: Support selecting both L4 UCKID and L4 UCMAS & Bulk Import child_name
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Drop check constraint cũ giới hạn l4_type chỉ được nhận 1 giá trị đơn lẻ
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_l4_type_check;

-- 2. Tăng độ dài cột l4_type để lưu được chuỗi kết hợp (ví dụ: 'L4 UCKID, L4 UCMAS')
ALTER TABLE leads ALTER COLUMN l4_type TYPE VARCHAR(100);

-- 3. Cập nhật hàm trigger để tự động đánh dấu thời gian lên L4 UCKID và L4 UCMAS
--    khi cột l4_type chứa các chuỗi tương ứng (sử dụng toán tử LIKE)
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

-- 4. Cập nhật hàm rpc_bulk_create_leads hỗ trợ thêm child_name
CREATE OR REPLACE FUNCTION rpc_bulk_create_leads(
  p_leads JSONB
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_lead leads%ROWTYPE;
  v_dups INT;
  v_success INT := 0;
  v_failed INT := 0;
  v_dup_count INT := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  -- Kiểm tra quyền tạo lead hàng loạt
  IF auth_permission_group() NOT IN ('admin', 'marketing') THEN
    RAISE EXCEPTION 'Chỉ admin hoặc marketing mới được import lead hàng loạt';
  END IF;

  PERFORM set_config('app.current_user_id', auth.uid()::text, true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_leads)
  LOOP
    BEGIN
      -- Kiểm tra trùng SĐT
      v_dups := 0;
      IF v_item->>'phone' IS NOT NULL AND v_item->>'phone' != '' THEN
        SELECT COUNT(*) INTO v_dups FROM leads WHERE phone = v_item->>'phone';
      END IF;

      INSERT INTO leads (full_name, phone, child_name, child_birth_year, address, source_type, ad_campaign)
      VALUES (
        v_item->>'full_name',
        NULLIF(v_item->>'phone', ''),
        v_item->>'child_name',
        (v_item->>'child_birth_year')::int,
        v_item->>'address',
        COALESCE(v_item->>'source_type', 'PULL'),
        v_item->>'ad_campaign'
      )
      RETURNING * INTO v_lead;

      -- Thông báo trùng SĐT nếu có
      IF v_dups > 0 THEN
        v_dup_count := v_dup_count + 1;
        INSERT INTO notifications (user_id, type, lead_id, message)
        SELECT DISTINCT p.id, 'phone_reinterest', ol.id,
          '📞 SĐT ' || v_lead.phone || ' đã có ' || v_dups || ' lead. Data mới: "' || v_lead.full_name || '" (' || v_lead.lead_code || ')'
        FROM leads ol
        JOIN profiles p ON (p.id = ol.assigned_staff OR (p.center_id = ol.assigned_center AND p.is_manager))
        WHERE ol.phone = v_lead.phone AND ol.id != v_lead.id AND ol.assigned_center IS NOT NULL
          AND p.is_active = true;
      END IF;

      v_success := v_success + 1;
      v_results := v_results || jsonb_build_object(
        'success', true, 'lead_code', v_lead.lead_code, 'duplicate_phone', v_dups > 0
      );

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'success', false, 'name', v_item->>'full_name', 'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'message', 'Tạo hoàn tất: ' || v_success || ' thành công, ' || v_failed || ' lỗi, ' || v_dup_count || ' trùng SĐT',
    'success_count', v_success,
    'failed_count', v_failed,
    'dup_count', v_dup_count,
    'results', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
