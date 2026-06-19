import { useState, useCallback, useEffect } from 'react';
import { fetchAppointmentReminders, updateLead } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSharedData } from '../../contexts/SharedDataProvider';
import { HiOutlinePhone, HiOutlineOfficeBuilding, HiOutlineUser } from 'react-icons/hi';
import ReminderSection from './ReminderSection';
import CommentSection from './CommentSection';
import toast from 'react-hot-toast';

export default function AppointmentDetail({ appt, onUpdate }) {
  const { user, isAdmin, isMarketing, isCenter, isTelesale, isLeadTelesale } = useAuth();
  const { centers, allStaff } = useSharedData();
  const [reminders, setReminders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [updating, setUpdating] = useState(false);

  const canAssign = isAdmin || isMarketing || isLeadTelesale;
  const canEditAppointment = isAdmin || isLeadTelesale || isMarketing ||
    (isCenter && appt.assigned_center === user?.center_id) ||
    (isTelesale && appt.assigned_staff === user?.id);

  const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [newApptTime, setNewApptTime] = useState(formatDateForInput(appt.trial_appointment_at));

  useEffect(() => {
    setNewApptTime(formatDateForInput(appt.trial_appointment_at));
  }, [appt.trial_appointment_at]);

  const loadReminders = useCallback(async () => {
    try {
      const data = await fetchAppointmentReminders(appt.id);
      setReminders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoaded(true);
    }
  }, [appt.id]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const handleStaffChange = async (e) => {
    const newStaffId = e.target.value || null;
    if (updating) return;
    setUpdating(true);
    try {
      await updateLead(appt.id, { assigned_staff: newStaffId }, 'Chuyển telesale phụ trách');
      toast.success('Đã chuyển nhân viên Sale đặt lịch');
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error('Lỗi chuyển nhân viên: ' + (err.message || ''));
    } finally {
      setUpdating(false);
    }
  };

  const handleCenterChange = async (e) => {
    const newCenterId = e.target.value || null;
    if (updating) return;
    setUpdating(true);
    try {
      await updateLead(appt.id, { assigned_center: newCenterId }, 'Chuyển trung tâm phụ trách');
      toast.success('Đã chuyển trung tâm');
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error('Lỗi chuyển trung tâm: ' + (err.message || ''));
    } finally {
      setUpdating(false);
    }
  };

  const handleReschedule = async () => {
    if (!newApptTime) return;
    if (updating) return;
    setUpdating(true);
    try {
      const formattedIso = new Date(newApptTime).toISOString();
      await updateLead(appt.id, { trial_appointment_at: formattedIso }, 'Đổi lịch hẹn học thử');
      toast.success('Đã đổi lịch hẹn học thử');
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error('Lỗi đổi lịch hẹn: ' + (err.message || ''));
    } finally {
      setUpdating(false);
    }
  };

  const saleReminder = reminders.find((r) => r.role === 'sale') || null;
  const centerReminder = reminders.find((r) => r.role === 'center') || null;

  if (!loaded) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" role="status" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Phụ trách & Trung tâm & Đổi lịch */}
      <div className="bg-surface-50 dark:bg-surface-800/40 p-4 rounded-xl border border-surface-200/50 dark:border-surface-700/30 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex-1 flex flex-col lg:flex-row gap-4">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-semibold text-surface-500 flex items-center gap-1.5">
              <HiOutlineUser className="w-4 h-4 text-primary-400" /> Sale đặt lịch phụ trách
            </label>
            {canAssign ? (
              <select
                value={appt.assigned_staff || ''}
                onChange={handleStaffChange}
                disabled={updating}
                className="select-field text-xs py-1.5 px-3"
              >
                <option value="">Chưa gán</option>
                {allStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-medium text-surface-700 dark:text-surface-300 pl-5.5 py-1">
                {appt.sale_name || 'Chưa gán'}
              </p>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-semibold text-surface-500 flex items-center gap-1.5">
              <HiOutlineOfficeBuilding className="w-4 h-4 text-primary-400" /> Trung tâm học thử
            </label>
            {canAssign ? (
              <select
                value={appt.assigned_center || ''}
                onChange={handleCenterChange}
                disabled={updating}
                className="select-field text-xs py-1.5 px-3"
              >
                <option value="">Chưa gán</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-medium text-surface-700 dark:text-surface-300 pl-5.5 py-1">
                {appt.center_name || 'Chưa gán'}
              </p>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-semibold text-surface-500 flex items-center gap-1.5">
              📅 Đổi lịch hẹn học thử
            </label>
            {canEditAppointment ? (
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  step="300"
                  value={newApptTime}
                  onChange={(e) => setNewApptTime(e.target.value)}
                  disabled={updating}
                  className="input-field text-xs py-1 px-2 font-mono flex-1 min-w-[140px]"
                />
                <button
                  onClick={handleReschedule}
                  disabled={updating || !newApptTime || newApptTime === formatDateForInput(appt.trial_appointment_at)}
                  className="btn-primary text-xs py-1 px-3 whitespace-nowrap"
                >
                  Đổi lịch
                </button>
              </div>
            ) : (
              <p className="text-xs font-medium text-surface-700 dark:text-surface-300 pl-5.5 py-1">
                {appt.trial_appointment_at ? new Date(appt.trial_appointment_at).toLocaleString('vi-VN') : 'Chưa đặt'}
              </p>
            )}
          </div>
        </div>
        {updating && (
          <div className="flex items-center justify-center px-4">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="border-t border-surface-200 dark:border-surface-700" />

      <div className="flex flex-col sm:flex-row gap-4">
        <ReminderSection
          leadId={appt.id}
          role="sale"
          label="Sale nhắc lịch"
          icon={HiOutlinePhone}
          reminder={saleReminder}
          onUpdate={loadReminders}
        />
        <div className="hidden sm:block w-px bg-surface-200 dark:bg-surface-700" />
        <ReminderSection
          leadId={appt.id}
          role="center"
          label="Trung tâm nhắc lịch"
          icon={HiOutlineOfficeBuilding}
          reminder={centerReminder}
          onUpdate={loadReminders}
        />
      </div>
      <div className="border-t border-surface-200 dark:border-surface-700" />
      <CommentSection leadId={appt.id} />
    </div>
  );
}
