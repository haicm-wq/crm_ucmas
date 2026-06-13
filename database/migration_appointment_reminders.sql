-- ============================================================
-- MIGRATION: Appointment Reminders & Comments
-- Chạy file này trên Supabase SQL Editor
-- ============================================================

-- 1. Bảng trạng thái nhắc lịch (1 row per lead per role)
CREATE TABLE IF NOT EXISTS appointment_reminders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    role       VARCHAR(10) NOT NULL CHECK (role IN ('sale','center')),
    status     VARCHAR(20) NOT NULL DEFAULT 'pending' 
               CHECK (status IN ('pending','reminded','failed')),
    note       TEXT,
    updated_by UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lead_id, role)
);
CREATE INDEX IF NOT EXISTS idx_appt_rem_lead ON appointment_reminders(lead_id);

-- 2. Bảng chat/trao đổi giữa sale & center trên lịch hẹn
CREATE TABLE IF NOT EXISTS appointment_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES profiles(id),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appt_cmt_lead ON appointment_comments(lead_id, created_at);

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE appointment_comments;

-- 4. RLS
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_comments ENABLE ROW LEVEL SECURITY;

-- Reminders: Read
CREATE POLICY "reminders_select" ON appointment_reminders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_reminders.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

-- Reminders: Insert
CREATE POLICY "reminders_insert" ON appointment_reminders FOR INSERT WITH CHECK (
  auth.uid() = updated_by
);

-- Reminders: Update
CREATE POLICY "reminders_update" ON appointment_reminders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND permission_group IN ('admin','marketing','center'))
) WITH CHECK (
  auth.uid() = updated_by
);

-- Comments: Read
CREATE POLICY "comments_select" ON appointment_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.permission_group IN ('admin','marketing')
      OR EXISTS (
        SELECT 1 FROM leads l WHERE l.id = appointment_comments.lead_id 
        AND (l.assigned_center = p.center_id OR l.assigned_staff = p.id)
      )
    )
  )
);

-- Comments: Insert
CREATE POLICY "comments_insert" ON appointment_comments FOR INSERT WITH CHECK (
  auth.uid() = author_id
);
