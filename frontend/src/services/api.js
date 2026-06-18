/**
 * UCMAS CRM — API Service (Supabase wrapper)
 * Thay thế axios → supabase client
 * Giữ interface quen thuộc cho frontend
 */
import { supabase } from '../lib/supabase';

// ============================================================
// IN-MEMORY CACHE LAYER (Tối ưu hóa bộ nhớ đệm phía Client)
// ============================================================
const queryCache = new Map();

/**
 * Tạo cache key duy nhất dựa trên tên hàm và các tham số truyền vào
 */
function getCacheKey(fnName, args) {
  return `${fnName}:${JSON.stringify(args)}`;
}

/**
 * Hàm bao bọc (wrapper) để tự động hóa kiểm tra cache và lưu dữ liệu.
 * Trả về bản sao sâu (deep copy) để tránh việc thay đổi state trực tiếp trong component React làm hỏng cache.
 */
async function withCache(fnName, args, fetchFn, ttlMs = 30000) {
  const key = getCacheKey(fnName, args);
  const now = Date.now();
  if (queryCache.has(key)) {
    const cached = queryCache.get(key);
    if (now - cached.timestamp < ttlMs) {
      return JSON.parse(JSON.stringify(cached.data));
    }
  }
  const data = await fetchFn();
  queryCache.set(key, { data, timestamp: now });
  return JSON.parse(JSON.stringify(data));
}

/**
 * Xóa cache của các hàm cụ thể hoặc xóa toàn bộ cache khi có thay đổi dữ liệu (Mutations).
 */
export function clearCache(fnNames = []) {
  if (fnNames.length === 0) {
    queryCache.clear();
    return;
  }
  for (const key of queryCache.keys()) {
    const fnName = key.split(':')[0];
    if (fnNames.includes(fnName)) {
      queryCache.delete(key);
    }
  }
}

// ============================================================
// LEADS
// ============================================================

