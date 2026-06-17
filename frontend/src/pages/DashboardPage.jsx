import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSharedData } from '../contexts/SharedDataProvider';
import { fetchDashboardAnalytics } from '../services/api';
import { CardSkeleton, ChartSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import {
  HiOutlineChartBar, HiOutlineUserGroup, HiOutlineCalendar,
  HiOutlineTrendingUp, HiOutlineRefresh, HiOutlineStar,
} from 'react-icons/hi';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const LEVEL_COLORS = {
  L0: '#6366f1', L1: '#3b82f6', L2: '#0ea5e9', L3: '#10b981',
  L4: '#f59e0b', L5: '#ef4444', L6: '#8b5cf6',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

const STAT_COLORS = {
  primary: { bg: 'bg-primary-100 dark:bg-primary-500/10', text: 'text-primary-600 dark:text-primary-400' },
  blue:    { bg: 'bg-blue-100 dark:bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400' },
  green:   { bg: 'bg-green-100 dark:bg-green-500/10',   text: 'text-green-600 dark:text-green-400' },
  yellow:  { bg: 'bg-yellow-100 dark:bg-yellow-500/10',  text: 'text-yellow-600 dark:text-yellow-400' },
};

function StatCard({ icon: Icon, label, value, color = 'primary' }) {
  const c = STAT_COLORS[color] || STAT_COLORS.primary;
  return (
    <div className="glass-card p-5 group hover:border-primary-500/30 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${c.text}`} />
        </div>
      </div>
    </div>
  );
}

function FunnelBar({ group, count, maxCount }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-surface-600 dark:text-surface-400 w-8">{group}</span>
      <div className="flex-1 h-7 bg-surface-200 dark:bg-surface-800/50 rounded-lg overflow-hidden">
        <div className="h-full rounded-lg transition-[width] duration-500 flex items-center px-2"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: LEVEL_COLORS[group] || '#6366f1' }}>
          <span className="text-[10px] font-bold text-white whitespace-nowrap">{count}</span>
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg p-3">
      <p className="text-xs font-medium text-surface-800 dark:text-surface-200">{label || payload[0]?.name}</p>
      <p className="text-sm font-bold text-primary-600 dark:text-primary-400">{payload[0]?.value}</p>
    </div>
  );
}

