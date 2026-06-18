import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchNotifications, markAllNotificationsRead } from '../../services/api';
import { formatRelativeTime } from '../../utils/format';
import { HiOutlineBell, HiOutlineLogout, HiOutlineMoon, HiOutlineSun, HiOutlineMenu } from 'react-icons/hi';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('ucmas_dark_mode');
    return saved !== null ? saved === 'true' : false; // Light mode default
  });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [activeTab, setActiveTab] = useState('system'); // system | transfer
  const notifRef = useRef(null);

  // Bug11 fix: only fetch when user is loaded
  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications({ limit: 40, unreadOnly: false })
      .then((res) => {
        setNotifications(res.data);
        setUnreadCount(res.unread);
      })
      .catch(console.error);
  }, [user?.id]);

  // Supabase Realtime for new notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('my-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev].slice(0, 40));
        setUnreadCount((c) => c + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Đồng bộ class khi mount
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('ucmas_dark_mode', String(newMode));
    document.documentElement.classList.toggle('dark');
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const formatTime = formatRelativeTime;

  const systemNotifs = notifications.filter((n) => n.type !== 'center_transfer');
  const transferNotifs = notifications.filter((n) => n.type === 'center_transfer');
  const activeNotifs = activeTab === 'system' ? systemNotifs : transferNotifs;

  return (
    <header className="h-16 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger menu button for mobile screens */}
        <button
          onClick={onMenuClick}
          className="btn-ghost p-2 md:hidden text-surface-500 hover:text-surface-700 dark:hover:text-surface-200"
          title="Mở menu"
        >
          <HiOutlineMenu className="w-6 h-6" />
        </button>

        <div className="min-w-0">
          <h2 className="text-sm md:text-lg font-semibold text-surface-800 dark:text-surface-100 truncate max-w-[150px] sm:max-w-[200px] md:max-w-none">
            Xin chào, {user?.full_name} 👋
          </h2>
          <p className="text-[10px] md:text-xs text-surface-500 truncate">
            {user?.center_name || user?.department_name || user?.permission_group}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <button onClick={toggleDarkMode} className="btn-ghost" title="Chế độ sáng/tối">
          {darkMode ? <HiOutlineSun className="w-5 h-5 text-yellow-400" /> : <HiOutlineMoon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="btn-ghost relative"
            title="Thông báo"
          >
            <HiOutlineBell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse-soft">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifs && (
            <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-96 glass-card shadow-2xl border border-surface-200 dark:border-surface-700 animate-slide-up overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
                <h3 className="font-semibold text-surface-800 dark:text-surface-100">Thông báo</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300">
                    Đọc tất cả
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
                <button
                  onClick={() => setActiveTab('system')}
                  className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-all duration-150 ${
                    activeTab === 'system'
                      ? 'border-primary-500 text-primary-500'
                      : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                  }`}
                >
                  Hệ thống ({systemNotifs.length})
                </button>
                <button
                  onClick={() => setActiveTab('transfer')}
                  className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-all duration-150 ${
                    activeTab === 'transfer'
                      ? 'border-primary-500 text-primary-500'
                      : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                  }`}
                >
                  Chuyển trung tâm ({transferNotifs.length})
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {activeNotifs.length === 0 ? (
                  <p className="p-6 text-center text-surface-500 text-sm">Không có thông báo nào</p>
                ) : (
                  activeNotifs.map((notif, i) => (
                    <div
                      key={notif.id || i}
                      className={`p-4 border-b border-surface-100 dark:border-surface-800/50 hover:bg-surface-100/50 dark:hover:bg-surface-800/30 transition-colors ${
                        !notif.is_read ? 'bg-primary-500/5' : ''
                      }`}
                    >
                      <p className="text-sm text-surface-700 dark:text-surface-200">{notif.message}</p>
                      <p className="text-xs text-surface-500 mt-1">{formatTime(notif.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button onClick={logout} className="btn-ghost text-red-400 hover:text-red-300" title="Đăng xuất">
          <HiOutlineLogout className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
