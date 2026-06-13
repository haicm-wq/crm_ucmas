import { useState, useCallback, useEffect } from 'react';
import { fetchAppointmentReminders } from '../../services/api';
import { HiOutlinePhone, HiOutlineOfficeBuilding } from 'react-icons/hi';
import ReminderSection from './ReminderSection';
import CommentSection from './CommentSection';

export default function AppointmentDetail({ appt }) {
  const [reminders, setReminders] = useState([]);
  const [loaded, setLoaded] = useState(false);

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
