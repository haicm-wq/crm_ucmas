import { useState, useEffect, useRef, useCallback } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import {
  fetchReportFunnel, fetchReportCenterConversion, fetchReportSalePerformance,
  fetchReportCenterComparison, fetchReportSourceCampaign, fetchReportTimeInStage,
} from '../services/api';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import { HiOutlineDocumentReport, HiOutlineRefresh } from 'react-icons/hi';

const TABS = [
  { id: 'funnel', label: 'Phễu L0→L6' },
  { id: 'center_conv', label: 'Tỷ lệ chốt' },
  { id: 'sale_perf', label: 'Hiệu suất Sale' },
  { id: 'center_cmp', label: 'So sánh TT' },
  { id: 'source', label: 'Nguồn / QC' },
  { id: 'time', label: 'Tốc độ chuyển đổi' },
];

export default function ReportsPage() {
  const { centers } = useSharedData();
  const [tab, setTab] = useState('funnel');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', center_id: '' });
  // Cache report results per tab — avoids refetch when switching tabs
  const cacheRef = useRef({});

  const loadReport = useCallback(async (forceRefresh = false) => {
    // Use cache if available and not forced
    const cacheKey = `${tab}_${JSON.stringify(filters)}`;
    if (!forceRefresh && cacheRef.current[cacheKey]) {
      setData(cacheRef.current[cacheKey]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setData(null);
    try {
      let result;
      switch (tab) {
        case 'funnel': result = await fetchReportFunnel(filters); break;
        case 'center_conv': result = await fetchReportCenterConversion(); break;
        case 'sale_perf': result = await fetchReportSalePerformance(); break;
        case 'center_cmp': result = await fetchReportCenterComparison(); break;
        case 'source': result = await fetchReportSourceCampaign(); break;
        case 'time': result = await fetchReportTimeInStage(filters.center_id || null); break;
        default: result = null;
      }
      setData(result);
      cacheRef.current[cacheKey] = result;
    } catch (err) {
      console.error('Error loading report:', err);
      toast.error(err.message || 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  }, [tab, filters]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const renderTable = (cols, rows) => {
    const rowList = Array.isArray(rows) ? rows : [];
    return (
      <div className="overflow-x-auto">
        <table className="data-table text-sm">
          <thead>
            <tr>{cols.map((c) => (<th key={c.key}>{c.label}</th>))}</tr>
          </thead>
          <tbody>
            {rowList.map((row, i) => (
              <tr key={i}>{cols.map((c) => (<td key={c.key} className={c.className || ''}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>))}</tr>
            ))}
            {rowList.length === 0 && (
              <tr><td colSpan={cols.length} className="text-center py-8 text-surface-500">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
          <HiOutlineDocumentReport className="w-7 h-7 text-primary-400" /> Báo cáo
        </h1>
        <button onClick={() => loadReport(true)} className="btn-ghost" aria-label="Làm mới">
          <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="glass-card p-1 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
              tab === t.id ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400' : 'text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters for funnel/time */}
      {(tab === 'funnel' || tab === 'time') && (
        <div className="glass-card p-4 flex flex-wrap items-end gap-3">
          {tab === 'funnel' && (
            <>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Từ ngày</label>
                <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="input-field py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Đến ngày</label>
                <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="input-field py-2 text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-surface-500 mb-1">Trung tâm</label>
            <select value={filters.center_id} onChange={(e) => setFilters({ ...filters, center_id: e.target.value })}
              className="select-field py-2 text-sm">
              <option value="">Tất cả</option>
              {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <button onClick={loadReport} className="btn-primary text-sm">Xem</button>
        </div>
      )}

      {/* Content */}
      <div className="glass-card p-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'funnel' && data && (
              <div className="space-y-6">
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Phễu chuyển đổi</h3>
                {renderTable([
                  { key: 'level_group', label: 'Level' },
                  { key: 'count', label: 'Số lead', className: 'text-right font-semibold text-primary-600 dark:text-primary-400' },
                ], data.funnel)}
                {data.conversion && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'L0 tổng', value: data.conversion.total_l0 },
                      { label: 'Đạt L1', value: data.conversion.reached_l1 },
                      { label: 'Đã hẹn', value: data.conversion.booked },
                      { label: 'Đã chốt L4', value: data.conversion.reached_l4 },
                    ].map((s) => (
                      <div key={s.label} className="p-3 bg-surface-100 dark:bg-surface-800/30 rounded-xl text-center">
                        <p className="text-[10px] text-surface-500 uppercase">{s.label}</p>
                        <p className="text-xl font-bold text-surface-800 dark:text-surface-100 mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'center_conv' && renderTable([
              { key: 'trung_tam', label: 'Trung tâm' },
              { key: 'nhan_ban_giao', label: 'Nhận BG', className: 'text-right' },
              { key: 'da_hoc_thu', label: 'Đã học thử', className: 'text-right' },
              { key: 'da_dong_phi', label: 'Đã đóng phí', className: 'text-right text-green-600 dark:text-green-400 font-semibold' },
              { key: 'ty_le_chot_pct', label: 'Tỷ lệ %', className: 'text-right font-bold text-primary-600 dark:text-primary-400',
                render: (r) => r.ty_le_chot_pct != null ? `${r.ty_le_chot_pct}%` : '—' },
            ], data)}

            {tab === 'sale_perf' && renderTable([
              { key: 'sale_name', label: 'Nhân viên' },
              { key: 'total_leads', label: 'Tổng lead', className: 'text-right' },
              { key: 'booked', label: 'Đã hẹn', className: 'text-right' },
              { key: 'converted', label: 'Đã chốt', className: 'text-right text-green-600 dark:text-green-400 font-semibold' },
            ], data)}

            {tab === 'center_cmp' && renderTable([
              { key: 'center_name', label: 'Trung tâm' },
              { key: 'total', label: 'Tổng', className: 'text-right' },
              { key: 'trialed', label: 'Học thử', className: 'text-right' },
              { key: 'paid', label: 'Đóng phí', className: 'text-right text-green-600 dark:text-green-400 font-semibold' },
              { key: 'conversion_pct', label: '%', className: 'text-right font-bold text-primary-600 dark:text-primary-400',
                render: (r) => r.conversion_pct != null ? `${r.conversion_pct}%` : '—' },
            ], data)}

            {tab === 'source' && renderTable([
              { key: 'source_type', label: 'Nguồn', render: (r) => (
                <span className={`font-medium ${r.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{r.source_type}</span>
              )},
              { key: 'ad_campaign', label: 'Chiến dịch' },
              { key: 'count', label: 'Số lead', className: 'text-right' },
              { key: 'converted', label: 'Chốt', className: 'text-right text-green-600 dark:text-green-400 font-semibold' },
            ], data)}

            {tab === 'time' && data && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'L0 → L1', value: data.gio_l0_l1 },
                  { label: 'L1 → L2', value: data.gio_l1_l2 },
                  { label: 'L2 → Hẹn', value: data.gio_l2_hen },
                  { label: 'Hẹn → Học thử', value: data.gio_hen_hocthu },
                  { label: 'Học thử → Đóng phí', value: data.gio_hocthu_dongphi },
                ].map((s) => (
                  <div key={s.label} className="p-4 bg-surface-100 dark:bg-surface-800/30 rounded-xl text-center">
                    <p className="text-xs text-surface-500">{s.label}</p>
                    <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{s.value ?? '—'}</p>
                    <p className="text-[10px] text-surface-500 mt-1">giờ (TB)</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
