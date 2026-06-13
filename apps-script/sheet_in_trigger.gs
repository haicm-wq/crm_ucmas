/**
 * UCMAS CRM — Google Apps Script
 * Đồng bộ data từ Sheet → Supabase CRM (tự động theo interval)
 * 
 * CƠ CHẾ TRÁNH TRÙNG:
 * - Tự thêm cột "CRM Status" ở cuối Sheet
 * - Sau khi sync thành công → ghi "✅ Đã đồng bộ" + mã lead + thời gian
 * - Các lần sync sau chỉ xử lý row CHƯA có trạng thái
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

  // Tìm cột đã có
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === STATUS_COL_HEADER) {
      return i + 1; // 1-indexed
    }
  }

  // Chưa có → tạo mới ở cột cuối + 1
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

  // Kiểm tra bật/tắt
  if (sync_enabled !== 'true' || !sync_interval || sync_interval === '0') return;

  // Kiểm tra interval
  const intervalMs = parseInt(sync_interval) * 60 * 1000;
  const now = Date.now();
  const lastSync = last_sync_at ? new Date(last_sync_at).getTime() : 0;
  if (now - lastSync < intervalMs) return;

  // Sync!
  console.log('🔄 Bắt đầu đồng bộ...');
  const result = syncNewRows(field_mapping);
  updateSyncStatus(result);
}

// ═══════════════════════════════════════════════════════════
// SYNC CHỈ ROWS MỚI (chưa có trạng thái)
// ═══════════════════════════════════════════════════════════
function syncNewRows(fieldMapping) {
  if (!fieldMapping || !fieldMapping.mapping) {
    console.error('Chưa cấu hình mapping!');
    return { error: 'no_mapping', success: 0, skipped: 0, failed: 0, total_checked: 0 };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: 0, skipped: 0, failed: 0, total_checked: 0 };

  // Tìm/tạo cột trạng thái
  const statusCol = getOrCreateStatusCol(sheet);
  const lastDataCol = statusCol - 1; // Cột data cuối (trước cột status)

  // Đọc headers (không bao gồm cột status)
  const headers = sheet.getRange(1, 1, 1, lastDataCol).getValues()[0];

  // Đọc trạng thái tất cả rows
  const statusValues = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();

  let success = 0, skipped = 0, failed = 0, already_synced = 0;

  for (let i = 0; i < lastRow - 1; i++) {
    const row = i + 2;
    const status = String(statusValues[i][0]).trim();

    // ⏭️ BỎ QUA nếu đã đồng bộ
    if (status && status.startsWith('✅')) {
      already_synced++;
      continue;
    }

    // Đọc data row này
    const rowValues = sheet.getRange(row, 1, 1, lastDataCol).getValues()[0];

    // Map theo mapping động
    const payload = mapRowToPayload(headers, rowValues, fieldMapping.mapping, sheet.getName(), row);
    if (!payload.p_full_name) continue; // Row trống

    // Gọi API
    const result = callSupabaseRPC(payload);

    if (result) {
      if (result.status === 'success') {
        success++;
        // ✅ Ghi trạng thái "Đã đồng bộ" vào Sheet
        const timestamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm');
        sheet.getRange(row, statusCol).setValue('✅ ' + (result.lead_code || 'OK') + ' · ' + timestamp);
        sheet.getRange(row, statusCol).setFontColor('#2E7D32');
      } else if (result.status === 'skipped') {
        skipped++;
        if (result.reason === 'duplicate_hash') {
          // Row đã tồn tại trong CRM (hash trùng) → đánh dấu luôn
          sheet.getRange(row, statusCol).setValue('✅ Đã có · ' + result.reason);
          sheet.getRange(row, statusCol).setFontColor('#F57F17');
        } else if (result.reason === 'phone_reinterest') {
          // SĐT trùng → ghi chú
          sheet.getRange(row, statusCol).setValue('⚠️ SĐT trùng (' + result.existing_count + ' lead)');
          sheet.getRange(row, statusCol).setFontColor('#E65100');
        }
      }
    } else {
      failed++;
      sheet.getRange(row, statusCol).setValue('❌ Lỗi API');
      sheet.getRange(row, statusCol).setFontColor('#C62828');
    }

    // Rate limit
    Utilities.sleep(200);
  }

  console.log(`✅ Sync: ${success} mới, ${skipped} bỏ qua, ${failed} lỗi, ${already_synced} đã sync trước đó`);
  return { success, skipped, failed, already_synced, total_checked: lastRow - 1 };
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
        payload.p_full_name = val ? String(val) : null;
        break;
      case 'phone':
        payload.p_phone = val ? String(val) : null;
        break;
      case 'child_birth_year':
        payload.p_child_birth_year = val ? parseInt(val) : null;
        break;
      case 'address':
        payload.p_address = val ? String(val) : null;
        break;
      case 'source_type':
        payload.p_source_type = val ? String(val) : 'PULL';
        break;
      case 'ad_campaign':
        payload.p_ad_campaign = val ? String(val) : null;
        break;
      case 'child_name':
        payload.p_child_name = val ? String(val) : null;
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
