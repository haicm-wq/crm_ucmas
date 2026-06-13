import { useState, useEffect } from 'react';
import { fetchCentersAdmin } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineRefresh } from 'react-icons/hi';

export default function CentersTab() {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setCenters(await fetchCentersAdmin()); } catch { toast.error('Lỗi tải trung tâm'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 flex justify-between">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">13 Trung tâm</h3>
        <button onClick={load} className="btn-ghost text-xs" aria-label="Làm mới"><HiOutlineRefresh className="w-4 h-4" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table text-sm">
          <thead><tr><th>Mã</th><th>Tên</th><th>Địa chỉ</th><th>SĐT</th><th>Quản lý</th><th>Active</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8">
                <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </td></tr>
            ) : (
              centers.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs text-primary-400">{c.code}</td>
                  <td className="font-medium text-surface-800 dark:text-surface-100">{c.name}</td>
                  <td className="text-surface-600 dark:text-surface-400 text-sm max-w-[200px] truncate">{c.address || '—'}</td>
                  <td className="text-surface-600 dark:text-surface-400 text-xs">{c.phone || '—'}</td>
                  <td className="text-surface-600 dark:text-surface-400 text-sm">{c.manager_name || '—'}</td>
                  <td className="text-center">{c.is_active ? '🟢' : '🔴'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
