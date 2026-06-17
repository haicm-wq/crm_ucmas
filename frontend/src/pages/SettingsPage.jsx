import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import UsersTab from '../components/settings/UsersTab';
import CentersTab from '../components/settings/CentersTab';
import SyncTab from '../components/settings/SyncTab';
import FieldsTab from '../components/settings/FieldsTab';
import ProductsTab from '../components/settings/ProductsTab';
import ProfileTab from '../components/settings/ProfileTab';
import { 
  HiOutlineUsers, HiOutlineOfficeBuilding, HiOutlineRefresh, 
  HiOutlineAdjustments, HiOutlineCollection, HiOutlineLockClosed 
} from 'react-icons/hi';

const ALL_TABS = [
  { id: 'users', label: 'Nhân viên', icon: HiOutlineUsers, adminOnly: true },
  { id: 'centers', label: 'Trung tâm', icon: HiOutlineOfficeBuilding, adminOnly: true },
  { id: 'sync', label: 'Đồng bộ Sheet', icon: HiOutlineRefresh, adminOnly: true },
  { id: 'fields', label: 'Trường dữ liệu', icon: HiOutlineAdjustments, adminOnly: true },
  { id: 'products', label: 'Sản phẩm & Level', icon: HiOutlineCollection, adminOnly: true },
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
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-300'
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
      {activeTab === 'profile' && <ProfileTab />}
    </div>
  );
}

