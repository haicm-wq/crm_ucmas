import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import UsersTab from '../components/settings/UsersTab';
import CentersTab from '../components/settings/CentersTab';
import SyncTab from '../components/settings/SyncTab';
import FieldsTab from '../components/settings/FieldsTab';
import ProductsTab from '../components/settings/ProductsTab';
import { HiOutlineUsers, HiOutlineOfficeBuilding, HiOutlineRefresh, HiOutlineAdjustments, HiOutlineCollection } from 'react-icons/hi';

const TABS = [
  { id: 'users', label: 'Nhân viên', icon: HiOutlineUsers },
  { id: 'centers', label: 'Trung tâm', icon: HiOutlineOfficeBuilding },
  { id: 'sync', label: 'Đồng bộ Sheet', icon: HiOutlineRefresh },
  { id: 'fields', label: 'Trường dữ liệu', icon: HiOutlineAdjustments },
  { id: 'products', label: 'Sản phẩm & Level', icon: HiOutlineCollection },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users');
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-surface-500">Bạn không có quyền truy cập trang này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-surface-800 dark:text-surface-100">Cài đặt hệ thống</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-300'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'centers' && <CentersTab />}
      {activeTab === 'sync' && <SyncTab />}
      {activeTab === 'fields' && <FieldsTab />}
      {activeTab === 'products' && <ProductsTab />}
    </div>
  );
}
