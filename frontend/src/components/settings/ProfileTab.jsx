import { useState } from 'react';
import { changePassword } from '../../services/api';
import toast from 'react-hot-toast';

export default function ProfileTab() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Xác nhận mật khẩu không khớp');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(newPassword);
      toast.success('Đổi mật khẩu thành công!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Lỗi đổi mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-4">
      <div className="glass-card p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200">Đổi mật khẩu tài khoản</h2>
          <p className="text-xs text-surface-500 mt-1">
            Mật khẩu mới phải dài tối thiểu 6 ký tự.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Mật khẩu mới *
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field py-2 text-sm w-full"
              placeholder="Nhập mật khẩu mới"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Xác nhận mật khẩu mới *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field py-2 text-sm w-full"
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang cập nhật...
              </>
            ) : (
              'Cập nhật mật khẩu'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
