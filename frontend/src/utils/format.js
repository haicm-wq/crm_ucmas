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
  return d.toLocaleDateString('vi-VN');
}

/**
 * Convert value → datetime-local input format (yyyy-MM-ddTHH:mm)
 * Safe: returns '' on invalid input
 * @param {string|Date|null} val
 * @returns {string}
 */
export function toDatetimeLocal(val) {
  if (!val) return '';
  try {
    const d = typeof val === 'string' ? val : new Date(val).toISOString();
    return d.slice(0, 16);
  } catch {
    return '';
  }
}
