/**
 * EmptyState — Reusable empty state with icon + message + optional action
 * Replaces bare "Không tìm thấy..." text throughout the app
 */
import { HiOutlineInbox } from 'react-icons/hi';

export default function EmptyState({
  icon: Icon = HiOutlineInbox,
  title = 'Không có dữ liệu',
  description,
  action,
  actionLabel,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-surface-100 dark:bg-surface-800/50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-surface-400 dark:text-surface-500" />
      </div>
      <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-surface-500 text-center max-w-sm">{description}</p>
      )}
      {action && actionLabel && (
        <button onClick={action} className="btn-primary text-sm mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
