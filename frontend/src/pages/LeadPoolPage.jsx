import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useAuth } from '../contexts/AuthContext';
import { useSupabaseRealtime } from '../hooks/useShared';
import { supabase } from '../lib/supabase';
import { fetchL0Pool, bulkAssign, fetchL0UnprocessedStats, updateLead, updateLeadLevelAndProducts, softDeleteLeads } from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineInbox, HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineTrash } from 'react-icons/hi';
import LeadDetailPanel from '../components/leads/LeadDetailPanel';
import MultiSelect from '../components/ui/MultiSelect';
import { PRODUCT_OPTIONS, L0_ALERT_THRESHOLD_MS, L0_POOL_LEVELS, PAGE_SIZE_OPTIONS, BIRTH_YEAR_RANGE } from '../config/constants';
import { getLevelInfo, ALL_LEVEL_CODES } from '../config/levels';
import { validatePhone } from '../utils/validation';
import { formatDate } from '../utils/format';

// Levels cơ bản cho L0 Pool (luôn hiển thị)
const L0_BASE_LEVELS = ['L0', 'L1.KK', 'L0.R', 'L0.K'];
// Levels "tốt nghiệp" — chuyển lead sang Danh sách Lead
const GRADUATION_LEVELS = ALL_LEVEL_CODES.filter(c => !L0_BASE_LEVELS.includes(c));

