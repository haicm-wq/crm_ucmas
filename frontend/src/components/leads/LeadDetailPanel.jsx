import { useState, useEffect, useCallback, useRef } from 'react';
import { updateLead, fetchNotes, addNote, fetchLevelHistory, fetchSiblings, fetchStaffByCenter } from '../../services/api';
import { getLevelInfo, ALL_LEVEL_CODES } from '../../config/levels';
import { PRODUCTS } from '../../config/constants';
import { validatePhone, cleanFormChanges } from '../../utils/validation';
import { toDatetimeLocal, formatDateTime } from '../../utils/format';
import { useSharedData } from '../../contexts/SharedDataProvider';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlinePencil, HiOutlineChatAlt, HiOutlineClock, HiOutlineUserGroup } from 'react-icons/hi';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import CustomDateTimePicker from '../ui/CustomDateTimePicker';

// Bug9 fix: toDatetimeLocal is now in utils/format.js

// cleanFormChanges is now in utils/validation.js

export default function LeadDetailPanel({ lead, centers, onClose, onUpdate }) {
  const { isAdmin, user, isCenter } = useAuth();
  // Chỉ admin hoặc sale (không phải trung tâm) mới được đổi Sale đặt lịch
  const canEditStaff = isAdmin || !isCenter;
  // Performance: dùng cached data từ SharedDataProvider thay vì fetch mỗi lần mở panel
  const { products: allProducts, productLevels: allProductLevels, customFieldsDef, subSources } = useSharedData();
  const [activeTab, setActiveTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [notes, setNotes] = useState([]);
  const [history, setHistory] = useState([]);
  // Bug1 fix: separate state for level note vs tab note
  const [levelNote, setLevelNote] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });
  const [siblings, setSiblings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const filteredSubSources = (subSources || []).filter(
    (s) => s.source_type === (form.source_type || lead.source_type) && s.is_active
  );

  // States cho level theo sản phẩm (chỉ lead-specific data)
  const [leadProductLevels, setLeadProductLevels] = useState([]);
  const [formProductLevels, setFormProductLevels] = useState({});

  const loadLeadProductLevels = useCallback(async () => {
    try {
      // Chỉ fetch dữ liệu lead-specific, products/productLevels đã có trong cache
      const { data: leadLvls } = await supabase.from('lead_product_levels').select('*').eq('lead_id', lead.id);
      setLeadProductLevels(leadLvls || []);

      const initialFormLvls = {};
      (leadLvls || []).forEach((l) => {
        initialFormLvls[l.product_code] = l.level_code;
      });
      setFormProductLevels(initialFormLvls);
    } catch (err) {
      console.error('Lỗi tải thông tin level theo sản phẩm:', err);
    }
  }, [lead.id]);

  // Performance: không cần fetchSettings mỗi lần mở panel, dùng customFieldsDef từ cache

  useEffect(() => {
    setForm({
      full_name: lead.full_name,
      phone: lead.phone || '',
      child_birth_year: lead.child_birth_year || '',
      address: lead.address || '',
      level_code: lead.level_code,
      assigned_center: lead.assigned_center || '',
      assigned_staff: lead.assigned_staff || '',
      trial_appointment_at: toDatetimeLocal(lead.trial_appointment_at),
      next_followup_at: toDatetimeLocal(lead.next_followup_at),
      source_type: lead.source_type,
      ad_campaign: lead.ad_campaign || '',
      interested_products: lead.interested_products || [],
      l4_type: lead.l4_type || '',
      child_name: lead.child_name || '',
      custom_fields: lead.custom_fields || {},
      l1_kk_note: lead.l1_kk_note || '',
      student_code: lead.student_code || '',
      tuition_fee: lead.tuition_fee ?? 0,
      material_fee: lead.material_fee ?? 0,
      fanpage: lead.fanpage || '',
    });
    setLevelNote('');
    setNoteContent('');
    setEditing(false);
    setActiveTab('info');
    // Reset tab data so they reload on next visit
    setNotes([]);
    setHistory([]);
    setSiblings([]);
    loadLeadProductLevels();
  }, [lead.id, loadLeadProductLevels]);

  // Bug5 fix: ref theo dõi tab đã load, cho phép reload khi cần
  const loadedTabsRef = useRef({});

  useEffect(() => {
    // Reset loaded flags khi lead thay đổi
    loadedTabsRef.current = {};
  }, [lead.id]);

  useEffect(() => {
    if (activeTab === 'notes' && !loadedTabsRef.current.notes) {
      loadedTabsRef.current.notes = true;
      loadNotes();
    }
    if (activeTab === 'history' && !loadedTabsRef.current.history) {
      loadedTabsRef.current.history = true;
      loadHistory();
    }
    if (activeTab === 'siblings' && !loadedTabsRef.current.siblings && lead.phone) {
      loadedTabsRef.current.siblings = true;
      loadSiblings();
    }
  }, [activeTab, lead.id]);

  // Load toàn bộ Sale đặt lịch (telesale) một lần duy nhất khi panel mount
  useEffect(() => {
    setStaffLoading(true);
    fetchStaffByCenter()
      .then(setStaff)
      .catch(console.error)
      .finally(() => setStaffLoading(false));
  }, []);

  const loadNotes = useCallback(async () => {
    try { setNotes(await fetchNotes(lead.id)); } catch (err) { console.error(err); }
  }, [lead.id]);

  const loadHistory = useCallback(async () => {
    try { setHistory(await fetchLevelHistory(lead.id)); } catch (err) { console.error(err); }
  }, [lead.id]);

  const loadSiblings = useCallback(async () => {
    try { setSiblings(await fetchSiblings(lead.id)); } catch (err) { console.error(err); }
  }, [lead.id]);

  const handleSave = async () => {
    // Frontend validation
    if (form.phone) {
      const phoneCheck = validatePhone(form.phone);
      if (!phoneCheck.valid) {
        toast.error(phoneCheck.message);
        return;
      }
    }
    const isGraduationLevel = !['L1.KK', 'L0.R', 'L0.K'].includes(form.level_code);
    if (isGraduationLevel) {
      if (!form.phone) {
        toast.error('Lead ≥ L1 cần có SĐT');
        return;
      }
      if (!form.assigned_center) {
        toast.error('Lead ≥ L1 cần được gán trung tâm');
        return;
      }
    }

    // Xác nhận khi đổi Họ tên phụ huynh hoặc SĐT
    const hasNameChanged = form.full_name !== lead.full_name;
    const hasPhoneChanged = (form.phone || '') !== (lead.phone || '');
    if (hasNameChanged || hasPhoneChanged) {
      const msg = `Bạn đang thay đổi thông tin quan trọng:\n` +
        (hasNameChanged ? ` - Họ tên: "${lead.full_name || '—'}" -> "${form.full_name || '—'}"\n` : '') +
        (hasPhoneChanged ? ` - SĐT: "${lead.phone || '—'}" -> "${form.phone || '—'}"\n` : '') +
        `Bạn có đồng ý thực hiện thay đổi này không?`;
      setConfirmDialog({
        open: true,
        message: msg,
        onConfirm: () => {
          setConfirmDialog({ open: false, message: '', onConfirm: null });
          executeSave();
        },
      });
      return;
    }

    executeSave();
  };

  const executeSave = async () => {
    setSaving(true);
    try {
      const changes = cleanFormChanges(form);
      
      // Đảm bảo Mã học sinh và học phí/học liệu được gán mặc định nếu bị trống
      if (form.tuition_fee === '' || form.tuition_fee === null || form.tuition_fee === undefined) {
        changes.tuition_fee = 0;
      } else {
        changes.tuition_fee = parseInt(form.tuition_fee);
      }
      if (form.material_fee === '' || form.material_fee === null || form.material_fee === undefined) {
        changes.material_fee = 0;
      } else {
        changes.material_fee = parseInt(form.material_fee);
      }
      if (form.student_code === '') {
        changes.student_code = null;
      }

      // Bug1 fix: use levelNote (not noteContent)
      const note = form.level_code !== lead.level_code ? levelNote : null;
      await updateLead(lead.id, changes, note);

      // Lưu thay đổi level của từng sản phẩm
      const levelChanges = [];
      for (const [prodCode, lvlCode] of Object.entries(formProductLevels)) {
        const original = leadProductLevels.find(l => l.product_code === prodCode)?.level_code || 'L1.KK';
        if (lvlCode !== original) {
          levelChanges.push(supabase.rpc('rpc_update_lead_product_level', {
            p_lead_id: lead.id,
            p_product_code: prodCode,
            p_level_code: lvlCode,
            p_note: levelNote || `Cập nhật Level ${prodCode} từ giao diện chi tiết`,
          }));
        }
      }
      if (levelChanges.length > 0) {
        const results = await Promise.all(levelChanges);
        const firstErr = results.find(r => r.error);
        if (firstErr) throw firstErr.error;
      }

      toast.success('Cập nhật thành công!');
      setEditing(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await addNote(lead.id, noteContent);
      setNoteContent('');
      loadNotes();
      toast.success('Đã thêm ghi chú');
    } catch (err) {
      toast.error('Lỗi thêm ghi chú');
    }
  };

  const formatDt = formatDateTime;

  const levelInfo = getLevelInfo(lead.level_code);

  const tabs = [
    { id: 'info', label: 'Thông tin', icon: HiOutlinePencil },
    { id: 'notes', label: `Ghi chú${notes.length ? ` (${notes.length})` : ''}`, icon: HiOutlineChatAlt },
    { id: 'history', label: 'Lịch sử Level', icon: HiOutlineClock },
    ...(lead.phone ? [{ id: 'siblings', label: `Cùng SĐT${siblings.length ? ` (${siblings.length})` : ''}`, icon: HiOutlineUserGroup }] : []),
  ];

  return (
    <>
    <div className="modal-overlay items-end sm:items-center" onClick={onClose}>
      <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-t-2xl rounded-b-none sm:rounded-2xl shadow-xl w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden animate-slide-in sm:mx-4 will-change-transform" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-700">
          <div>
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">{lead.full_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-500/10 px-2 py-0.5 rounded">{lead.lead_code}</span>
              <span className={`badge ${levelInfo.bgClass}`}>{lead.level_code}</span>
              <span className="text-xs text-surface-500">{levelInfo.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'info' && (
              !editing ? (
                <button onClick={() => setEditing(true)} className="btn-secondary text-sm px-3 py-1.5">Chỉnh sửa</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-3 py-1.5">
                    {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button onClick={() => { setEditing(false); setLevelNote(''); }} className="btn-ghost text-sm px-3 py-1.5">Hủy</button>
                </div>
              )
            )}
            <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Đóng"><HiOutlineX className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex overflow-x-auto flex-nowrap whitespace-nowrap gap-1 p-1 bg-surface-50 dark:bg-surface-800/30 border-b border-surface-200 dark:border-surface-700 scrollbar-none">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400 font-semibold'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
              }`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto h-[calc(95vh-125px)] sm:h-auto sm:max-h-[60vh]">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {[
                  { key: 'full_name', label: 'Họ tên phụ huynh', type: 'text' },
                  { key: 'phone', label: 'SĐT', type: 'text' },
                  { key: 'child_name', label: 'Tên của con', type: 'text' },
                  { key: 'child_birth_year', label: 'Năm sinh con', type: 'number' },
                  { key: 'fanpage', label: 'Fanpage', type: 'text' },
                  { key: 'ad_campaign', label: 'Chiến dịch QC', type: 'text' },
                  { key: 'address', label: 'Địa chỉ', type: 'text', full: true },
                  { key: 'l1_kk_note', label: 'Ghi chú kho kiểm', type: 'text', full: true },
                ].map(({ key, label, type, full }) => (
                  <div key={key} className={full ? 'col-span-1 sm:col-span-2' : 'col-span-1'}>
                    <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{label}</label>
                    {editing ? (
                      key === 'ad_campaign' ? (
                        <select
                          value={form.ad_campaign || ''}
                          onChange={(e) => setForm({ ...form, ad_campaign: e.target.value })}
                          className="select-field py-2 text-sm"
                        >
                          <option value="">— Chọn nguồn con —</option>
                          {filteredSubSources.map((sub) => (
                            <option key={sub.id} value={sub.name}>
                              {sub.name}
                            </option>
                          ))}
                          {form.ad_campaign && !filteredSubSources.some(s => s.name === form.ad_campaign) && (
                            <option value={form.ad_campaign}>{form.ad_campaign} (Ngoài danh sách)</option>
                          )}
                        </select>
                      ) : (
                        <input type={type} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          className="input-field py-2 text-sm" />
                      )
                    ) : (
                      <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{lead[key] || '—'}</p>
                    )}
                  </div>
                ))}

                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Sản phẩm quan tâm</label>
                  {editing ? (
                    <div className="flex flex-wrap gap-4 mt-1">
                      {PRODUCTS.map((prod) => (
                        <label key={prod} className="flex items-center gap-2 cursor-pointer text-sm text-surface-700 dark:text-surface-300">
                          <input type="checkbox"
                            checked={form.interested_products?.includes(prod)}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...(form.interested_products || []), prod]
                                : (form.interested_products || []).filter((p) => p !== prod);
                              setForm({ ...form, interested_products: updated });
                            }}
                            className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500 focus:ring-primary-500 focus:ring-opacity-25" />
                          <span>{prod}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {lead.interested_products && lead.interested_products.length > 0 ? (
                        lead.interested_products.map((prod) => (
                          <span key={prod} className="px-2 py-0.5 text-xs font-semibold rounded bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-500/20">
                            {prod}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-surface-500">—</p>
                      )}
                    </div>
                  )}
                </div>

                {customFieldsDef.length > 0 && (
                  <div className="col-span-1 sm:col-span-2 border-t border-surface-200 dark:border-surface-700/50 pt-4 mt-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">Thông tin bổ sung</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {customFieldsDef.map((field) => (
                        <div key={field.key} className={field.type === 'text' && field.key.includes('dia_chi') ? 'col-span-1 sm:col-span-2' : 'col-span-1'}>
                          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{field.label}</label>
                          {editing ? (
                            field.type === 'select' ? (
                              <select
                                value={form.custom_fields?.[field.key] || ''}
                                onChange={(e) => setForm({
                                  ...form,
                                  custom_fields: { ...form.custom_fields, [field.key]: e.target.value }
                                })}
                                className="select-field py-2 text-sm"
                              >
                                <option value="">— Chọn —</option>
                                {field.options?.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === 'boolean' ? (
                              <label className="flex items-center gap-2 cursor-pointer py-2 text-sm text-surface-700 dark:text-surface-300">
                                <input
                                  type="checkbox"
                                  checked={!!form.custom_fields?.[field.key]}
                                  onChange={(e) => setForm({
                                    ...form,
                                    custom_fields: { ...form.custom_fields, [field.key]: e.target.checked }
                                  })}
                                  className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-primary-500 focus:ring-primary-500"
                                />
                                <span>{field.label}</span>
                              </label>
                            ) : (
                              <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={form.custom_fields?.[field.key] || ''}
                                onChange={(e) => setForm({
                                  ...form,
                                  custom_fields: { ...form.custom_fields, [field.key]: e.target.value }
                                })}
                                className="input-field py-2 text-sm"
                              />
                            )
                          ) : (
                            <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">
                              {field.type === 'boolean'
                                ? (lead.custom_fields?.[field.key] ? 'Có' : 'Không')
                                : (lead.custom_fields?.[field.key] || '—')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Doanh thu & Thông tin học sinh */}
                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 border-t border-surface-200 dark:border-surface-700/50 pt-4 mt-2">
                  <h4 className="col-span-3 text-xs font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-3 flex-wrap">
                    <span>Thông tin Học sinh & Doanh thu</span>
                    {((form.level_code || lead.level_code || '').startsWith('L4') && editing) && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded animate-pulse normal-case">
                        ⚠️ Nhập Mã học sinh và Nguyên học liệu khi lên L4
                      </span>
                    )}
                  </h4>

                  <div>
                    <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Mã học sinh</label>
                    {editing ? (
                      <input 
                        type="text" 
                        value={form.student_code || ''} 
                        onChange={(e) => setForm({ ...form, student_code: e.target.value })}
                        className="input-field py-2 text-sm" 
                        placeholder="Nhập mã học sinh..."
                      />
                    ) : (
                      <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{lead.student_code || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Học phí</label>
                    {editing ? (
                      <input 
                        type="number" 
                        value={form.tuition_fee ?? ''} 
                        onChange={(e) => setForm({ ...form, tuition_fee: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="input-field py-2 text-sm" 
                        placeholder="0"
                      />
                    ) : (
                      <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{(lead.tuition_fee || 0).toLocaleString('vi-VN')} đ</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Nguyên học liệu</label>
                    {editing ? (
                      <input 
                        type="number" 
                        value={form.material_fee ?? ''} 
                        onChange={(e) => setForm({ ...form, material_fee: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="input-field py-2 text-sm" 
                        placeholder="0"
                      />
                    ) : (
                      <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{(lead.material_fee || 0).toLocaleString('vi-VN')} đ</p>
                    )}
                  </div>

                  {!editing && (
                    <div className="col-span-3 bg-surface-50 dark:bg-surface-800/10 p-3 rounded-xl border border-surface-200 dark:border-surface-700/50 flex items-center justify-between text-xs">
                      <span className="text-surface-500 font-medium">Tổng doanh thu thực tế (Học phí + Học liệu):</span>
                      <span className="font-bold text-primary-600 dark:text-primary-400 text-sm">
                        {((lead.tuition_fee || 0) + (lead.material_fee || 0)).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}
                </div>

                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border-t border-surface-200 dark:border-surface-700/50 pt-4 mt-2">
                  <h4 className="col-span-1 sm:col-span-2 text-xs font-semibold uppercase tracking-wider text-surface-500">Level theo từng sản phẩm</h4>
                  {editing ? (
                    form.interested_products && form.interested_products.length > 0 ? (
                      form.interested_products.map((p_code) => {
                        const prodLvls = allProductLevels.filter(l => l.product_code === p_code);
                        const isGraduated = !['L1.KK', 'L0.R', 'L0.K'].includes(lead.level_code);
                        const filteredProdLvls = prodLvls.filter((lvl) => {
                          // Leads đã tốt nghiệp (không thuộc kho kiểm) → ẩn các base levels của kho kiểm
                          if (isGraduated && ['L1.KK', 'L0.R', 'L0.K'].includes(lvl.level_code)) {
                            return false;
                          }
                          // Leads còn ở kho kiểm → chỉ hiện L1.KK/L0.R/L0.K nếu lead gốc hoặc đang chọn
                          if (['L1.KK', 'L0.R', 'L0.K'].includes(lvl.level_code)) {
                            const isOriginalPool = ['L1.KK', 'L0.R', 'L0.K'].includes(lead.level_code);
                            const isCurrentlySelected = formProductLevels[p_code] === lvl.level_code;
                            return isOriginalPool || isCurrentlySelected;
                          }
                          return true;
                        });
                        return (
                          <div key={p_code}>
                            <label className="block text-xs font-medium text-surface-500 mb-1">Level {p_code}</label>
                            <select 
                              value={formProductLevels[p_code] || 'L1.KK'} 
                              onChange={(e) => setFormProductLevels({ ...formProductLevels, [p_code]: e.target.value })}
                              className="select-field py-2 text-sm"
                            >
                              {filteredProdLvls.map((lvl) => (
                                <option key={lvl.level_code} value={lvl.level_code}>
                                  {lvl.level_code} — {lvl.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })
                    ) : (
                      <p className="col-span-2 text-xs text-surface-500">Hãy chọn sản phẩm quan tâm phía trên trước để thiết lập Level.</p>
                    )
                  ) : (
                    <div className="col-span-2 flex flex-wrap gap-2">
                      {lead.interested_products && lead.interested_products.length > 0 ? (
                        lead.interested_products.map((p_code) => {
                          const currentLvlCode = formProductLevels[p_code] || 'L1.KK';
                          const lvlInfo = allProductLevels.find(l => l.product_code === p_code && l.level_code === currentLvlCode) || { label: 'L1 Kho kiểm', color: '#F59E0B' };
                          return (
                            <span 
                              key={p_code} 
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5"
                              style={{ 
                                color: lvlInfo.color, 
                                borderColor: `${lvlInfo.color}40`, 
                                backgroundColor: `${lvlInfo.color}10` 
                              }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lvlInfo.color }} />
                              <span className="font-bold">{p_code}:</span> {currentLvlCode} ({lvlInfo.label})
                            </span>
                          );
                        })
                      ) : (
                        <p className="text-sm text-surface-500">— Chưa chọn sản phẩm quan tâm</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Trung tâm</label>
                  {editing ? (
                    <select value={form.assigned_center} onChange={(e) => {
                      const newCenterId = e.target.value;
                      // Nếu trung tâm khác với ban đầu, hiển thị xác nhận
                      if (newCenterId !== (lead.assigned_center || '')) {
                        const currentCenterName = centers.find(c => c.id === form.assigned_center)?.name || 'Chưa gán';
                        const newCenterName = centers.find(c => c.id === newCenterId)?.name || 'Chưa gán';
                        const confirmed = window.confirm(
                          `Bạn đang thay đổi Trung tâm:\n"${currentCenterName}" → "${newCenterName}"\n\nBạn xác nhận đổi trung tâm?`
                        );
                        if (!confirmed) return; // Không đổi nếu người dùng hủy
                      }
                      // Giữ nguyên Sale đặt lịch, không reset
                      setForm({ ...form, assigned_center: newCenterId });
                    }}
                      className="select-field py-2 text-sm">
                      <option value="">— Chưa gán —</option>
                      {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  ) : (
                    <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{lead.center_name || '—'}</p>
                  )}
                </div>

                {editing && (
                  <div>
                    <label className="block text-xs font-medium text-surface-500 mb-1">
                      Sale đặt lịch
                      {!canEditStaff && (
                        <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-normal">(Chỉ Sale/Admin được đổi)</span>
                      )}
                    </label>
                    {staffLoading ? (
                      <p className="text-xs text-surface-500 py-2">Đang tải...</p>
                    ) : canEditStaff ? (
                      <select value={form.assigned_staff} onChange={(e) => setForm({ ...form, assigned_staff: e.target.value })}
                        className="select-field py-2 text-sm">
                        <option value="">— Chưa gán —</option>
                        {staff.map((s) => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
                      </select>
                    ) : (
                      <p className="text-sm text-surface-800 dark:text-surface-200 font-medium py-1">
                        {staff.find(s => s.id === form.assigned_staff)?.full_name || lead.staff_name || '—'}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Lịch học thử</label>
                  {editing ? (
                    <CustomDateTimePicker value={form.trial_appointment_at}
                      onChange={(val) => setForm({ ...form, trial_appointment_at: val })} />
                  ) : (
                    <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{formatDt(lead.trial_appointment_at)}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Follow-up</label>
                  {editing ? (
                    <CustomDateTimePicker value={form.next_followup_at}
                      onChange={(val) => setForm({ ...form, next_followup_at: val })} />
                  ) : (
                    <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{formatDt(lead.next_followup_at)}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Nguồn</label>
                  {editing ? (
                    <select
                      value={form.source_type || 'PULL'}
                      onChange={(e) => setForm({ ...form, source_type: e.target.value, ad_campaign: '' })}
                      disabled={!isAdmin}
                      className="select-field py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="PULL">PULL</option>
                      <option value="PUSH">PUSH</option>
                    </select>
                  ) : (
                    <p className="text-sm text-surface-800 dark:text-surface-200 font-medium">{lead.source_type || 'PULL'}</p>
                  )}
                </div>
              </div>

              {!editing && lead.interested_products && lead.interested_products.length > 0 && (
                <div className="mt-6 pt-4 border-t border-surface-200 dark:border-surface-700/50 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-1">Mốc thời gian Level theo sản phẩm</h3>
                  {lead.interested_products.map((p_code) => {
                    const lpl = leadProductLevels.find(l => l.product_code === p_code);
                    const enteredAtObj = lpl?.entered_at || {};
                    const entries = Object.entries(enteredAtObj);
                    if (entries.length === 0) return null;
                    return (
                      <div key={p_code} className="space-y-2">
                        <p className="text-xs font-bold text-primary-500 uppercase tracking-wide">{p_code}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          {entries.map(([lvlCode, timestamp]) => {
                            const lvlDef = allProductLevels.find(l => l.product_code === p_code && l.level_code === lvlCode);
                            return (
                              <div key={lvlCode} className="p-3 rounded-xl bg-surface-100 dark:bg-surface-800/40 border border-surface-200 dark:border-surface-700/50">
                                <span className="block text-[11px] font-medium text-surface-500 mb-1">
                                  {lvlCode} ({lvlDef?.label || '—'})
                                </span>
                                <span className="block text-xs text-surface-700 dark:text-surface-300 font-mono">
                                  {formatDt(timestamp)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bug1 fix: separate levelNote for level change */}
              {editing && form.level_code !== lead.level_code && (
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-500 mb-1">Ghi chú đổi level</label>
                  <textarea value={levelNote} onChange={(e) => setLevelNote(e.target.value)}
                    className="input-field py-2 text-sm h-20" placeholder="Lý do đổi level..." />
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* Bug1 fix: noteContent (not newNote) for tab notes */}
              <div className="flex gap-2">
                <input value={noteContent} onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Thêm ghi chú..." className="input-field py-2 text-sm flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()} />
                <button onClick={handleAddNote} className="btn-primary text-sm">Gửi</button>
              </div>
              {notes.map((note) => (
                <div key={note.id} className="p-3 bg-surface-50 dark:bg-surface-800/40 border border-surface-200 dark:border-surface-700/50 rounded-xl">
                  <p className="text-sm text-surface-800 dark:text-surface-200">{note.content}</p>
                  <p className="text-[10px] text-surface-500 dark:text-surface-400 mt-2">
                    {note.author_name || 'System'} · {formatDt(note.created_at)}
                  </p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-surface-500 text-sm text-center py-4">Chưa có ghi chú</p>}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary-500 mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {h.from_level && (<span className={`badge text-[10px] ${getLevelInfo(h.from_level).bgClass}`}>{h.from_level}</span>)}
                      <span className="text-surface-500 dark:text-surface-400">→</span>
                      <span className={`badge text-[10px] ${getLevelInfo(h.to_level).bgClass}`}>{h.to_level}</span>
                    </div>
                    {h.note && <p className="text-xs text-surface-700 dark:text-surface-300 mt-1">{h.note}</p>}
                    <p className="text-[10px] text-surface-500 dark:text-surface-400 mt-1">
                      {h.changed_by_name || 'System'} · {h.source} · {formatDt(h.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {history.length === 0 && <p className="text-surface-500 text-sm text-center py-4">Chưa có lịch sử</p>}
            </div>
          )}

          {activeTab === 'siblings' && (
            <div className="space-y-3">
              <p className="text-xs text-surface-500">
                Các lead khác cùng SĐT <span className="text-primary-400 font-mono">{lead.phone}</span> (1 phụ huynh nhiều con)
              </p>
              {siblings.length === 0 ? (
                <p className="text-surface-500 text-sm text-center py-4">Không có lead nào khác cùng SĐT</p>
              ) : (
                siblings.map((s) => (
                  <div key={s.id} className="p-3 bg-surface-50 dark:bg-surface-800/40 rounded-xl border border-surface-200 dark:border-surface-700/50 hover:border-primary-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary-600 dark:text-primary-400">{s.lead_code}</span>
                          <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{s.full_name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {s.child_birth_year && <span className="text-xs text-surface-500 dark:text-surface-400">Sinh {s.child_birth_year}</span>}
                          <span className={`badge text-[10px] ${getLevelInfo(s.level_code).bgClass}`}>{s.level_code}</span>
                          {s.center_name && <span className="text-xs text-surface-500 dark:text-surface-400">· {s.center_name}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-surface-500 dark:text-surface-400">{formatDt(s.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title="Thay đổi thông tin quan trọng"
        message={confirmDialog.message}
        confirmLabel="Đồng ý thay đổi"
        cancelLabel="Hủy bỏ"
        variant="warning"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: null })}
      />
    </>
  );
}
