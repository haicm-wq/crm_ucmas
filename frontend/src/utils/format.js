/**
 * UCMAS CRM — Shared formatting utilities
 * Thay thế các hàm format rải rác ở 4+ files
 */

/**
 * Format date ngắn: dd/MM/yy
 * @param {string|Date} dt
 * @returns {string}
 */
export function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Format datetime đầy đủ: dd/MM/yyyy HH:mm
 * @param {string|Date} dt
 * @returns {string}
 */
export function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Format thời gian tương đối: "Vừa xong", "5 phút trước", "3 giờ trước", dd/MM/yyyy
 * @param {string|Date} dt
 * @returns {string}
 */
export function formatRelativeTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const now = new Date();
  const diffSec = (now - d) / 1000;
  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return d.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Convert Date to yyyy-MM-dd format in Vietnam timezone
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateYmd(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch {
    return '';
  }
}

/**
 * Convert value → datetime-local input format (yyyy-MM-ddTHH:mm) in Vietnam timezone
 * Safe: returns '' on invalid input
 * @param {string|Date|null} val
 * @returns {string}
 */
export function toDatetimeLocal(val) {
  if (!val) return '';
  try {
    const d = typeof val === 'string' ? new Date(val) : val;
    if (isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const formatted = formatter.format(d); // "yyyy-MM-dd HH:mm"
    const parts = formatted.split(' ');
    const datePart = parts[0];
    const timePart = parts[1].slice(0, 5);
    return `${datePart}T${timePart}`;
  } catch {
    return '';
  }
}

/**
 * Convert zone-less local datetime string (yyyy-MM-ddTHH:mm) back to UTC ISO string in Asia/Ho_Chi_Minh (+07:00)
 * @param {string} val 
 * @returns {string|null}
 */
export function toIsoUtcString(val) {
  if (!val) return null;
  try {
    if (val.includes('+') || val.endsWith('Z')) {
      return new Date(val).toISOString();
    }
    return new Date(`${val}:00+07:00`).toISOString();
  } catch {
    return null;
  }
}
