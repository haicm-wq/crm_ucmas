import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSharedData } from '../contexts/SharedDataProvider';
import { useDebounce } from '../hooks/useShared';
import { useAuth } from '../contexts/AuthContext';
import { fetchAppointments } from '../services/api';
import { getLevelInfo } from '../config/levels';
import { APPOINTMENT_STATUS_MAP } from '../config/constants';
import AppointmentDetail from '../components/calendar/AppointmentDetail';
import EmptyState from '../components/ui/EmptyState';
import { ListSkeleton } from '../components/ui/SkeletonLoader';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar, HiOutlineRefresh, HiOutlineChevronDown,
  HiOutlineViewGrid, HiOutlineViewList,
} from 'react-icons/hi';

const STATUS_MAP = APPOINTMENT_STATUS_MAP;

// ─── CalendarGridView ─────────────────────────────────────
function CalendarGridView({ appointments, currentMonth, onMonthChange }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Map appointments to date keys
  const dateMap = useMemo(() => {
    const map = {};
    appointments.forEach((a) => {
      const d = new Date(a.trial_appointment_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  const cells = [];
  const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
        <button onClick={prevMonth} className="btn-ghost text-sm">← Trước</button>
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
          Tháng {month + 1}/{year}
        </h3>
        <button onClick={nextMonth} className="btn-ghost text-sm">Sau →</button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500 border-b border-surface-200 dark:border-surface-700">{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="min-h-[80px] bg-surface-50/50 dark:bg-surface-800/20" />;
          const key = `${year}-${month}-${day}`;
          const dayAppts = dateMap[key] || [];
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

          return (
            <div key={day} className={`min-h-[80px] border-b border-r border-surface-200/50 dark:border-surface-700/30 p-1.5 transition-colors ${
              isToday ? 'bg-primary-50 dark:bg-primary-500/5' : 'hover:bg-surface-50 dark:hover:bg-surface-800/20'
            }`}>
              <span className={`text-xs font-medium ${isToday ? 'w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center' : 'text-surface-600 dark:text-surface-400'}`}>
                {day}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 3).map((a) => {
                  const st = STATUS_MAP[a.appt_status] || STATUS_MAP.scheduled;
                  return (
                    <div key={a.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] bg-surface-100 dark:bg-surface-800/50 truncate" title={`${a.full_name} — Nguồn: ${a.source_type || 'PULL'} — ${st.label}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className="truncate text-surface-700 dark:text-surface-300">
                        {new Date(a.trial_appointment_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {a.full_name} ({a.source_type || 'PULL'})
                      </span>
                    </div>
                  );
                })}
                {dayAppts.length > 3 && (
                  <p className="text-[9px] text-primary-500 font-medium px-1">+{dayAppts.length - 3} hẹn</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main CalendarPage ──────────────────────────────────────
export default function CalendarPage() {
  const { centers, allStaff } = useSharedData();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // list | grid
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { user, isAdmin, isMarketing, isLeadTelesale } = useAuth();
  const showCenterFilter = isAdmin || isMarketing || isLeadTelesale;

  const [filters, setFilters] = useState({
    from: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
    center_id: !showCenterFilter && user?.permission_group === 'center' ? (user?.center_id || '') : '',
    status: '',
    assigned_staff: '',
  });

  // Đồng bộ center_id khi thông tin user profile tải xong
  useEffect(() => {
    if (!showCenterFilter && user?.permission_group === 'center' && user?.center_id) {
      setFilters((prev) => ({
        ...prev,
        center_id: user.center_id,
      }));
    }
  }, [user, showCenterFilter]);

  // Debounce filter changes to avoid rapid API calls
  const debouncedFilters = useDebounce(filters, 500);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { status, ...apiFilters } = debouncedFilters;
      const data = await fetchAppointments(apiFilters);
      setAppointments(data);
    } catch {
      toast.error('Lỗi tải lịch hẹn');
    } finally {
      setLoading(false);
    }
  }, [debouncedFilters]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  // Sync calendar month with filters
  useEffect(() => {
    if (viewMode === 'grid') {
      const y = currentMonth.getFullYear();
      const m = currentMonth.getMonth();
      setFilters((prev) => ({
        ...prev,
        from: new Date(y, m, 1).toISOString().slice(0, 10),
        to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
      }));
    }
  }, [currentMonth, viewMode]);

  const stats = useMemo(() => {
    let scheduled = 0;
    let scheduledSale = 0;
    let scheduledCenter = 0;
    let attended = 0;
    let missed = 0;
    let cancelled = 0;

    appointments.forEach((a) => {
      if (a.appt_status === 'scheduled') {
        scheduled++;
        if (a.sale_remind_status !== 'reminded') scheduledSale++;
        if (a.center_remind_status !== 'reminded') scheduledCenter++;
      } else if (a.appt_status === 'attended') {
        attended++;
      } else if (a.appt_status === 'missed') {
        missed++;
      } else if (a.appt_status === 'cancelled') {
        cancelled++;
      }
    });

    return {
      total: appointments.length,
      scheduled,
      scheduledSale,
      scheduledCenter,
      attended,
      missed,
      cancelled,
    };
  }, [appointments]);

  const filteredAppointments = filters.status
    ? appointments.filter((a) => a.appt_status === filters.status)
    : appointments;

  // Group by date for list view
  const groupedByDate = useMemo(() => {
    const DAYS_OF_WEEK = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const groups = {};
    filteredAppointments.forEach((appt) => {
      const dateObj = new Date(appt.trial_appointment_at);
      const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()];
      const formattedDate = dateObj.toLocaleDateString('vi-VN');
      const dateKey = `${dayOfWeek}, ${formattedDate}`;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(appt);
    });
    return groups;
  }, [filteredAppointments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            <HiOutlineCalendar className="w-7 h-7 text-primary-400" /> Lịch hẹn học thử
          </h1>
          <div className="text-xs sm:text-sm text-surface-500 mt-1.5 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1.5">
            <span>Tổng lịch: <strong className="text-surface-800 dark:text-surface-200 font-semibold">{stats.total}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Đã hẹn: <strong className="text-sky-500 dark:text-sky-400 font-semibold">{stats.scheduled}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Cần nhắc (Sale): <strong className="text-blue-500 dark:text-blue-400 font-semibold">{stats.scheduledSale}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Cần nhắc (TT): <strong className="text-indigo-500 dark:text-indigo-400 font-semibold">{stats.scheduledCenter}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Đã học thử: <strong className="text-green-500 dark:text-green-400 font-semibold">{stats.attended}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Bỏ lỡ: <strong className="text-red-500 dark:text-red-400 font-semibold">{stats.missed}</strong></span>
            <span className="text-surface-300 dark:text-surface-700 hidden sm:inline">•</span>
            <span>Đã hủy: <strong className="text-surface-400 dark:text-surface-500 font-semibold">{stats.cancelled}</strong></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5">
            <button onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-surface-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
              title="Danh sách" aria-label="Xem dạng danh sách">
              <HiOutlineViewList className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-surface-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
              title="Lịch tháng" aria-label="Xem dạng lịch">
              <HiOutlineViewGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={loadAppointments} className="btn-ghost" aria-label="Làm mới">
            <HiOutlineRefresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {viewMode === 'list' && (
            <>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Từ ngày</label>
                <input type="date" value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="input-field py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-surface-500 mb-1">Đến ngày</label>
                <input type="date" value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="input-field py-2 text-sm" />
              </div>
            </>
          )}
          {showCenterFilter && (
            <div>
              <label className="block text-xs text-surface-500 mb-1">Trung tâm</label>
              <select value={filters.center_id}
                onChange={(e) => setFilters({ ...filters, center_id: e.target.value })}
                className="select-field py-2 text-sm">
                <option value="">Tất cả</option>
                {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-surface-500 mb-1">Trạng thái</label>
            <select value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="select-field py-2 text-sm">
              <option value="">Tất cả</option>
              <option value="scheduled">Đã hẹn</option>
              <option value="attended">Đã học thử</option>
              <option value="missed">Bỏ lỡ</option>
              <option value="cancelled">Hủy</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Sale đặt lịch</label>
            <select value={filters.assigned_staff}
              onChange={(e) => setFilters({ ...filters, assigned_staff: e.target.value })}
              className="select-field py-2 text-sm">
              <option value="">Tất cả</option>
              {(allStaff || []).map((s) => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
            </select>
          </div>
        </div>
      </div>

      {/* Calendar Grid View */}
      {viewMode === 'grid' && !loading && (
        <CalendarGridView
          appointments={filteredAppointments}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        loading ? (
          <div className="glass-card p-4"><ListSkeleton rows={6} /></div>
        ) : Object.keys(groupedByDate).length === 0 ? (
          <EmptyState icon={HiOutlineCalendar} title="Không có lịch hẹn"
            description="Không có lịch hẹn trong khoảng thời gian này" />
        ) : (
          Object.entries(groupedByDate).map(([date, appts]) => (
            <div key={date} className="glass-card overflow-hidden">
              <div className="px-4 py-3 bg-surface-100 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700">
                <h3 className="text-base font-semibold text-surface-800 dark:text-surface-200">{date} — {appts.length} hẹn</h3>
              </div>
              <div className="divide-y divide-surface-200 dark:divide-surface-800/50">
                {appts.map((appt) => {
                  const st = STATUS_MAP[appt.appt_status] || STATUS_MAP.scheduled;
                  const levelInfo = getLevelInfo(appt.level_code);
                  const isExpanded = expandedId === appt.id;
                  return (
                    <div key={appt.id}>
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                        className={`p-4 cursor-pointer transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isExpanded ? 'bg-primary-50/50 dark:bg-primary-500/5' : 'hover:bg-surface-50 dark:hover:bg-surface-800/20'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                          <div className="text-center min-w-[80px] pt-1 sm:pt-0 flex flex-col items-center justify-center">
                            {appt.lead_code && (
                              <span className="text-xs font-mono font-semibold text-surface-400 dark:text-surface-500 bg-surface-100 dark:bg-surface-800/80 px-1.5 rounded mb-1">
                                {appt.lead_code}
                              </span>
                            )}
                            <p className="text-lg sm:text-xl font-bold text-primary-600 dark:text-primary-400 leading-none">
                              {new Date(appt.trial_appointment_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <p className="text-base font-semibold text-surface-800 dark:text-surface-100">{appt.full_name}</p>
                              {(appt.child_name || appt.child_birth_year || appt.address) && (
                                <span className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 bg-surface-100/50 dark:bg-surface-800/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  👶 {appt.child_name || 'Chưa có tên con'}{appt.child_birth_year ? ` (${appt.child_birth_year})` : ''}{appt.address ? ` - 📍 ${appt.address}` : ''}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                              <span className="text-sm text-surface-500 font-mono">{appt.phone}</span>
                              <span className={`badge text-xs ${levelInfo.bgClass}`}>{appt.level_code}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                appt.source_type === 'PUSH'
                                  ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              }`}>
                                {appt.source_type || 'PULL'}
                              </span>
                              <span className="text-sm text-surface-500">{appt.center_name}</span>
                              {appt.sale_name && <span className="text-sm text-surface-600 dark:text-surface-400">· {appt.sale_name}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pl-[86px] sm:pl-0">
                          <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                          <HiOutlineChevronDown className={`w-4 h-4 text-surface-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 bg-surface-50/50 dark:bg-surface-800/10 border-t border-surface-200/50 dark:border-surface-700/30">
                          <AppointmentDetail appt={appt} onUpdate={loadAppointments} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )
      )}

      {/* Grid View Loading */}
      {viewMode === 'grid' && loading && (
        <div className="glass-card p-4"><ListSkeleton rows={4} /></div>
      )}
    </div>
  );
}
