import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import UsersTab from '../components/settings/UsersTab';
import CentersTab from '../components/settings/CentersTab';
import SyncTab from '../components/settings/SyncTab';
import FieldsTab from '../components/settings/FieldsTab';
import ProductsTab from '../components/settings/ProductsTab';
import SourcesTab from '../components/settings/SourcesTab';
import ProfileTab from '../components/settings/ProfileTab';
import { 
  HiOutlineUsers, HiOutlineOfficeBuilding, HiOutlineRefresh, 
  HiOutlineAdjustments, HiOutlineCollection, HiOutlineLockClosed,
  HiOutlineFilter
} from 'react-icons/hi';

const ALL_TABS = [
  { id: 'users', label: 'Nhân viên', icon: HiOutlineUsers, adminOnly: true },
  { id: 'centers', label: 'Trung tâm', icon: HiOutlineOfficeBuilding, adminOnly: true },
  { id: 'sync', label: 'Đồng bộ Sheet', icon: HiOutlineRefresh, adminOnly: true },
  { id: 'fields', label: 'Trường dữ liệu', icon: HiOutlineAdjustments, adminOnly: true },
  { id: 'products', label: 'Sản phẩm & Level', icon: HiOutlineCollection, adminOnly: true },
  { id: 'sources', label: 'Nguồn lead con', icon: HiOutlineFilter, adminOnly: true },
  { id: 'profile', label: 'Đổi mật khẩu', icon: HiOutlineLockClosed, adminOnly: false },
];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const tabs = ALL_TABS.filter((tab) => !tab.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState(isAdmin ? 'users' : 'profile');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100">Cài đặt hệ thống</h1>

      {/* Tab Navigation */}
      <div className="glass-card p-1 flex flex-wrap gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400 font-semibold'
                : 'text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && isAdmin && <UsersTab />}
      {activeTab === 'centers' && isAdmin && <CentersTab />}
      {activeTab === 'sync' && isAdmin && <SyncTab />}
      {activeTab === 'fields' && isAdmin && <FieldsTab />}
      {activeTab === 'products' && isAdmin && <ProductsTab />}
      {activeTab === 'sources' && isAdmin && <SourcesTab />}
      {activeTab === 'profile' && <ProfileTab />}
    </div>
  );
}


