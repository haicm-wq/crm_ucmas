import { useState, useEffect, useRef, useCallback } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchReportFunnel, fetchReportCenterConversion, fetchReportSalePerformance,
  fetchReportCenterComparison, fetchReportSourceCampaign, fetchReportTimeInStage,
  fetchReportBookingSalePerformance, fetchReportProductAnalytics,
} from '../services/api';
import { TableSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import { HiOutlineDocumentReport, HiOutlineRefresh } from 'react-icons/hi';

const TABS = [
  { id: 'funnel', label: 'Phễu L0→L6' },
  { id: 'center_conv', label: 'Tỷ lệ chốt' },
  { id: 'sale_perf', label: 'Hiệu suất Sale' },
  { id: 'booking_sale_perf', label: 'Sale đặt lịch' },
  { id: 'ucmas_report', label: 'Báo cáo UCMAS' },
  { id: 'uckid_report', label: 'Báo cáo UCKID' },
  { id: 'center_cmp', label: 'So sánh TT' },
  { id: 'source', label: 'Nguồn / QC' },
  { id: 'time', label: 'Tốc độ chuyển đổi' },
];

export default function ReportsPage() {
  const { centers } = useSharedData();
  const { user, isCenter, isTelesale, isLeadTelesale, isAdmin } = useAuth();
  
  const getFirstDayOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };
  const getToday = () => new Date().toISOString().split('T')[0];

  const filteredTabs = TABS.filter((t) => {
    if (isCenter) {
      return ['funnel', 'ucmas_report', 'uckid_report'].includes(t.id);
    }
    if (isTelesale || isLeadTelesale) {
      return ['booking_sale_perf', 'funnel', 'ucmas_report', 'uckid_report', 'time'].includes(t.id);
    }
    return true; // Admin/Marketing sees all
  });

  const [tab, setTab] = useState(filteredTabs[0]?.id || 'funnel');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ 
    from: getFirstDayOfMonth(), 
    to: getToday(), 
    center_id: isCenter ? (user?.center_id || '') : '',
    source_type: isCenter ? 'PULL' : '',  // Trung tâm mặc định xem PULL
  });

  // Sync center_id if user center_id loads later
  useEffect(() => {
    if (isCenter && user?.center_id && filters.center_id !== user.center_id) {
      setFilters((prev) => ({ ...prev, center_id: user.center_id }));
    }
  }, [isCenter, user, filters.center_id]);

  // Adjust active tab if it's not allowed for the current role
  useEffect(() => {
    if (filteredTabs.length > 0 && !filteredTabs.some((t) => t.id === tab)) {
      setTab(filteredTabs[0].id);
    }
  }, [filteredTabs, tab]);
  
  // Cache report results per tab — avoids refetch when switching tabs
  const cacheRef = useRef({});

  const loadReport = useCallback(async (forceRefresh = false) => {
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
      const apiFilters = {
        from: filters.from ? `${filters.from}T00:00:00Z` : null,
        to: filters.to ? `${filters.to}T23:59:59Z` : null,
        center_id: filters.center_id || null,
      };

      switch (tab) {
        case 'funnel': 
          result = await fetchReportFunnel({ ...apiFilters, source_type: filters.source_type || null }); 
          break;
        case 'center_conv': 
          result = await fetchReportCenterConversion(); 
          break;
        case 'sale_perf': 
          result = await fetchReportSalePerformance(); 
          break;
        case 'booking_sale_perf': 
          result = await fetchReportBookingSalePerformance(apiFilters); 
          break;
        case 'ucmas_report': 
          result = await fetchReportProductAnalytics({ ...apiFilters, product_code: 'UCMAS' }); 
          break;
        case 'uckid_report': 
          result = await fetchReportProductAnalytics({ ...apiFilters, product_code: 'UCKID' }); 
          break;
        case 'center_cmp': 
          result = await fetchReportCenterComparison(); 
          break;
        case 'source': 
          result = await fetchReportSourceCampaign(); 
          break;
        case 'time': 
          result = await fetchReportTimeInStage(filters.center_id || null); 
          break;
        default: 
          result = null;
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
      <div className="overflow-x-auto max-w-6xl w-full">
        <table className="data-table text-sm max-w-6xl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th 
                  key={c.key} 
                  className={c.headerClassName || ''} 
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowList.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td 
                    key={c.key} 
                    className={c.className || ''} 
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {rowList.length === 0 && (
              <tr><td colSpan={cols.length} className="text-center py-8 text-surface-500">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const showFilterBar = tab === 'funnel' || tab === 'time' || tab === 'booking_sale_perf' || tab === 'ucmas_report' || tab === 'uckid_report';
  const showDateFilters = tab === 'funnel' || tab === 'booking_sale_perf' || tab === 'ucmas_report' || tab === 'uckid_report';

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
        {filteredTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
              tab === t.id ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400' : 'text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      {showFilterBar && (
        <div className="glass-card p-4 flex flex-wrap items-end gap-3 bg-surface-50/50 dark:bg-surface-800/10">
          {showDateFilters && (
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
            <select 
              value={filters.center_id} 
              disabled={isCenter}
              onChange={(e) => setFilters({ ...filters, center_id: e.target.value })}
              className="select-field py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {!isCenter && <option value="">Tất cả</option>}
              {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>

          {/* Bộ lọc nguồn — chỉ hiện cho Trung tâm khi xem Phiếu */}
          {isCenter && tab === 'funnel' && (
            <div>
              <label className="block text-xs text-surface-500 mb-1">Nguồn lead</label>
              <select
                value={filters.source_type}
                onChange={(e) => setFilters({ ...filters, source_type: e.target.value })}
                className="select-field py-2 text-sm"
              >
                <option value="PULL">Chỉ nguồn PULL (Quảng cáo)</option>
                <option value="PUSH">Chỉ nguồn PUSH (Giới thiệu)</option>
                <option value="">Tất cả (PULL + PUSH)</option>
              </select>
            </div>
          )}

          <button onClick={() => loadReport(true)} className="btn-primary text-sm px-4 py-2">Xem</button>
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
                  { key: 'count', label: 'Số lead', className: 'text-right font-semibold text-primary-600 dark:text-primary-400', headerClassName: 'text-right' },
                ], data.funnel)}
                {data.conversion && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl">
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
              { key: 'nhan_ban_giao', label: 'Nhận BG', className: 'text-right', headerClassName: 'text-right' },
              { key: 'da_hoc_thu', label: 'Đã học thử', className: 'text-right', headerClassName: 'text-right' },
              { key: 'da_dong_phi', label: 'Đã đóng phí', className: 'text-right text-green-600 dark:text-green-400 font-semibold', headerClassName: 'text-right' },
              { key: 'ty_le_chot_pct', label: 'Tỷ lệ %', className: 'text-right font-bold text-primary-600 dark:text-primary-400', headerClassName: 'text-right',
                render: (r) => r.ty_le_chot_pct != null ? `${r.ty_le_chot_pct}%` : '—' },
            ], data)}

            {tab === 'sale_perf' && renderTable([
              { key: 'sale_name', label: 'Nhân viên' },
              { key: 'total_leads', label: 'Tổng lead', className: 'text-right', headerClassName: 'text-right' },
              { key: 'booked', label: 'Đã hẹn', className: 'text-right', headerClassName: 'text-right' },
              { key: 'converted', label: 'Đã chốt', className: 'text-right text-green-600 dark:text-green-400 font-semibold', headerClassName: 'text-right' },
            ], data)}

            {tab === 'booking_sale_perf' && renderTable([
              { key: 'sale_name', label: 'Nhân viên Sale', width: '20%' },
              { key: 'l0_count', label: 'Nhận L0', className: 'text-center font-mono', headerClassName: 'text-center', width: '8%' },
              { key: 'l1_count', label: 'Đạt L1', className: 'text-center font-mono', headerClassName: 'text-center', width: '8%' },
              { key: 'l2_booked_count', label: 'Lịch hẹn (L2.2B)', className: 'text-center text-blue-600 dark:text-blue-400 font-semibold font-mono', headerClassName: 'text-center', width: '12%' },
              { key: 'l3_attended_count', label: 'Đến test (L3.1)', className: 'text-center font-mono', headerClassName: 'text-center', width: '12%' },
              { key: 'l3_total_count', label: 'Mốc L3 tổng', className: 'text-center font-mono', headerClassName: 'text-center', width: '12%' },
              { key: 'l1_l0_rate', label: 'Tỷ lệ L1/L0', className: 'text-center font-bold text-amber-600 dark:text-amber-400', headerClassName: 'text-center', width: '9%',
                render: (r) => r.l1_l0_rate != null ? `${r.l1_l0_rate}%` : '—' },
              { key: 'l2_l1_rate', label: 'Tỷ lệ L2.2B/L1', className: 'text-center font-bold text-primary-600 dark:text-primary-400', headerClassName: 'text-center', width: '10%',
                render: (r) => r.l2_l1_rate != null ? `${r.l2_l1_rate}%` : '—' },
              { key: 'l3_l1_rate', label: 'Tỷ lệ L3/L1', className: 'text-center font-bold text-green-600 dark:text-green-400', headerClassName: 'text-center', width: '9%',
                render: (r) => r.l3_l1_rate != null ? `${r.l3_l1_rate}%` : '—' },
            ], data)}

            {(tab === 'ucmas_report' || tab === 'uckid_report') && data && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-surface-850 dark:text-surface-200 mb-3">
                    Phễu chuyển đổi rút gọn (L1 → L4)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 max-w-6xl">
                    {(data.funnel || []).map((item) => (
                      <div key={item.level} className="p-3 bg-surface-100 dark:bg-surface-800/30 rounded-xl text-center border border-surface-200/50 dark:border-surface-700/50">
                        <p className="text-[10px] text-surface-500 uppercase font-semibold tracking-wider">Mốc {item.level}</p>
                        <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">{item.count}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-surface-200 dark:border-surface-700 pt-6">
                  <h3 className="text-sm font-semibold text-surface-850 dark:text-surface-200 mb-3">
                    Thống kê chi tiết trạng thái
                  </h3>
                  {renderTable([
                    { key: 'level_code', label: 'Mã Level', className: 'font-mono' },
                    { key: 'label', label: 'Tên trạng thái' },
                    { key: 'count', label: 'Số lượng chuyển dịch', className: 'text-right font-semibold text-primary-600 dark:text-primary-400', headerClassName: 'text-right',
                      render: (r) => (
                        <span style={{ color: r.color }} className="font-semibold">{r.count}</span>
                      )
                    },
                  ], data.details)}
                </div>
              </div>
            )}

            {tab === 'center_cmp' && renderTable([
              { key: 'center_name', label: 'Trung tâm' },
              { key: 'total', label: 'Tổng', className: 'text-right', headerClassName: 'text-right' },
              { key: 'trialed', label: 'Học thử', className: 'text-right', headerClassName: 'text-right' },
              { key: 'paid', label: 'Đóng phí', className: 'text-right text-green-600 dark:text-green-400 font-semibold', headerClassName: 'text-right' },
              { key: 'conversion_pct', label: '%', className: 'text-right font-bold text-primary-600 dark:text-primary-400', headerClassName: 'text-right',
                render: (r) => r.conversion_pct != null ? `${r.conversion_pct}%` : '—' },
            ], data)}

            {tab === 'source' && renderTable([
              { key: 'source_type', label: 'Nguồn', render: (r) => (
                <span className={`font-medium ${r.source_type === 'PULL' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{r.source_type}</span>
              )},
              { key: 'ad_campaign', label: 'Chiến dịch' },
              { key: 'count', label: 'Số lead', className: 'text-right', headerClassName: 'text-right' },
              { key: 'converted', label: 'Chốt', className: 'text-right text-green-600 dark:text-green-400 font-semibold', headerClassName: 'text-right' },
            ], data)}

            {tab === 'time' && data && (() => {
              const showKKMetrics = isAdmin || isTelesale || isLeadTelesale;
              const items = [
                ...(showKKMetrics ? [
                  { label: 'Chăm sóc lần đầu L1 Kho kiểm', value: data.l1_kk_first_process },
                  { label: 'L1 Kho kiểm → L1', value: data.l1_kk_to_l1 },
                ] : []),
                { label: 'L1 → L2.2B', value: data.l1_to_l2_2b },
                { label: 'L1 → L3', value: data.l1_to_l3 },
                { label: 'L1 → L4', value: data.l1_to_l4 },
              ];

              return (
                <div className={`grid grid-cols-2 md:grid-cols-${items.length} gap-4 max-w-6xl`}>
                  {items.map((s) => (
                    <div key={s.label} className="p-4 bg-surface-100 dark:bg-surface-800/30 rounded-xl text-center border border-surface-200/50 dark:border-surface-700/50">
                      <p className="text-xs text-surface-500 font-medium">{s.label}</p>
                      <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{s.value ?? '—'}</p>
                      <p className="text-[10px] text-surface-500 mt-1">giờ (TB)</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
