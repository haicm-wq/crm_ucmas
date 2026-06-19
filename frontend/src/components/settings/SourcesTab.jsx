import { useState } from 'react';
import { useSharedData } from '../../contexts/SharedDataProvider';
import { createSubSource, updateSubSource, deleteSubSource } from '../../services/api';
import toast from 'react-hot-toast';
import { 
  HiOutlinePlus as PlusIcon, 
  HiOutlineTrash as TrashIcon, 
  HiOutlinePencil as PencilIcon, 
  HiOutlineCheck as CheckIcon, 
  HiOutlineX as XIcon, 
  HiOutlineAdjustments as AdjustIcon
} from 'react-icons/hi';

export default function SourcesTab() {
  const { subSources, refreshSubSources } = useSharedData();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form states
  const [parentType, setParentType] = useState('PULL');
  const [sourceName, setSourceName] = useState('');

  const handleSubmit = async () => {
    const name = sourceName.trim();
    if (!name) {
      toast.error('Tên nguồn con không được để trống');
      return;
    }

    // Check duplicate (case-insensitive)
    const isDup = subSources.some(
      s => s.source_type === parentType && 
           s.name.toLowerCase() === name.toLowerCase() && 
           s.id !== editingId
    );
    if (isDup) {
      toast.error(`Nguồn con "${name}" đã tồn tại trong nhóm ${parentType}!`);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateSubSource(editingId, { source_type: parentType, name });
        toast.success('Cập nhật nguồn con thành công!');
      } else {
        await createSubSource({ source_type: parentType, name, is_active: true });
        toast.success('Thêm nguồn con thành công!');
      }
      refreshSubSources();
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Lỗi lưu thông tin');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (src) => {
    setEditingId(src.id);
    setParentType(src.source_type);
    setSourceName(src.name);
  };

  const handleToggleActive = async (src) => {
    try {
      await updateSubSource(src.id, { is_active: !src.is_active });
      toast.success(`${src.is_active ? 'Khóa' : 'Kích hoạt'} nguồn con thành công!`);
      refreshSubSources();
    } catch (err) {
      toast.error(err.message || 'Lỗi cập nhật trạng thái');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa nguồn con này? Điều này sẽ gỡ cấu hình và các leads cũ có nguồn này vẫn giữ nguyên, nhưng sẽ không chọn được nguồn này cho lead mới nữa.')) {
      return;
    }

    try {
      await deleteSubSource(id);
      toast.success('Xóa nguồn con thành công!');
      refreshSubSources();
    } catch (err) {
      toast.error(err.message || 'Lỗi xóa nguồn con');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setParentType('PULL');
    setSourceName('');
  };

  return (
    <div className="space-y-6">
      {/* Add / Edit Form */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <AdjustIcon className="w-4 h-4 text-primary-500" />
          {editingId ? 'Cập nhật nguồn lead con' : 'Thêm cấu hình nguồn lead con mới'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">Nguồn cha *</label>
            <select
              value={parentType}
              onChange={(e) => setParentType(e.target.value)}
              className="select-field py-2 text-sm"
            >
              <option value="PULL">PULL (Quảng cáo / Marketing)</option>
              <option value="PUSH">PUSH (Giới thiệu / Chủ động)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-surface-500 mb-1">Tên nguồn lead con *</label>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="input-field py-2 text-sm"
              placeholder="Ví dụ: Facebook Ads, Google Search, Đại sứ học viên..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary text-sm flex-1 flex items-center justify-center gap-1.5 py-2.5"
            >
              {editingId ? (
                <><CheckIcon className="w-4 h-4" /> Cập nhật</>
              ) : (
                <><PlusIcon className="w-4 h-4" /> Thêm nguồn</>
              )}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="btn-secondary text-sm p-2.5"
                title="Hủy sửa"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-surface-200 dark:border-surface-700">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Danh sách các nguồn lead con</h3>
          <p className="text-xs text-surface-500 mt-1">Các nguồn con này sẽ hiển thị làm tùy chọn lọc trên Dashboard và trong các màn hình thêm/sửa Lead.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-12">STT</th>
                <th>Phân loại</th>
                <th>Tên nguồn con</th>
                <th>Trạng thái</th>
                <th className="text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {subSources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-surface-500 text-sm">
                    Chưa cấu hình nguồn lead con nào.
                  </td>
                </tr>
              ) : (
                subSources.map((src, idx) => (
                  <tr key={src.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/10">
                    <td className="font-mono text-xs text-surface-500">{idx + 1}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        src.source_type === 'PULL' 
                          ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' 
                          : 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                      }`}>
                        {src.source_type}
                      </span>
                    </td>
                    <td className="font-medium text-surface-800 dark:text-surface-200">
                      {src.name}
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleActive(src)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          src.is_active
                            ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400'
                            : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${src.is_active ? 'bg-emerald-500' : 'bg-surface-400'}`} />
                        {src.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                      </button>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleEdit(src)}
                          className="btn-ghost p-1.5 text-primary-600 dark:text-primary-400"
                          title="Sửa"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(src.id)}
                          className="btn-ghost p-1.5 text-red-500"
                          title="Xóa"
                        >
                          <TrashIcon className="w-4 h-4" />
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