export default function LeadPoolPage() {
  const { centers, allStaff, productLevels } = useSharedData();
  const { canViewL0, user, isCenter, isAdmin } = useAuth();
  const isTelesale = user?.permission_group === 'telesale';
  const [searchParams, setSearchParams] = useSearchParams();
  const [levelFilter, setLevelFilter] = useState('');
  const [pool, setPool] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [assigning, setAssigning] = useState(false);
  const [targetCenter, setTargetCenter] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [unprocessedStats, setUnprocessedStats] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [savingLeads, setSavingLeads] = useState({}); // { [leadId]: { [field]: boolean } }
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Lưu tạm graduation level đang chọn cho từng sản phẩm của từng lead
  // { [leadId]: { [productCode]: levelCode } }
  const [pendingProductLevels, setPendingProductLevels] = useState({});
  // Bug1 fix: dùng ref map thay vì single shared state để tránh race condition
  const focusedValueRef = useRef({});
  const loadRef = useRef(null);

  useEffect(() => {
    const levelParam = searchParams.get('level_code');
    if (levelParam && L0_BASE_LEVELS.includes(levelParam)) {
      setLevelFilter(levelParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const isOver3Hours = (createdAt) => {
    return (Date.now() - new Date(createdAt).getTime()) > L0_ALERT_THRESHOLD_MS;
  };

  // DRY: helper để set/clear saving state cho từng field của từng lead
  const markSaving = (leadId, field, isSaving) => {
    setSavingLeads(prev => {
      const next = { ...prev };
      if (isSaving) {
        next[leadId] = { ...next[leadId], [field]: true };
      } else if (next[leadId]) {
        delete next[leadId][field];
        if (Object.keys(next[leadId]).length === 0) delete next[leadId];
      }
      return next;
    });
  };

  const loadPool = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await fetchL0Pool({ page, limit: pageSize });
      setPool(result.data);
      setPagination(result.pagination);
      setSelected(new Set());
      
      // Load 3-hour unprocessed stats
      const stats = await fetchL0UnprocessedStats();
      setUnprocessedStats(stats);
    } catch {
      toast.error('Lỗi tải kho L0');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  // NOTE: không cần useEffect riêng cho pageSize vì loadPool đã phụ thuộc pageSize
  // và useEffect ở dưới (line 379) đã gọi loadPool() khi loadPool thay đổi.

  const handleInputChange = (leadId, field, value) => {
    setPool(prevPool => prevPool.map(lead => {
      if (lead.id === leadId) {
        return { ...lead, [field]: value };
      }
      return lead;
    }));
  };

  const handleInputBlur = async (leadId, field, originalValue, currentValue) => {
    if (currentValue === originalValue) return;

    if (field === 'phone') {
      const phoneCheck = validatePhone(currentValue);
      if (!phoneCheck.valid) {
        toast.error(phoneCheck.message);
        handleInputChange(leadId, field, originalValue);
        return;
      }
    }

    markSaving(leadId, field, true);
    try {
      const cleanVal = currentValue === '' ? null : currentValue;
      let changes = { [field]: cleanVal };
      if (field === 'child_birth_year' && cleanVal) {
        changes.child_birth_year = parseInt(cleanVal);
      }
      await updateLead(leadId, changes);
      toast.success('Đã lưu thay đổi');
      handleInputChange(leadId, field, cleanVal);
      if (field === 'phone') loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật');
      handleInputChange(leadId, field, originalValue);
    } finally {
      markSaving(leadId, field, false);
    }
  };

  const handleCenterChange = async (leadId, centerId) => {
    markSaving(leadId, 'assigned_center', true);
    try {
      const cleanVal = centerId === '' ? null : centerId;
      await updateLead(leadId, { assigned_center: cleanVal });
      setPool(prevPool => prevPool.map(lead => {
        if (lead.id === leadId) {
          const center = centers.find(c => c.id === centerId);
          return { ...lead, assigned_center: cleanVal, center_name: center ? center.name : null };
        }
        return lead;
      }));
      toast.success('Đã cập nhật trung tâm');
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật trung tâm');
    } finally {
      markSaving(leadId, 'assigned_center', false);
    }
  };

  const handleStaffChange = async (leadId, staffId) => {
    markSaving(leadId, 'assigned_staff', true);
    try {
      const cleanVal = staffId === '' ? null : staffId;
      await updateLead(leadId, { assigned_staff: cleanVal });
      setPool(prevPool => prevPool.map(lead => {
        if (lead.id === leadId) {
          return { ...lead, assigned_staff: cleanVal };
        }
        return lead;
      }));
      toast.success('Đã cập nhật nhân viên');
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật nhân viên');
    } finally {
      markSaving(leadId, 'assigned_staff', false);
    }
  };

  // Kiểm tra lead có đủ điều kiện chuyển level ≥ L1 không
  const canGraduate = (lead) => {
    return lead.assigned_center && (lead.interested_products?.length > 0);
  };

  const handleLevelChange = async (leadId, levelCode) => {
    const lead = pool.find(l => l.id === leadId);
    if (!lead) return;

    const isGraduationLevel = !L0_BASE_LEVELS.includes(levelCode);

    // Validation: level ≥ L1 yêu cầu trung tâm + sản phẩm
    if (isGraduationLevel) {
      if (!lead.assigned_center) {
        toast.error('Cần chọn Trung tâm trước khi chuyển level này');
        return;
      }
      if (!lead.interested_products?.length) {
        toast.error('Cần chọn Sản phẩm trước khi chuyển level này');
        return;
      }

      // ConfirmDialog: cảnh báo lead sẽ chuyển sang Danh sách Lead
      const levelInfo = getLevelInfo(levelCode);
      setConfirmDialog({
        open: true,
        message: `Lead "${lead.full_name || lead.lead_code}" sẽ được chuyển sang Level "${levelInfo.label}" (${levelCode}).\n\nSau khi chuyển, lead sẽ biến mất khỏi Kho L0 và xuất hiện ở Danh sách Lead.\n\nBạn có chắc chắn muốn thực hiện?`,
        onConfirm: () => {
          setConfirmDialog({ open: false, message: '', onConfirm: null });
          executeLevelChange(leadId, levelCode);
        },
      });
      return;
    }

    // Level cơ bản L0 — chuyển trực tiếp
    executeLevelChange(leadId, levelCode);
  };

  const executeLevelChange = async (leadId, levelCode) => {
    markSaving(leadId, 'level_code', true);
    try {
      await updateLeadLevelAndProducts(leadId, levelCode);
      const isGraduation = !L0_BASE_LEVELS.includes(levelCode);
      toast.success(isGraduation
        ? '✅ Lead đã chuyển sang Danh sách Lead'
        : 'Đã cập nhật level'
      );
      loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật level');
    } finally {
      markSaving(leadId, 'level_code', false);
    }
  };

  const handleProductLevelChange = (leadId, productCode, levelCode) => {
    const lead = pool.find(l => l.id === leadId);
    if (!lead) return;

    const isGraduationLevel = !L0_BASE_LEVELS.includes(levelCode);

    // Validation: graduation level yêu cầu trung tâm
    if (isGraduationLevel && !lead.assigned_center) {
      toast.error('Cần chọn Trung tâm trước khi chuyển level này');
      return;
    }

    if (!isGraduationLevel) {
      // Level cơ bản L0 — nếu đang có pending graduation thì xóa sản phẩm này
      setPendingProductLevels(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          const leadPending = { ...next[leadId] };
          delete leadPending[productCode];
          if (Object.keys(leadPending).length === 0) delete next[leadId];
          else next[leadId] = leadPending;
        }
        return next;
      });
      // Cập nhật trực tiếp level cơ bản
      executeProductLevelChange(leadId, productCode, levelCode);
      return;
    }

    // --- Graduation level: lưu tạm, chờ đủ tất cả sản phẩm ---
    const allProducts = lead.interested_products || [];

    // Lấy pending hiện tại của lead này
    const currentPending = pendingProductLevels[leadId] || {};
    const newPending = { ...currentPending, [productCode]: levelCode };

    // Cập nhật UI ngay (để user thấy dropdown đổi)
    setPendingProductLevels(prev => ({
      ...prev,
      [leadId]: newPending,
    }));

    // Kiểm tra xem tất cả sản phẩm đã có graduation level chưa
    const allSelected = allProducts.every(p => {
      const chosen = newPending[p];
      return chosen && !L0_BASE_LEVELS.includes(chosen);
    });

    if (!allSelected) {
      // Chưa đủ — thông báo còn thiếu
      const missing = allProducts.filter(p => {
        const chosen = newPending[p];
        return !chosen || L0_BASE_LEVELS.includes(chosen);
      });
      toast(`Đã chọn level cho ${productCode}. Còn cần chọn level cho: ${missing.join(', ')}`, { icon: 'ℹ️', duration: 3000 });
      return;
    }

    // Đủ tất cả — hiện ConfirmDialog
    const summaryLines = allProducts
      .map(p => {
        const lvl = newPending[p];
        const lvlDef = productLevels.find(l => l.product_code === p && l.level_code === lvl);
        return `  • ${p}: ${lvl}${lvlDef ? ' — ' + lvlDef.label : ''}`;
      })
      .join('\n');

    setConfirmDialog({
      open: true,
      message: `Lead "${lead.full_name || lead.lead_code}" sẽ được chuyển sang Danh sách Lead với các level:\n\n${summaryLines}\n\nSau khi chuyển, lead sẽ biến mất khỏi Kho L0.\n\nBạn có chắc chắn muốn thực hiện?`,
      onConfirm: () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
        // Thực hiện cập nhật lần lượt cho từng sản phẩm
        executeAllProductLevelChanges(leadId, newPending, allProducts);
        // Xóa pending sau khi confirm
        setPendingProductLevels(prev => {
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
      },
    });
  };

  const executeAllProductLevelChanges = async (leadId, levelMap, allProducts) => {
    markSaving(leadId, 'level_code', true);
    try {
      for (const productCode of allProducts) {
        const levelCode = levelMap[productCode];
        if (!levelCode) continue;
        const { error } = await supabase.rpc('rpc_update_lead_product_level', {
          p_lead_id: leadId,
          p_product_code: productCode,
          p_level_code: levelCode,
          p_note: `Cập nhật Level ${productCode} trực tiếp từ kho kiểm`,
        });
        if (error) throw error;
      }
      toast.success('✅ Lead đã chuyển sang Danh sách Lead');
      loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật level sản phẩm');
    } finally {
      markSaving(leadId, 'level_code', false);
    }
  };

  const executeProductLevelChange = async (leadId, productCode, levelCode) => {
    markSaving(leadId, 'level_code', true);
    try {
      const { error } = await supabase.rpc('rpc_update_lead_product_level', {
        p_lead_id: leadId,
        p_product_code: productCode,
        p_level_code: levelCode,
        p_note: `Cập nhật Level ${productCode} trực tiếp từ kho kiểm`,
      });
      if (error) throw error;
      toast.success('Đã cập nhật level sản phẩm');
      loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật level sản phẩm');
    } finally {
      markSaving(leadId, 'level_code', false);
    }
  };

  const handleProductsChange = async (leadId, selectedProds) => {
    markSaving(leadId, 'interested_products', true);
    try {
      await updateLead(leadId, { interested_products: selectedProds });
      setPool(prevPool => prevPool.map(lead => {
        if (lead.id === leadId) {
          return { ...lead, interested_products: selectedProds };
        }
        return lead;
      }));
      toast.success('Đã cập nhật sản phẩm');
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật sản phẩm');
    } finally {
      markSaving(leadId, 'interested_products', false);
    }
  };

  useEffect(() => { loadRef.current = loadPool; }, [loadPool]);
  useEffect(() => { loadPool(); }, [loadPool]);

  // Debounced realtime — avoids flood when bulk assigning
  useSupabaseRealtime('leads', () => {
    loadRef.current?.(pagination.page);
  }, { debounceMs: 1500 });

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const filteredPool = pool.filter(lead => {
    if (!levelFilter) return true;
    return lead.level_code === levelFilter;
  });

  const toggleAll = () => {
    if (selected.size === filteredPool.length) setSelected(new Set());
    else setSelected(new Set(filteredPool.map((l) => l.id)));
  };

  const handleBulkAssign = async () => {
    if (selected.size === 0 || !targetCenter) {
      toast.error('Chọn lead và trung tâm');
      return;
    }
    setAssigning(true);
    try {
      const result = await bulkAssign(Array.from(selected), targetCenter);
      toast.success(`Gán ${result.success} lead thành công`);
      setSelected(new Set());
      setTargetCenter('');
      loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi phân bổ');
    } finally {
      setAssigning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const countToDelete = selected.size;
    setDeleting(true);
    try {
      const result = await softDeleteLeads(Array.from(selected));
      toast.success(`Đã chuyển ${result?.deleted || countToDelete} lead vào thùng rác!`);
      setShowDeleteConfirm(false);
      setSelected(new Set());
      // Dùng loadRef để tránh stale closure với pagination.page
      loadRef.current?.(pagination.page);
    } catch (err) {
      toast.error('Lỗi xóa lead: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!canViewL0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-surface-500">Bạn không có quyền xem kho L1 kho kiểm.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            <HiOutlineInbox className="w-7 h-7 text-primary-400" /> Kho Lead L1 kho kiểm
          </h1>
          <p className="text-sm text-surface-500">
            {levelFilter ? `${filteredPool.length} lead ở level ${levelFilter}` : `${pagination.total} lead chờ phân bổ`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Xóa đã chọn — chỉ admin */}
          {isAdmin && selected.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 py-1.5 px-3 rounded-lg transition-colors"
            >
              <HiOutlineTrash className="w-4 h-4" />
              Xóa ({selected.size})
            </button>
          )}
          {/* Bộ lọc Level L0 */}
          <select 
            value={levelFilter} 
            onChange={(e) => setLevelFilter(e.target.value)}
            className="select-field py-1.5 px-3 text-xs w-44 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Tất cả Level kho kiểm</option>
            {L0_BASE_LEVELS.map(lvl => {
              const info = getLevelInfo(lvl);
              return <option key={lvl} value={lvl}>{lvl} — {info.label}</option>;
            })}
          </select>
          <button onClick={() => loadPool(pagination.page)} className="btn-ghost" aria-label="Làm mới">
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {unprocessedStats > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-center justify-between text-red-800 dark:text-red-400 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-sm font-medium">
              Cảnh báo: Có <strong>{unprocessedStats}</strong> lead vào hệ thống quá 3 tiếng chưa xử lý!
            </span>
          </div>
        </div>
      )}

      {/* Bulk Assign Bar */}
      {selected.size > 0 && (
        <div className="glass-card p-4 flex flex-wrap items-center gap-3 animate-slide-up">
          <span className="text-sm text-surface-700 dark:text-surface-300 font-medium">
            Đã chọn <span className="text-primary-600 dark:text-primary-400 font-bold">{selected.size}</span> lead
          </span>
          <select value={targetCenter}
            onChange={(e) => setTargetCenter(e.target.value)}
            className="select-field py-2 text-sm w-48">
            <option value="">— Chọn trung tâm —</option>
            {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <button onClick={handleBulkAssign} disabled={assigning || !targetCenter}
            className="btn-primary text-sm disabled:opacity-50">
            {assigning ? 'Đang gán...' : isTelesale ? `Nhận ${selected.size} lead` : `Phân bổ ${selected.size} lead`}
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-ghost text-sm text-red-500">Bỏ chọn</button>
        </div>
      )}

      {/* Data Table */}
      <div className="glass-card overflow-hidden relative">
        {loading && pool.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-500/20 overflow-hidden z-10">
            <div className="h-full bg-primary-500 animate-pulse w-full" />
          </div>
        )}
        <div className="overflow-auto max-h-[calc(100vh-320px)] relative">
          <table className="data-table data-table-compact" style={{ minWidth: '1500px' }}>
            <thead>
              <tr>
                <th className="w-10 px-3">
                  <input type="checkbox"
                    checked={filteredPool.length > 0 && selected.size === filteredPool.length}
                    onChange={toggleAll}
                    className="rounded border-surface-300 dark:border-surface-600 text-primary-500 cursor-pointer"
                  />
                </th>
                <th className="w-[80px]">Mã Lead</th>
                <th className="w-[110px]"><div className="leading-tight">Họ tên<br/>phụ huynh</div></th>
                <th className="w-[90px]">Tên con</th>
                <th className="w-[85px]">SĐT</th>
                <th className="w-[80px]">Năm sinh con</th>
                <th className="w-full">Địa chỉ</th>
                <th className="w-[110px]">Trung tâm</th>
                <th className="w-[110px]">Sale đặt lịch</th>
                <th className="w-[130px]">Ghi chú kho kiểm</th>
                <th className="w-[110px]">Sản phẩm</th>
                <th className="w-[110px]">Level</th>
                <th className="w-[60px]">Nguồn</th>
                <th className="w-[95px]">Fanpage</th>
                <th className="w-[95px]">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {loading && pool.length === 0 ? (
                <tr><td colSpan={15} className="p-0"><TableSkeleton rows={8} cols={15} /></td></tr>
              ) : filteredPool.length === 0 ? (
                <tr><td colSpan={15}>
                  <EmptyState icon={HiOutlineInbox} title="Kho L1 kho kiểm trống"
                    description={levelFilter ? `Chưa có lead nào ở level ${levelFilter}` : "Chưa có lead nào ở mức L1 kho kiểm"} />
                </td></tr>
              ) : (
                filteredPool.map((lead) => {
                  const unprocessed = lead.level_code === 'L1.KK';
                  const hasNoNote = !lead.l1_kk_note || lead.l1_kk_note.trim() === '';
                  const delayed = unprocessed && hasNoNote && isOver3Hours(lead.created_at);
                  
                  let rowClass = 'hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors duration-150 cursor-pointer';
                  if (selected.has(lead.id)) {
                    rowClass = 'bg-primary-50/50 dark:bg-primary-500/5';
                  } else if (delayed) {
                    rowClass = 'bg-red-500/5 hover:bg-red-500/10 dark:hover:bg-red-500/10';
                  } else if (unprocessed) {
                    rowClass = 'bg-amber-500/5 hover:bg-amber-500/10 dark:hover:bg-amber-500/10';
                  }

                  return (
                    <tr key={lead.id} onClick={() => { if (selected.size === 0) setSelectedLead(lead); }} className={rowClass}>
                      <td className="px-3" onClick={(e) => { e.stopPropagation(); toggleSelect(lead.id); }}>
                        <input type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => {}}
                          className="rounded border-surface-300 dark:border-surface-600 text-primary-500 cursor-pointer"
                        />
                      </td>
                      <td className={`font-mono text-sm text-primary-600 dark:text-primary-400 ${delayed ? 'border-l-2 border-l-red-500 dark:border-l-red-400' : unprocessed ? 'border-l-2 border-l-amber-500 dark:border-l-amber-400' : ''}`}>
                        {lead.lead_code}
                      </td>
                      
                      {/* Họ tên phụ huynh */}
                      <td>
                        <div className="flex items-center gap-1.5 min-w-[100px] font-medium text-sm">
                          <span>{lead.full_name || '—'}</span>
                          {delayed && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-850 dark:text-red-400 animate-pulse">
                              Trễ
                            </span>
                          )}
                          {unprocessed && !delayed && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-850 dark:text-amber-400">
                              Mới
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tên con */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[85px]">
                          <input
                            type="text"
                            value={lead.child_name || ''}
                            placeholder="Tên con..."
                            onFocus={(e) => { focusedValueRef.current[`${lead.id}-child_name`] = e.target.value; }}
                            onChange={(e) => handleInputChange(lead.id, 'child_name', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'child_name', focusedValueRef.current[`${lead.id}-child_name`], e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={isCenter || savingLeads[lead.id]?.child_name}
                            className="input-field py-1 px-2 text-sm w-full"
                          />
                          {savingLeads[lead.id]?.child_name && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* SĐT */}
                      <td>
                        <div className="min-w-[80px] font-mono text-sm text-surface-700 dark:text-surface-300">
                          {lead.phone || '—'}
                        </div>
                      </td>

                      {/* Năm sinh con */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[70px]">
                          <select
                            value={lead.child_birth_year || ''}
                            onChange={(e) => handleInputBlur(lead.id, 'child_birth_year', lead.child_birth_year, e.target.value)}
                            disabled={isCenter || savingLeads[lead.id]?.child_birth_year}
                            className="select-field py-1 px-2 text-sm w-full"
                          >
                            <option value="">Năm sinh</option>

                            {BIRTH_YEAR_RANGE.map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                          {savingLeads[lead.id]?.child_birth_year && (
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Địa chỉ */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[150px]">
                          <input
                            type="text"
                            value={lead.address || ''}
                            placeholder="Địa chỉ..."
                            onFocus={(e) => { focusedValueRef.current[`${lead.id}-address`] = e.target.value; }}
                            onChange={(e) => handleInputChange(lead.id, 'address', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'address', focusedValueRef.current[`${lead.id}-address`], e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={isCenter || savingLeads[lead.id]?.address}
                            className="input-field py-1 px-2 text-sm w-full"
                          />
                          {savingLeads[lead.id]?.address && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Trung tâm */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[110px]">
                          <select
                            value={lead.assigned_center || ''}
                            onChange={(e) => handleCenterChange(lead.id, e.target.value)}
                            disabled={isCenter || savingLeads[lead.id]?.assigned_center}
                            className={`select-field py-1 px-2 text-sm w-full ${
                              !lead.assigned_center
                                ? 'bg-amber-50/60 border-amber-200/80 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 font-medium'
                                : 'bg-white dark:bg-surface-800'
                            }`}
                          >
                            <option value="">— Chưa gán —</option>
                            {centers.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          {savingLeads[lead.id]?.assigned_center && (
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Sale đặt lịch */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[110px]">
                          <select
                            value={lead.assigned_staff || ''}
                            onChange={(e) => handleStaffChange(lead.id, e.target.value)}
                            disabled={isCenter || savingLeads[lead.id]?.assigned_staff}
                            className={`select-field py-1 px-2 text-sm w-full ${
                              !lead.assigned_staff
                                ? 'bg-amber-50/60 border-amber-200/80 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 font-medium'
                                : 'bg-white dark:bg-surface-800'
                            }`}
                          >
                            <option value="">— Chưa gán —</option>
                            {allStaff.map(s => (
                              <option key={s.id} value={s.id}>{s.full_name}</option>
                            ))}
                          </select>
                          {savingLeads[lead.id]?.assigned_staff && (
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Ghi chú kho kiểm */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[125px]">
                          <input
                            type="text"
                            value={lead.l1_kk_note || ''}
                            placeholder="Ghi chú kiểm..."
                            onFocus={(e) => { focusedValueRef.current[`${lead.id}-l1_kk_note`] = e.target.value; }}
                            onChange={(e) => handleInputChange(lead.id, 'l1_kk_note', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'l1_kk_note', focusedValueRef.current[`${lead.id}-l1_kk_note`], e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={isCenter || savingLeads[lead.id]?.l1_kk_note}
                            className="input-field py-1 px-2 text-sm w-full font-sans"
                          />
                          {savingLeads[lead.id]?.l1_kk_note && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Sản phẩm quan tâm */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[115px]">
                          <MultiSelect
                            options={PRODUCT_OPTIONS}
                            selected={lead.interested_products || []}
                            onChange={(vals) => handleProductsChange(lead.id, vals)}
                            placeholder="Chọn..."
                            className="w-full text-sm text-left"
                            searchable={false}
                            disabled={isCenter}
                          />
                          {savingLeads[lead.id]?.interested_products && (
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Level — dynamic dropdown */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex flex-col gap-1.5 justify-center min-w-[115px]">
                          {lead.interested_products && lead.interested_products.length > 0 ? (
                            lead.interested_products.map((p_code) => {
                              // Ưu tiên hiển thị pending (đang chọn) nếu có, nếu không dùng level từ DB
                              const pendingLvl = pendingProductLevels[lead.id]?.[p_code];
                              const savedLvl = lead.lead_product_levels?.find(l => l.product_code === p_code)?.level_code || 'L0';
                              const currentLvl = pendingLvl || savedLvl;
                              const isGradPending = pendingLvl && !L0_BASE_LEVELS.includes(pendingLvl);
                              const prodLvls = productLevels.filter(lvl => lvl.product_code === p_code);
                              return (
                                <div key={p_code} className="flex items-center gap-1">
                                  <span className="text-xs font-mono font-bold text-surface-500 w-12 truncate" title={p_code}>
                                    {p_code}:
                                  </span>
                                  <select
                                    value={currentLvl}
                                    onChange={(e) => handleProductLevelChange(lead.id, p_code, e.target.value)}
                                    disabled={isCenter || savingLeads[lead.id]?.level_code}
                                    className={`select-field py-0.5 px-1 text-xs w-28 font-semibold ${
                                      isGradPending
                                        ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'
                                        : 'bg-white dark:bg-surface-800'
                                    }`}
                                  >
                                    <optgroup label="── Xử lý trong Kho L0 ──">
                                      {L0_POOL_LEVELS.map(lvl => (
                                        <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                                      ))}
                                    </optgroup>
                                    {canGraduate(lead) && (
                                      <optgroup label="── Chuyển đi ──">
                                        {prodLvls
                                          .filter(lvl => !['L0', 'L0.R', 'L0.K', 'L1.KK'].includes(lvl.level_code))
                                          .map(lvl => (
                                            <option key={lvl.level_code} value={lvl.level_code}>
                                              {lvl.level_code} — {lvl.label}
                                            </option>
                                          ))}
                                      </optgroup>
                                    )}
                                  </select>
                                </div>
                              );
                            })
                          ) : (
                            <select
                              value={lead.level_code || 'L0'}
                              onChange={(e) => handleLevelChange(lead.id, e.target.value)}
                              disabled={isCenter || savingLeads[lead.id]?.level_code}
                              className="select-field py-1 px-2 text-sm w-full font-semibold"
                            >
                              <optgroup label="── Xử lý trong Kho L0 ──">
                                {L0_POOL_LEVELS.map(lvl => (
                                  <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                                ))}
                              </optgroup>
                              {canGraduate(lead) && (
                                <optgroup label="── Chuyển sang Danh sách Lead ──">
                                  {GRADUATION_LEVELS.map(code => {
                                    const info = getLevelInfo(code);
                                    return <option key={code} value={code}>{code} — {info.label}</option>;
                                  })}
                                </optgroup>
                              )}
                            </select>
                          )}
                          {savingLeads[lead.id]?.level_code && (
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Nguồn */}
                      <td>
                        <span className={`text-sm font-semibold ${lead.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                          {lead.source_type}
                        </span>
                      </td>

                      {/* Fanpage */}
                      <td>
                        <div className="text-sm text-surface-700 dark:text-surface-300 truncate max-w-[110px]" title={lead.fanpage || ''}>
                          {lead.fanpage || '—'}
                        </div>
                      </td>

                      {/* Ngày tạo */}
                      <td className="text-sm text-surface-500 font-mono">
                        {formatDate(lead.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
              <button onClick={() => loadPool(pagination.page - 1)} disabled={pagination.page <= 1}
                className="btn-ghost text-sm disabled:opacity-30 py-1.5 px-3">← Trước</button>
              <button onClick={() => loadPool(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="btn-ghost text-sm disabled:opacity-30 py-1.5 px-3">Sau →</button>
            </div>
          )}
        </div>
      </div>

      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} centers={centers}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => { setSelectedLead(null); loadPool(pagination.page); }} />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title="Chuyển Lead sang Danh sách Lead"
        message={confirmDialog.message}
        confirmLabel="Đồng ý chuyển"
        cancelLabel="Hủy bỏ"
        variant="info"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: null })}
      />

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
                Bạn đã chọn <strong className="text-red-600">{selected.size} lead</strong> để xóa.
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
    </div>
  );
}