export async function fetchLeads({ page = 1, limit = 50, search, level_code, center_id, staff_id, product, sort_by = 'created_at', sort_dir = 'desc', advanced_filters } = {}) {
  return withCache('fetchLeads', { page, limit, search, level_code, center_id, staff_id, product, sort_by, sort_dir, advanced_filters }, async () => {
    const offset = (page - 1) * limit;

    let query = supabase
      .from('leads')
      .select('*, centers!assigned_center(name), profiles!assigned_staff(full_name), lead_product_levels(*)', { count: 'exact' })
      .neq('level_group', 'L0')
      .neq('level_code', 'L1.KK'); // Danh sách Lead chỉ hiển thị leads đã "tốt nghiệp" khỏi Kho L0 (loại trừ L1.KK)

    if (search) {
      // Bug8 fix: sanitize PostgREST special chars to prevent filter syntax errors
      const s = search.replace(/[%_.*,()]/g, '');
      if (s) {
        query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,lead_code.ilike.%${s}%`);
      }
    }
    if (level_code) {
      if (Array.isArray(level_code)) {
        if (level_code.length > 0) query = query.in('level_code', level_code);
      } else {
        query = query.eq('level_code', level_code);
      }
    }
    if (center_id) {
      if (Array.isArray(center_id)) {
        if (center_id.length > 0) query = query.in('assigned_center', center_id);
      } else {
        query = query.eq('assigned_center', center_id);
      }
    }
    if (staff_id) {
      if (Array.isArray(staff_id)) {
        if (staff_id.length > 0) query = query.in('assigned_staff', staff_id);
      } else {
        query = query.eq('assigned_staff', staff_id);
      }
    }
    if (product) {
      const productArr = Array.isArray(product) ? product : [product];
      if (productArr.length > 0) {
        query = query.contains('interested_products', productArr);
      }
    }

    // Advanced filters: each rule = { field, op, value }
    // op: 'eq' | 'neq' | 'contains' | 'not_contains'
    if (advanced_filters && advanced_filters.length > 0) {
      for (const rule of advanced_filters) {
        if (!rule.value) continue;
        switch (rule.op) {
          case 'eq':
            query = query.eq(rule.field, rule.value);
            break;
          case 'neq':
            query = query.neq(rule.field, rule.value);
            break;
          case 'contains':
            query = query.contains(rule.field, [rule.value]);
            break;
          case 'not_contains':
            // PostgREST: NOT contains
            query = query.not(rule.field, 'cs', `{${rule.value}}`);
            break;
        }
      }
    }

    query = query.order(sort_by, { ascending: sort_dir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Flatten joins
    const leads = (data || []).map((l) => ({
      ...l,
      center_name: l.centers?.name || null,
      staff_name: l.profiles?.full_name || null,
    }));

    return {
      data: leads,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }, 30000);
}

export async function fetchAllStaff() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, center_id')
    .in('permission_group', ['telesale', 'lead_telesale'])
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function fetchL0Pool({ page = 1, limit = 100 } = {}) {
  return withCache('fetchL0Pool', { page, limit }, async () => {
    const offset = (page - 1) * limit;
    const { data, error, count } = await supabase
      .rpc('rpc_fetch_l0_pool', {}, { count: 'exact' })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const leads = data || [];
    if (leads.length > 0) {
      const leadIds = leads.map(l => l.id);
      const { data: lpLevels, error: lplError } = await supabase
        .from('lead_product_levels')
        .select('*')
        .in('lead_id', leadIds);
      
      if (!lplError && lpLevels) {
        leads.forEach(l => {
          l.lead_product_levels = lpLevels.filter(lvl => lvl.lead_id === l.id);
        });
      }
    }

    return {
      data: leads,
      pagination: {
        page, limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }, 30000);
}

export async function fetchL0UnprocessedStats() {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('level_code', 'L0')
    .is('first_processed_at', null)
    .lt('created_at', threeHoursAgo);
  if (error) throw error;
  return count || 0;
}


export async function fetchLeadById(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*, centers!assigned_center(name), profiles!assigned_staff(full_name)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return { ...data, center_name: data.centers?.name, staff_name: data.profiles?.full_name };
}

export async function createLead(leadData) {
  const { data, error } = await supabase.from('leads').insert(leadData).select().single();
  if (error) throw error;
  clearCache();
  return data;
}

export async function updateLead(leadId, changes, note) {
  const { data, error } = await supabase.rpc('rpc_update_lead', {
    p_lead_id: leadId,
    p_changes: changes,
    p_note: note || null,
  });
  if (error) throw error;
  clearCache();
  return data;
}

export async function updateLeadLevelAndProducts(leadId, levelCode, note) {
  const { data, error } = await supabase.rpc('rpc_update_lead_level_and_products', {
    p_lead_id: leadId,
    p_level_code: levelCode,
    p_note: note || null,
  });
  if (error) throw error;
  clearCache();
  return data;
}


export async function checkPhone(phone) {
  const { data, error } = await supabase.rpc('rpc_check_phone', { p_phone: phone });
  if (error) throw error;
  return data;
}

export async function fetchSiblings(leadId) {
  // First get the phone of this lead
  const { data: lead } = await supabase.from('leads').select('phone').eq('id', leadId).single();
  if (!lead?.phone) return [];

  const { data, error } = await supabase
    .from('leads')
    .select('id, lead_code, full_name, child_birth_year, level_code, level_group, created_at, centers!assigned_center(name)')
    .eq('phone', lead.phone)
    .neq('id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((s) => ({ ...s, center_name: s.centers?.name }));
}

// ============================================================
// NOTES
// ============================================================

export async function fetchNotes(leadId) {
  const { data, error } = await supabase
    .from('lead_notes')
    .select('*, profiles!author_id(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((n) => ({ ...n, author_name: n.profiles?.full_name }));
}

export async function addNote(leadId, content) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
  const { error } = await supabase.from('lead_notes').insert({
    lead_id: leadId,
    author_id: user.id,
    content,
  });
  if (error) throw error;
  clearCache();
}

// ============================================================
// LEVEL HISTORY
// ============================================================

export async function fetchLevelHistory(leadId) {
  const { data, error } = await supabase
    .from('lead_level_history')
    .select('*, profiles!changed_by(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((h) => ({ ...h, changed_by_name: h.profiles?.full_name }));
}

// ============================================================
// BULK OPERATIONS
// ============================================================

export async function bulkAssign(leadIds, centerId) {
  const { data, error } = await supabase.rpc('rpc_bulk_assign', {
    p_lead_ids: leadIds,
    p_center_id: centerId,
  });
  if (error) throw error;
  clearCache();
  return data;
}

export async function bulkCreateLeads(leadsData) {
  const { data, error } = await supabase.rpc('rpc_bulk_create_leads', {
    p_leads: leadsData,
  });
  if (error) throw error;
  clearCache();
  return data;
}
// ============================================================
// TRASH / SOFT DELETE (Admin only)
// ============================================================

export async function softDeleteLeads(leadIds) {
  const { data, error } = await supabase.rpc('rpc_soft_delete_leads', {
    p_lead_ids: leadIds,
  });
  if (error) throw error;
  clearCache();
  return data;
}

export async function fetchTrashLeads({ page = 1, limit = 50, search = '' } = {}) {
  const offset = (page - 1) * limit;
  const { data, error } = await supabase.rpc('rpc_fetch_trash', {
    p_limit: limit,
    p_offset: offset,
    p_search: search || null,
  });
  if (error) throw error;
  return {
    data: data?.data || [],
    total: data?.total || 0,
    totalPages: Math.ceil((data?.total || 0) / limit),
  };
}

export async function restoreLeads(leadIds) {
  const { data, error } = await supabase.rpc('rpc_restore_leads', {
    p_lead_ids: leadIds,
  });
  if (error) throw error;
  clearCache();
  return data;
}

export async function purgeTrash() {
  const { data, error } = await supabase.rpc('rpc_purge_trash');
  if (error) throw error;
  clearCache();
  return data;
}

// ============================================================
// APPOINTMENTS
// ============================================================

export async function fetchAppointments({ from, to, center_id, status } = {}) {
  return withCache('fetchAppointments', { from, to, center_id, status }, async () => {
    let query = supabase.from('v_trial_appointments').select('*');
    if (from) query = query.gte('trial_appointment_at', from);
    if (to) query = query.lte('trial_appointment_at', to);
    if (center_id) query = query.eq('assigned_center', center_id);
    if (status) query = query.eq('appt_status', status);
    query = query.order('trial_appointment_at', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }, 30000);
}

// ============================================================
// APPOINTMENT REMINDERS
// ============================================================

export async function fetchAppointmentReminders(leadId) {
  const { data, error } = await supabase
    .from('appointment_reminders')
    .select('*, profiles!updated_by(full_name)')
    .eq('lead_id', leadId);
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    updated_by_name: r.profiles?.full_name || null,
  }));
}

export async function upsertAppointmentReminder(leadId, role, status, note) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Phiên đăng nhập hết hạn');
  const { data, error } = await supabase
    .from('appointment_reminders')
    .upsert({
      lead_id: leadId,
      role,
      status,
      note: note || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,role' })
    .select()
    .single();
  if (error) throw error;
  clearCache();
  return data;
}

// ============================================================
// APPOINTMENT COMMENTS (trao đổi Sale ↔ Trung tâm)
// ============================================================

export async function fetchAppointmentComments(leadId) {
  const { data, error } = await supabase
    .from('appointment_comments')
    .select('*, profiles!author_id(full_name, permission_group)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({
    ...c,
    author_name: c.profiles?.full_name || 'Ẩn danh',
    author_role: c.profiles?.permission_group || 'center',
  }));
}

export async function addAppointmentComment(leadId, content) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Phiên đăng nhập hết hạn');
  const { error } = await supabase.from('appointment_comments').insert({
    lead_id: leadId,
    author_id: user.id,
    content,
  });
  if (error) throw error;
  clearCache();
}

// ============================================================
// DASHBOARD / REPORTS
// ============================================================

export async function fetchDashboardHQ() {
  return withCache('fetchDashboardHQ', {}, async () => {
    const { data, error } = await supabase.rpc('rpc_dashboard_hq');
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchDashboardCenter(centerId) {
  return withCache('fetchDashboardCenter', { centerId }, async () => {
    const { data, error } = await supabase.rpc('rpc_dashboard_center', { p_center_id: centerId });
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchDashboardAnalytics({ from, to, center_ids, product_codes, source_type } = {}) {
  const sortedCenters = Array.isArray(center_ids) ? [...center_ids].sort() : center_ids;
  const sortedProducts = Array.isArray(product_codes) ? [...product_codes].sort() : product_codes;
  
  return withCache('fetchDashboardAnalytics', { from, to, center_ids: sortedCenters, product_codes: sortedProducts, source_type }, async () => {
    const { data, error } = await supabase.rpc('rpc_dashboard_analytics', {
      p_from: from || null,
      p_to: to || null,
      p_center_ids: sortedCenters || null,
      p_product_codes: sortedProducts || null,
      p_source_type: source_type || null,
    });
    if (error) throw error;
    return data;
  }, 30000);
}

export async function fetchReportBookingSalePerformance({ from, to, center_id } = {}) {
  return withCache('fetchReportBookingSalePerformance', { from, to, center_id }, async () => {
    const { data, error } = await supabase.rpc('rpc_report_booking_sale_performance', {
      p_from: from || null,
      p_to: to || null,
      p_center_id: center_id || null,
    });
    if (error) throw error;
    return data;
  }, 30000);
}

export async function fetchReportProductAnalytics({ from, to, center_id, product_code } = {}) {
  return withCache('fetchReportProductAnalytics', { from, to, center_id, product_code }, async () => {
    const { data, error } = await supabase.rpc('rpc_report_product_analytics', {
      p_from: from || null,
      p_to: to || null,
      p_center_id: center_id || null,
      p_product_code: product_code || 'UCMAS',
    });
    if (error) throw error;
    return data;
  }, 30000);
}

export async function fetchReportFunnel({ from, to, center_id, source_type } = {}) {
  return withCache('fetchReportFunnel', { from, to, center_id, source_type }, async () => {
    const { data, error } = await supabase.rpc('rpc_report_funnel', {
      p_from: from || null, p_to: to || null, p_center_id: center_id || null,
      p_source_type: source_type || null,
    });
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchReportCenterConversion() {
  return withCache('fetchReportCenterConversion', {}, async () => {
    const { data, error } = await supabase.rpc('rpc_report_center_conversion');
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchReportSalePerformance() {
  return withCache('fetchReportSalePerformance', {}, async () => {
    const { data, error } = await supabase.rpc('rpc_report_sale_performance');
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchReportCenterComparison() {
  return withCache('fetchReportCenterComparison', {}, async () => {
    const { data, error } = await supabase.rpc('rpc_report_center_comparison');
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchReportSourceCampaign() {
  return withCache('fetchReportSourceCampaign', {}, async () => {
    const { data, error } = await supabase.rpc('rpc_report_source_campaign');
    if (error) throw error;
    return data;
  }, 60000);
}

export async function fetchReportTimeInStage(centerId) {
  return withCache('fetchReportTimeInStage', { centerId }, async () => {
    const { data, error } = await supabase.rpc('rpc_report_time_in_stage', {
      p_center_id: centerId || null,
    });
    if (error) throw error;
    return data;
  }, 60000);
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function fetchNotifications({ limit = 10, unreadOnly = false } = {}) {
  // RLS already filters by user_id = auth.uid(), no need for getUser()
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, count, error } = await query;
  if (error) throw error;

  // Unread count: use head query (no data transfer) only if not already filtering unread
  let unreadTotal = 0;
  if (unreadOnly) {
    unreadTotal = count || 0;
  } else {
    const { count: uc } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);
    unreadTotal = uc || 0;
  }

  return { data: data || [], unread: unreadTotal };
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  // RLS filters by user_id = auth.uid() automatically
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  if (error) throw error;
}

// ============================================================
// CENTERS / ADMIN
// ============================================================

export async function fetchCenters() {
  const { data, error } = await supabase
    .from('centers')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function fetchCentersAdmin() {
  const { data, error } = await supabase
    .from('centers')
    .select('*, profiles!manager_id(full_name)')
    .order('name');
  if (error) throw error;
  return (data || []).map((c) => ({ ...c, manager_name: c.profiles?.full_name }));
}

export async function updateCenter(id, changes) {
  const { data, error } = await supabase.from('centers').update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, centers:centers!center_id(name), departments(name), sub_departments(name)')
    .order('full_name');
  if (error) throw error;
  return (data || []).map((u) => ({
    ...u,
    center_name: u.centers?.name,
    department_name: u.departments?.name,
    sub_department_name: u.sub_departments?.name,
  }));
}

export async function updateProfile(id, changes) {
  const { data, error } = await supabase.from('profiles').update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function createUser({ username, password, full_name, permission_group, center_id, can_view_l0_pool, center_access_mode }) {
  // Auto-generate email from username for Supabase Auth (which requires email format)
  const email = `${username}@ucmas.local`;
  const { data, error } = await supabase.rpc('rpc_create_user', {
    p_email: email,
    p_password: password,
    p_full_name: full_name,
    p_permission_group: permission_group || 'center',
    p_center_id: center_id || null,
    p_can_view_l0_pool: can_view_l0_pool || false,
    p_center_access_mode: center_access_mode || 'own',
  });
  if (error) throw error;
  if (data?.status === 'error') throw new Error(data.message);
  return data;
}

export async function fetchDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('code');
  if (error) throw error;
  return data || [];
}

export async function fetchSubDepartments(departmentId) {
  const { data, error } = await supabase
    .from('sub_departments')
    .select('*, centers(name)')
    .eq('department_id', departmentId)
    .order('code');
  if (error) throw error;
  return (data || []).map((s) => ({ ...s, center_name: s.centers?.name }));
}

// ============================================================
// SYSTEM SETTINGS
// ============================================================

export async function fetchSettings() {
  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) throw error;
  const settings = {};
  (data || []).forEach((s) => { settings[s.key] = s.value; });
  // Mask sensitive
  if (settings.sheet_service_account_json) {
    settings.sheet_service_account_json_set = true;
    delete settings.sheet_service_account_json;
  }
  return settings;
}

export async function updateSettings(settingsObj) {
  const { data: { user } } = await supabase.auth.getUser();
  const rows = Object.entries(settingsObj).map(([key, value]) => ({
    key,
    value,
    updated_by: user?.id,
    updated_at: new Date().toISOString(),
  }));
  // Single batch upsert instead of N roundtrips
  const { error } = await supabase.from('system_settings').upsert(rows);
  if (error) throw error;
}

// ============================================================
// STAFF by center (for dropdowns)
// ============================================================

export async function fetchStaffByCenter(centerId) {
  let query = supabase
    .from('profiles')
    .select('id, full_name')
    .in('permission_group', ['telesale', 'lead_telesale'])
    .eq('is_active', true);
  // Bug2 fix: filter by center_id if provided
  if (centerId) query = query.eq('center_id', centerId);
  query = query.order('full_name');
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================================
// PRODUCTS & LEVELS
// ============================================================

export async function fetchProductLevels() {
  const { data, error } = await supabase
    .from('product_levels')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ============================================================
// PASSWORD MANAGEMENT
// ============================================================

export async function changePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export async function resetUserPassword(userId) {
  const { data, error } = await supabase.rpc('rpc_reset_user_password', {
    p_user_id: userId,
    p_new_password: '123456'
  });
  if (error) throw error;
  if (data?.status === 'error') {
    throw new Error(data?.message || 'Có lỗi xảy ra khi reset mật khẩu');
  }
  return data;
}