// Custom Premium Multi-select Dropdown
function MultiSelectDropdown({ label, options, selectedValues, onChange, disabled, placeholder = 'Tất cả' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const selectedLabels = options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => o.label);

  const displayValue = selectedLabels.length === 0 
    ? placeholder 
    : selectedLabels.length <= 2 
      ? selectedLabels.join(', ') 
      : `Đã chọn ${selectedLabels.length}`;

  return (
    <div ref={containerRef} className="relative min-w-[150px] max-w-[220px] text-sm">
      <label className="block text-xs text-surface-500 mb-1">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-surface-700 dark:text-surface-200 flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed select-field"
      >
        <span className="truncate">{displayValue}</span>
        <svg className="w-4 h-4 text-surface-400 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer select-none text-surface-700 dark:text-surface-200"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => handleToggle(option.value)}
                className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4 mr-2 border-surface-300 dark:border-surface-600"
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-surface-500 text-xs">Không có lựa chọn</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const getFirstDayOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };
  const getToday = () => new Date().toISOString().split('T')[0];

  const { user, isAdmin, isMarketing, isCenter } = useAuth();
  const { centers, products } = useSharedData();

  // Filters State
  const [from, setFrom] = useState(getFirstDayOfMonth());
  const [to, setTo] = useState(getToday());
  const [selectedCenters, setSelectedCenters] = useState(isCenter ? [user.center_id] : []);
  const [selectedProducts, setSelectedProducts] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // Force center role filter to their center_id
      const centerFilter = isCenter ? [user.center_id] : selectedCenters;

      const result = await fetchDashboardAnalytics({
        from: from ? `${from}T00:00:00Z` : null,
        to: to ? `${to}T23:59:59Z` : null,
        center_ids: centerFilter.length > 0 ? centerFilter : null,
        product_codes: selectedProducts.length > 0 ? selectedProducts : null,
      });
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu dashboard');
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedCenters, selectedProducts, isCenter, user?.center_id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleResetFilters = () => {
    setFrom(getFirstDayOfMonth());
    setTo(getToday());
    setSelectedCenters(isCenter ? [user.center_id] : []);
    setSelectedProducts([]);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <CardSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton /><ChartSkeleton />
        </div>
      </div>
    );
  }

  // View state is single center if user is center OR selected exactly one center
  const isHQ = !isCenter && (selectedCenters.length !== 1);
  const funnel = data.funnel || [];
  const maxFunnel = Math.max(...funnel.map((f) => parseInt(f.count) || 0), 1);

  // Prepare chart data
  const sourceData = (data.bySource || []).map((s) => ({
    name: s.source_type === 'PULL' ? 'Quảng cáo' : 'Giới thiệu',
    value: parseInt(s.count),
  }));

  const centerChartData = (data.byCenter || []).slice(0, 10).map((c) => ({
    name: c.center_name?.replace('Trung tâm ', ''),
    leads: parseInt(c.count),
  }));

  // Map dropdown choices
  const centerOptions = (centers || []).map((c) => ({ label: c.name, value: c.id }));
  const productOptions = (products || []).map((p) => ({ label: p.name, value: p.code }));

  const contacted = data.conversion?.contacted || 0;
  const trialed = data.conversion?.trialed || 0;
  const paid = data.conversion?.paid || 0;

  const rateL3L1 = contacted > 0 ? ((trialed / contacted) * 100).toFixed(1) : '0.0';
  const rateL4L1 = contacted > 0 ? ((paid / contacted) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100">
            {isHQ ? 'Dashboard Tổng quan' : `Dashboard ${data.center?.name || ''}`}
          </h1>
          <p className="text-sm text-surface-500">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadDashboard} className="btn-ghost" aria-label="Làm mới">
            <HiOutlineRefresh className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Premium Filter Bar */}
      <div className="glass-card p-4 flex flex-wrap items-end gap-3 bg-surface-50/50 dark:bg-surface-800/10">
        <div>
          <label className="block text-xs text-surface-500 mb-1">Từ ngày</label>
          <input 
            type="date" 
            value={from} 
            onChange={(e) => setFrom(e.target.value)}
            className="input-field py-2 text-sm" 
          />
        </div>
        <div>
          <label className="block text-xs text-surface-500 mb-1">Đến ngày</label>
          <input 
            type="date" 
            value={to} 
            onChange={(e) => setTo(e.target.value)}
            className="input-field py-2 text-sm" 
          />
        </div>

        {/* Center Multi-select (Admin/Marketing only) */}
        {(isAdmin || isMarketing) && (
          <MultiSelectDropdown
            label="Trung tâm"
            options={centerOptions}
            selectedValues={selectedCenters}
            onChange={setSelectedCenters}
            placeholder="Tất cả trung tâm"
          />
        )}

        {/* Product Multi-select */}
        <MultiSelectDropdown
          label="Sản phẩm"
          options={productOptions}
          selectedValues={selectedProducts}
          onChange={setSelectedProducts}
          placeholder="Tất cả sản phẩm"
        />

        <div className="flex gap-2">
          <button onClick={loadDashboard} className="btn-primary text-sm px-4 py-2">
            Lọc
          </button>
          <button onClick={handleResetFilters} className="btn-ghost text-sm px-3 py-2 border border-surface-200 dark:border-surface-700">
            Reset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={HiOutlineUserGroup} label="Tổng lead" value={data.total || 0} />
        <StatCard icon={HiOutlineCalendar} label="Hẹn trong kỳ"
          value={data.todayAppointments || 0} color="blue" />
        <StatCard icon={HiOutlineTrendingUp} label="Đã chốt"
          value={data.conversion?.paid || 0} color="green" />
        <div className="glass-card p-5 group hover:border-primary-500/30 transition-colors duration-200">
          <div className="flex items-start justify-between">
            <div className="space-y-1 w-full">
              <p className="text-xs text-surface-500 font-medium uppercase tracking-wider">Tỷ lệ chốt</p>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-400">Tỷ lệ L3/L1:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateL3L1}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-600 dark:text-surface-400">Tỷ lệ L4/L1:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateL4L1}%</span>
                </div>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center flex-shrink-0 ml-2">
              <HiOutlineStar className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-4 flex items-center gap-2">
            <HiOutlineChartBar className="w-4 h-4 text-primary-400" /> Phễu Lead L0→L6
          </h3>
          <div className="space-y-2">
            {funnel.map((f) => (
              <FunnelBar key={f.level_group} group={f.level_group} count={parseInt(f.count)} maxCount={maxFunnel} />
            ))}
          </div>
        </div>

        {/* Source Distribution Chart — HQ only */}
        {isHQ && sourceData.length > 0 ? (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-4">📊 Phân bố nguồn Lead</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80} paddingAngle={5} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Staff Performance — Center view */
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-4">👥 Hiệu suất nhân viên</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(data.staffPerformance || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800/30">
                  <span className="text-sm text-surface-700 dark:text-surface-300">{s.staff_name || 'Chưa gán'}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-surface-500">Tổng: {s.total_leads}</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">Chốt: {s.paid_leads}</span>
                  </div>
                </div>
              ))}
              {(data.staffPerformance || []).length === 0 && (
                <p className="text-center text-sm text-surface-500 py-8">Không có dữ liệu nhân viên</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Center Comparison BarChart — HQ only */}
      {isHQ && centerChartData.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-4">📈 So sánh Lead theo Trung tâm</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={centerChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e2e8f0)" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HQ extras: milestones */}
      {isHQ && data.recentMilestones?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-4">🎯 Milestone gần đây</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.recentMilestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface-100 dark:bg-surface-800/20">
                <span className="text-xs font-mono text-primary-600 dark:text-primary-400">{m.lead_code}</span>
                <span className="text-sm text-surface-800 dark:text-surface-200 flex-1 truncate">{m.full_name}</span>
                <span className="badge text-[10px] bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">{m.level_code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
