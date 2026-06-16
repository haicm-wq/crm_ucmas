/**
 * ConfirmDialog — Custom modal thay thế window.confirm()
 * Phù hợp với design system, hỗ trợ dark mode
 */
import { HiOutlineExclamationCircle } from 'react-icons/hi';

export default function ConfirmDialog({
  isOpen,
  title = 'Xác nhận',
  message = 'Bạn có chắc chắn muốn thực hiện thao tác này?',
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Hủy',
  variant = 'warning', // 'warning' | 'danger' | 'info'
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const variantStyles = {
    warning: {
      icon: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      btn: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    },
    danger: {
      icon: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      btn: 'bg-red-500 hover:bg-red-600 text-white',
    },
    info: {
      icon: 'text-primary-500',
      bg: 'bg-primary-500/10',
      border: 'border-primary-500/30',
      btn: 'bg-primary-500 hover:bg-primary-600 text-white',
    },
  };

  const style = variantStyles[variant] || variantStyles.warning;

  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 60 }}>
      <div
        className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${style.bg} ${style.border} border flex items-center justify-center`}>
              <HiOutlineExclamationCircle className={`w-6 h-6 ${style.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-surface-800 dark:text-surface-100">
                {title}
              </h3>
              <div className="mt-2 text-sm text-surface-600 dark:text-surface-400 whitespace-pre-line">
                {message}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30 rounded-b-2xl">
          <button
            onClick={onCancel}
            className="btn-ghost text-sm px-4 py-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors duration-150 shadow-sm ${style.btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
