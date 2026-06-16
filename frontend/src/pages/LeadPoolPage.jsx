import { useState, useEffect, useCallback, useRef } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useAuth } from '../contexts/AuthContext';
import { useSupabaseRealtime } from '../hooks/useShared';
import { fetchL0Pool, bulkAssign } from '../services/api';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineInbox, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';

export default function LeadPoolPage() {
  const { centers } = useSharedData();
  const { canViewL0, user } = useAuth();
  const isTelesale = user?.permission_group === 'telesale';
  const [pool, setPool] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [assigning, setAssigning] = useState(false);
  const [targetCenter, setTargetCenter] = useState('');
  const loadRef = useRef(null);

  const loadPool = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await fetchL0Pool({ page, limit: 100 });
      setPool(result.data);
      setPagination(result.pagination);
      setSelected(new Set());
    } catch {
      toast.error('Lỗi tải kho L0');
    } finally {
      setLoading(false);
    }
  }, []);

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
      <div className="glass-card overflow-hidden">
        {loading && pool.length > 0 && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-500/20 overflow-hidden z-10">
            <div className="h-full bg-primary-500 animate-pulse w-full" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" checked={pool.length > 0 && selected.size === pool.length}
                    onChange={toggleAll}
                    className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500" />
                </th>
                <th>Mã Lead</th><th>Họ tên</th><th>SĐT</th><th>Năm sinh con</th>
                <th>Địa chỉ</th><th>Nguồn</th><th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {loading && pool.length === 0 ? (
                <tr><td colSpan={8} className="p-0"><TableSkeleton rows={8} cols={8} /></td></tr>
              ) : pool.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={HiOutlineInbox} title="Kho L0 trống"
                    description="Chưa có lead nào ở mức L0" />
                </td></tr>
              ) : (
                pool.map((lead) => (
                  <tr key={lead.id} className={selected.has(lead.id) ? 'bg-primary-50/50 dark:bg-primary-500/5' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500" />
                    </td>
                    <td className="font-mono text-xs text-primary-600 dark:text-primary-400">{lead.lead_code}</td>
                    <td>
                      <div className="font-medium text-surface-800 dark:text-surface-100">{lead.full_name}</div>
                      {lead.child_name && (
                        <div className="text-[11px] text-surface-500 mt-0.5">Con: {lead.child_name}</div>
                      )}
                    </td>
                    <td className="font-mono text-xs text-surface-800 dark:text-surface-200">{lead.phone || '—'}</td>
                    <td className="text-sm text-surface-800 dark:text-surface-200">{lead.child_birth_year || '—'}</td>
                    <td className="text-xs text-surface-600 dark:text-surface-400 max-w-[200px] truncate">{lead.address || '—'}</td>
                    <td><span className={`text-xs font-semibold ${lead.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{lead.source_type}</span></td>
                    <td className="text-xs text-surface-500 font-mono">
                      {new Date(lead.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-surface-200 dark:border-surface-800">
            <span className="text-sm text-surface-500">
              {pagination.total} lead · Trang {pagination.page}/{pagination.totalPages}
            </span>
            <div className="flex gap-1">
              <button onClick={() => loadPool(pagination.page - 1)} disabled={pagination.page <= 1}
                className="btn-ghost text-sm disabled:opacity-30 flex items-center gap-1">
                <HiOutlineChevronLeft className="w-4 h-4" /> Trước
              </button>
              <button onClick={() => loadPool(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="btn-ghost text-sm disabled:opacity-30 flex items-center gap-1">
                Sau <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
