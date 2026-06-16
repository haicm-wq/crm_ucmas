/**
 * UCMAS CRM — Shared constants
 * Tập trung các hằng số dùng chung để tránh magic strings/arrays rải rác
 */

/** Danh sách sản phẩm — dùng ở LeadsPage, LeadPoolPage, LeadDetailPanel */
export const PRODUCTS = ['UCMAS', 'UCKID', 'ROBOT', 'TRẠI HÈ'];

/** Options dạng { value, label } cho MultiSelect dropdown */
export const PRODUCT_OPTIONS = PRODUCTS.map((p) => ({ value: p, label: p }));

/** Regex validate SĐT Việt Nam: 0xxxxxxxxx (10 số) hoặc xxxxxxxxx (9 số không bắt đầu bằng 0) */
export const PHONE_REGEX = /^(?:0\d{9}|[1-9]\d{8})$/;

/** Danh sách level cho L0 Pool (chuyển nhanh) */
export const L0_POOL_LEVELS = [
  { value: 'L0', label: 'L0 — Data đầu vào' },
  { value: 'L1.KK', label: 'L1 Kho kiểm' },
  { value: 'L0.R', label: 'Số rác' },
  { value: 'L0.K', label: 'Khu vực khác' },
];

/** 3 tiếng = ngưỡng cảnh báo xử lý L0 */
export const L0_ALERT_THRESHOLD_MS = 3 * 60 * 60 * 1000;

/** Status map cho Appointment */
export const APPOINTMENT_STATUS_MAP = {
  scheduled: { label: 'Đã hẹn', color: 'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-500/10', dot: 'bg-blue-500' },
  attended: { label: 'Đã học thử', color: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/10', dot: 'bg-green-500' },
  missed: { label: 'Bỏ lỡ', color: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/10', dot: 'bg-red-500' },
  cancelled: { label: 'Hủy', color: 'text-surface-500 bg-surface-200 dark:bg-surface-700/50', dot: 'bg-surface-400' },
};

/** Source type labels */
export const SOURCE_TYPE_LABELS = {
  PULL: 'Quảng cáo',
  PUSH: 'Giới thiệu',
};

/** Default page sizes for data tables */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

/** Year range for child birth year select */
export const BIRTH_YEAR_RANGE = Array.from({ length: 21 }, (_, i) => 2010 + i);
