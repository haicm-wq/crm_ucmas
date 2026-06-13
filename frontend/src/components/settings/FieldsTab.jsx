import { useState, useEffect } from 'react';
import { fetchSettings, updateSettings } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineCheck, HiOutlineX, HiOutlineAdjustments } from 'react-icons/hi';

const FIELD_TYPES = [
  { value: 'text', label: 'Văn bản (Text)' },
  { value: 'number', label: 'Số (Number)' },
  { value: 'select', label: 'Lựa chọn (Dropdown)' },
  { value: 'boolean', label: 'Có/Không (Checkbox)' },
];

export default function FieldsTab() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);

  // Form states for add/edit field
  const [fieldKey, setFieldKey] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldOptions, setFieldOptions] = useState('');

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      if (s.crm_custom_fields) {
        try {
          setFields(JSON.parse(s.crm_custom_fields));
        } catch {
          setFields([]);
        }
      } else {
        setFields([]);
      }
    } catch {
      toast.error('Lỗi tải danh sách trường dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async (updatedFields) => {
    setSaving(true);
    try {
      await updateSettings({
        crm_custom_fields: JSON.stringify(updatedFields),
      });
      setFields(updatedFields);
      toast.success('Đã lưu cấu hình trường dữ liệu!');
    } catch (err) {
      toast.error(err.message || 'Lỗi lưu cấu hình');
    } finally {
      setSaving(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setFieldKey('');
    setFieldLabel('');
    setFieldType('text');
    setFieldOptions('');
    setEditingIndex(-1);
  };

  const handleAddField = () => {
    const key = fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label = fieldLabel.trim();

    if (!key) {
      toast.error('Mã trường không được để trống');
      return;
    }
    if (!label) {
      toast.error('Tên hiển thị không được để trống');
      return;
    }

    // Check duplicate key (excluding currently editing index)
    const isDup = fields.some((f, idx) => f.key === key && idx !== editingIndex);
    if (isDup) {
      toast.error(`Mã trường "${key}" đã tồn tại!`);
      return;
    }

    const newField = {
      key,
      label,
      type: fieldType,
      options: fieldType === 'select' ? fieldOptions.split(',').map(s => s.trim()).filter(Boolean) : [],
    };

    let updated;
    if (editingIndex > -1) {
      updated = [...fields];
      updated[editingIndex] = newField;
    } else {
      updated = [...fields, newField];
    }

    handleSaveAll(updated);
  };

  const handleEditField = (index) => {
    const field = fields[index];
    setFieldKey(field.key);
    setFieldLabel(field.label);
    setFieldType(field.type);
    setFieldOptions(field.options ? field.options.join(', ') : '');
    setEditingIndex(index);
  };

  const handleDeleteField = (index) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa trường dữ liệu này? Tất cả các dữ liệu đã lưu cho trường này ở lead cũ sẽ không hiển thị trên giao diện nữa.')) {
      return;
    }
    const updated = fields.filter((_, idx) => idx !== index);
    handleSaveAll(updated);
  };

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add / Edit Form */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <HiOutlineAdjustments className="w-4 h-4 text-primary-500" />
          {editingIndex > -1 ? 'Sửa trường dữ liệu' : 'Thêm trường dữ liệu tùy chỉnh mới'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Mã trường (viết liền không dấu, ví dụ: truong_hoc) *</label>
            <input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              disabled={editingIndex > -1}
              className="input-field py-2 text-sm"
              placeholder="truong_hoc"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Tên hiển thị trên CRM *</label>
            <input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              className="input-field py-2 text-sm"
              placeholder="Trường tiểu học"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Kiểu dữ liệu *</label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="select-field py-2 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddField}
              disabled={saving}
              className="btn-primary text-sm flex-1 flex items-center justify-center gap-1.5 py-2.5"
            >
              {editingIndex > -1 ? (
                <><HiOutlineCheck className="w-4 h-4" /> Cập nhật</>
              ) : (
                <><HiOutlinePlus className="w-4 h-4" /> Thêm trường</>
              )}
            </button>
            {editingIndex > -1 && (
              <button
                onClick={resetForm}
                className="btn-secondary text-sm p-2.5"
                title="Hủy sửa"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {fieldType === 'select' && (
          <div className="p-3 bg-surface-50 dark:bg-surface-800/30 border border-surface-200 dark:border-surface-700/50 rounded-xl animate-slide-in">
            <label className="block text-xs font-medium text-surface-500 mb-1">Các lựa chọn (Các giá trị ngăn cách bởi dấu phẩy) *</label>
            <input
              value={fieldOptions}
              onChange={(e) => setFieldOptions(e.target.value)}
              className="input-field py-2 text-sm"
              placeholder="Công lập, Dân lập, Quốc tế"
            />
          </div>
        )}
      </div>

      {/* Fields List */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-surface-200 dark:border-surface-700">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Danh sách trường dữ liệu hiện có</h3>
          <p className="text-xs text-surface-500 mt-1">Các trường này sẽ tự động xuất hiện trong màn hình thêm mới và chỉnh sửa thông tin chi tiết Lead.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên hiển thị</th>
                <th>Mã trường</th>
                <th>Kiểu dữ liệu</th>
                <th>Cấu hình bổ sung</th>
                <th className="text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-surface-500 text-sm">
                    Chưa có trường dữ liệu tùy chỉnh nào được tạo.
                  </td>
                </tr>
              ) : (
                fields.map((field, idx) => (
                  <tr key={field.key}>
                    <td className="w-12 text-surface-500 font-mono text-xs">{idx + 1}</td>
                    <td className="font-semibold text-surface-800 dark:text-surface-100">{field.label}</td>
                    <td className="font-mono text-xs text-primary-500">{field.key}</td>
                    <td>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300">
                        {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                      </span>
                    </td>
                    <td>
                      {field.type === 'select' && field.options ? (
                        <div className="flex flex-wrap gap-1">
                          {field.options.map(opt => (
                            <span key={opt} className="px-1.5 py-0.5 text-[10px] bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 rounded">
                              {opt}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-surface-400">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleEditField(idx)}
                          className="btn-ghost p-1.5 text-primary-600 dark:text-primary-400"
                          title="Sửa"
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteField(idx)}
                          className="btn-ghost p-1.5 text-red-500"
                          title="Xóa"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
