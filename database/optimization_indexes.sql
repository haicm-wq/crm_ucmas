-- ============================================================
-- UCMAS CRM — DATABASE OPTIMIZATION INDEXES
-- Chạy file này trên Supabase SQL Editor khi sẵn sàng
-- Sử dụng CONCURRENTLY để không lock bảng khi tạo index
-- ============================================================

-- 1. Trigram indexes cho ILIKE search (full_name, phone)
-- Cải thiện tốc độ tìm kiếm %...% pattern từ full scan → index scan
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_fullname_trgm
  ON leads USING gin(full_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_phone_trgm
  ON leads USING gin(phone gin_trgm_ops);

-- 2. Composite indexes cho các filter phổ biến
-- Cải thiện query trên LeadsPage khi lọc theo center + level
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_center_level
  ON leads(assigned_center, level_code);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_staff_level
  ON leads(assigned_staff, level_code);

-- 3. Index cho sort_by phổ biến
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_created_desc
  ON leads(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_updated_desc
  ON leads(updated_at DESC);

-- 4. Partial index cho L0 pool (chỉ index L0 leads — nhỏ hơn full index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_l0_pool
  ON leads(created_at DESC) WHERE level_group = 'L0';
