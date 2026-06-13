import { useState, useEffect, useCallback, useRef } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useDebounce, useSupabaseRealtime } from '../hooks/useShared';
import { fetchLeads } from '../services/api';
import { getLevelInfo, isMilestone, ALL_LEVEL_CODES } from '../config/levels';
import LeadDetailPanel from '../components/leads/LeadDetailPanel';
import BulkImportModal from '../components/leads/BulkImportModal';
import CreateLeadModal from '../components/leads/CreateLeadModal';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch, HiOutlineFilter, HiOutlinePlus,
  HiOutlineRefresh, HiOutlineUpload, HiOutlineUsers,
  HiOutlineX, HiOutlineTrash,
} from 'react-icons/hi';

const PRODUCTS = ['UCMAS', 'UCKID', 'ROBOT', 'TRẠI HÈ'];

const ADVANCED_FIELDS = [
  { value: 'level_code', label: 'Level', type: 'select', options: ALL_LEVEL_CODES },
  { value: 'assigned_center', label: 'Trung tâm', type: 'center' },
  { value: 'assigned_staff', label: 'NV phụ trách', type: 'staff' },
  { value: 'interested_products', label: 'Sản phẩm', type: 'product' },
  { value: 'source_type', label: 'Nguồn', type: 'select', options: ['PULL', 'PUSH'] },
];

// Whitelist: chỉ cho phép filter trên các field đã định nghĩa
const ALLOWED_FILTER_FIELDS = ADVANCED_FIELDS.map((f) => f.value);

const OPERATORS = {
  select: [{ value: 'eq', label: 'là' }, { value: 'neq', label: 'không phải' }],
  center: [{ value: 'eq', label: 'là' }, { value: 'neq', label: 'không phải' }],
  staff: [{ value: 'eq', label: 'là' }, { value: 'neq', label: 'không phải' }],
  product: [{ value: 'contains', label: 'bao gồm' }, { value: 'not_contains', label: 'không bao gồm' }],
};

