import { useState } from 'react';
import { createLead, checkPhone } from '../../services/api';
import { useSharedData } from '../../contexts/SharedDataProvider';
import { useAuth } from '../../contexts/AuthContext';
import { PRODUCTS } from '../../config/constants';
import { validatePhone } from '../../utils/validation';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineExclamation } from 'react-icons/hi';

export default function CreateLeadModal({ onClose, onCreated }) {
  const { user, isCenter, isTelesale, isLeadTelesale } = useAuth();
  const [form, setForm] = useState({
    full_name: '', phone: '', child_birth_year: '',
    child_name: '',
    address: '', source_type: 'PULL', ad_campaign: '',
    interested_products: [],
    custom_fields: {},
    fanpage: '',
  });
  // Performance: dùng cached customFieldsDef từ SharedDataProvider
  const { customFieldsDef } = useSharedData();
  const [saving, setSaving] = useState(false);
  const [dupCheck, setDupCheck] = useState(null);
  const [dupConfirmed, setDupConfirmed] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const handlePhoneBlur = async () => {
    const phone = form.phone.trim();
    if (!phone || !validatePhone(phone).valid) {
      setDupCheck(null);
      setDupConfirmed(false);
      return;
    }
    setCheckingPhone(true);
    try {
      const result = await checkPhone(phone);
      setDupCheck(result);
      if (!result.exists) setDupConfirmed(false);
    } catch {
      setDupCheck(null);
    } finally {
      setCheckingPhone(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { toast.error('Họ tên không được trống'); return; }
    if (form.phone) {
      const phoneCheck = validatePhone(form.phone);
      if (!phoneCheck.valid) { toast.error(phoneCheck.message); return; }
    }

    // Center bị chặn cứng nếu lead trùng đã có center hoặc đang ở L0 hoặc L1.KK (kho kiểm)
    const isCenterBlocked = isCenter && dupCheck?.exists &&
      dupCheck.leads.some((l) => l.center_name || l.level_group === 'L0' || l.level_code === 'L1.KK');
    if (isCenterBlocked) { toast.error('Không thể tạo lead trùng SĐT này!'); return; }

    // Admin/Marketing/Telesale/LeadTelesale: cần xác nhận trước khi tạo trùng
    if (dupCheck?.exists && !dupConfirmed) { toast.error('Vui lòng xác nhận tiếp tục'); return; }

    setSaving(true);
    try {
      const data = { ...form };
      if (data.child_birth_year) data.child_birth_year = parseInt(data.child_birth_year);
      else delete data.child_birth_year;
      if (!data.phone) delete data.phone;

      // Khi trung tâm tạo lead: tự gán trung tâm và level L1 để hiển thị ngay trong danh sách
      if (isCenter && user?.center_id) {
        data.assigned_center = user.center_id;
        data.level_code = 'L1';  // Trung tâm tạo lead thẳng vào danh sách L1
      }

      await createLead(data);
      toast.success('Tạo lead thành công!');
      onCreated();
    } catch (err) {
      toast.error(err.message || 'Lỗi tạo lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 animate-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-700">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">Thêm Lead mới</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Đóng"><HiOutlinePlus className="w-5 h-5 rotate-45" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Họ tên phụ huynh *</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="input-field py-2 text-sm" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Tên của con</label>
              <input value={form.child_name || ''} onChange={(e) => setForm({ ...form, child_name: e.target.value })}
                className="input-field py-2 text-sm" placeholder="Nguyễn Đức Anh" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Năm sinh con</label>
              <input type="number" value={form.child_birth_year}
                onChange={(e) => setForm({ ...form, child_birth_year: e.target.value })}
                className="input-field py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">SĐT phụ huynh</label>
              <input value={form.phone}
                onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDupCheck(null); setDupConfirmed(false); }}
                onBlur={handlePhoneBlur}
                className="input-field py-2 text-sm" placeholder="0901234567" />
              {checkingPhone && <p className="text-xs text-surface-500 mt-1">Đang kiểm tra...</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Nguồn</label>
              <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                className="select-field py-2 text-sm">
                <option value="PULL">PULL (Quảng cáo)</option>
                <option value="PUSH">PUSH (Giới thiệu)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Địa chỉ</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input-field py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Fanpage</label>
              <input value={form.fanpage || ''} onChange={(e) => setForm({ ...form, fanpage: e.target.value })}
                className="input-field py-2 text-sm" placeholder="Tên Fanpage..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Chiến dịch QC</label>
              <input value={form.ad_campaign} onChange={(e) => setForm({ ...form, ad_campaign: e.target.value })}
                className="input-field py-2 text-sm" placeholder="Chiến dịch..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Sản phẩm quan tâm</label>
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
            </div>

            {customFieldsDef.length > 0 && (
              <div className="col-span-2 border-t border-surface-200 dark:border-surface-700/50 pt-4 mt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-3">Thông tin bổ sung</h4>
                <div className="grid grid-cols-2 gap-4">
                  {customFieldsDef.map((field) => (
                    <div key={field.key} className={field.type === 'text' && field.key.includes('dia_chi') ? 'col-span-2' : ''}>
                      <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{field.label}</label>
                      {field.type === 'select' ? (
                        <select
                          value={form.custom_fields[field.key] || ''}
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
                            checked={!!form.custom_fields[field.key]}
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
                          value={form.custom_fields[field.key] || ''}
                          onChange={(e) => setForm({
                            ...form,
                            custom_fields: { ...form.custom_fields, [field.key]: e.target.value }
                          })}
                          className="input-field py-2 text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {dupCheck?.exists && (() => {
            // Phân loại lead trùng: center khác / kho L0 / L1.KK / center hiện tại
            const isBlockedByCenter = isCenter && dupCheck.leads.some(
              (l) => l.center_name || l.level_group === 'L0' || l.level_code === 'L1.KK'
            );

            return (
              <div className={`p-4 rounded-xl animate-fade-in border ${
                isBlockedByCenter
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-yellow-500/10 border-yellow-500/30'
              }`}>
                <div className="flex items-start gap-3">
                  <HiOutlineExclamation className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    isBlockedByCenter ? 'text-red-400' : 'text-yellow-400'
                  }`} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${
                      isBlockedByCenter
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                    }`}>
                      {isBlockedByCenter
                        ? '⛔ SĐT này đã tồn tại trên hệ thống — Không thể tạo trùng!'
                        : `⚠️ SĐT này đã có ${dupCheck.count} lead trên hệ thống!`
                      }
                    </p>

                    <div className="mt-2 space-y-2">
                      {dupCheck.leads.map((l) => {
                        const isL0 = l.level_group === 'L0' || l.level_code === 'L1.KK';
                        return (
                          <div key={l.id} className="text-xs p-2 rounded-lg bg-white/50 dark:bg-surface-800/50">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-primary-600 dark:text-primary-400 font-mono font-bold">{l.lead_code}</span>
                              <span className="text-surface-700 dark:text-surface-300">{l.full_name}</span>
                              {l.child_birth_year && <span className="text-surface-500">(sinh {l.child_birth_year})</span>}
                              <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                isL0 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                     : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              }`}>{l.level_code}</span>
                            </div>
                            {isL0 ? (
                              <p className="mt-1 text-orange-700 dark:text-orange-300 font-medium">
                                📥 Đang nằm trong <strong>Kho L1 kho kiểm</strong> (chưa giao về trung tâm)
                                {l.staff_name && <> — Sale đặt lịch: <strong>{l.staff_name}</strong></>}
                                {!l.staff_name && <span className="italic"> — Chưa có Sale đặt lịch phụ trách. Hãy liên hệ quản lý để được chia lead về trung tâm.</span>}
                                . <span className="underline">Hãy liên hệ Sale đặt lịch để xếp lead này về trung tâm của bạn.</span>
                              </p>
                            ) : l.center_name ? (
                              <p className="mt-1 text-red-700 dark:text-red-300 font-medium">
                                🏛️ Đang thuộc <strong>{l.center_name}</strong>
                                {l.staff_name && <> — Sale: <strong>{l.staff_name}</strong></>}
                              </p>
                            ) : (
                              <p className="mt-1 text-surface-500">Chưa gán trung tâm</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Admin/Marketing/Sale đặt lịch/Lead Sale: cho xác nhận tiếp tục */}
                    {!isBlockedByCenter && (
                      <label className="flex items-center gap-2 mt-3 cursor-pointer">
                        <input type="checkbox" checked={dupConfirmed}
                          onChange={(e) => setDupConfirmed(e.target.checked)}
                          className="rounded bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-yellow-500" />
                        <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Tôi xác nhận muốn tạo lead mới với SĐT này</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}


          <div className="flex gap-2 pt-2">
            <button onClick={handleSubmit} disabled={saving || (dupCheck?.exists && (
              // Center: chặn cứng khi lead đã có center hoặc đang ở L0 hoặc L1.KK (kho kiểm)
              (isCenter && dupCheck.leads.some((l) => l.center_name || l.level_group === 'L0' || l.level_code === 'L1.KK'))
              // Admin/Marketing/Sale đặt lịch/Lead Sale: cần xác nhận checkbox
              || (!isCenter && !dupConfirmed)
            ))}
              className="btn-primary text-sm disabled:opacity-50">
              {saving ? 'Đang tạo...' : 'Tạo Lead'}
            </button>
            <button onClick={onClose} className="btn-secondary text-sm">Hủy</button>
          </div>
        </div>
      </div>
    </div>
  );
}
