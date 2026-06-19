import React from 'react';

/**
 * CustomDateTimePicker
 * Replaces native <input type="datetime-local" />
 * - Standard native date picker (<input type="date">)
 * - Custom hours select (1 to 12)
 * - Custom minutes select (00, 05, 10, ..., 55)
 * - Custom period select (SA/CH)
 */
export default function CustomDateTimePicker({ value, onChange, disabled, className = "" }) {
  let datePart = "";
  let hourPart = "09";
  let minutePart = "00";
  let periodPart = "SA";

  if (value) {
    const tIdx = value.indexOf('T');
    if (tIdx !== -1) {
      datePart = value.substring(0, tIdx);
      const timePart = value.substring(tIdx + 1); // "HH:mm"
      const parts = timePart.split(':');
      if (parts.length >= 2) {
        const hStr = parts[0];
        const mStr = parts[1];
        let h = parseInt(hStr, 10);
        let m = parseInt(mStr, 10);

        // Round to nearest 5 minutes
        m = Math.round(m / 5) * 5;
        if (m >= 60) {
          m = 55;
        }
        minutePart = String(m).padStart(2, '0');

        if (h >= 12) {
          periodPart = "CH";
          if (h > 12) h -= 12;
        } else {
          periodPart = "SA";
          if (h === 0) h = 12;
        }
        hourPart = String(h).padStart(2, '0');
      }
    }
  }

  const getTodayLocalStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const updateValue = (newDate, newHour, newMinute, newPeriod) => {
    if (!newDate) {
      onChange("");
      return;
    }
    let h = parseInt(newHour, 10);
    if (newPeriod === "CH" && h < 12) {
      h += 12;
    } else if (newPeriod === "SA" && h === 12) {
      h = 0;
    }
    const hStr = String(h).padStart(2, '0');
    const mStr = String(newMinute).padStart(2, '0');
    onChange(`${newDate}T${hStr}:${mStr}`);
  };

  const handleDateChange = (e) => {
    const val = e.target.value;
    if (!val) {
      updateValue("", "09", "00", "SA");
    } else {
      updateValue(val, hourPart, minutePart, periodPart);
    }
  };

  const handleHourChange = (e) => {
    updateValue(datePart || getTodayLocalStr(), e.target.value, minutePart, periodPart);
  };

  const handleMinuteChange = (e) => {
    updateValue(datePart || getTodayLocalStr(), hourPart, e.target.value, periodPart);
  };

  const handlePeriodChange = (e) => {
    updateValue(datePart || getTodayLocalStr(), hourPart, minutePart, e.target.value);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  return (
    <div className={`flex flex-wrap items-center gap-1.5 w-full ${className}`}>
      <input
        type="date"
        value={datePart}
        onChange={handleDateChange}
        disabled={disabled}
        className="input-field py-1.5 px-3 text-sm flex-1 min-w-[120px]"
      />
      <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-800 rounded-lg p-1 border border-surface-200/50 dark:border-surface-700/30">
        <select
          value={hourPart}
          onChange={handleHourChange}
          disabled={disabled}
          className="bg-transparent border-0 text-sm font-semibold focus:ring-0 px-1.5 py-0.5 text-surface-800 dark:text-surface-200 cursor-pointer"
        >
          {hours.map((h) => (
            <option key={h} value={h} className="dark:bg-surface-900">{h}</option>
          ))}
        </select>
        <span className="text-surface-400 font-bold">:</span>
        <select
          value={minutePart}
          onChange={handleMinuteChange}
          disabled={disabled}
          className="bg-transparent border-0 text-sm font-semibold focus:ring-0 px-1.5 py-0.5 text-surface-800 dark:text-surface-200 cursor-pointer"
        >
          {minutes.map((m) => (
            <option key={m} value={m} className="dark:bg-surface-900">{m}</option>
          ))}
        </select>
        <select
          value={periodPart}
          onChange={handlePeriodChange}
          disabled={disabled}
          className="bg-transparent border-0 text-xs font-bold focus:ring-0 px-1.5 py-0.5 text-primary-600 dark:text-primary-400 cursor-pointer"
        >
          <option value="SA" className="dark:bg-surface-900">SA</option>
          <option value="CH" className="dark:bg-surface-900">CH</option>
        </select>
      </div>
    </div>
  );
}
