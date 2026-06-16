import { useState, useEffect, useCallback, useRef } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useAuth } from '../contexts/AuthContext';
import { useSupabaseRealtime } from '../hooks/useShared';
import { fetchL0Pool, bulkAssign, fetchL0UnprocessedStats, updateLead, updateLeadLevelAndProducts } from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineInbox, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import LeadDetailPanel from '../components/leads/LeadDetailPanel';
import MultiSelect from '../components/ui/MultiSelect';

export default function LeadPoolPage() {
  const { centers, allStaff } = useSharedData();
  const { canViewL0, user } = useAuth();
  const isTelesale = user?.permission_group === 'telesale';
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
  const loadRef = useRef(null);

  const isOver3Hours = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    return (now - created) > (3 * 60 * 60 * 1000); // 3 hours in milliseconds
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

  useEffect(() => {
    loadPool(1);
  }, [pageSize]);

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
      if (currentValue && !/^(?:0\d{9}|[1-9]\d{8})$/.test(currentValue)) {
        toast.error('SĐT bắt đầu bằng 0 phải đủ 10 số, không bắt đầu bằng 0 phải đủ 9 số');
        handleInputChange(leadId, field, originalValue);
        return;
      }
    }

    setSavingLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], [field]: true } }));
    try {
      const cleanVal = currentValue === '' ? null : currentValue;
      let changes = { [field]: cleanVal };
      if (field === 'child_birth_year' && cleanVal) {
        changes.child_birth_year = parseInt(cleanVal);
      }
      await updateLead(leadId, changes);
      toast.success('Đã lưu thay đổi');
      
      if (field === 'phone') {
        loadPool(pagination.page);
      }
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật');
      handleInputChange(leadId, field, originalValue);
    } finally {
      setSavingLeads(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          delete next[leadId][field];
          if (Object.keys(next[leadId]).length === 0) delete next[leadId];
        }
        return next;
      });
    }
  };

  const handleCenterChange = async (leadId, centerId) => {
    setSavingLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], assigned_center: true } }));
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
      setSavingLeads(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          delete next[leadId].assigned_center;
          if (Object.keys(next[leadId]).length === 0) delete next[leadId];
        }
        return next;
      });
    }
  };

  const handleStaffChange = async (leadId, staffId) => {
    setSavingLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], assigned_staff: true } }));
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
      setSavingLeads(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          delete next[leadId].assigned_staff;
          if (Object.keys(next[leadId]).length === 0) delete next[leadId];
        }
        return next;
      });
    }
  };

  const handleLevelChange = async (leadId, levelCode) => {
    setSavingLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], level_code: true } }));
    try {
      await updateLeadLevelAndProducts(leadId, levelCode);
      toast.success('Đã cập nhật level');
      loadPool(pagination.page);
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật level');
    } finally {
      setSavingLeads(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          delete next[leadId].level_code;
          if (Object.keys(next[leadId]).length === 0) delete next[leadId];
        }
        return next;
      });
    }
  };

  const handleProductsChange = async (leadId, selectedProds) => {
    setSavingLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], interested_products: true } }));
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
      setSavingLeads(prev => {
        const next = { ...prev };
        if (next[leadId]) {
          delete next[leadId].interested_products;
          if (Object.keys(next[leadId]).length === 0) delete next[leadId];
        }
        return next;
      });
    }
  };

  useEffect(() => { loadRef.current = loadPool; }, [loadPool]);
  useEffect(() => { loadPool(); }, [loadPool]);

  // Debounced realtime — avoids flood when bulk assigning
  useSupabaseRealtime('leads', () => {
    loadRef.current?.(pagination.page);
  }, { debounceMs: 1500, filter: 'level_group=eq.L0' });

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pool.length) setSelected(new Set());
    else setSelected(new Set(pool.map((l) => l.id)));
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

  if (!canViewL0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-surface-500">Bạn không có quyền xem kho L0.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            <HiOutlineInbox className="w-7 h-7 text-primary-400" /> Kho Lead L0
          </h1>
          <p className="text-sm text-surface-500">{pagination.total} lead chờ phân bổ</p>
        </div>
        <button onClick={() => loadPool(pagination.page)} className="btn-ghost" aria-label="Làm mới">
          <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {unprocessedStats > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-center justify-between text-red-800 dark:text-red-400 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-sm font-medium">
              Cảnh báo: Có <strong>{unprocessedStats}</strong> lead L0 vào hệ thống quá 3 tiếng chưa được xử lý!
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
          <table className="data-table" style={{ minWidth: '1700px' }}>
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" checked={pool.length > 0 && selected.size === pool.length}
                    onChange={toggleAll}
                    className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500" />
                </th>
                <th>Mã Lead</th>
                <th>Họ tên phụ huynh</th>
                <th>Tên con</th>
                <th>SĐT</th>
                <th>Năm sinh con</th>
                <th>Địa chỉ</th>
                <th>Trung tâm</th>
                <th>Sale đặt lịch</th>
                <th>Sản phẩm</th>
                <th>Level</th>
                <th>Nguồn</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {loading && pool.length === 0 ? (
                <tr><td colSpan={13} className="p-0"><TableSkeleton rows={8} cols={13} /></td></tr>
              ) : pool.length === 0 ? (
                <tr><td colSpan={13}>
                  <EmptyState icon={HiOutlineInbox} title="Kho L0 trống"
                    description="Chưa có lead nào ở mức L0" />
                </td></tr>
              ) : (
                pool.map((lead) => {
                  const unprocessed = lead.level_code === 'L0';
                  const delayed = unprocessed && isOver3Hours(lead.created_at);
                  
                  let rowClass = 'hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors duration-150 cursor-pointer';
                  if (selected.has(lead.id)) {
                    rowClass = 'bg-primary-50/50 dark:bg-primary-500/5';
                  } else if (delayed) {
                    rowClass = 'bg-red-500/5 hover:bg-red-500/10 dark:hover:bg-red-500/10';
                  } else if (unprocessed) {
                    rowClass = 'bg-amber-500/5 hover:bg-amber-500/10 dark:hover:bg-amber-500/10';
                  }

                  return (
                    <tr key={lead.id} onClick={() => setSelectedLead(lead)} className={rowClass}>
                      <td 
                        onClick={(e) => e.stopPropagation()} 
                        className={delayed ? 'border-l-2 border-l-red-500 dark:border-l-red-400' : unprocessed ? 'border-l-2 border-l-amber-500 dark:border-l-amber-400' : ''}
                      >
                        <input type="checkbox" checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500" />
                      </td>
                      <td className="font-mono text-xs text-primary-600 dark:text-primary-400">{lead.lead_code}</td>
                      
                      {/* Họ tên phụ huynh */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[180px]">
                          <input
                            type="text"
                            value={lead.full_name || ''}
                            onChange={(e) => handleInputChange(lead.id, 'full_name', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'full_name', lead.full_name, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={savingLeads[lead.id]?.full_name}
                            className="input-field py-1 px-2 text-xs w-full font-medium"
                          />
                          {delayed && !savingLeads[lead.id]?.full_name && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-850 dark:text-red-400 animate-pulse">
                              Trễ
                            </span>
                          )}
                          {unprocessed && !delayed && !savingLeads[lead.id]?.full_name && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-850 dark:text-amber-400">
                              Mới
                            </span>
                          )}
                          {savingLeads[lead.id]?.full_name && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Tên con */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[130px]">
                          <input
                            type="text"
                            value={lead.child_name || ''}
                            placeholder="Tên con..."
                            onChange={(e) => handleInputChange(lead.id, 'child_name', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'child_name', lead.child_name, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={savingLeads[lead.id]?.child_name}
                            className="input-field py-1 px-2 text-xs w-full"
                          />
                          {savingLeads[lead.id]?.child_name && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* SĐT */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[120px]">
                          <input
                            type="text"
                            value={lead.phone || ''}
                            placeholder="SĐT..."
                            onChange={(e) => handleInputChange(lead.id, 'phone', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'phone', lead.phone, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={savingLeads[lead.id]?.phone}
                            className="input-field py-1 px-2 text-xs w-full font-mono"
                          />
                          {savingLeads[lead.id]?.phone && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Năm sinh con */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[95px]">
                          <select
                            value={lead.child_birth_year || ''}
                            onChange={(e) => handleInputBlur(lead.id, 'child_birth_year', lead.child_birth_year, e.target.value)}
                            disabled={savingLeads[lead.id]?.child_birth_year}
                            className="select-field py-1 px-2 text-xs w-full"
                          >
                            <option value="">— Năm sinh —</option>
                            {Array.from({ length: 21 }, (_, i) => 2010 + i).map(year => (
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
                        <div className="relative flex items-center min-w-[170px]">
                          <input
                            type="text"
                            value={lead.address || ''}
                            placeholder="Địa chỉ..."
                            onChange={(e) => handleInputChange(lead.id, 'address', e.target.value)}
                            onBlur={(e) => handleInputBlur(lead.id, 'address', lead.address, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            disabled={savingLeads[lead.id]?.address}
                            className="input-field py-1 px-2 text-xs w-full"
                          />
                          {savingLeads[lead.id]?.address && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Trung tâm */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[140px]">
                          <select
                            value={lead.assigned_center || ''}
                            onChange={(e) => handleCenterChange(lead.id, e.target.value)}
                            disabled={savingLeads[lead.id]?.assigned_center}
                            className="select-field py-1 px-2 text-xs w-full"
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
                        <div className="relative flex items-center min-w-[140px]">
                          <select
                            value={lead.assigned_staff || ''}
                            onChange={(e) => handleStaffChange(lead.id, e.target.value)}
                            disabled={savingLeads[lead.id]?.assigned_staff}
                            className="select-field py-1 px-2 text-xs w-full"
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

                      {/* Sản phẩm quan tâm */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[140px]">
                          <MultiSelect
                            options={['UCMAS', 'UCKID', 'ROBOT', 'TRẠI HÈ'].map(p => ({ value: p, label: p }))}
                            selected={lead.interested_products || []}
                            onChange={(vals) => handleProductsChange(lead.id, vals)}
                            placeholder="Chọn..."
                            className="w-full text-xs text-left"
                            searchable={false}
                          />
                          {savingLeads[lead.id]?.interested_products && (
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Level */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center min-w-[130px]">
                          <select
                            value={lead.level_code || 'L0'}
                            onChange={(e) => handleLevelChange(lead.id, e.target.value)}
                            disabled={savingLeads[lead.id]?.level_code}
                            className="select-field py-1 px-2 text-xs w-full font-semibold"
                          >
                            <option value="L0">L0 — Data đầu vào</option>
                            <option value="L1.KK">L1 Kho kiểm</option>
                            <option value="L0.R">Số rác</option>
                            <option value="L0.K">Khu vực khác</option>
                          </select>
                          {savingLeads[lead.id]?.level_code && (
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                          )}
                        </div>
                      </td>

                      {/* Nguồn */}
                      <td>
                        <span className={`text-xs font-semibold ${lead.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                          {lead.source_type}
                        </span>
                      </td>

                      {/* Ngày tạo */}
                      <td className="text-xs text-surface-500 font-mono">
                        {new Date(lead.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })}
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
              {[10, 20, 50, 100, 200].map((size) => (
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
    </div>
  );
}
