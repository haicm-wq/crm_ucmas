import { useState, useEffect } from 'react';
import { upsertAppointmentReminder } from '../../services/api';
import toast from 'react-hot-toast';

export default function ReminderSection({ leadId, role, label, icon: Icon, reminder, onUpdate }) {
  const [note, setNote] = useState(reminder?.note || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNote(reminder?.note || ''); }, [reminder?.note]);

  const handleStatusChange = async (newStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      await upsertAppointmentReminder(leadId, role, newStatus, newStatus === 'failed' ? note : null);
      onUpdate();
      if (newStatus === 'reminded') toast.success(`${label}: Đã nhắc lịch hẹn`);
    } catch (err) {
      toast.error('Lỗi cập nhật: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await upsertAppointmentReminder(leadId, role, 'failed', note);
      onUpdate();
      toast.success('Đã lưu ghi chú');
    } catch (err) {
      toast.error('Lỗi lưu ghi chú');
    } finally {
      setSaving(false);
    }
  };

  const status = reminder?.status || 'pending';

  return (
    <div className="flex-1 min-w-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-surface-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">{label}</span>
      </div>

      <div className="flex gap-2 mb-2">
        <button
          onClick={() => handleStatusChange('reminded')}
          disabled={saving}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-150 border ${
            status === 'reminded'
              ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30'
              : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:bg-green-50 dark:hover:bg-green-500/5 hover:border-green-300'
          }`}
        >
          ✅ Đã nhắc
        </button>
        <button
          onClick={() => handleStatusChange('failed')}
          disabled={saving}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-150 border ${
            status === 'failed'
              ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30'
              : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:bg-red-50 dark:hover:bg-red-500/5 hover:border-red-300'
          }`}
        >
          ❌ Chưa nhắc được
        </button>
      </div>

      {status === 'failed' && (
        <div className="mt-2 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lý do chưa nhắc được lịch..."
            rows={2}
            className="input-field text-xs py-2 resize-none"
          />
          <button onClick={handleSaveNote} disabled={saving || !note.trim()} className="btn-primary text-xs py-1.5 px-3">
            {saving ? 'Đang lưu...' : 'Lưu ghi chú'}
          </button>
        </div>
      )}

      {reminder?.updated_by_name && (
        <p className="text-[10px] text-surface-400 mt-2">
          Cập nhật bởi {reminder.updated_by_name} · {new Date(reminder.updated_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
