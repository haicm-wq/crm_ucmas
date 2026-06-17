import { useState, useEffect } from 'react';
import { useSharedData } from '../../contexts/SharedDataProvider';
import { fetchProfiles, updateProfile, createUser, resetUserPassword } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlinePencil, HiOutlineKey } from 'react-icons/hi';

export default function UsersTab() {
  const { centers } = useSharedData();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '', password: '', full_name: '',
    permission_group: 'center', center_id: '',
    can_view_l0_pool: false, center_access_mode: 'own',
  });

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await fetchProfiles());
    } catch { toast.error('Lỗi tải nhân viên'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      permission_group: u.permission_group,
      is_manager: u.is_manager,
      can_view_l0_pool: u.can_view_l0_pool,
      level_access_cap: u.level_access_cap || '',
      center_access_mode: u.center_access_mode,
      center_id: u.center_id || '',
      is_active: u.is_active,
    });
  };

  const handleSave = async () => {
    try {
      const changes = { ...editForm };
      if (changes.center_id === '') changes.center_id = null;
      await updateProfile(editingId, changes);
      toast.success('Cập nhật quyền thành công');
      setEditingId(null);
      load();
    } catch (err) { toast.error(err.message || 'Lỗi cập nhật'); }
  };

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password || !newUser.full_name) {
      toast.error('Vui lòng điền đủ Tên đăng nhập, Mật khẩu và Họ tên');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(newUser.username)) {
      toast.error('Tên đăng nhập chỉ được chứa chữ cái, số, dấu chấm, gạch ngang');
      return;
    }
    setCreating(true);
    try {
      await createUser({
        username: newUser.username,
        password: newUser.password,
        full_name: newUser.full_name,
        permission_group: newUser.permission_group,
        center_id: newUser.center_id || null,
        can_view_l0_pool: newUser.can_view_l0_pool,
        center_access_mode: newUser.center_access_mode,
      });
      toast.success(`Đã tạo tài khoản ${newUser.username}`);
      setNewUser({ username: '', password: '', full_name: '', permission_group: 'center', center_id: '', can_view_l0_pool: false, center_access_mode: 'own' });
      setShowCreate(false);
      load();
    } catch (err) { toast.error(err.message || 'Lỗi tạo tài khoản'); }
    finally { setCreating(false); }
  };

  const handleResetPassword = async (u) => {
    const username = u.email?.replace('@ucmas.local', '') || u.email;
    const confirmed = window.confirm(`Bạn có chắc chắn muốn reset mật khẩu của nhân viên "${u.full_name}" (Tên đăng nhập: ${username}) về mặc định "123456" không?`);
    if (!confirmed) return;
    
    try {
      await resetUserPassword(u.id);
      toast.success(`Đã reset mật khẩu của nhân viên "${u.full_name}" về mặc định "123456" thành công.`);
    } catch (err) {
      toast.error(err.message || 'Lỗi reset mật khẩu');
    }
  };

  return (
    <div className="space-y-4">
      {/* Create User Form */}
      {showCreate && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">➕ Tạo tài khoản mới</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-surface-500 mb-1">Họ tên *</label>
              <input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                className="input-field py-2 text-sm" placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Tên đăng nhập *</label>
              <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="input-field py-2 text-sm" placeholder="nguyenvana" autoComplete="off" />
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Mật khẩu *</label>
              <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="input-field py-2 text-sm" placeholder="Ít nhất 6 ký tự" type="password" />
            </div>
            <div>
              <label className="block text-xs text-surface-500 mb-1">Nhóm quyền</label>
              <select value={newUser.permission_group} onChange={(e) => {
                const val = e.target.value;
                setNewUser({ ...newUser, permission_group: val, center_id: val === 'center' ? newUser.center_id : '' });
              }}
                className="select-field py-2 text-sm">
                <option value="admin">Admin</option>
                <option value="marketing">Marketing</option>
                <option value="lead_telesale">Lead Sale đặt lịch</option>
                <option value="telesale">Sale đặt lịch</option>
                <option value="center">Center</option>
              </select>
            </div>
            {newUser.permission_group === 'center' && (
              <div>
                <label className="block text-xs text-surface-500 mb-1">Trung tâm *</label>
                <select value={newUser.center_id} onChange={(e) => setNewUser({ ...newUser, center_id: e.target.value })}
                  className="select-field py-2 text-sm">
                  <option value="">— Chọn trung tâm —</option>
                  {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            )}
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                <input type="checkbox" checked={newUser.can_view_l0_pool}
                  onChange={(e) => setNewUser({ ...newUser, can_view_l0_pool: e.target.checked })}
                  className="rounded" />
                Xem kho L0
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm">
              {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">Hủy</button>
          </div>
        </div>
      )}

      {/* User List */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Danh sách nhân viên ({users.length})</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary text-xs px-3 py-1.5">
              + Thêm nhân viên
            </button>
            <button onClick={load} className="btn-ghost text-xs" aria-label="Làm mới"><HiOutlineRefresh className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Họ tên</th><th>Tên đăng nhập</th><th>Quyền</th><th>Trung tâm</th>
                <th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8">
                  <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-surface-500">Chưa có nhân viên</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-surface-800 dark:text-surface-100">{u.full_name}</td>
                    <td className="text-surface-500 text-xs font-mono">{u.email?.replace('@ucmas.local', '') || u.email}</td>
                    <td>
                      {editingId === u.id ? (
                        <select value={editForm.permission_group}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditForm({ ...editForm, permission_group: val, center_id: val === 'center' ? editForm.center_id : '' });
                          }}
                          className="select-field py-1 text-xs">
                          <option value="admin">Admin</option>
                          <option value="marketing">Marketing</option>
                          <option value="lead_telesale">Lead Sale đặt lịch</option>
                          <option value="telesale">Sale đặt lịch</option>
                          <option value="center">Center</option>
                        </select>
                      ) : (
                        <span className={`badge text-[10px] ${
                          u.permission_group === 'admin' ? 'bg-red-500/10 text-red-500' :
                          u.permission_group === 'marketing' ? 'bg-blue-500/10 text-blue-500' :
                          u.permission_group === 'lead_telesale' ? 'bg-indigo-500/10 text-indigo-500' :
                          u.permission_group === 'telesale' ? 'bg-purple-500/10 text-purple-500' :
                          'bg-green-500/10 text-green-500'
                        }`}>{
                          u.permission_group === 'admin' ? 'Admin' :
                          u.permission_group === 'marketing' ? 'Marketing' :
                          u.permission_group === 'lead_telesale' ? 'Lead Sale đặt lịch' :
                          u.permission_group === 'telesale' ? 'Sale đặt lịch' :
                          'Center'
                        }</span>
                      )}
                    </td>
                    <td className="text-surface-500 text-xs">
                      {editingId === u.id ? (
                        editForm.permission_group === 'center' ? (
                          <select value={editForm.center_id || ''}
                            onChange={(e) => setEditForm({ ...editForm, center_id: e.target.value })}
                            className="select-field py-1 text-xs">
                            <option value="">— Chọn trung tâm —</option>
                            {centers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                        ) : '—'
                      ) : (
                        u.center_name || '—'
                      )}
                    </td>
                    <td className="text-center">
                      {editingId === u.id ? (
                        <input type="checkbox" checked={editForm.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
                      ) : (
                        u.is_active ? '🟢' : '🔴'
                      )}
                    </td>
                    <td>
                      {editingId === u.id ? (
                        <div className="flex gap-1">
                          <button onClick={handleSave} className="btn-primary text-[10px] px-2 py-1">Lưu</button>
                          <button onClick={() => setEditingId(null)} className="btn-ghost text-[10px] px-2 py-1">Hủy</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 items-center justify-end">
                          <button onClick={() => startEdit(u)} className="btn-ghost text-xs" title="Chỉnh sửa">
                            <HiOutlinePencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleResetPassword(u)} className="btn-ghost text-xs text-red-500 hover:text-red-700" title="Reset mật khẩu">
                            <HiOutlineKey className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
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
