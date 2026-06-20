import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSharedData } from '../contexts/SharedDataProvider';
import { fetchDashboardAnalytics } from '../services/api';
import { supabase } from '../lib/supabase';
import { formatDateYmd } from '../utils/format';

import { CardSkeleton, ChartSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import {
  HiOutlineChartBar, HiOutlineUserGroup, HiOutlineCalendar,
  HiOutlineTrendingUp, HiOutlineRefresh, HiOutlineStar, HiOutlineInbox,
} from 'react-icons/hi';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const LEVEL_COLORS = {
  L0: '#6366f1', 'L1.KK': '#6366f1', L1: '#3b82f6', L2: '#0ea5e9', L3: '#10b981',
  L4: '#f59e0b', L5: '#ef4444', L6: '#8b5cf6',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

const STAT_COLORS = {
  primary: { bg: 'bg-primary-100 dark:bg-primary-500/10', text: 'text-primary-600 dark:text-primary-400' },
  blue:    { bg: 'bg-blue-100 dark:bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400' },
  green:   { bg: 'bg-green-100 dark:bg-green-500/10',   text: 'text-green-600 dark:text-green-400' },
  yellow:  { bg: 'bg-yellow-100 dark:bg-yellow-500/10',  text: 'text-yellow-600 dark:text-yellow-400' },
};

function StatCard({ icon: Icon, label, value, color = 'primary', children }) {
  const c = STAT_COLORS[color] || STAT_COLORS.primary;
  return (
    <div className="glass-card p-5 group hover:border-primary-500/30 transition-colors duration-200 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-surface-500 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-6 h-6 ${c.text}`} />
        </div>
      </div>
      {children}
    </div>
  );
}

function FunnelBar({ group, count, maxCount, onClick }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-3 cursor-pointer group" onClick={onClick}>
      <span className="text-xs font-mono text-surface-600 dark:text-surface-400 w-8 group-hover:text-primary-500 transition-colors">{group}</span>
      <div className="flex-1 h-7 bg-surface-200 dark:bg-surface-800/50 rounded-lg overflow-hidden group-hover:ring-1 group-hover:ring-primary-500/50 transition-all">
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
function MultiSelectDropdown({ label, options, selectedValues, onChange, disabled, placeholder = 'Tất cả', className = "min-w-[150px] max-w-[220px]" }) {
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
    <div ref={containerRef} className={`relative text-sm ${className}`}>
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
  const navigate = useNavigate();
  const getFirstDayOfMonth = () => {
    return formatDateYmd(new Date(new Date().setDate(1)));
  };
  const getToday = () => formatDateYmd(new Date());

  const { user, isAdmin, isMarketing, isCenter, isTelesale, isLeadTelesale } = useAuth();

  const handleLevelClick = (code) => {
    const l0Levels = ['L1.KK', 'L0.R', 'L0.K'];
    if (l0Levels.includes(code)) {
      navigate(`/kho-l1-kho-kiem?level_code=${code}`);
    } else {
      navigate(`/leads?level_code=${code}`);
    }
  };
  const { centers, products, productLevels, subSources } = useSharedData();

  // Filters State
  const [from, setFrom] = useState(getFirstDayOfMonth());
  const [to, setTo] = useState(getToday());
  const [selectedCenters, setSelectedCenters] = useState(isCenter ? [user.center_id] : []);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedSourceType, setSelectedSourceType] = useState(isCenter ? 'PULL' : ''); // Center mặc định xem PULL
  const [selectedSubSource, setSelectedSubSource] = useState('');

  const [activeFilters, setActiveFilters] = useState({
    from: getFirstDayOfMonth(),
    to: getToday(),
    selectedCenters: isCenter ? [user.center_id] : [],
    selectedProducts: [],
    sourceType: isCenter ? 'PULL' : '',
    subSource: '',
  });

  const filteredSubSources = useMemo(() => {
    const list = subSources || [];
    if (!selectedSourceType) return list.filter((s) => s.is_active);
    return list.filter((s) => s.source_type === selectedSourceType && s.is_active);
  }, [subSources, selectedSourceType]);

  useEffect(() => {
    if (selectedSubSource && !filteredSubSources.some((s) => s.name === selectedSubSource)) {
      setSelectedSubSource('');
    }
  }, [selectedSourceType, filteredSubSources, selectedSubSource]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countL0, setCountL0] = useState(0);
  const [countPending, setCountPending] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // Force center role filter to their center_id
      const centerFilter = isCenter ? [user.center_id] : activeFilters.selectedCenters;

      const result = await fetchDashboardAnalytics({
        from: activeFilters.from ? `${activeFilters.from}T00:00:00+07:00` : null,
        to: activeFilters.to ? `${activeFilters.to}T23:59:59+07:00` : null,
        center_ids: centerFilter.length > 0 ? centerFilter : null,
        product_codes: activeFilters.selectedProducts.length > 0 ? activeFilters.selectedProducts : null,
        source_type: activeFilters.sourceType || null,
        sub_source: activeFilters.subSource || null,
      });
      setData(result);

      // Custom queries for telesale role
      if (isTelesale && !isLeadTelesale) {
        // Query L1.KK leads assigned to this telesale
        let queryL0 = supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('level_code', 'L1.KK')
          .eq('assigned_staff', user.id);

        if (activeFilters.from) queryL0 = queryL0.gte('created_at', `${activeFilters.from}T00:00:00+07:00`);
        if (activeFilters.to) queryL0 = queryL0.lte('created_at', `${activeFilters.to}T23:59:59+07:00`);

        const { count: l0Count, error: l0Err } = await queryL0;
        if (!l0Err) setCountL0(l0Count || 0);

        // Query pending appointment reminders
        let queryPending = supabase
          .from('v_trial_appointments')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_staff', user.id)
          .eq('appt_status', 'scheduled')
          .or('sale_remind_status.is.null,sale_remind_status.neq.reminded');

        if (activeFilters.from) queryPending = queryPending.gte('trial_appointment_at', `${activeFilters.from}T00:00:00+07:00`);
        if (activeFilters.to) queryPending = queryPending.lte('trial_appointment_at', `${activeFilters.to}T23:59:59+07:00`);

        const { count: pendingCount, error: pendingErr } = await queryPending;
        if (!pendingErr) setCountPending(pendingCount || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu dashboard');
    } finally {
      setLoading(false);
    }
  }, [activeFilters, isCenter, user?.center_id, isTelesale, isLeadTelesale, user?.id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleApplyFilters = () => {
    setActiveFilters({
      from,
      to,
      selectedCenters,
      selectedProducts,
      sourceType: selectedSourceType,
      subSource: selectedSubSource,
    });
  };

  const handleResetFilters = () => {
    const defaultFrom = getFirstDayOfMonth();
    const defaultTo = getToday();
    const defaultCenters = isCenter ? [user.center_id] : [];
    const defaultProducts = [];
    const defaultSource = isCenter ? 'PULL' : '';
    const defaultSubSource = '';

    setFrom(defaultFrom);
    setTo(defaultTo);
    setSelectedCenters(defaultCenters);
    setSelectedProducts(defaultProducts);
    setSelectedSourceType(defaultSource);
    setSelectedSubSource(defaultSubSource);

    setActiveFilters({
      from: defaultFrom,
      to: defaultTo,
      selectedCenters: defaultCenters,
      selectedProducts: defaultProducts,
      sourceType: defaultSource,
      subSource: defaultSubSource,
    });
  };

  const contacted = data?.conversion?.contacted || 0;
  const booked = data?.conversion?.booked || 0;
  const trialed = data?.conversion?.trialed || 0;
  const paid = data?.conversion?.paid || 0;

  const rawFunnel = data?.funnel || [];
  const funnel = useMemo(() => {
    if (isTelesale && !isLeadTelesale) {
      return rawFunnel.map(f => {
        if (f.level_group === 'L0' || f.level_group === 'L1.KK') {
          return { ...f, count: countL0 + contacted };
        }
        return f;
      });
    }
    return rawFunnel;
  }, [rawFunnel, isTelesale, isLeadTelesale, countL0, contacted]);

  if (!data) { // Skeletons only on initial load
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
  const isHQ = !isCenter && !isTelesale && (selectedCenters.length !== 1);
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

  const rateL3L1 = contacted > 0 ? ((trialed / contacted) * 100).toFixed(1) : '0.0';
  const rateL4L1 = contacted > 0 ? ((paid / contacted) * 100).toFixed(1) : '0.0';
  const rateL2L1 = contacted > 0 ? ((booked / contacted) * 100).toFixed(1) : '0.0';
  const totalL0 = countL0 + contacted;
  const rateL1L0 = totalL0 > 0 ? ((contacted / totalL0) * 100).toFixed(1) : '0.0';
  const rateTelesaleL3L1 = contacted > 0 ? ((trialed / contacted) * 100).toFixed(1) : '0.0';

  // Unified cards configuration for all roles
  const statsCards = isTelesale && !isLeadTelesale ? [
    {
      isCustom: true,
      render: () => (
        <StatCard
          icon={HiOutlineInbox}
          label="L1 KK"
          value={totalL0}
          color="yellow"
        >
          <div className="mt-2 pt-2 border-t border-surface-100 dark:border-surface-800 text-[10px] text-surface-500 space-y-0.5">
            <div className="flex justify-between">
              <span>L1 kho kiểm:</span>
              <span className="font-semibold text-surface-700 dark:text-surface-300">{countL0}</span>
            </div>
            <div className="flex justify-between">
              <span>Đã lên L1:</span>
              <span className="font-semibold text-surface-700 dark:text-surface-300">{contacted}</span>
            </div>
          </div>
        </StatCard>
      )
    },
    { icon: HiOutlineUserGroup, label: "Tổng L1", value: contacted, color: "primary" },
    { icon: HiOutlineCalendar, label: "Lịch hẹn", value: booked, color: "blue" },
    { icon: HiOutlineCalendar, label: "Hẹn cần xử lý", value: countPending, color: "yellow" },
    { icon: HiOutlineTrendingUp, label: "Tổng L3", value: trialed, color: "green" },
    { icon: HiOutlineStar, label: "Tổng L4", value: paid, color: "yellow" },
    {
      isCustom: true,
      render: () => (
        <div className="glass-card p-5 group hover:border-primary-500/30 transition-colors duration-200">
          <div className="flex items-start justify-between">
            <div className="space-y-1 w-full font-sans">
              <p className="text-xs text-surface-500 font-semibold uppercase tracking-wider">Hiệu suất</p>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500 font-medium">Tỷ lệ L1/L1.KK:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateL1L0}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500 font-medium">Tỷ lệ L3/L1:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateTelesaleL3L1}%</span>
                </div>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-green-150 dark:bg-green-500/10 flex items-center justify-center flex-shrink-0 ml-2">
              <HiOutlineTrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      )
    }
  ] : [
    { icon: HiOutlineUserGroup, label: "Tổng L1", value: contacted, color: "primary" },
    { icon: HiOutlineCalendar, label: "Tổng L2", value: booked, color: "blue" },
    { icon: HiOutlineTrendingUp, label: "Tổng L3", value: trialed, color: "green" },
    { icon: HiOutlineStar, label: "Tổng L4", value: paid, color: "yellow" },
    {
      isCustom: true,
      render: () => (
        <div className="glass-card p-5 group hover:border-primary-500/30 transition-colors duration-200">
          <div className="flex items-start justify-between">
            <div className="space-y-1 w-full font-sans">
              <p className="text-xs text-surface-500 font-semibold uppercase tracking-wider">Hiệu suất</p>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500 font-medium">Tỷ lệ L3/L1:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateL3L1}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500 font-medium">Tỷ lệ L4/L1:</span>
                  <span className="font-bold text-surface-900 dark:text-surface-100">{rateL4L1}%</span>
                </div>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-green-150 dark:bg-green-500/10 flex items-center justify-center flex-shrink-0 ml-2">
              <HiOutlineTrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      )
    }
  ];

  // Get counts by level code grouped baseline logic
  const baselineLevels = (productLevels || [])
    .filter((pl) => pl.product_code === 'UCMAS')
    .sort((a, b) => a.sort_order - b.sort_order);

  const groupedBaseline = {
    L1: [],
    L2: [],
    L3: [],
    L4: []
  };

  baselineLevels.forEach((level) => {
    const match = level.level_code.match(/^L(\d)/);
    const group = match ? 'L' + match[1] : null;
    if (group && groupedBaseline[group]) {
      const countItem = (data.byLevelCode || []).find((c) => c.level_code === level.level_code);
      groupedBaseline[group].push({
        code: level.level_code,
        label: level.label,
        color: level.color,
        count: countItem ? parseInt(countItem.count) : 0
      });
    }
  });

  // Append other non-baseline levels that match the group prefix
  (data.byLevelCode || []).forEach((item) => {
    const code = item.level_code;
    const match = code.match(/^L(\d)/);
    const group = match ? 'L' + match[1] : null;
    if (group && groupedBaseline[group]) {
      const alreadyInGroup = groupedBaseline[group].some((x) => x.code === code);
      if (!alreadyInGroup) {
        const levelMeta = (productLevels || []).find((pl) => pl.level_code === code) || {
          label: code,
          color: '#6B7280'
        };
        groupedBaseline[group].push({
          code,
          label: levelMeta.label,
          color: levelMeta.color,
          count: parseInt(item.count) || 0
        });
      }
    }
  });

  // Filter out L1 and L1.KK from L1 group in Snapshot details as they are not processed/active leads for the dashboard
  if (groupedBaseline['L1']) {
    groupedBaseline['L1'] = groupedBaseline['L1'].filter(
      (item) => item.code !== 'L1' && item.code !== 'L1.KK'
    );
  }

  // Helper functions for detailed center summary table
  const renderNumberCell = (val, isLastInSection = false) => {
    const borderClass = isLastInSection 
      ? "border-r-2 border-surface-300 dark:border-surface-600" 
      : "border-r border-surface-200 dark:border-surface-700";
    return (
      <td className={`text-center px-2 py-1.5 font-mono text-xs ${borderClass} ${val === 0 ? 'text-surface-400/50 dark:text-surface-600/50' : 'font-semibold text-surface-800 dark:text-surface-200'}`}>
        {val}
      </td>
    );
  };

  const renderRateCell = (num, den, isLastInSection = false) => {
    const borderClass = isLastInSection 
      ? "border-r-2 border-surface-300 dark:border-surface-600" 
      : "border-r border-surface-200 dark:border-surface-700";
    if (!den || den === 0) return <td className={`text-center font-medium text-surface-400 dark:text-surface-600 ${borderClass}`}>—</td>;
    const val = (num / den) * 100;
    let bgClass = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400";
    if (val >= 70) {
      bgClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400";
    } else if (val >= 40) {
      bgClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400";
    }
    return (
      <td className={`text-center font-bold text-xs ${borderClass} ${bgClass}`}>
        {val.toFixed(1)}%
      </td>
    );
  };

  const byCenterDetailed = data.byCenterDetailed || [];

  // Calculate totals for the bottom row
  const totals = byCenterDetailed.reduce((acc, row) => {
    acc.push_l1 += parseInt(row.push_l1) || 0;
    acc.push_l2 += parseInt(row.push_l2) || 0;
    acc.push_l3 += parseInt(row.push_l3) || 0;
    acc.push_l4 += parseInt(row.push_l4) || 0;
    
    acc.pull_l0 += parseInt(row.pull_l0) || 0;
    acc.pull_l1 += parseInt(row.pull_l1) || 0;
    acc.pull_l2 += parseInt(row.pull_l2) || 0;
    acc.pull_l3 += parseInt(row.pull_l3) || 0;
    acc.pull_l4 += parseInt(row.pull_l4) || 0;

    acc.total_l0 += parseInt(row.total_l0) || 0;
    acc.total_l1 += parseInt(row.total_l1) || 0;
    acc.total_l2 += parseInt(row.total_l2) || 0;
    acc.total_l3 += parseInt(row.total_l3) || 0;
    acc.total_l4 += parseInt(row.total_l4) || 0;

    acc.ton_l1_2 += parseInt(row.ton_l1_2) || 0;
    acc.ton_l1_3 += parseInt(row.ton_l1_3) || 0;
    acc.ton_l2_2a += parseInt(row.ton_l2_2a) || 0;
    acc.ton_l2_2b += parseInt(row.ton_l2_2b) || 0;
    acc.ton_l2_3 += parseInt(row.ton_l2_3) || 0;
    acc.ton_l3_1 += parseInt(row.ton_l3_1) || 0;
    acc.ton_l3_3 += parseInt(row.ton_l3_3) || 0;
    acc.ton_l4_1 += parseInt(row.ton_l4_1) || 0;
    acc.ton_l4_2 += parseInt(row.ton_l4_2) || 0;
    acc.ton_l4_3_plus += parseInt(row.ton_l4_3_plus) || 0;
    return acc;
  }, {
    push_l1: 0, push_l2: 0, push_l3: 0, push_l4: 0,
    pull_l0: 0, pull_l1: 0, pull_l2: 0, pull_l3: 0, pull_l4: 0,
    total_l0: 0, total_l1: 0, total_l2: 0, total_l3: 0, total_l4: 0,
    ton_l1_2: 0, ton_l1_3: 0, ton_l2_2a: 0, ton_l2_2b: 0, ton_l2_3: 0,
    ton_l3_1: 0, ton_l3_3: 0, ton_l4_1: 0, ton_l4_2: 0, ton_l4_3_plus: 0
  });

  return (
    <div className={`space-y-6 ${loading ? 'opacity-65 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}`}>
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-800 dark:text-surface-100">
            {isHQ ? 'Dashboard Tổng quan' : `Dashboard ${data.center?.name || ''}`}
          </h1>
          <p className="text-xs sm:text-sm text-surface-500 mt-1">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={loadDashboard} className="btn-ghost p-2" aria-label="Làm mới">
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Premium Filter Bar */}
      <div className="glass-card p-4 grid grid-cols-6 sm:flex sm:flex-wrap items-end gap-3 bg-surface-50/50 dark:bg-surface-800/10">
        <div className="col-span-3 sm:col-span-auto w-full sm:w-auto">
          <label className="block text-xs text-surface-500 mb-1">Từ ngày</label>
          <input 
            type="date" 
            value={from} 
            onChange={(e) => setFrom(e.target.value)}
            className="input-field py-2 text-sm w-full" 
          />
        </div>
        <div className="col-span-3 sm:col-span-auto w-full sm:w-auto">
          <label className="block text-xs text-surface-500 mb-1">Đến ngày</label>
          <input 
            type="date" 
            value={to} 
            onChange={(e) => setTo(e.target.value)}
            className="input-field py-2 text-sm w-full" 
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
            className="col-span-3 sm:col-span-auto w-full sm:w-auto sm:min-w-[150px] sm:max-w-[220px]"
          />
        )}

        {/* Product Multi-select */}
        <MultiSelectDropdown
          label="Sản phẩm"
          options={productOptions}
          selectedValues={selectedProducts}
          onChange={setSelectedProducts}
          placeholder="Tất cả sản phẩm"
          className="col-span-3 sm:col-span-auto w-full sm:w-auto sm:min-w-[150px] sm:max-w-[220px]"
        />

        {/* Nguồn lead — hiện cho mọi vai trò */}
        <div className="col-span-3 sm:col-span-auto w-full sm:w-auto">
          <label className="block text-xs text-surface-500 mb-1">Nguồn lead</label>
          <select
            value={selectedSourceType}
            onChange={(e) => setSelectedSourceType(e.target.value)}
            className="select-field py-2 text-sm w-full"
          >
            <option value="">Tất cả nguồn</option>
            <option value="PULL">Chỉ PULL (Quảng cáo)</option>
            <option value="PUSH">Chỉ PUSH (Giới thiệu)</option>
          </select>
        </div>

        {/* Nguồn con */}
        <div className="col-span-3 sm:col-span-auto w-full sm:w-auto">
          <label className="block text-xs text-surface-500 mb-1">Nguồn con</label>
          <select
            value={selectedSubSource}
            onChange={(e) => setSelectedSubSource(e.target.value)}
            className="select-field py-2 text-sm w-full"
          >
            <option value="">Tất cả nguồn con</option>
            {filteredSubSources.map((sub) => (
              <option key={sub.id} value={sub.name}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-6 sm:col-span-auto flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <button 
            onClick={handleApplyFilters} 
            disabled={loading}
            className="btn-primary text-sm px-4 py-2 flex items-center justify-center gap-1.5 flex-1 sm:flex-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Đang lọc...
              </>
            ) : 'Lọc'}
          </button>
          <button 
            onClick={handleResetFilters} 
            disabled={loading}
            className="btn-ghost text-sm px-3 py-2 flex items-center justify-center flex-1 sm:flex-none border border-surface-200 dark:border-surface-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={`grid grid-cols-2 md:grid-cols-3 ${isTelesale && !isLeadTelesale ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-5'} gap-4`}>
        {statsCards.map((card, i) => {
          if (card.isCustom) return <div key={i}>{card.render()}</div>;
          return (
            <StatCard
              key={i}
              icon={card.icon}
              label={card.label}
              value={card.value}
              color={card.color}
            />
          );
        })}
      </div>

      <div className={`grid grid-cols-1 ${!isTelesale ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* Funnel */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-4 flex items-center gap-2">
            <HiOutlineChartBar className="w-4 h-4 text-primary-400" /> Phễu chuyển đổi (Lũy kế)
          </h3>
          <div className="space-y-2">
            {funnel.slice(0, 5).map((f) => (
              <FunnelBar 
                key={f.level_group} 
                group={f.level_group} 
                count={parseInt(f.count)} 
                maxCount={maxFunnel} 
                onClick={() => handleLevelClick(f.level_group)} 
              />
            ))}
          </div>
        </div>

        {/* Source Distribution Chart — HQ only */}
        {!isTelesale && (
          isHQ && sourceData.length > 0 ? (
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
          ) : !isCenter ? (
            /* Staff Performance — chỉ hiện với Telesale/Admin, không hiện với Trung tâm */
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-4">👥 Hiệu suất nhân viên</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(data.staffPerformance || []).map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800/30">
                    <span className="text-sm text-surface-700 dark:text-surface-300">{s.staff_name || 'Chưa gán'}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-surface-500">Lũy kế L1: {s.total_leads}</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">Chốt L4: {s.paid_leads}</span>
                    </div>
                  </div>
                ))}
                {(data.staffPerformance || []).length === 0 && (
                  <p className="text-center text-sm text-surface-500 py-8">Không có dữ liệu nhân viên</p>
                )}
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Snapshot panel of current active level codes */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-4 flex items-center gap-2">
          📊 Phân bố trạng thái chi tiết hiện tại (Snapshot hoạt động)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(groupedBaseline).map(([groupName, items]) => (
            <div key={groupName} className="p-4 bg-surface-50 dark:bg-surface-800/20 border border-surface-100 dark:border-surface-800 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider border-b border-surface-200/50 dark:border-surface-700/50 pb-2">
                Nhóm {groupName}
              </h4>
              <div className="space-y-2">
                {items.map((item) => (
                  <div 
                    key={item.code} 
                    onClick={() => handleLevelClick(item.code)}
                    className="flex items-center justify-between text-xs cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 p-1 rounded transition-colors group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-mono text-surface-500 group-hover:text-primary-500 transition-colors">{item.code}</span>
                      <span className="text-surface-700 dark:text-surface-300 truncate group-hover:text-surface-900 dark:group-hover:text-surface-100 transition-colors" title={item.label}>
                        {item.label}
                      </span>
                    </div>
                    <span className="font-bold text-surface-900 dark:text-surface-100 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-md min-w-[20px] text-center group-hover:bg-primary-100 dark:group-hover:bg-primary-500/20 transition-colors">
                      {item.count}
                    </span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-center text-xs text-surface-400 py-4">Không có dữ liệu</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Center Summary Table — HQ only */}
      {isHQ && !isTelesale && byCenterDetailed.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-surface-800 dark:text-surface-200">
              📊 Báo cáo tổng hợp các Trung tâm
            </h3>
            <span className="text-[10px] text-surface-500">Đơn vị: data tuyển sinh</span>
          </div>

          <div className="overflow-x-auto border border-surface-200 dark:border-surface-700 rounded-lg shadow-sm">
            <table className="w-full border-collapse text-left text-xs text-surface-500 dark:text-surface-400">
              <thead className="sticky top-0 z-30 text-[10px] font-bold uppercase tracking-wider text-surface-700 dark:text-surface-200 select-none bg-surface-100 dark:bg-surface-800">
                <tr>
                  <th rowSpan={2} className="p-3 sticky left-0 z-40 bg-surface-100 dark:bg-surface-800 border-b-2 border-r-2 border-surface-300 dark:border-surface-600 w-[140px] min-w-[140px] text-center">
                    Trung Tâm
                  </th>
                  <th colSpan={6} className="p-2 bg-amber-500/10 text-amber-800 dark:text-amber-300 border-b border-r border-surface-200 dark:border-surface-700 text-center font-bold">
                    Nguồn PUSH Marketing
                  </th>
                  <th colSpan={7} className="p-2 bg-blue-500/10 text-blue-800 dark:text-blue-300 border-b border-r border-surface-200 dark:border-surface-700 text-center font-bold">
                    Nguồn PULL Marketing
                  </th>
                  <th colSpan={7} className="p-2 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-b border-r border-surface-200 dark:border-surface-700 text-center font-bold">
                    Tổng
                  </th>
                  <th colSpan={10} className="p-2 bg-red-500/10 text-red-800 dark:text-red-300 border-b border-surface-200 dark:border-surface-700 text-center font-bold">
                    Báo cáo tồn (Cohort trong kỳ)
                  </th>
                </tr>
                <tr className="bg-surface-50 dark:bg-surface-800 text-center">
                  {/* PUSH */}
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L4</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700 text-amber-700 dark:text-amber-400 font-extrabold">L4/L1</th>
                  <th className="p-2 border-b border-r-2 border-surface-300 dark:border-surface-600 text-amber-700 dark:text-amber-400 font-extrabold">L3/L1</th>
                  
                  {/* PULL */}
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1 KK</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L4</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700 text-blue-700 dark:text-blue-400 font-extrabold">L4/L1</th>
                  <th className="p-2 border-b border-r-2 border-surface-300 dark:border-surface-600 text-blue-700 dark:text-blue-400 font-extrabold">L3/L1</th>

                  {/* TỔNG */}
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1 KK</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L4</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700 text-emerald-700 dark:text-emerald-400 font-extrabold">L4/L1</th>
                  <th className="p-2 border-b border-r-2 border-surface-300 dark:border-surface-600 text-emerald-700 dark:text-emerald-400 font-extrabold">L3/L1</th>

                  {/* TỒN */}
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1.2</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L1.3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2.2A</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2.2B</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L2.3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L3.1</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L3.3</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L4.1</th>
                  <th className="p-2 border-b border-r border-surface-200 dark:border-surface-700">L4.2</th>
                  <th className="p-2 border-b border-surface-200 dark:border-surface-700">L4.3+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-surface-700 bg-white dark:bg-surface-900">
                {byCenterDetailed.map((row) => (
                  <tr key={row.center_id} className="group hover:bg-surface-50 dark:hover:bg-surface-800/40">
                    <td className="p-3 sticky left-0 z-20 bg-white dark:bg-surface-900 group-hover:bg-surface-50 dark:group-hover:bg-surface-800/40 border-r-2 border-surface-300 dark:border-surface-600 font-semibold text-surface-800 dark:text-surface-200 truncate w-[140px] min-w-[140px]">
                      {row.center_name?.replace('Trung tâm ', '')}
                    </td>
                    
                    {/* PUSH */}
                    {renderNumberCell(row.push_l1)}
                    {renderNumberCell(row.push_l2)}
                    {renderNumberCell(row.push_l3)}
                    {renderNumberCell(row.push_l4)}
                    {renderRateCell(row.push_l4, row.push_l1)}
                    {renderRateCell(row.push_l3, row.push_l1, true)}

                    {/* PULL */}
                    {renderNumberCell(row.pull_l0)}
                    {renderNumberCell(row.pull_l1)}
                    {renderNumberCell(row.pull_l2)}
                    {renderNumberCell(row.pull_l3)}
                    {renderNumberCell(row.pull_l4)}
                    {renderRateCell(row.pull_l4, row.pull_l1)}
                    {renderRateCell(row.pull_l3, row.pull_l1, true)}

                    {/* TỔNG */}
                    {renderNumberCell(row.total_l0)}
                    {renderNumberCell(row.total_l1)}
                    {renderNumberCell(row.total_l2)}
                    {renderNumberCell(row.total_l3)}
                    {renderNumberCell(row.total_l4)}
                    {renderRateCell(row.total_l4, row.total_l1)}
                    {renderRateCell(row.total_l3, row.total_l1, true)}

                    {/* TỒN */}
                    {renderNumberCell(row.ton_l1_2)}
                    {renderNumberCell(row.ton_l1_3)}
                    {renderNumberCell(row.ton_l2_2a)}
                    {renderNumberCell(row.ton_l2_2b)}
                    {renderNumberCell(row.ton_l2_3)}
                    {renderNumberCell(row.ton_l3_1)}
                    {renderNumberCell(row.ton_l3_3)}
                    {renderNumberCell(row.ton_l4_1)}
                    {renderNumberCell(row.ton_l4_2)}
                    {renderNumberCell(row.ton_l4_3_plus)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-surface-100 dark:bg-surface-800 font-bold border-t-2 border-surface-300 dark:border-surface-600">
                <tr className="bg-surface-150 dark:bg-surface-800 text-surface-900 dark:text-surface-100">
                  <td className="p-3 sticky left-0 z-20 bg-surface-150 dark:bg-surface-800 border-r-2 border-surface-300 dark:border-surface-600 text-center">
                    TỔNG/TB
                  </td>
                  
                  {/* PUSH */}
                  {renderNumberCell(totals.push_l1)}
                  {renderNumberCell(totals.push_l2)}
                  {renderNumberCell(totals.push_l3)}
                  {renderNumberCell(totals.push_l4)}
                  {renderRateCell(totals.push_l4, totals.push_l1)}
                  {renderRateCell(totals.push_l3, totals.push_l1, true)}

                  {/* PULL */}
                  {renderNumberCell(totals.pull_l0)}
                  {renderNumberCell(totals.pull_l1)}
                  {renderNumberCell(totals.pull_l2)}
                  {renderNumberCell(totals.pull_l3)}
                  {renderNumberCell(totals.pull_l4)}
                  {renderRateCell(totals.pull_l4, totals.pull_l1)}
                  {renderRateCell(totals.pull_l3, totals.pull_l1, true)}

                  {/* TỔNG */}
                  {renderNumberCell(totals.total_l0)}
                  {renderNumberCell(totals.total_l1)}
                  {renderNumberCell(totals.total_l2)}
                  {renderNumberCell(totals.total_l3)}
                  {renderNumberCell(totals.total_l4)}
                  {renderRateCell(totals.total_l4, totals.total_l1)}
                  {renderRateCell(totals.total_l3, totals.total_l1, true)}

                  {/* TỒN */}
                  {renderNumberCell(totals.ton_l1_2)}
                  {renderNumberCell(totals.ton_l1_3)}
                  {renderNumberCell(totals.ton_l2_2a)}
                  {renderNumberCell(totals.ton_l2_2b)}
                  {renderNumberCell(totals.ton_l2_3)}
                  {renderNumberCell(totals.ton_l3_1)}
                  {renderNumberCell(totals.ton_l3_3)}
                  {renderNumberCell(totals.ton_l4_1)}
                  {renderNumberCell(totals.ton_l4_2)}
                  {renderNumberCell(totals.ton_l4_3_plus)}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* HQ extras: milestones */}
      {isHQ && !isTelesale && data.recentMilestones?.length > 0 && (
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
