/**
 * UCMAS CRM — Google Apps Script (OPTIMIZED)
 * Đồng bộ data từ Sheet → Supabase CRM (tự động theo interval)
 * 
 * === TỐI ƯU SO VỚI BẢN CŨ ===
 * ✅ Batch read: Đọc TOÀN BỘ Sheet 1 lần (thay vì từng row)
 * ✅ Batch write: Ghi status hàng loạt cuối cùng (thay vì từng row)
 * ✅ Timeout protection: Tự dừng trước giới hạn 6 phút
 * ✅ Giảm sleep: 100ms thay vì 200ms (đủ rate limit Supabase)
 * ✅ Tốc độ: ~1500-2500 rows/lần (trước: ~550-800)
 *
 * CƠ CHẾ TRÁNH TRÙNG:
 * - Tự thêm cột "CRM Status" ở cuối Sheet
 * - Sau khi sync thành công → ghi "✅ Đã đồng bộ" + mã lead + thời gian
 * - Các lần sync sau chỉ xử lý row CHƯA có trạng thái
 * - Nếu bị timeout → lần chạy sau tiếp tục từ row chưa sync
 *
 * HƯỚNG DẪN CÀI ĐẶT:
 * 1. Mở Google Sheet → Extensions → Apps Script
 * 2. Dán toàn bộ code này vào
 * 3. Đổi SUPABASE_URL + SUPABASE_ANON_KEY 
 * 4. Chạy hàm setupAutoSync() 1 lần → tạo trigger tự động
 * 5. Vào CRM → Cài đặt → Google Sheets → mapping trường + chọn tần suất
 */

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...YOUR_ANON_KEY...';

// Tên cột trạng thái (tự thêm ở cuối Sheet)
const STATUS_COL_HEADER = 'Trạng thái cập nhật CRM';

// Timeout: dừng trước giới hạn 6 phút của Google (để còn kịp ghi status)
const MAX_EXECUTION_MS = 5 * 60 * 1000; // 5 phút (chừa 1 phút ghi kết quả)

// Rate limit giữa các API call
const API_DELAY_MS = 100;

// Cấu hình các trường dữ liệu xuất và tiêu đề mặc định
const CRM_EXPORT_FIELDS = [
  { key: 'lead_code', label: 'Mã Lead', defaultHeader: 'Mã Lead' },
  { key: 'full_name', label: 'Họ tên phụ huynh', defaultHeader: 'Họ tên phụ huynh' },
  { key: 'phone', label: 'SĐT phụ huynh', defaultHeader: 'SĐT phụ huynh' },
  { key: 'child_name', label: 'Tên con', defaultHeader: 'Tên con' },
  { key: 'child_birth_year', label: 'Năm sinh con', defaultHeader: 'Năm sinh con' },
  { key: 'address', label: 'Địa chỉ', defaultHeader: 'Địa chỉ' },
  { key: 'level_code', label: 'Cấp độ/Level hiện tại', defaultHeader: 'Level' },
  { key: 'l4_type', label: 'Phân loại L4 (UCMAS/UCKID)', defaultHeader: 'Phân loại L4' },
  { key: 'center_name', label: 'Tên trung tâm phụ trách', defaultHeader: 'Trung tâm' },
  { key: 'staff_name', label: 'Tên Sale đặt lịch', defaultHeader: 'Sale đặt lịch' },
  { key: 'source_type', label: 'Nguồn', defaultHeader: 'Nguồn' },
  { key: 'ad_campaign', label: 'Chiến dịch QC', defaultHeader: 'Chiến dịch QC' },
  { key: 'interested_products', label: 'Sản phẩm quan tâm', defaultHeader: 'Sản phẩm' },
  { key: 'entered_l1_at', label: 'Thời điểm lên L1', defaultHeader: 'Mốc L1' },
  { key: 'entered_l2_at', label: 'Thời điểm lên L2', defaultHeader: 'Mốc L2' },
  { key: 'entered_l3_at', label: 'Thời điểm lên L3', defaultHeader: 'Mốc L3' },
  { key: 'entered_l4_at', label: 'Thời điểm lên L4', defaultHeader: 'Mốc L4' },
  { key: 'entered_l4_uckid_at', label: 'Thời điểm lên L4 UCKID', defaultHeader: 'Mốc L4 UCKID' },
  { key: 'entered_l4_ucmas_at', label: 'Thời điểm lên L4 UCMAS', defaultHeader: 'Mốc L4 UCMAS' },
  { key: 'created_at', label: 'Ngày tạo', defaultHeader: 'Ngày tạo' },
  { key: 'updated_at', label: 'Ngày cập nhật', defaultHeader: 'Ngày cập nhật' },
];

