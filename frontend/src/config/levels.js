/**
 * UCMAS CRM — Level Configuration (Frontend)
 */

export const MILESTONE_LEVELS = ['L2.2B', 'L2.2O', 'L2.2OS', 'L3.O'];
export const HANDOFF_LEVEL = 'L2.2B';

export const LEVEL_CONFIG = {
  'L0':     { label: 'Data đầu vào',                 color: '#6B7280', bgClass: 'bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 border border-gray-200 dark:border-gray-700/50' },
  'L0.R':   { label: 'Số rác',                       color: '#EF4444', bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/30' },
  'L0.K':   { label: 'Khu vực khác',                 color: '#3B82F6', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30' },
  'L1':     { label: 'Đã có đủ 3 thông tin',         color: '#F59E0B', bgClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30' },
  'L1.KK':  { label: 'L1 Kho kiểm',                  color: '#F59E0B', bgClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30' },
  'L1.2':   { label: 'Không nghe máy',               color: '#EF4444', bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/30' },
  'L1.3':   { label: 'Dừng chăm sóc',                color: '#EF4444', bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/30' },
  'L2.2A':  { label: 'Suy nghĩ thêm',                color: '#3B82F6', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30' },
  'L2.2B':  { label: 'Đã hẹn lịch học thử',          color: '#3B82F6', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30' },
  'L2.2O':  { label: 'Đã gửi test online',           color: '#3B82F6', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30' },
  'L2.2OS': { label: 'Đã hoàn thành test',            color: '#3B82F6', bgClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30' },
  'L2.3':   { label: 'Dừng chăm sóc',                color: '#EF4444', bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/30' },
  'L3.O':   { label: 'Tư vấn trực tuyến',            color: '#10B981', bgClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30' },
  'L3.1':   { label: 'Đã học thử',                   color: '#10B981', bgClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30' },
  'L3.3':   { label: 'Dừng chăm sóc',                color: '#EF4444', bgClass: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/30' },
  'L4.1':   { label: 'Đóng phí 1 khóa',              color: '#15803D', bgClass: 'bg-green-700 text-white dark:bg-green-900/80 dark:text-green-100 border border-green-800' },
  'L4.2':   { label: 'Đóng phí 2 khóa',              color: '#15803D', bgClass: 'bg-green-700 text-white dark:bg-green-900/80 dark:text-green-100 border border-green-800' },
  'L4.3':   { label: 'Đóng phí 3 khóa',              color: '#15803D', bgClass: 'bg-green-700 text-white dark:bg-green-900/80 dark:text-green-100 border border-green-800' },
  'L5':     { label: 'Lên cấp',                      color: '#6366F1', bgClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/30' },
  'L6':     { label: 'Giới thiệu học viên',           color: '#8B5CF6', bgClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-200 dark:border-purple-900/30' },
};

export function getLevelInfo(code) {
  if (code?.startsWith('L4.')) {
    const num = parseInt(code.replace('L4.', ''));
    return {
      label: `Đóng phí ${num} khóa`,
      color: '#15803D',
      bgClass: 'bg-green-700 text-white dark:bg-green-900/80 dark:text-green-100 border border-green-800',
    };
  }
  return LEVEL_CONFIG[code] || { label: code, color: '#6B7280', bgClass: 'bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 border border-gray-200 dark:border-gray-700/50' };
}

export function isMilestone(code) {
  return MILESTONE_LEVELS.includes(code);
}

export const ALL_LEVEL_CODES = [
  'L0', 'L0.R', 'L0.K', 'L1', 'L1.KK', 'L1.2', 'L1.3',
  'L2.2A', 'L2.2B', 'L2.2O', 'L2.2OS', 'L2.3',
  'L3.O', 'L3.1', 'L3.3',
  'L4.1', 'L4.2', 'L4.3', 'L4.4', 'L4.5', 'L4.6', 'L4.7',
  'L4.8', 'L4.9', 'L4.10', 'L4.11', 'L4.12', 'L4.13',
  'L5', 'L6',
];
