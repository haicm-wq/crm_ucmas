import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  HiOutlineHome, HiOutlineInbox, HiOutlineUsers,
  HiOutlineCalendar, HiOutlineChartBar, HiOutlineCog,
  HiOutlineChevronLeft, HiOutlineChevronRight,
} from 'react-icons/hi';

const navItems = [
  { path: '/', label: 'Dashboard', icon: HiOutlineHome, roles: ['admin', 'marketing', 'center', 'telesale'] },
  { path: '/kho-l0', label: 'Kho L0', icon: HiOutlineInbox, roles: ['admin', 'marketing', 'telesale'] },
  { path: '/leads', label: 'Danh sách Lead', icon: HiOutlineUsers, roles: ['admin', 'marketing', 'center', 'telesale'] },
  { path: '/lich-hen', label: 'Lịch hẹn học thử', icon: HiOutlineCalendar, roles: ['admin', 'marketing', 'center', 'telesale'] },
  { path: '/bao-cao', label: 'Báo cáo', icon: HiOutlineChartBar, roles: ['admin', 'marketing'] },
  { path: '/cai-dat', label: 'Cài đặt', icon: HiOutlineCog, roles: ['admin'] },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user } = useAuth();

  const filteredItems = navItems.filter((item) =>
    item.roles.includes(user?.permission_group)
  );

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 z-50 transition-[width,transform] duration-200 flex flex-col
        ${collapsed ? 'md:w-20' : 'md:w-64'}
        ${mobileOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:translate-x-0'}
      `}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-surface-200 dark:border-surface-800">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/25">
              <span className="text-white font-bold text-sm">UC</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-surface-800 dark:text-surface-100">UCMAS CRM</h1>
              <p className="text-[10px] text-surface-500">Quản lý khách hàng</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-primary-500/25">
            <span className="text-white font-bold text-sm">UC</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-3' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse button - hidden on mobile */}
      <div className="p-3 border-t border-surface-200 dark:border-surface-800 hidden md:block">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 rounded-xl text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors duration-150"
        >
          {collapsed ? <HiOutlineChevronRight className="w-5 h-5" /> : <HiOutlineChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* User info */}
      {!collapsed && (
        <div className="p-4 border-t border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center text-white text-xs font-bold">
              {user?.full_name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">{user?.full_name}</p>
              <p className="text-xs text-surface-500 truncate">{user?.center_name || user?.permission_group}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
