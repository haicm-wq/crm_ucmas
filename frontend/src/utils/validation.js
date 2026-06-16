/**
 * UCMAS CRM — Shared validation utilities
 */
import { PHONE_REGEX } from '../config/constants';

/**
 * Validate SĐT Việt Nam
 * @param {string} phone
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePhone(phone) {
  if (!phone) return { valid: true }; // empty is OK (optional field)
  if (!PHONE_REGEX.test(phone)) {
    return {
      valid: false,
      message: 'SĐT bắt đầu bằng 0 phải đủ 10 số, không bắt đầu bằng 0 phải đủ 9 số',
    };
  }
  return { valid: true };
}

/**
 * Clean form changes → chỉ gửi fields có thay đổi, convert '' → null cho UUID/date/select
 * Di chuyển từ LeadDetailPanel để dùng chung
 * @param {Object} form
 * @returns {Object}
 */
export function cleanFormChanges(form) {
  const changes = {};
  const NULL_FIELDS = ['assigned_center', 'assigned_staff', 'trial_appointment_at', 'next_followup_at', 'l4_type'];

  for (const [k, v] of Object.entries(form)) {
    if (v === '' && NULL_FIELDS.includes(k)) {
      changes[k] = null;
    } else if (v === '') {
      continue; // skip empty optional text fields
    } else {
      changes[k] = v;
    }
  }
  if (changes.child_birth_year) {
    changes.child_birth_year = parseInt(changes.child_birth_year);
  }
  return changes;
}
