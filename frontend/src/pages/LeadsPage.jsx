import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce, useSupabaseRealtime } from '../hooks/useShared';
import { fetchLeads, fetchProductLevels, softDeleteLeads } from '../services/api';
import { getLevelInfo, isMilestone, ALL_LEVEL_CODES } from '../config/levels';
import { PRODUCTS, PAGE_SIZE_OPTIONS } from '../config/constants';
import { formatDate } from '../utils/format';
import LeadDetailPanel from '../components/leads/LeadDetailPanel';
import BulkImportModal from '../components/leads/BulkImportModal';
import CreateLeadModal from '../components/leads/CreateLeadModal';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import MultiSelect from '../components/ui/MultiSelect';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch, HiOutlineFilter, HiOutlinePlus,
  HiOutlineRefresh, HiOutlineUpload, HiOutlineUsers,
  HiOutlineX, HiOutlineTrash,
} from 'react-icons/hi';


const ADVANCED_FIELDS = [
  { value: 'level_code', label: 'Level', type: 'select', options: ALL_LEVEL_CODES },
  { value: 'assigned_center', label: 'Trung tâm', type: 'center' },
  { value: 'assigned_staff', label: 'Sale đặt lịch', type: 'staff' },
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
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [filters, setFilters] = useState({ level_code: [], center_id: [], staff_id: [], product: [], sort_by: 'created_at', sort_dir: 'desc' });

  useEffect(() => {
    const levelParam = searchParams.get('level_code');
    if (levelParam) {
      if (['L1', 'L2', 'L3', 'L4'].includes(levelParam)) {
        // Expand group
        const codes = ALL_LEVEL_CODES.filter(c => {
          if (levelParam === 'L4') {
            return c.startsWith('L4.');
          }
          return c.startsWith(levelParam) && c !== 'L1.KK';
        });
        setFilters(prev => ({ ...prev, level_code: codes }));
      } else {
        setFilters(prev => ({ ...prev, level_code: [levelParam] }));
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [advancedRules, setAdvancedRules] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [allProductLevels, setAllProductLevels] = useState([]);
  const [pageSize, setPageSize] = useState(50);
  const loadLeadsRef = useRef(null);
  // Admin: multi-select delete
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProductLevels()
      .then(setAllProductLevels)
      .catch(console.error);
  }, []);

  const toggleSelectLead = (e, id) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const countToDelete = selectedIds.size; // capture trước khi clear state
    setDeleting(true);
    try {
      const result = await softDeleteLeads([...selectedIds]);
      toast.success(`Đã chuyển ${result?.deleted || countToDelete} lead vào thùng rác!`);
      setShowDeleteConfirm(false);
      setSelectedIds(new Set());
      loadLeads(1); // về trang 1 vì dữ liệu đã thay đổi
    } catch (err) {
      toast.error('Lỗi xóa lead: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const getProductLevelTime = (lead, productCode, levelPrefix) => {
    const lpl = lead.lead_product_levels?.find((l) => l.product_code === productCode);
    if (!lpl || !lpl.entered_at) return null;

    const matches = Object.entries(lpl.entered_at)
      .filter(([key]) => key.startsWith(levelPrefix))
      .map(([_, time]) => time);

    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(a) - new Date(b))[0];
  };

  const renderProductLevelBadge = (lead, productCode) => {
    const lpl = lead.lead_product_levels?.find((l) => l.product_code === productCode);
    if (!lpl) return <span className="text-surface-500">—</span>;

    const lvlDef = allProductLevels.find(
      (l) => l.product_code === productCode && l.level_code === lpl.level_code
    ) || { label: 'Data đầu vào', color: '#6B7280' };
    const color = lvlDef.color || '#6B7280';

    return (
      <span
        className="px-2 py-1 text-[11px] font-bold rounded-md border flex items-center gap-1 w-max"
        style={{
          color: color,
          borderColor: `${color}40`,
          backgroundColor: `${color}10`,
        }}
        title={lvlDef.label || ''}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {lpl.level_code}
      </span>
    );
  };

  const renderTimeCell = (time) => {
    if (!time) return <span className="text-surface-500">—</span>;
    const dateStr = formatDate(time);
    const fullTimeStr = new Date(time).toLocaleString('vi-VN');
    return <span title={fullTimeStr}>{dateStr}</span>;
  };

  const loadLeads = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      // Security: whitelist filter fields
      const validRules = advancedRules
        .filter((r) => r.field && r.op && r.value && ALLOWED_FILTER_FIELDS.includes(r.field));
      const result = await fetchLeads({
        page, limit: pageSize, search: debouncedSearch, ...filters,
        advanced_filters: validRules.length > 0 ? validRules : undefined,
      });
      setLeads(result.data);
      setPagination(result.pagination);
    } catch {
      toast.error('Lỗi tải danh sách lead');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, advancedRules, pageSize]);

  useEffect(() => { loadLeadsRef.current = loadLeads; }, [loadLeads]);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Realtime with debounce via shared hook
  useSupabaseRealtime('leads', () => {
    loadLeadsRef.current?.(pagination.page);
  }, { debounceMs: 1000 });

  // formatDate is now imported from utils/format

  const activeFilterCount = [filters.level_code, filters.center_id, filters.product, filters.staff_id]
    .filter((x) => Array.isArray(x) ? x.length > 0 : Boolean(x)).length + advancedRules.filter((r) => r.value).length;

  const levelOptions = ALL_LEVEL_CODES.map((code) => ({
    value: code,
    label: `${code} — ${getLevelInfo(code).label}`
  }));

  const centerOptions = centers.map((c) => ({
    value: c.id,
    label: c.name
  }));

  const productOptions = PRODUCTS.map((p) => ({
    value: p,
    label: p
  }));

  const staffOptions = allStaff.map((s) => ({
    value: s.id,
    label: s.full_name
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100">Danh sách Lead</h1>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Toàn bộ các data L1 trở lên đã được phân về trung tâm</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowBulkModal(true)}
            className="btn-secondary text-sm flex items-center gap-1 py-2 px-3" title="Tải / Dán dữ liệu hàng loạt">
            <HiOutlineUpload className="w-4 h-4" /> <span className="hidden sm:inline">Tải dữ liệu</span>
          </button>
          {/* Xóa đã chọn — chỉ admin */}
          {isAdmin && selectedIds.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-1.5 py-2 px-3 rounded-xl transition-colors"
            >
              <HiOutlineTrash className="w-4 h-4" />
              Xóa ({selectedIds.size})
            </button>
          )}
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
            <div className="flex flex-wrap items-center gap-3">
              <MultiSelect
                id="filter-level"
                options={levelOptions}
                selected={filters.level_code}
                onChange={(vals) => setFilters({ ...filters, level_code: vals })}
                placeholder="Tất cả Level"
                labelPrefix="Level"
                className="w-48"
              />
              <MultiSelect
                id="filter-center"
                options={centerOptions}
                selected={filters.center_id}
                onChange={(vals) => setFilters({ ...filters, center_id: vals })}
                placeholder="Tất cả Trung tâm"
                labelPrefix="Trung tâm"
                className="w-52"
              />
              <MultiSelect
                id="filter-product"
                options={productOptions}
                selected={filters.product}
                onChange={(vals) => setFilters({ ...filters, product: vals })}
                placeholder="Tất cả Sản phẩm"
                labelPrefix="Sản phẩm"
                className="w-48"
              />
              <MultiSelect
                id="filter-staff"
                options={staffOptions}
                selected={filters.staff_id}
                onChange={(vals) => setFilters({ ...filters, staff_id: vals })}
                placeholder="Tất cả Sale đặt lịch"
                labelPrefix="Sale đặt lịch"
                className="w-56"
              />
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
                  setFilters({ level_code: [], center_id: [], staff_id: [], product: [], sort_by: 'created_at', sort_dir: 'desc' });
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
        <div className="overflow-auto max-h-[calc(100vh-320px)] relative">
          <table className="data-table" style={{ minWidth: '2080px' }} id="lead-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th className="w-10 px-3">
                    <input type="checkbox"
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onChange={toggleSelectAll}
                      className="rounded border-surface-300 dark:border-surface-600 text-primary-500"
                    />
                  </th>
                )}
                <th className="w-[85px]">Mã Lead</th>
                <th className="w-full min-w-[150px]">Họ tên</th>
                <th className="w-[100px]">Tên con</th>
                <th className="w-[100px]">SĐT</th>
                <th className="w-[80px]">Năm sinh con</th>
                <th className="w-[130px]">Trung tâm</th>
                <th className="w-[130px]">Sale đặt lịch</th>
                <th className="w-[110px]">Mã học sinh</th>
                <th className="w-[130px]">Doanh thu</th>
                <th className="w-[70px]">Nguồn</th>
                <th className="w-[110px]">Sản phẩm</th>
                <th className="w-[95px]">Level UCMAS</th>
                <th className="w-[95px]">Level UCKID</th>
                <th className="w-[85px]">L1 UCMAS</th>
                <th className="w-[85px]">L2 UCMAS</th>
                <th className="w-[85px]">L3 UCMAS</th>
                <th className="w-[85px]">L4 UCMAS</th>
                <th className="w-[85px]">L1 UCKID</th>
                <th className="w-[85px]">L2 UCKID</th>
                <th className="w-[85px]">L3 UCKID</th>
                <th className="w-[85px]">L4 UCKID</th>
                <th className="w-[85px]">Liên hệ cuối</th>
                <th className="w-[85px]">Follow-up</th>
              </tr>
            </thead>
            <tbody className={loading && leads.length > 0 ? "opacity-60 transition-opacity duration-200 pointer-events-none" : "transition-opacity duration-200"}>
              {loading && leads.length === 0 ? (
                <tr><td colSpan={isAdmin ? 24 : 23} className="p-0"><TableSkeleton rows={8} cols={isAdmin ? 24 : 23} /></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={isAdmin ? 24 : 23}>
                  <EmptyState icon={HiOutlineUsers} title="Không tìm thấy lead nào"
                    description="Thử thay đổi bộ lọc hoặc thêm lead mới" />
                </td></tr>
              ) : (
                leads.map((lead) => {
                  const levelInfo = getLevelInfo(lead.level_code);
                  const milestone = isMilestone(lead.level_code);
                  return (
                    <tr key={lead.id} id={`lead-row-${lead.id}`}
                      onClick={() => { if (!isAdmin || selectedIds.size === 0) setSelectedLead(lead); }}
                      className={`${milestone ? 'milestone-row' : ''} ${selectedIds.has(lead.id) ? 'bg-primary-50 dark:bg-primary-900/10' : ''} cursor-pointer`}>
                      {isAdmin && (
                        <td className="px-3" onClick={(e) => toggleSelectLead(e, lead.id)}>
                          <input type="checkbox"
                            checked={selectedIds.has(lead.id)}
                            onChange={() => {}}
                            className="rounded border-surface-300 dark:border-surface-600 text-primary-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="font-mono text-xs text-primary-600 dark:text-primary-400">{lead.lead_code}</td>
                      <td>
                        <div className="font-medium text-surface-800 dark:text-surface-100">{lead.full_name}</div>
                      </td>
                      <td className="text-sm font-medium text-surface-800 dark:text-surface-200">{lead.child_name || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 font-mono text-xs font-medium">{lead.phone || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.child_birth_year || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.center_name || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-sm font-medium">{lead.staff_name || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 font-mono text-xs font-medium">{lead.student_code || '—'}</td>
                      <td className="text-surface-800 dark:text-surface-200 text-xs font-bold font-mono">
                        {((lead.tuition_fee || 0) + (lead.material_fee || 0)).toLocaleString('vi-VN')} đ
                      </td>
                      <td><span className={`text-xs font-semibold ${lead.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{lead.source_type}</span></td>
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
                      {/* Level UCMAS */}
                      <td>
                        {renderProductLevelBadge(lead, 'UCMAS')}
                      </td>
                      {/* Level UCKID */}
                      <td>
                        {renderProductLevelBadge(lead, 'UCKID')}
                      </td>
                      {/* L1 -> L4 UCMAS */}
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCMAS', 'L1'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCMAS', 'L2'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCMAS', 'L3'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCMAS', 'L4'))}</td>
                      {/* L1 -> L4 UCKID */}
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCKID', 'L1'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCKID', 'L2'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCKID', 'L3'))}</td>
                      <td className="text-xs font-mono">{renderTimeCell(getProductLevelTime(lead, 'UCKID', 'L4'))}</td>
                      <td className="text-surface-600 dark:text-surface-400 text-xs font-mono">{formatDate(lead.last_contact_at)}</td>
                      <td className="text-surface-600 dark:text-surface-400 text-xs font-mono">{formatDate(lead.next_followup_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>


        {pagination.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-surface-200 dark:border-surface-800 gap-3">
            <div className="flex items-center gap-2 text-sm text-surface-500">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value))}
                className="py-1 px-2 text-xs w-24 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-lg focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} dòng</option>
                ))}
              </select>
              <span>/ trang (Tổng số {pagination.total} lead)</span>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-surface-500 mr-2">Trang {pagination.page}/{pagination.totalPages}</span>
                <button onClick={() => loadLeads(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="btn-ghost text-sm disabled:opacity-30 py-1.5 px-3">← Trước</button>
                <button onClick={() => loadLeads(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  className="btn-ghost text-sm disabled:opacity-30 py-1.5 px-3">Sau →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-surface-900 border border-red-200 dark:border-red-800/50 rounded-2xl shadow-xl w-full max-w-md mx-4 animate-slide-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <HiOutlineTrash className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-surface-800 dark:text-surface-100">Xóa lead đã chọn</h3>
                  <p className="text-sm text-surface-500">Lead sẽ được chuyển vào thùng rác</p>
                </div>
              </div>
              <p className="text-sm text-surface-700 dark:text-surface-300 mb-5">
                Bạn đã chọn <strong className="text-red-600">{selectedIds.size} lead</strong> để xóa.
                Lead sẽ được chuyển vào <strong>Thùng rác</strong> và có thể khôi phục sau.
              </p>
              <div className="flex gap-2">
                <button onClick={handleBulkDelete} disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-60">
                  {deleting ? 'Đang xóa...' : `🗑️ Chuyển vào thùng rác`}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary text-sm px-4">
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
