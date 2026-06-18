-- ============================================================
-- MIGRATION: Sửa RLS cho appointment_reminders và appointment_comments
-- Hỗ trợ quyền Lead Telesale (lead_telesale) thao tác nhắc lịch và bình luận
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Cập nhật chính sách RLS cho bảng appointment_reminders
DROP POLICY IF EXISTS "reminders_select" ON appointment_reminders;
CREATE POLICY "reminders_select" ON appointment_reminders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing','lead_telesale')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_reminders.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "reminders_insert" ON appointment_reminders;
CREATE POLICY "reminders_insert" ON appointment_reminders FOR INSERT WITH CHECK (
  auth.uid() = updated_by
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing','lead_telesale')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_reminders.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "reminders_update" ON appointment_reminders;
CREATE POLICY "reminders_update" ON appointment_reminders FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() 
    AND p.permission_group IN ('admin','marketing','center','telesale','lead_telesale')
  )
) WITH CHECK (
  auth.uid() = updated_by
);


-- 2. Cập nhật chính sách RLS cho bảng appointment_comments
DROP POLICY IF EXISTS "comments_select" ON appointment_comments;
CREATE POLICY "comments_select" ON appointment_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing','lead_telesale')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_comments.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

DROP POLICY IF EXISTS "comments_insert" ON appointment_comments;
CREATE POLICY "comments_insert" ON appointment_comments FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing','lead_telesale')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_comments.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

NOTIFY pgrst, 'reload schema';