export default function LeadsPage() {
  const { centers, allStaff } = useSharedData();
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [filters, setFilters] = useState({ level_code: '', center_id: '', staff_id: '', product: '', sort_by: 'created_at', sort_dir: 'desc' });
  const [selectedLead, setSelectedLead] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [advancedRules, setAdvancedRules] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const loadLeadsRef = useRef(null);

  const loadLeads = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      // Security: whitelist filter fields
      const validRules = advancedRules
        .filter((r) => r.field && r.op && r.value && ALLOWED_FILTER_FIELDS.includes(r.field));
      const result = await fetchLeads({
        page, limit: 50, search: debouncedSearch, ...filters,
        advanced_filters: validRules.length > 0 ? validRules : undefined,
      });
      setLeads(result.data);
      setPagination(result.pagination);
    } catch {
      toast.error('Lỗi tải danh sách lead');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, advancedRules]);

  useEffect(() => { loadLeadsRef.current = loadLeads; }, [loadLeads]);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Realtime with debounce via shared hook
  useSupabaseRealtime('leads', () => {
    loadLeadsRef.current?.(pagination.page);
  }, { debounceMs: 1000 });

  const formatDate = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const activeFilterCount = [filters.level_code, filters.center_id, filters.product, filters.staff_id]
    .filter(Boolean).length + advancedRules.filter((r) => r.value).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100">Danh sách Lead</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowBulkModal(true)}
            className="btn-secondary text-sm flex items-center gap-1 py-2 px-3" title="Tải / Dán dữ liệu hàng loạt">
            <HiOutlineUpload className="w-4 h-4" /> <span className="hidden sm:inline">Tải dữ liệu</span>
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="btn-primary text-sm flex items-center gap-1 py-2 px-3">
            <HiOutlinePlus className="w-4 h-4" /> <span>Thêm Lead</span>
          </button>
          <button onClick={() => loadLeads()} className="btn-ghost p-2" aria-label="Làm mới">
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input id="lead-search" type="text" placeholder="Tìm theo tên, SĐT, mã Lead..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-10 py-2 text-sm" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`btn-ghost text-sm flex items-center gap-1.5 ${showFilters ? 'text-primary-600 dark:text-primary-400' : ''}`}>
            <HiOutlineFilter className="w-4 h-4" /> Lọc
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-700/50 space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-3">
              <select id="filter-level" value={filters.level_code}
                onChange={(e) => setFilters({ ...filters, level_code: e.target.value })} className="select-field py-2 text-sm w-40">
                <option value="">Tất cả Level</option>
                {ALL_LEVEL_CODES.map((code) => (
                  <option key={code} value={code}>{code} — {getLevelInfo(code).label}</option>
                ))}
              </select>
              <select id="filter-center" value={filters.center_id}
                onChange={(e) => setFilters({ ...filters, center_id: e.target.value })} className="select-field py-2 text-sm w-40">
                <option value="">Tất cả Trung tâm</option>
                {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <select id="filter-product" value={filters.product}
                onChange={(e) => setFilters({ ...filters, product: e.target.value })} className="select-field py-2 text-sm w-40">
                <option value="">Tất cả Sản phẩm</option>
                {PRODUCTS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
              <select id="filter-staff" value={filters.staff_id}
                onChange={(e) => setFilters({ ...filters, staff_id: e.target.value })} className="select-field py-2 text-sm w-44">
                <option value="">Tất cả NV phụ trách</option>
                {allStaff.map((s) => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
              </select>
              <select id="filter-sort" value={filters.sort_by}
                onChange={(e) => setFilters({ ...filters, sort_by: e.target.value })} className="select-field py-2 text-sm w-40">
                <option value="created_at">Ngày tạo</option>
                <option value="updated_at">Cập nhật cuối</option>
                <option value="full_name">Tên A-Z</option>
                <option value="last_contact_at">Liên hệ cuối</option>
                <option value="next_followup_at">Follow-up</option>
              </select>
            </div>

            {/* Advanced filter rules */}
            {advancedRules.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Bộ lọc nâng cao (VÀ)</p>
                {advancedRules.map((rule, idx) => {
                  const fieldDef = ADVANCED_FIELDS.find((f) => f.value === rule.field);
                  const ops = fieldDef ? OPERATORS[fieldDef.type] : [];
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-surface-50 dark:bg-surface-800/30 rounded-lg border border-surface-200 dark:border-surface-700/50">
                      {idx > 0 && (
                        <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-500/10 px-2 py-0.5 rounded uppercase">VÀ</span>
                      )}
                      <select value={rule.field}
                        onChange={(e) => {
                          const updated = [...advancedRules];
                          const newFieldDef = ADVANCED_FIELDS.find((f) => f.value === e.target.value);
                          const defaultOp = newFieldDef ? OPERATORS[newFieldDef.type]?.[0]?.value : 'eq';
                          updated[idx] = { field: e.target.value, op: defaultOp, value: '' };
                          setAdvancedRules(updated);
                        }}
                        className="select-field py-1.5 text-xs w-32">
                        <option value="">Chọn trường</option>
                        {ADVANCED_FIELDS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                      </select>

                      <select value={rule.op}
                        onChange={(e) => {
                          const updated = [...advancedRules];
                          updated[idx] = { ...updated[idx], op: e.target.value };
                          setAdvancedRules(updated);
                        }}
                        className="select-field py-1.5 text-xs w-36">
                        {ops.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                      </select>

                      {fieldDef?.type === 'select' && (
                        <select value={rule.value} onChange={(e) => { const u = [...advancedRules]; u[idx] = { ...u[idx], value: e.target.value }; setAdvancedRules(u); }}
                          className="select-field py-1.5 text-xs w-36">
                          <option value="">Chọn giá trị</option>
                          {fieldDef.options.map((v) => (<option key={v} value={v}>{v}</option>))}
                        </select>
                      )}
                      {fieldDef?.type === 'center' && (
                        <select value={rule.value} onChange={(e) => { const u = [...advancedRules]; u[idx] = { ...u[idx], value: e.target.value }; setAdvancedRules(u); }}
                          className="select-field py-1.5 text-xs w-36">
                          <option value="">Chọn trung tâm</option>
                          {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                      )}
                      {fieldDef?.type === 'staff' && (
                        <select value={rule.value} onChange={(e) => { const u = [...advancedRules]; u[idx] = { ...u[idx], value: e.target.value }; setAdvancedRules(u); }}
                          className="select-field py-1.5 text-xs w-44">
                          <option value="">Chọn nhân viên</option>
                          {allStaff.map((s) => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
                        </select>
                      )}
                      {fieldDef?.type === 'product' && (
                        <select value={rule.value} onChange={(e) => { const u = [...advancedRules]; u[idx] = { ...u[idx], value: e.target.value }; setAdvancedRules(u); }}
                          className="select-field py-1.5 text-xs w-36">
                          <option value="">Chọn sản phẩm</option>
                          {PRODUCTS.map((p) => (<option key={p} value={p}>{p}</option>))}
                        </select>
                      )}

                      <button onClick={() => setAdvancedRules(advancedRules.filter((_, i) => i !== idx))}
                        className="btn-ghost p-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label="Xóa điều kiện">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button onClick={() => setAdvancedRules([...advancedRules, { field: '', op: 'eq', value: '' }])}
                className="btn-ghost text-xs flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10">
                <HiOutlinePlus className="w-3.5 h-3.5" /> Thêm điều kiện lọc
              </button>
              {activeFilterCount > 0 && (
                <button onClick={() => {
                  setFilters({ level_code: '', center_id: '', staff_id: '', product: '', sort_by: 'created_at', sort_dir: 'desc' });
                  setAdvancedRules([]);
                }}
                  className="btn-ghost text-xs flex items-center gap-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <HiOutlineX className="w-3.5 h-3.5" /> Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="glass-card overflow-hidden relative">
        {loading && leads.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-500/20 overflow-hidden z-10">
            <div className="h-full bg-primary-500 animate-pulse w-full" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="data-table" id="lead-table">
            <thead>
              <tr>
                <th>Mã Lead</th><th>Họ tên</th><th>Tên con</th><th>SĐT</th><th>Năm sinh con</th>
                <th>Sản phẩm</th><th>Trạng thái</th><th>Level UCMAS/UCKID</th><th>Trung tâm</th><th>NV phụ trách</th>
                <th>Liên hệ cuối</th><th>Follow-up</th><th>Nguồn</th>
              </tr>
            </thead>
            <tbody className={loading && leads.length > 0 ? "opacity-60 transition-opacity duration-200 pointer-events-none" : "transition-opacity duration-200"}>
              {loading && leads.length === 0 ? (
                <tr><td colSpan={13} className="p-0"><TableSkeleton rows={8} cols={13} /></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={13}>
                  <EmptyState icon={HiOutlineUsers} title="Không tìm thấy lead nào"
                    description="Thử thay đổi bộ lọc hoặc thêm lead mới" />
                </td></tr>
              ) : (
                leads.map((lead) => {
                  const levelInfo = getLevelInfo(lead.level_code);
                  const milestone = isMilestone(lead.level_code);
                  return (
                    <tr key={lead.id} id={`lead-row-${lead.id}`} onClick={() => setSelectedLead(lead)}
                      className={milestone ? 'milestone-row' : ''}>
                      <td className="font-mono text-xs text-primary-600 dark:text-primary-400">{lead.lead_code}</td>
                      <td>
                        <div className="font-medium text-surface-800 dark:text-surface-100">{lead.full_name}</div>
                      </td>
                      <td className="text-sm font-medium text-surface-800 dark:text-surface-200">{lead.child_name || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 font-mono text-xs font-medium">{lead.phone || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.child_birth_year || '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {lead.interested_products && lead.interested_products.length > 0 ? (
                            lead.interested_products.map((p) => (
                              <span key={p} className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-500/20">
                                {p}
                              </span>
                            ))
                          ) : (<span className="text-surface-500">—</span>)}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`badge ${levelInfo.bgClass}`} style={{ borderLeft: `3px solid ${levelInfo.color}` }}>{lead.level_code}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {lead.l4_type ? (
                            lead.l4_type.split(',').map((item) => (
                              <span key={item.trim()} className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20">
                                {item.trim().replace(/^L4\s+/, '')}
                              </span>
                            ))
                          ) : ('—')}
                        </div>
                      </td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.center_name || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.staff_name || '—'}</td>
                      <td className="text-surface-600 dark:text-surface-400 text-xs font-mono">{formatDate(lead.last_contact_at)}</td>
                      <td className="text-surface-600 dark:text-surface-400 text-xs font-mono">{formatDate(lead.next_followup_at)}</td>
                      <td><span className={`text-xs font-semibold ${lead.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{lead.source_type}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-surface-200 dark:border-surface-800">
            <span className="text-sm text-surface-500">{pagination.total} lead · Trang {pagination.page}/{pagination.totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => loadLeads(pagination.page - 1)} disabled={pagination.page <= 1}
                className="btn-ghost text-sm disabled:opacity-30">← Trước</button>
              <button onClick={() => loadLeads(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="btn-ghost text-sm disabled:opacity-30">Sau →</button>
            </div>
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} centers={centers}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => { setSelectedLead(null); loadLeads(pagination.page); }} />
      )}

      {showCreateModal && (
        <CreateLeadModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadLeads(); }} />
      )}

      {showBulkModal && (
        <BulkImportModal onClose={() => setShowBulkModal(false)} onSuccess={() => loadLeads()} />
      )}
    </div>
  );
}
