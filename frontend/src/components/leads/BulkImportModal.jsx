import { useState } from 'react';
import { bulkCreateLeads } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineUpload, HiOutlineClipboardCopy } from 'react-icons/hi';

const REQUIRED_COLS = ['full_name'];
const ALL_COLS = ['full_name', 'phone', 'child_name', 'child_birth_year', 'address', 'source_type', 'ad_campaign'];

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[,\t]/).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const vals = line.split(/[,\t]/);
    const obj = {};
    headers.forEach((h, i) => {
      if (ALL_COLS.includes(h)) obj[h] = vals[i]?.trim() || '';
    });
    return obj;
  }).filter((row) => row.full_name);
}

export default function BulkImportModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('paste'); // paste | file
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleParse = () => {
    if (mode === 'paste') {
      const data = parseCSV(text);
      if (data.length === 0) { toast.error('Không tìm thấy dữ liệu hợp lệ'); return; }
      setParsedData(data);
    }
  };

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = parseCSV(ev.target.result);
      setParsedData(data);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkCreateLeads(parsedData);
      setResult(res);
      toast.success(res.message || `Tạo ${res.success_count} lead`);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden animate-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-700">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">Tải dữ liệu hàng loạt</h2>
          <button onClick={onClose} className="btn-ghost"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button onClick={() => setMode('paste')} className={`btn-ghost text-sm flex items-center gap-1 ${mode === 'paste' ? 'text-primary-400 bg-primary-500/10' : ''}`}>
              <HiOutlineClipboardCopy className="w-4 h-4" /> Dán dữ liệu
            </button>
            <button onClick={() => setMode('file')} className={`btn-ghost text-sm flex items-center gap-1 ${mode === 'file' ? 'text-primary-400 bg-primary-500/10' : ''}`}>
              <HiOutlineUpload className="w-4 h-4" /> Tải file CSV
            </button>
          </div>

          <p className="text-xs text-surface-500">
            Dòng 1: header (cột). Cột bắt buộc: <code className="text-primary-400">full_name</code>.
            Cột tùy chọn: <code className="text-primary-400">phone, child_name, child_birth_year, address, source_type, ad_campaign</code>.
            Ngăn cách bằng dấu phẩy (,) hoặc tab.
          </p>

          {mode === 'paste' && (
            <div>
              <textarea value={text} onChange={(e) => setText(e.target.value)}
                placeholder={`full_name,phone,child_birth_year,address\nNguyễn Văn A,0901234567,2018,Cầu Giấy HN\nTrần Thị B,0912345678,2019,Hà Đông HN`}
                className="input-field h-40 font-mono text-xs" />
              <button onClick={handleParse} className="btn-secondary text-sm mt-2">Phân tích dữ liệu</button>
            </div>
          )}

          {mode === 'file' && (
            <div>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload}
                className="block w-full text-sm text-surface-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-500/10 file:text-primary-400 hover:file:bg-primary-500/20" />
              {file && <p className="text-xs text-surface-500 mt-2">File: {file.name}</p>}
            </div>
          )}

          {parsedData.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th>#</th>
                      {ALL_COLS.map((c) => (<th key={c}>{c}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td className="text-surface-500">{i + 1}</td>
                        {ALL_COLS.map((c) => (
                          <td key={c} className={!row[c] && REQUIRED_COLS.includes(c) ? 'text-red-400' : 'text-surface-700 dark:text-surface-300'}>
                            {row[c] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 20 && (
                  <p className="text-xs text-surface-500 mt-2">Hiển thị 20/{parsedData.length} dòng</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleImport} disabled={importing}
                  className="btn-primary text-sm disabled:opacity-50">
                  {importing ? 'Đang tải...' : `Tải ${parsedData.length} lead lên hệ thống`}
                </button>
                <button onClick={() => setParsedData([])} className="btn-ghost text-sm">Xóa</button>
              </div>
            </>
          )}

          {result && (
            <div className="p-4 bg-surface-100 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 animate-fade-in">
              <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{result.message}</p>
              {result.dup_count > 0 && (
                <p className="text-xs text-yellow-400 mt-1">⚠️ {result.dup_count} lead trùng SĐT — đã thông báo cho nhân viên</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
