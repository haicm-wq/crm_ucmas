import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, updateSettings } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineLink, HiOutlineCheck, HiOutlineExclamation, HiOutlineLightningBolt, HiOutlineClock } from 'react-icons/hi';

const CRM_FIELDS = [
  { value: '', label: '— Bỏ qua —' },
  { value: 'full_name', label: 'Họ tên phụ huynh', required: true },
  { value: 'phone', label: 'SĐT phụ huynh' },
  { value: 'child_name', label: 'Tên con' },
  { value: 'child_birth_year', label: 'Năm sinh con' },
  { value: 'address', label: 'Địa chỉ' },
  { value: 'source_type', label: 'Nguồn (PULL/PUSH)' },
  { value: 'ad_campaign', label: 'Chiến dịch QC' },
  { value: 'interested_products', label: 'Sản phẩm quan tâm' },
];

function extractSheetId(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : url;
}

export default function SyncTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetTab, setSheetTab] = useState('');
  const [sheetColumns, setSheetColumns] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});

  // Auto-fetched sheet info
  const [sheetMeta, setSheetMeta] = useState(null);
  const [fetchingColumns, setFetchingColumns] = useState(false);

  // Manual sync
  const [syncing, setSyncing] = useState(false);
  const [syncDetail, setSyncDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
      if (s.sheet_in_id) setSheetUrl(s.sheet_in_id);
      if (s.sheet_tab_name) setSheetTab(s.sheet_tab_name);

      // Load sync detail
      if (s.last_sync_detail) {
        try { setSyncDetail(JSON.parse(s.last_sync_detail)); } catch { /* ignore */ }
      }

      // Load auto-pushed columns from Apps Script
      if (s.sheet_columns_auto) {
        try {
          const meta = JSON.parse(s.sheet_columns_auto);
          setSheetMeta(meta);
          if (!s.sheet_field_mapping && meta.columns?.length > 0) {
            setSheetColumns(meta.columns);
            const newMapping = {};
            meta.columns.forEach((col) => { newMapping[col] = ''; });
            setFieldMapping(newMapping);
          }
        } catch { /* ignore */ }
      }

      // Load saved mapping
      if (s.sheet_field_mapping) {
        try {
          const saved = JSON.parse(s.sheet_field_mapping);
          if (saved.columns) setSheetColumns(saved.columns);
          if (saved.mapping) setFieldMapping(saved.mapping);
        } catch { /* ignore */ }
      }
    } catch { toast.error('Lỗi tải cài đặt'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch columns from CRM settings (pushed by Apps Script)
  const handleFetchColumns = async () => {
    setFetchingColumns(true);
    try {
      const s = await fetchSettings();
      if (!s.sheet_columns_auto) {
        toast.error('Chưa có dữ liệu cột từ Sheet.\nHãy cài Apps Script vào Sheet và chạy setupAutoSync() trước.');
        return;
      }
      const meta = JSON.parse(s.sheet_columns_auto);
      if (!meta.columns || meta.columns.length === 0) {
        toast.error('Sheet không có cột nào');
        return;
      }
      setSheetMeta(meta);
      setSheetColumns(meta.columns);
      const newMapping = {};
      meta.columns.forEach((col) => {
        newMapping[col] = fieldMapping[col] || '';
      });
      setFieldMapping(newMapping);
      if (meta.tab_name && !sheetTab) setSheetTab(meta.tab_name);
      toast.success(`Đã đọc ${meta.columns.length} cột từ Sheet "${meta.sheet_name}"`);
    } catch (err) {
      toast.error(err.message || 'Lỗi đọc cột');
    } finally {
      setFetchingColumns(false);
    }
  };

  // Trigger manual sync: reset last_sync_at → Apps Script sẽ sync ngay lần chạy tới (≤1 phút)
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await updateSettings({
        last_sync_at: '2000-01-01T00:00:00Z',
        sync_enabled: 'true',
      });
      toast.success('Đã yêu cầu đồng bộ! Apps Script sẽ chạy trong vòng 1 phút.\nQuay lại kiểm tra sau 1-2 phút.', { duration: 6000 });

      // Poll kết quả sau 70 giây
      setTimeout(async () => {
        try {
          const s = await fetchSettings();
          setSettings(s);
          if (s.last_sync_detail) {
            const detail = JSON.parse(s.last_sync_detail);
            setSyncDetail(detail);
            if (detail.success > 0) {
              toast.success(`✅ Đồng bộ xong! ${detail.success} lead mới đã được tạo.`, { duration: 5000 });
            } else if (detail.already_synced > 0) {
              toast('ℹ️ Không có dữ liệu mới — tất cả đã được đồng bộ trước đó.', { duration: 5000 });
            }
          }
        } catch { /* ignore poll error */ }
      }, 70000);
    } catch (err) {
      toast.error(err.message || 'Lỗi');
    } finally {
      setSyncing(false);
    }
  };

  // Refresh sync status
  const handleRefreshStatus = async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      if (s.last_sync_detail) {
        setSyncDetail(JSON.parse(s.last_sync_detail));
      }
      toast.success('Đã cập nhật trạng thái');
    } catch { toast.error('Lỗi tải trạng thái'); }
  };

  const handleMappingChange = (col, crmField) => {
    setFieldMapping({ ...fieldMapping, [col]: crmField });
  };

  const handleSaveAll = async () => {
    const mappedFields = Object.values(fieldMapping).filter(Boolean);
    if (!mappedFields.includes('full_name')) {
      toast.error('Bắt buộc phải mapping trường "Họ tên phụ huynh" (full_name)');
      return;
    }
    const seen = new Set();
    for (const f of mappedFields) {
      if (seen.has(f)) {
        const label = CRM_FIELDS.find((c) => c.value === f)?.label || f;
        toast.error(`Trường "${label}" bị mapping trùng! Mỗi trường CRM chỉ được chọn 1 lần`);
        return;
      }
      seen.add(f);
    }

    const sheetId = extractSheetId(sheetUrl);
    setSaving(true);
    try {
      await updateSettings({
        sheet_in_id: sheetId,
        sheet_tab_name: sheetTab,
        sheet_field_mapping: JSON.stringify({
          columns: sheetColumns,
          mapping: fieldMapping,
          updated_at: new Date().toISOString(),
        }),
        sync_interval: settings.sync_interval || '0',
        sync_enabled: settings.sync_interval && settings.sync_interval !== '0' ? 'true' : 'false',
        sheet_shared_secret: settings.sheet_shared_secret || '',
      });
      toast.success('Đã lưu cấu hình đồng bộ!');
    } catch (err) { toast.error(err.message || 'Lỗi lưu'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="glass-card p-12 text-center"><div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  const sheetId = extractSheetId(sheetUrl);
  const mappedCount = Object.values(fieldMapping).filter(Boolean).length;
  const hasFullName = Object.values(fieldMapping).includes('full_name');

  return (
    <div className="space-y-4">
      {/* Step 1: Connect Sheet */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">1</span>
          Kết nối Google Sheet
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-surface-500 mb-1">Link hoặc ID của Google Sheet *</label>
            <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
              className="input-field py-2 text-sm" placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit" />
            {sheetId && sheetUrl && (
              <p className="text-[11px] text-green-600 dark:text-green-400 mt-1 font-mono">✅ Sheet ID: {sheetId}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Tên tab (sheet)</label>
            <input value={sheetTab} onChange={(e) => setSheetTab(e.target.value)}
              className="input-field py-2 text-sm" placeholder={sheetMeta?.tab_name || 'Trang tính1'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Tần suất đồng bộ</label>
            <select value={settings.sync_interval || '0'}
              onChange={(e) => setSettings({ ...settings, sync_interval: e.target.value, sync_enabled: e.target.value !== '0' ? 'true' : 'false' })}
              className="select-field py-2 text-sm">
              <option value="0">Tắt đồng bộ</option>
              <option value="1">Mỗi 1 phút</option>
              <option value="5">Mỗi 5 phút</option>
              <option value="15">Mỗi 15 phút</option>
              <option value="30">Mỗi 30 phút</option>
              <option value="60">Mỗi 1 giờ</option>
              <option value="360">Mỗi 6 giờ</option>
            </select>
          </div>
        </div>
      </div>

      {/* Step 2: Fetch columns from Sheet */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">2</span>
            Đọc cột từ Google Sheet
          </h3>
          <button onClick={handleFetchColumns} disabled={fetchingColumns}
            className="btn-primary text-sm flex items-center gap-1.5">
            {fetchingColumns ? (
              <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang đọc...</>
            ) : (
              <><HiOutlineLink className="w-4 h-4" /> Kết nối & đọc cột</>
            )}
          </button>
        </div>

        {sheetMeta && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20">
            <div className="flex items-start gap-2">
              <HiOutlineCheck className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-1">
                <p className="text-green-800 dark:text-green-300 font-medium">
                  Đã đọc được <span className="font-bold">{sheetMeta.columns?.length || 0}</span> cột từ Sheet "{sheetMeta.sheet_name}"
                </p>
                <p className="text-green-600 dark:text-green-400">
                  Tab: {sheetMeta.tab_name} · {sheetMeta.total_rows} dòng dữ liệu · Cập nhật: {new Date(sheetMeta.pushed_at).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>
          </div>
        )}

        {!sheetMeta && (
          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20">
            <div className="flex items-start gap-2">
              <HiOutlineExclamation className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-800 dark:text-yellow-300 space-y-1">
                <p className="font-medium">Chưa kết nối được với Sheet</p>
                <p className="text-yellow-600 dark:text-yellow-400">
                  Hãy mở Google Sheet → Extensions → Apps Script → dán code → chạy <code className="bg-yellow-200 dark:bg-yellow-800/50 px-1 rounded">setupAutoSync()</code> → sau đó quay lại đây bấm "Kết nối & đọc cột"
                </p>
              </div>
            </div>
          </div>
        )}

        {sheetColumns.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {sheetColumns.map((col, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/50 text-xs font-medium text-surface-700 dark:text-surface-300">
                <span className="w-4 h-4 rounded bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 text-[9px] font-bold flex items-center justify-center">{idx + 1}</span>
                {col}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Field Mapping */}
      {sheetColumns.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">3</span>
            Mapping trường dữ liệu
            {mappedCount > 0 && (
              <span className="text-[10px] bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                {mappedCount} trường đã map
              </span>
            )}
          </h3>
          <p className="text-xs text-surface-500">
            Chọn mỗi cột trong Sheet tương ứng với trường dữ liệu nào trong CRM. Cột không cần đồng bộ thì chọn "Bỏ qua".
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Cột trong Sheet</span>
              <span />
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">Trường CRM</span>
            </div>

            {sheetColumns.map((col, idx) => {
              const mapped = fieldMapping[col] || '';
              const isDuplicate = mapped && Object.entries(fieldMapping).filter(([, v]) => v === mapped).length > 1;

              return (
                <div key={idx}
                  className={`grid grid-cols-[1fr_40px_1fr] items-center gap-2 p-3 rounded-lg border transition-colors duration-150 ${
                    mapped
                      ? isDuplicate
                        ? 'bg-red-50 dark:bg-red-500/5 border-red-300 dark:border-red-500/30'
                        : 'bg-green-50 dark:bg-green-500/5 border-green-300 dark:border-green-500/30'
                      : 'bg-surface-50 dark:bg-surface-800/30 border-surface-200 dark:border-surface-700/50'
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-surface-200 dark:bg-surface-700 text-[10px] font-bold text-surface-500 flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{col}</span>
                  </div>
                  <span className="text-surface-400 text-center text-lg">→</span>
                  <select value={mapped}
                    onChange={(e) => handleMappingChange(col, e.target.value)}
                    className={`select-field py-1.5 text-xs ${mapped ? 'font-semibold' : 'text-surface-400'}`}>
                    {CRM_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}{f.required ? ' ✱' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 pt-2">
            {hasFullName ? (
              <span className="text-xs text-green-600 dark:text-green-400">✅ Trường "Họ tên" đã được mapping</span>
            ) : (
              <span className="text-xs text-red-500">⚠️ Bắt buộc mapping trường "Họ tên phụ huynh"</span>
            )}
            <span className="text-xs text-surface-400">{mappedCount}/{sheetColumns.length} cột đã mapping</span>
          </div>
        </div>
      )}

      {/* Step 4: Save + Manual Sync */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-surface-500">
            {sheetId ? `Sheet ID: ${sheetId.slice(0, 20)}...` : 'Chưa kết nối Sheet'}
            {sheetColumns.length > 0 && ` · ${sheetColumns.length} cột · ${mappedCount} đã map`}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleManualSync} disabled={syncing || !hasFullName}
              className="text-sm flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed">
              {syncing ? (
                <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang yêu cầu...</>
              ) : (
                <><HiOutlineLightningBolt className="w-4 h-4" /> Đồng bộ ngay</>
              )}
            </button>
            <button onClick={handleSaveAll} disabled={saving || !sheetId}
              className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? 'Đang lưu...' : '💾 Lưu cấu hình'}
            </button>
          </div>
        </div>

        {/* Sync status panel */}
        {(settings.last_sync_at || syncDetail) && (
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-800/30 border border-surface-200 dark:border-surface-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-surface-600 dark:text-surface-300 flex items-center gap-1.5">
                <HiOutlineClock className="w-3.5 h-3.5" />
                Trạng thái đồng bộ
              </h4>
              <button onClick={handleRefreshStatus} className="text-[10px] text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1">
                <HiOutlineRefresh className="w-3 h-3" /> Làm mới
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {settings.last_sync_at && (
                <div className="text-center p-2 rounded-lg bg-white dark:bg-surface-800/50">
                  <p className="text-[10px] text-surface-400 mb-0.5">Lần cuối</p>
                  <p className="text-xs font-mono text-surface-700 dark:text-surface-300">
                    {new Date(settings.last_sync_at).toLocaleString('vi-VN')}
                  </p>
                </div>
              )}
              {settings.last_sync_result && (
                <div className="text-center p-2 rounded-lg bg-white dark:bg-surface-800/50">
                  <p className="text-[10px] text-surface-400 mb-0.5">Kết quả</p>
                  <p className={`text-xs font-semibold ${settings.last_sync_result === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {settings.last_sync_result === 'success' ? '✅ Thành công' : '❌ Lỗi'}
                  </p>
                </div>
              )}
              {syncDetail && (
                <>
                  <div className="text-center p-2 rounded-lg bg-white dark:bg-surface-800/50">
                    <p className="text-[10px] text-surface-400 mb-0.5">Lead mới</p>
                    <p className="text-lg font-bold text-green-600">{syncDetail.success || 0}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white dark:bg-surface-800/50">
                    <p className="text-[10px] text-surface-400 mb-0.5">Tổng quét</p>
                    <p className="text-lg font-bold text-surface-700 dark:text-surface-300">{syncDetail.total_checked || 0}</p>
                  </div>
                </>
              )}
            </div>

            {syncDetail && (
              <div className="flex flex-wrap gap-3 text-[11px] text-surface-500">
                {syncDetail.already_synced > 0 && <span>📋 Đã sync trước: {syncDetail.already_synced}</span>}
                {syncDetail.skipped > 0 && <span>⏭ Bỏ qua: {syncDetail.skipped}</span>}
                {syncDetail.failed > 0 && <span className="text-red-500">❌ Lỗi: {syncDetail.failed}</span>}
                {syncDetail.elapsed_seconds && <span>⏱ {syncDetail.elapsed_seconds}s</span>}
                {syncDetail.timed_out && <span className="text-amber-500">⚠️ Timeout — sẽ tiếp tục lần sau</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
