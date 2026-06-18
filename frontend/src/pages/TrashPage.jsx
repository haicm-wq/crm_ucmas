import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchTrashLeads, restoreLeads, purgeTrash } from '../services/api';
import { formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import {
  HiOutlineTrash, HiOutlineRefresh, HiOutlineSearch,
  HiOutlineExclamation, HiOutlineCheckCircle,
} from 'react-icons/hi';

export default function TrashPage() {
  const { isAdmin } = useAuth();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);

  const LIMIT = 50;

  const loadTrash = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const result = await fetchTrashLeads({ page, limit: LIMIT, search });
      setLeads(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error('Lỗi tải dữ liệu thùng rác: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, search]);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const toggleSelect = (id) => {
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

  const handleRestore = async () => {
    if (selectedIds.size === 0) return;
    setRestoring(true);
    try {
      const result = await restoreLeads([...selectedIds]);
      toast.success(`Đã khôi phục ${result?.restored || selectedIds.size} lead!`);
      loadTrash();
    } catch (err) {
      toast.error('Lỗi khôi phục: ' + err.message);
    } finally {
      setRestoring(false);
    }
  };

  const handlePurge = async () => {
    if (purgeInput !== 'XÓA TOÀN BỘ') {
      toast.error('Vui lòng nhập đúng "XÓA TOÀN BỘ" để xác nhận');
      return;
    }
    setPurging(true);
    try {
      const result = await purgeTrash();
      toast.success(`Đã xóa vĩnh viễn ${result?.purged || 0} lead khỏi hệ thống!`);
      setShowPurgeConfirm(false);
      setPurgeInput('');
      loadTrash();
    } catch (err) {
      toast.error('Lỗi dọn sạch: ' + err.message);
    } finally {
      setPurging(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="glass-card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-lg font-bold text-surface-800 dark:text-surface-100">Không có quyền truy cập</h2>
          <p className="text-sm text-surface-500 mt-2">Chỉ Admin mới có thể truy cập Thùng rác.</p>
        </div>
      </div>
    );
  }

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            <HiOutlineTrash className="w-7 h-7 text-red-500" />
            Thùng rác
          </h1>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
            {total} lead đang trong thùng rác · Dọn sạch để xóa vĩnh viễn khỏi hệ thống
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {someSelected && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="btn-primary text-sm flex items-center gap-1.5 py-2 px-4 disabled:opacity-60"
            >
              <HiOutlineCheckCircle className="w-4 h-4" />
              {restoring ? 'Đang khôi phục...' : `Khôi phục (${selectedIds.size})`}
            </button>
          )}
          {total > 0 && (
            <button
              onClick={() => { setShowPurgeConfirm(true); setPurgeInput(''); }}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-1.5 py-2 px-4 rounded-xl transition-colors disabled:opacity-60"
              disabled={purging}
            >
              <HiOutlineTrash className="w-4 h-4" />
              Dọn sạch thùng rác
            </button>
          )}
          <button onClick={loadTrash} className="btn-ghost p-2" title="Làm mới">
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên, SĐT, mã Lead..."
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
        <button type="submit" className="btn-secondary text-sm px-4 py-2">Tìm</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
            className="btn-ghost text-sm px-3 py-2">Xóa lọc</button>
        )}
      </form>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-surface-500">
            <HiOutlineTrash className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Thùng rác trống</p>
            <p className="text-xs mt-1">Không có lead nào trong thùng rác</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-surface-300 dark:border-surface-600 text-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Mã Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Họ tên</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">SĐT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Level</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Trung tâm</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Người xóa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Ngày xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => toggleSelect(lead.id)}
                    className={`cursor-pointer transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50 ${
                      selectedIds.has(lead.id) ? 'bg-primary-50 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-surface-300 dark:border-surface-600 text-primary-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-primary-600 dark:text-primary-400 font-bold">{lead.lead_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-surface-800 dark:text-surface-200">{lead.full_name}</span>
                      {lead.child_birth_year && (
                        <span className="text-xs text-surface-500 ml-1">({lead.child_birth_year})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-surface-600 dark:text-surface-400 font-mono text-xs">{lead.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">
                        {lead.level_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-surface-600 dark:text-surface-400 text-xs">{lead.center_name || '—'}</td>
                    <td className="px-4 py-3 text-surface-600 dark:text-surface-400 text-xs">{lead.deleted_by_name || '—'}</td>
                    <td className="px-4 py-3 text-surface-500 text-xs">{formatDate(lead.deleted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-surface-500">
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} lead
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-ghost px-3 py-1 text-sm disabled:opacity-40">‹ Trước</button>
            <span className="px-3 py-1 text-surface-600 dark:text-surface-400">Trang {page}/{totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-ghost px-3 py-1 text-sm disabled:opacity-40">Sau ›</button>
          </div>
        </div>
      )}

      {/* Purge Confirmation Modal */}
      {showPurgeConfirm && (
        <div className="modal-overlay" onClick={() => setShowPurgeConfirm(false)}>
          <div className="bg-white dark:bg-surface-900 border border-red-200 dark:border-red-800/50 rounded-2xl shadow-xl w-full max-w-md mx-4 animate-slide-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <HiOutlineExclamation className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-surface-800 dark:text-surface-100">Xóa vĩnh viễn thùng rác</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">Hành động này không thể hoàn tác!</p>
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl mb-4">
                <p className="text-sm text-surface-700 dark:text-surface-300">
                  Bạn sắp xóa vĩnh viễn <strong className="text-red-600 dark:text-red-400">{total} lead</strong> khỏi hệ thống.
                  Tất cả lịch sử, ghi chú, và dữ liệu liên quan sẽ bị xóa hoàn toàn và <strong>không thể khôi phục</strong>.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  Nhập <span className="font-mono font-bold text-red-600 dark:text-red-400">XÓA TOÀN BỘ</span> để xác nhận:
                </label>
                <input
                  type="text"
                  value={purgeInput}
                  onChange={(e) => setPurgeInput(e.target.value)}
                  placeholder="XÓA TOÀN BỘ"
                  className="input-field py-2 text-sm w-full font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handlePurge}
                  disabled={purgeInput !== 'XÓA TOÀN BỘ' || purging}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-900 text-white text-sm font-medium py-2.5 px-4 rounded-xl transition-colors disabled:cursor-not-allowed"
                >
                  {purging ? 'Đang xóa...' : '🗑️ Xóa vĩnh viễn tất cả'}
                </button>
                <button
                  onClick={() => { setShowPurgeConfirm(false); setPurgeInput(''); }}
                  className="btn-secondary text-sm px-4 py-2.5"
                >
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