// ═══════════════════════════════════════════════════════════
// CÀI ĐẶT: Chạy 1 lần để tạo trigger tự động
// ═══════════════════════════════════════════════════════════
function setupAutoSync() {
  // Xóa trigger cũ
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'autoSyncTick') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger mỗi 1 phút — script tự kiểm tra interval từ CRM
  ScriptApp.newTrigger('autoSyncTick')
    .timeBased()
    .everyMinutes(1)
    .create();

  // Đẩy headers lên CRM ngay để UI hiển thị mapping
  pushHeadersToCRM();

  console.log('✅ Auto-sync trigger đã được tạo + headers đã đẩy lên CRM');
}

// ═══════════════════════════════════════════════════════════
// ĐẨY HEADERS LÊN CRM (để UI tự đọc — không cần nhập tay)
// ═══════════════════════════════════════════════════════════
function pushHeadersToCRM() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    console.warn('⚠️ Sheet rỗng hoặc không tìm thấy cột nào để đẩy.');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim())
    .filter(h => h && h !== STATUS_COL_HEADER);

  if (headers.length === 0) {
    console.warn('⚠️ Không tìm thấy tiêu đề cột hợp lệ.');
    return;
  }

  const payload = {
    key: 'sheet_columns_auto',
    value: JSON.stringify({
      columns: headers,
      tab_name: sheet.getName(),
      sheet_name: SpreadsheetApp.getActiveSpreadsheet().getName(),
      total_rows: Math.max(0, sheet.getLastRow() - 1),
      pushed_at: new Date().toISOString(),
    }),
  };

  // UPSERT: insert hoặc update nếu đã tồn tại (fix lỗi PATCH rỗng)
  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/system_settings', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  if (code >= 400) {
    console.error('❌ Lỗi đẩy headers (HTTP ' + code + '):', resp.getContentText());
  } else {
    console.log('📤 Đã đẩy ' + headers.length + ' cột lên CRM: ' + headers.join(', '));
  }
}

// ═══════════════════════════════════════════════════════════
// TÌM HOẶC TẠO CỘT TRẠNG THÁI
// ═══════════════════════════════════════════════════════════
function getOrCreateStatusCol(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === STATUS_COL_HEADER) {
      return i + 1;
    }
  }

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(STATUS_COL_HEADER);
  sheet.getRange(1, newCol).setFontWeight('bold');
  sheet.getRange(1, newCol).setBackground('#E8F5E9');
  return newCol;
}

