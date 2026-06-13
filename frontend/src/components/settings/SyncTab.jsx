import { useState, useEffect } from 'react';
import { fetchSettings, updateSettings } from '../../services/api';
import toast from 'react-hot-toast';

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
  const [columnsText, setColumnsText] = useState('');
  const [sheetColumns, setSheetColumns] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
      if (s.sheet_in_id) setSheetUrl(s.sheet_in_id);
      if (s.sheet_tab_name) setSheetTab(s.sheet_tab_name);
      if (s.sheet_field_mapping) {
        try {
          const saved = JSON.parse(s.sheet_field_mapping);
          if (saved.columns) {
            setSheetColumns(saved.columns);
            setColumnsText(saved.columns.join('\n'));
          }
          if (saved.mapping) setFieldMapping(saved.mapping);
        } catch { /* ignore parse errors */ }
      }
    } catch { toast.error('Lỗi tải cài đặt'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleParseColumns = () => {
    const cols = columnsText
      .split(/[\n,]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length === 0) {
      toast.error('Vui lòng nhập ít nhất 1 tên cột');
      return;
    }
    setSheetColumns(cols);
    const newMapping = {};
    cols.forEach((col) => {
      newMapping[col] = fieldMapping[col] || '';
    });
    setFieldMapping(newMapping);
    toast.success(`Đã nhận ${cols.length} cột`);
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
              className="input-field py-2 text-sm" placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit hoặc paste Sheet ID" />
            {sheetId && sheetUrl && (
              <p className="text-[11px] text-green-600 dark:text-green-400 mt-1 font-mono">✅ Sheet ID: {sheetId}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Tên tab (sheet)</label>
            <input value={sheetTab} onChange={(e) => setSheetTab(e.target.value)}
              className="input-field py-2 text-sm" placeholder="Sheet1 (mặc định)" />
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

        {settings.last_sync_at && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-800/30 border border-surface-200 dark:border-surface-700/50">
            <span className="text-xs text-surface-500">Đồng bộ lần cuối:</span>
            <span className="text-xs font-mono text-surface-700 dark:text-surface-300">
              {new Date(settings.last_sync_at).toLocaleString('vi-VN')}
            </span>
            {settings.last_sync_result && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${settings.last_sync_result === 'success' ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                {settings.last_sync_result === 'success' ? '✅ Thành công' : '❌ Lỗi'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Input columns */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">2</span>
          Nhập tên cột trong Sheet
        </h3>
        <p className="text-xs text-surface-500">
          Copy tên các cột (hàng tiêu đề) từ Google Sheet của bạn, mỗi cột 1 dòng hoặc cách nhau bởi dấu phẩy.
        </p>

        <textarea
          value={columnsText}
          onChange={(e) => setColumnsText(e.target.value)}
          rows={5}
          className="input-field py-2 text-sm font-mono resize-none"
          placeholder={"STT\nHọ tên phụ huynh\nSố điện thoại\nNăm sinh con\nĐịa chỉ\nNguồn\nChiến dịch QC"}
        />

        <button onClick={handleParseColumns} disabled={!columnsText.trim()}
          className="btn-primary text-sm flex items-center gap-1.5">
          📥 Nhận diện cột ({columnsText.split(/[\n,]+/).filter((c) => c.trim()).length} cột)
        </button>
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

      {/* Save All */}
      <div className="glass-card p-5 flex items-center justify-between">
        <div className="text-xs text-surface-500">
          {sheetId ? `Sheet ID: ${sheetId.slice(0, 20)}...` : 'Chưa kết nối Sheet'}
          {sheetColumns.length > 0 && ` · ${sheetColumns.length} cột · ${mappedCount} đã map`}
        </div>
        <button onClick={handleSaveAll} disabled={saving || !sheetId}
          className="btn-primary text-sm flex items-center gap-1.5">
          {saving ? 'Đang lưu...' : '💾 Lưu cấu hình đồng bộ'}
        </button>
      </div>
    </div>
  );
}
