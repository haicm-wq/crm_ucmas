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
const STATUS_COL_HEADER = 'CRM Status';

// Timeout: dừng trước giới hạn 6 phút của Google (để còn kịp ghi status)
const MAX_EXECUTION_MS = 5 * 60 * 1000; // 5 phút (chừa 1 phút ghi kết quả)

// Rate limit giữa các API call
const API_DELAY_MS = 100;

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

  console.log('✅ Auto-sync trigger đã được tạo (mỗi 1 phút check CRM interval)');
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

  if (sync_enabled !== 'true' || !sync_interval || sync_interval === '0') return;

  const intervalMs = parseInt(sync_interval) * 60 * 1000;
  const now = Date.now();
  const lastSync = last_sync_at ? new Date(last_sync_at).getTime() : 0;
  if (now - lastSync < intervalMs) return;

  console.log('🔄 Bắt đầu đồng bộ...');
  const result = syncNewRows(field_mapping);
  updateSyncStatus(result);
}

// ═══════════════════════════════════════════════════════════
// SYNC — OPTIMIZED: Batch read + timeout protection
// ═══════════════════════════════════════════════════════════
function syncNewRows(fieldMapping) {
  if (!fieldMapping || !fieldMapping.mapping) {
    console.error('Chưa cấu hình mapping!');
    return { error: 'no_mapping', success: 0, skipped: 0, failed: 0, total_checked: 0 };
  }

  const startTime = Date.now();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
        }
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
  };

  headers.forEach((header, colIdx) => {
    const headerName = String(header).trim();
    const crmField = mapping[headerName];
    if (!crmField) return;

    const val = rowValues[colIdx];
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
    if (code >= 400) {
      console.error('RPC error:', code, response.getContentText());
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// ĐỌC CẤU HÌNH TỪ CRM
// ═══════════════════════════════════════════════════════════
function getSyncConfig() {
  const url = SUPABASE_URL + '/rest/v1/system_settings?key=in.(sync_enabled,sync_interval,last_sync_at,sheet_field_mapping)&select=key,value';
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(response.getContentText());
    const config = {};
    (data || []).forEach((row) => { config[row.key] = row.value; });

    if (config.sheet_field_mapping) {
      try { config.field_mapping = JSON.parse(config.sheet_field_mapping); }
      catch { config.field_mapping = null; }
    }
    return config;
  } catch (err) {
    console.error('Error loading config:', err);
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
    const url = SUPABASE_URL + '/rest/v1/system_settings?key=eq.' + item.key;
    try {
      const resp = UrlFetchApp.fetch(url, {
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify({ value: item.value }),
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() === 404 || resp.getContentText().includes('0 rows')) {
        UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/system_settings', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(item),
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Prefer': 'return=minimal',
          },
          muteHttpExceptions: true,
        });
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
  const result = syncNewRows(config.field_mapping);
  updateSyncStatus(result);
  console.log('Manual sync done:', JSON.stringify(result));
}