// ═══════════════════════════════════════════════════════════
// HÀM CHÍNH: Chạy mỗi 1 phút bởi trigger
// ═══════════════════════════════════════════════════════════
function autoSyncTick() {
  const config = getSyncConfig();
  if (!config) return;

  const { sync_enabled, sync_interval, last_sync_at, field_mapping } = config;
  const lastSync = last_sync_at ? new Date(last_sync_at).getTime() : 0;

  // 1. Kiểm tra & Chạy Chiều Nhập (Inbound)
  const isInboundManual = lastSync > 0 && lastSync < new Date('2010-01-01').getTime();
  let runInbound = false;
  if (isInboundManual) {
    runInbound = true;
  } else if (sync_enabled === 'true' && sync_interval && sync_interval !== '0') {
    const intervalMs = parseInt(sync_interval) * 60 * 1000;
    const bufferMs = Math.min(2 * 60 * 1000, intervalMs * 0.1); // Grace period: 2 phút hoặc 10% chu kỳ
    if (Date.now() - lastSync >= (intervalMs - bufferMs)) {
      runInbound = true;
    }
  }

  if (runInbound) {
    console.log(isInboundManual ? '🔄 Bắt đầu đồng bộ Chiều Nhập thủ công (yêu cầu từ CRM)...' : '🔄 Bắt đầu đồng bộ Chiều Nhập định kỳ...');
    const result = syncNewRows(field_mapping, config.sheet_tab_name);
    updateSyncStatus(result);
  }

  // 2. Kiểm tra & Chạy Chiều Xuất (Outbound)
  const { sheet_out_sync_enabled, sheet_out_last_sync_at, sheet_out_field_mapping } = config;
  const lastOutSync = sheet_out_last_sync_at ? new Date(sheet_out_last_sync_at).getTime() : 0;
  const isOutboundManual = lastOutSync > 0 && lastOutSync < new Date('2010-01-01').getTime();
  let runOutbound = false;
  if (isOutboundManual) {
    runOutbound = true;
  } else if (sheet_out_sync_enabled === 'true' && sync_interval && sync_interval !== '0') {
    const intervalMs = parseInt(sync_interval) * 60 * 1000;
    const bufferMs = Math.min(2 * 60 * 1000, intervalMs * 0.1); // Grace period: 2 phút hoặc 10% chu kỳ
    if (Date.now() - lastOutSync >= (intervalMs - bufferMs)) {
      runOutbound = true;
    }
  }

  if (runOutbound) {
    console.log(isOutboundManual ? '🔄 Bắt đầu đồng bộ Chiều Xuất thủ công (yêu cầu từ CRM)...' : '🔄 Bắt đầu đồng bộ Chiều Xuất định kỳ...');
    const result = syncOutboundRows(config);
    updateSyncOutStatus(result);
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC — OPTIMIZED: Batch read + timeout protection
// ═══════════════════════════════════════════════════════════
function syncNewRows(fieldMapping, tabName) {
  if (!fieldMapping || !fieldMapping.mapping) {
    console.error('Chưa cấu hình mapping!');
    return { error: 'no_mapping', success: 0, skipped: 0, failed: 0, total_checked: 0 };
  }

  const startTime = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = null;
  if (tabName) {
    sheet = ss.getSheetByName(tabName);
  }
  if (!sheet) {
    sheet = ss.getActiveSheet();
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: 0, skipped: 0, failed: 0, total_checked: 0 };

  const statusCol = getOrCreateStatusCol(sheet);
  const lastDataCol = statusCol - 1;

  // ════════════════════════════════════════════
  // BATCH READ: Đọc TẤT CẢ data 1 lần duy nhất
  // ════════════════════════════════════════════
  const headers = sheet.getRange(1, 1, 1, lastDataCol).getValues()[0];
  const allData = sheet.getRange(2, 1, lastRow - 1, lastDataCol).getValues();
  const allStatus = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();

  let success = 0, skipped = 0, failed = 0, already_synced = 0, timed_out = false;

  // Buffer ghi status — sẽ flush cuối cùng hoặc khi đầy
  const statusUpdates = []; // [{ row, text, color }]

  for (let i = 0; i < allData.length; i++) {
    // ⏱️ TIMEOUT PROTECTION: kiểm tra mỗi 50 rows
    if (i % 50 === 0 && (Date.now() - startTime) > MAX_EXECUTION_MS) {
      timed_out = true;
      console.log(`⏱️ Timeout sau ${i} rows — sẽ tiếp tục lần sau`);
      break;
    }

    const row = i + 2;
    const status = String(allStatus[i][0]).trim();

    // ⏭️ BỎ QUA nếu đã đồng bộ (chỉ check string — không đọc Sheet)
    if (status && (status.startsWith('✅') || status.startsWith('⚠️') || status.startsWith('❌'))) {
      already_synced++;
      continue;
    }

    // Data đã có sẵn trong memory — không cần đọc Sheet
    const rowValues = allData[i];

    const payload = mapRowToPayload(headers, rowValues, fieldMapping.mapping, sheet.getName(), row);
    if (!payload.p_full_name) continue; // Row trống

    // Gọi Supabase RPC
    const result = callSupabaseRPC(payload);
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm');

    if (result) {
      if (result.status === 'success') {
        success++;
        statusUpdates.push({
          row, text: '✅ ' + (result.lead_code || 'OK') + ' · ' + timestamp, color: '#2E7D32',
        });
      } else if (result.status === 'skipped') {
        skipped++;
        if (result.reason === 'duplicate_hash') {
          statusUpdates.push({
            row, text: '✅ Đã có · ' + result.reason, color: '#F57F17',
          });
        } else if (result.reason === 'phone_reinterest') {
          statusUpdates.push({
            row, text: '⚠️ SĐT trùng (' + result.existing_count + ' lead)', color: '#E65100',
          });
        } else {
          statusUpdates.push({
            row, text: '⏭️ Bỏ qua · ' + (result.reason || 'không xác định'), color: '#757575',
          });
        }
      } else if (result.status === 'failed') {
        failed++;
        statusUpdates.push({
          row, text: '❌ Lỗi API: ' + result.error, color: '#C62828',
        });
      }
    } else {
      failed++;
      statusUpdates.push({
        row, text: '❌ Lỗi API', color: '#C62828',
      });
    }

    // Rate limit (giảm từ 200ms → 100ms vì đã bỏ read/write Sheet mỗi row)
    Utilities.sleep(API_DELAY_MS);
  }

  // ════════════════════════════════════════════
  // BATCH WRITE: Ghi TẤT CẢ status 1 lần
  // ════════════════════════════════════════════
  if (statusUpdates.length > 0) {
    flushStatusUpdates(sheet, statusCol, statusUpdates);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Sync hoàn tất trong ${elapsed}s: ${success} mới, ${skipped} bỏ qua, ${failed} lỗi, ${already_synced} đã sync trước đó${timed_out ? ' (TIMEOUT — sẽ tiếp tục)' : ''}`);

  return {
    success, skipped, failed, already_synced,
    total_checked: allData.length,
    timed_out,
    elapsed_seconds: parseFloat(elapsed),
  };
}

// ═══════════════════════════════════════════════════════════
// BATCH WRITE STATUS — Ghi hàng loạt (tối ưu I/O)
// ═══════════════════════════════════════════════════════════
function flushStatusUpdates(sheet, statusCol, updates) {
  // Nhóm theo rows liên tiếp để tối ưu setValues
  // Nhưng vì rows có thể không liên tiếp, dùng cách: ghi từng batch nhỏ
  // Mỗi batch ≤ 100 rows để tránh timeout ghi

  const BATCH_SIZE = 100;
  for (let b = 0; b < updates.length; b += BATCH_SIZE) {
    const batch = updates.slice(b, b + BATCH_SIZE);

    // Ghi text
    batch.forEach((u) => {
      sheet.getRange(u.row, statusCol).setValue(u.text);
    });

    // Ghi color (separate pass — ít tốn kém hơn setValues)
    batch.forEach((u) => {
      sheet.getRange(u.row, statusCol).setFontColor(u.color);
    });

    // Flush buffer để tránh chậm tích lũy
    SpreadsheetApp.flush();
  }
}

// ═══════════════════════════════════════════════════════════
// MAP ROW → PAYLOAD (theo mapping động)
// ═══════════════════════════════════════════════════════════
function mapRowToPayload(headers, rowValues, mapping, sheetName, row) {
  const payload = {
    p_sheet_name: sheetName,
    p_sheet_row: row,
    p_custom_fields: {},
  };

  headers.forEach((header, colIdx) => {
    const headerName = String(header).trim();
    const crmField = mapping[headerName];
    if (!crmField) return;

    const val = rowValues[colIdx];
    if (crmField.startsWith('custom_fields.')) {
      const customKey = crmField.split('.')[1];
      payload.p_custom_fields[customKey] = val !== undefined && val !== null ? String(val).trim() : null;
      return;
    }

    switch (crmField) {
      case 'full_name':
        payload.p_full_name = val ? String(val).trim() : null;
        break;
      case 'phone':
        payload.p_phone = val ? String(val).trim().replace(/\s+/g, '') : null;
        break;
      case 'child_birth_year':
        payload.p_child_birth_year = val ? parseInt(val) : null;
        break;
      case 'address':
        payload.p_address = val ? String(val).trim() : null;
        break;
      case 'source_type':
        payload.p_source_type = val ? String(val).trim() : 'PULL';
        break;
      case 'ad_campaign':
        payload.p_ad_campaign = val ? String(val).trim() : null;
        break;
      case 'child_name':
        payload.p_child_name = val ? String(val).trim() : null;
        break;
      case 'interested_products':
        if (val) {
          payload.p_interested_products = String(val).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        }
        break;
    }
  });

  return payload;
}

// ═══════════════════════════════════════════════════════════
// GỌI SUPABASE RPC
// ═══════════════════════════════════════════════════════════
function callSupabaseRPC(payload) {
  const url = SUPABASE_URL + '/rest/v1/rpc/rpc_sync_inbound';
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code >= 400) {
      console.error('RPC error:', code, text);
      let errMsg = 'HTTP ' + code;
      try {
        const parsed = JSON.parse(text);
        if (parsed.message) errMsg = parsed.message;
        else if (parsed.details) errMsg = parsed.details;
      } catch (e) {
        if (text && text.length < 100) errMsg = text;
      }
      return { status: 'failed', error: errMsg };
    }
    return JSON.parse(text);
  } catch (err) {
    console.error('Fetch error:', err);
    return { status: 'failed', error: String(err) };
  }
}

// ═══════════════════════════════════════════════════════════
// ĐỌC CẤU HÌNH TỪ CRM
// ═══════════════════════════════════════════════════════════
function getSyncConfig() {
  const keys = [
    'sync_enabled', 'sync_interval', 'last_sync_at', 'sheet_field_mapping', 'sheet_tab_name',
    'sheet_out_id', 'sheet_out_tab_name', 'sheet_out_field_mapping',
    'sheet_out_sync_enabled', 'sheet_out_last_sync_at', 'sheet_out_last_sync_result', 'sheet_out_last_sync_detail',
    'crm_custom_fields'
  ];
  const url = SUPABASE_URL + '/rest/v1/system_settings?key=in.(' + keys.join(',') + ')&select=key,value';
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    if (code >= 400) {
      console.error('❌ Lỗi đọc cấu hình từ CRM (HTTP ' + code + '):', response.getContentText());
      return null;
    }
    const data = JSON.parse(response.getContentText());
    const config = {};
    (data || []).forEach((row) => { config[row.key] = row.value; });

    if (config.sheet_field_mapping) {
      try { config.field_mapping = JSON.parse(config.sheet_field_mapping); }
      catch { config.field_mapping = null; }
    }
    if (config.sheet_out_field_mapping) {
      try { config.sheet_out_mapping = JSON.parse(config.sheet_out_field_mapping); }
      catch { config.sheet_out_mapping = null; }
    }
    return config;
  } catch (err) {
    console.error('❌ Lỗi kết nối Supabase khi đọc config:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// CẬP NHẬT TRẠNG THÁI SYNC VỀ CRM
// ═══════════════════════════════════════════════════════════
function updateSyncStatus(result) {
  const updates = [
    { key: 'last_sync_at', value: new Date().toISOString() },
    { key: 'last_sync_result', value: result.error ? 'error' : 'success' },
    { key: 'last_sync_detail', value: JSON.stringify(result) },
  ];

  updates.forEach((item) => {
    try {
      const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/system_settings', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(item),
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 400) {
        console.error('❌ Lỗi cập nhật trạng thái sync key ' + item.key + ' (HTTP ' + code + '):', resp.getContentText());
      }
    } catch (err) { console.error('Status update error:', err); }
  });
}

// ═══════════════════════════════════════════════════════════
// MANUAL: Sync thủ công (chạy tay khi cần)
// ═══════════════════════════════════════════════════════════
function manualSyncAll() {
  const config = getSyncConfig();
  if (!config || !config.field_mapping) {
    console.error('Chưa cấu hình mapping! Vào CRM → Cài đặt → Google Sheets');
    return;
  }
  const result = syncNewRows(config.field_mapping, config.sheet_tab_name);
  updateSyncStatus(result);
  console.log('Manual inbound sync done:', JSON.stringify(result));
}

function manualSyncOutbound() {
  const config = getSyncConfig();
  if (!config) return;
  console.log('🔄 Bắt đầu đồng bộ chiều xuất thủ công từ Menu Sheets...');
  const result = syncOutboundRows(config);
  updateSyncOutStatus(result);
  console.log('Manual outbound sync done:', JSON.stringify(result));
}

// ═══════════════════════════════════════════════════════════
// TỰ ĐỘNG THÊM MENU VÀO GOOGLE SHEETS
// ═══════════════════════════════════════════════════════════
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ CRM UCMAS')
    .addItem('1. Kích hoạt tự động đồng bộ (setup)', 'setupAutoSync')
    .addItem('2. Đẩy danh sách cột lên CRM', 'pushHeadersToCRM')
    .addSeparator()
    .addItem('3. Đồng bộ dữ liệu Nhập (Sheet -> CRM)', 'manualSyncAll')
    .addItem('4. Đồng bộ dữ liệu Xuất (CRM -> Sheet)', 'manualSyncOutbound')
    .addToUi();
}

// ═══════════════════════════════════════════════════════════
// CHIỀU XUẤT (OUTBOUND SYNC): CRM → Google Sheet
// ═══════════════════════════════════════════════════════════

function syncOutboundRows(config) {
  if (!config || !config.sheet_out_id || !config.sheet_out_mapping || !config.sheet_out_mapping.mapping) {
    console.error('Chưa cấu hình Google Sheet xuất hoặc mapping chiều xuất!');
    return { error: 'no_outbound_config', success: 0, updated: 0, failed: 0 };
  }

  const startTime = Date.now();
  let ss;
  try {
    ss = SpreadsheetApp.openById(config.sheet_out_id);
  } catch (err) {
    console.error('Không mở được Outbound Spreadsheet:', err);
    return { error: 'invalid_spreadsheet_id', success: 0, updated: 0, failed: 0 };
  }

  let sheet = ss.getSheetByName(config.sheet_out_tab_name);
  if (!sheet) {
    sheet = ss.insertSheet(config.sheet_out_tab_name || 'CRM Export');
  }

  const mapping = config.sheet_out_mapping.mapping;
  
  // Lấy các trường tùy chỉnh từ config
  let customFields = [];
  if (config.crm_custom_fields) {
    try {
      customFields = JSON.parse(config.crm_custom_fields);
    } catch (e) {
      console.error('Lỗi parse crm_custom_fields:', e);
    }
  }

  // Kết hợp danh sách trường tĩnh và trường tùy chỉnh động
  const allExportFields = [
    ...CRM_EXPORT_FIELDS,
    ...customFields.map(f => ({
      key: 'custom_fields.' + f.key,
      label: f.label + ' (Trường tùy chỉnh)',
      defaultHeader: f.label
    }))
  ];

  const activeMappedFields = allExportFields.filter(f => mapping[f.key] && mapping[f.key].trim() !== '');

  if (activeMappedFields.length === 0) {
    console.error('⚠️ Không có trường nào được cấu hình xuất dữ liệu.');
    return { error: 'no_mapped_fields', success: 0, updated: 0, failed: 0 };
  }

  // 1. Lấy headers hiện có trên Sheet
  const lastCol = sheet.getLastColumn();
  let sheetHeaders = [];
  if (lastCol > 0) {
    sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  }

  // 2. Khởi tạo headers nếu Sheet rỗng
  if (sheetHeaders.length === 0) {
    sheetHeaders = activeMappedFields.map(f => mapping[f.key].trim());
    if (sheetHeaders.length > 0) {
      sheet.getRange(1, 1, 1, sheetHeaders.length).setValues([sheetHeaders]);
      sheet.getRange(1, 1, 1, sheetHeaders.length).setFontWeight('bold');
      sheet.getRange(1, 1, 1, sheetHeaders.length).setBackground('#E8F5E9');
      SpreadsheetApp.flush();
    }
  } else {
    // 3. Nếu Sheet không rỗng, kiểm tra xem có cột nào mới được map cấu hình chưa có trên Sheet không -> append vào cuối
    let headersUpdated = false;
    activeMappedFields.forEach(f => {
      const headerName = mapping[f.key].trim();
      if (sheetHeaders.indexOf(headerName) === -1) {
        sheetHeaders.push(headerName);
        headersUpdated = true;
      }
    });
    if (headersUpdated) {
      sheet.getRange(1, 1, 1, sheetHeaders.length).setValues([sheetHeaders]);
      sheet.getRange(1, 1, 1, sheetHeaders.length).setFontWeight('bold');
      SpreadsheetApp.flush();
    }
  }

  // Lấy leads mới/cập nhật từ CRM
  const leads = getLeadsForOutboundSync(config.sheet_out_last_sync_at);
  if (!leads) {
    return { error: 'fetch_leads_failed', success: 0, updated: 0, failed: 0 };
  }

  if (leads.length === 0) {
    console.log('ℹ️ Không có leads mới hoặc cập nhật cần xuất.');
    return { success: 0, updated: 0, failed: 0, total_leads: 0 };
  }

  console.log(`📋 Tìm thấy ${leads.length} leads cần đồng bộ chiều xuất.`);
  const lastRowBefore = sheet.getLastRow();

  const newLeads = [];
  const updatedLeads = [];

  leads.forEach((lead) => {
    if (!lead.sheet_out_row || lead.sheet_out_row <= 1 || lead.sheet_out_row > lastRowBefore) {
      newLeads.push(lead);
    } else {
      updatedLeads.push(lead);
    }
  });

  const rowUpdatesToSupabase = [];
  let successCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  // 1. Ghi mới các lead chưa có dòng (BATCH WRITE)
  if (newLeads.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    const newRowsValues = newLeads.map((lead, index) => {
      const targetRow = startRow + index;
      lead.sheet_out_row = targetRow;
      rowUpdatesToSupabase.push({ id: lead.id, sheet_row: targetRow });
      return mapLeadToRow(lead, sheetHeaders, mapping, null);
    });

    try {
      sheet.getRange(startRow, 1, newRowsValues.length, sheetHeaders.length).setValues(newRowsValues);
      successCount += newLeads.length;
    } catch (err) {
      console.error('❌ Lỗi batch write new leads:', err);
      failedCount += newLeads.length;
      rowUpdatesToSupabase.length = 0;
    }
  }

  // 2. Ghi đè các lead đã có dòng và được update (ROW-BY-ROW với cơ chế kiểm tra Mã Lead)
  if (updatedLeads.length > 0) {
    // Tìm cột chứa "Mã Lead" (lead_code) dynamically
    const leadCodeHeader = mapping.lead_code ? mapping.lead_code.trim() : 'Mã Lead';
    const leadCodeColIdx = sheetHeaders.indexOf(leadCodeHeader) + 1;
    let leadCodes = [];
    if (leadCodeColIdx > 0 && lastRowBefore > 0) {
      leadCodes = sheet.getRange(1, leadCodeColIdx, lastRowBefore, 1).getValues().map(r => String(r[0]).trim());
    }

    updatedLeads.forEach((lead) => {
      let targetRow = lead.sheet_out_row;
      let isMatch = false;

      // 1. Kiểm tra nhanh: Nếu dòng lưu trong DB khớp Mã Lead thực tế trên Sheet
      if (targetRow > 1 && targetRow <= lastRowBefore && leadCodes[targetRow - 1] === lead.lead_code) {
        isMatch = true;
      }

      // 2. Nếu không khớp (do chèn/xóa dòng hoặc sort), quét tìm Mã Lead trên cột
      if (!isMatch && leadCodes.length > 0) {
        const foundIdx = leadCodes.indexOf(lead.lead_code);
        if (foundIdx !== -1) {
          targetRow = foundIdx + 1;
          isMatch = true;
          // Ghi nhận cập nhật lại số dòng mới về Supabase
          rowUpdatesToSupabase.push({ id: lead.id, sheet_row: targetRow });
        }
      }

      try {
        let existingRowValues = null;
        if (isMatch && targetRow > 1 && targetRow <= lastRowBefore) {
          existingRowValues = sheet.getRange(targetRow, 1, 1, sheetHeaders.length).getValues()[0];
        }

        const rowValues = mapLeadToRow(lead, sheetHeaders, mapping, existingRowValues);

        if (isMatch) {
          sheet.getRange(targetRow, 1, 1, sheetHeaders.length).setValues([rowValues]);
          updatedCount++;
        } else {
          // 3. Nếu không tìm thấy, append như dòng mới ở cuối
          const appendRow = sheet.getLastRow() + 1;
          lead.sheet_out_row = appendRow;
          const newRowValues = mapLeadToRow(lead, sheetHeaders, mapping, null);
          sheet.getRange(appendRow, 1, 1, sheetHeaders.length).setValues([newRowValues]);
          rowUpdatesToSupabase.push({ id: lead.id, sheet_row: appendRow });
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Lỗi update lead ${lead.lead_code} tại dòng ${targetRow}:`, err);
        failedCount++;
      }
    });
  }

  SpreadsheetApp.flush();

  // 3. Cập nhật sheet_out_row ngược lại Supabase
  if (rowUpdatesToSupabase.length > 0) {
    const rpcSuccess = updateSheetOutRowsInSupabase(rowUpdatesToSupabase);
    if (!rpcSuccess) {
      console.error('❌ Lỗi cập nhật sheet_out_row về Supabase.');
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  return {
    success: successCount,
    updated: updatedCount,
    failed: failedCount,
    elapsed_seconds: parseFloat(elapsed),
    total_leads: leads.length
  };
}

function mapLeadToRow(lead, sheetHeaders, mapping, existingRowValues) {
  const headerToCrmKey = {};
  Object.entries(mapping).forEach(([crmKey, headerName]) => {
    if (headerName && headerName.trim() !== '') {
      headerToCrmKey[headerName.trim()] = crmKey;
    }
  });

  return sheetHeaders.map((header, colIdx) => {
    const crmKey = headerToCrmKey[header];
    if (!crmKey) {
      // Cột này không được map từ CRM (ví dụ: cột Trạng thái cập nhật CRM của chiều nhập)
      // Giữ nguyên giá trị cũ trên Sheet nếu có, tránh ghi đè làm trống
      return existingRowValues ? existingRowValues[colIdx] : '';
    }

    let val;
    if (crmKey.startsWith('custom_fields.')) {
      const customKey = crmKey.split('.')[1];
      val = lead.custom_fields ? lead.custom_fields[customKey] : null;
    } else {
      val = lead[crmKey];
    }

    if (val === undefined || val === null) return '';
    if (crmKey === 'interested_products' && Array.isArray(val)) {
      return val.join(', ');
    }
    if (crmKey === 'created_at' || crmKey === 'updated_at' || crmKey.endsWith('_at')) {
      try {
        return Utilities.formatDate(new Date(val), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
      } catch (e) {
        return String(val);
      }
    }
    return val;
  });
}

function getLeadsForOutboundSync(lastSyncAt) {
  const url = SUPABASE_URL + '/rest/v1/rpc/rpc_get_leads_for_outbound_sync';
  const payload = {
    p_last_sync_at: lastSyncAt || null
  };
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    if (code >= 400) {
      console.error('❌ Lỗi rpc_get_leads_for_outbound_sync (HTTP ' + code + '):', response.getContentText());
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (err) {
    console.error('❌ Lỗi kết nối khi lấy leads outbound:', err);
    return null;
  }
}

function updateSheetOutRowsInSupabase(updates) {
  const url = SUPABASE_URL + '/rest/v1/rpc/rpc_update_sheet_out_rows';
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ p_updates: updates }),
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    return code < 400;
  } catch (err) {
    console.error('❌ Lỗi kết nối khi cập nhật sheet_out_row:', err);
    return false;
  }
}

function updateSyncOutStatus(result) {
  const updates = [
    { key: 'sheet_out_last_sync_at', value: new Date().toISOString() },
    { key: 'sheet_out_last_sync_result', value: result.error ? 'error' : 'success' },
    { key: 'sheet_out_last_sync_detail', value: JSON.stringify(result) },
  ];

  updates.forEach((item) => {
    try {
      const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/system_settings', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(item),
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code >= 400) {
        console.error('❌ Lỗi cập nhật trạng thái outbound key ' + item.key + ' (HTTP ' + code + '):', resp.getContentText());
      }
    } catch (err) { console.error('Status update error:', err); }
  });
}
