# UCMAS CRM — Hệ thống Quản lý Khách hàng

Hệ thống CRM cho chuỗi 13 trung tâm UCMAS tại Hà Nội.  
**Stack:** React + Vite (Vercel) · Supabase (PostgreSQL + Auth + Realtime)

## Kiến trúc

```
Frontend (Vercel)          Supabase
┌──────────────┐    ┌─────────────────────┐
│  React/Vite  │───▶│ Auth (JWT)          │
│  TailwindCSS │───▶│ PostgreSQL (RLS)    │
│  Supabase JS │───▶│ Realtime (WebSocket)│
└──────────────┘    │ RPC (Business Logic)│
                    └─────────────────────┘
Google Sheets ──▶ Apps Script ──▶ Supabase RPC
```

## Tính năng chính

- **Quản lý Lead:** Phễu L0 → L6 với 20+ trạng thái chi tiết
- **Kho L0:** Pool data đầu vào, gán trung tâm hàng loạt
- **Bàn giao trung tâm:** Tự động thông báo khi lead đạt L2.2B
- **Lịch hẹn học thử:** Calendar view theo ngày/tuần
- **Báo cáo:** Phễu, tỷ lệ chốt, hiệu suất sale, so sánh trung tâm
- **Đồng bộ Google Sheets:** Tự động import data từ sheet quảng cáo
- **Realtime:** Thông báo push cho sale & trung tâm
- **Phân quyền:** Admin / Marketing / Center với RLS

## Cài đặt

### 1. Supabase
1. Tạo project trên [supabase.com](https://supabase.com)
2. Vào SQL Editor, chạy theo thứ tự:
   - `database/supabase_schema.sql`
   - `database/supabase_rls.sql`
   - `database/supabase_rpc.sql`
3. Tạo admin user qua Authentication → Users → Add User

### 2. Frontend
```bash
cd frontend
cp .env.example .env
# Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Deploy lên Vercel
1. Push code lên GitHub
2. Import repo vào Vercel
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output: `dist`
6. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Cấu trúc thư mục

```
├── apps-script/          # Google Apps Script (đồng bộ Sheet)
├── database/             # SQL files cho Supabase
│   ├── supabase_schema.sql
│   ├── supabase_rls.sql
│   └── supabase_rpc.sql
└── frontend/             # React + Vite
    └── src/
        ├── components/   # UI components
        ├── config/       # Level definitions
        ├── contexts/     # Auth context
        ├── lib/          # Supabase client
        ├── pages/        # Route pages
        └── services/     # API wrapper
```
