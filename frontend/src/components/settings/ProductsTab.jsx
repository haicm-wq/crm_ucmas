import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { 
  HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, 
  HiOutlineCheck, HiOutlineX, HiOutlineCollection, 
  HiOutlineHashtag, HiOutlineRefresh 
} from 'react-icons/hi';

export default function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [levels, setLevels] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingLevels, setLoadingLevels] = useState(false);

  // Form states for product
  const [prodCode, setProdCode] = useState('');
  const [prodName, setProdName] = useState('');
  const [editingProd, setEditingProd] = useState(null); // product code being edited

  // Form states for level
  const [lvlCode, setLvlCode] = useState('');
  const [lvlLabel, setLvlLabel] = useState('');
  const [lvlColor, setLvlColor] = useState('#6B7280');
  const [lvlSort, setLvlSort] = useState('0');
  const [editingLvlIndex, setEditingLvlIndex] = useState(-1);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      loadLevels(selectedProduct.code);
    } else {
      setLevels([]);
    }
  }, [selectedProduct]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      setProducts(data || []);
      if (data && data.length > 0 && !selectedProduct) {
        setSelectedProduct(data[0]);
      }
    } catch (err) {
      toast.error('Lỗi tải danh sách sản phẩm');
      console.error(err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadLevels = async (productCode) => {
    setLoadingLevels(true);
    try {
      const { data, error } = await supabase
        .from('product_levels')
        .select('*')
        .eq('product_code', productCode)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setLevels(data || []);
    } catch (err) {
      toast.error('Lỗi tải danh sách level');
      console.error(err);
    } finally {
      setLoadingLevels(false);
    }
  };

  const handleSaveProduct = async () => {
    const code = prodCode.trim().toUpperCase();
    const name = prodName.trim();

    if (!code) {
      toast.error('Mã sản phẩm không được trống');
      return;
    }
    if (!name) {
      toast.error('Tên sản phẩm không được trống');
      return;
    }

    try {
      if (editingProd) {
        const { error } = await supabase
          .from('products')
          .update({ name })
          .eq('code', editingProd);
        if (error) throw error;
        toast.success('Đã cập nhật tên sản phẩm!');
      } else {
        const { error } = await supabase
          .from('products')
          .insert({ code, name });
        if (error) throw error;
        toast.success('Đã thêm sản phẩm mới!');
      }
      setProdCode('');
      setProdName('');
      setEditingProd(null);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Lỗi lưu sản phẩm');
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${product.name}"?\n\nTất cả các level và dữ liệu trạng thái level của lead liên quan sẽ bị xóa sạch.\nSản phẩm này cũng sẽ bị xóa khỏi danh sách "Sản phẩm quan tâm" của các lead.`)) {
      return;
    }
    try {
      // 1. Xóa product code khỏi leads.interested_products array
      // (vì interested_products là text[], không có FK cascade)
      const { data: affectedLeads, error: fetchErr } = await supabase
        .from('leads')
        .select('id, interested_products')
        .contains('interested_products', [product.code]);
      
      if (!fetchErr && affectedLeads?.length > 0) {
        for (const lead of affectedLeads) {
          const updated = (lead.interested_products || []).filter(p => p !== product.code);
          await supabase.from('leads').update({ interested_products: updated }).eq('id', lead.id);
        }
      }

      // 2. Xóa product (cascade sẽ xóa product_levels + lead_product_levels)
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('code', product.code);
      if (error) throw error;

      toast.success(`Đã xóa sản phẩm "${product.name}"${affectedLeads?.length ? ` và cập nhật ${affectedLeads.length} lead` : ''}!`);
      if (selectedProduct?.code === product.code) {
        setSelectedProduct(null);
      }
      loadProducts();
    } catch (err) {
      console.error('Lỗi xóa sản phẩm:', err);
      toast.error(err.message || 'Lỗi khi xóa sản phẩm');
    }
  };

  const handleSaveLevel = async () => {
    const code = lvlCode.trim();
    const label = lvlLabel.trim();
    const color = lvlColor.trim() || '#6B7280';
    const sort = parseInt(lvlSort) || 0;

    if (!code) {
      toast.error('Mã level không được trống');
      return;
    }
    if (!label) {
      toast.error('Tên hiển thị không được trống');
      return;
    }

    try {
      const payload = {
        product_code: selectedProduct.code,
        level_code: code,
        label,
        color,
        sort_order: sort,
      };

      if (editingLvlIndex > -1) {
        const target = levels[editingLvlIndex];
        const { error } = await supabase
          .from('product_levels')
          .update(payload)
          .eq('id', target.id);
        if (error) throw error;
        toast.success('Cập nhật Level thành công!');
      } else {
        const { error } = await supabase
          .from('product_levels')
          .insert(payload);
        if (error) throw error;
        toast.success('Đã thêm Level mới!');
      }
      resetLevelForm();
      loadLevels(selectedProduct.code);
    } catch (err) {
      toast.error(err.message || 'Lỗi lưu Level');
    }
  };

  const handleEditLevel = (index) => {
    const lvl = levels[index];
    setLvlCode(lvl.level_code);
    setLvlLabel(lvl.label);
    setLvlColor(lvl.color);
    setLvlSort(String(lvl.sort_order));
    setEditingLvlIndex(index);
  };

  const handleDeleteLevel = async (lvl) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa level "${lvl.level_code} — ${lvl.label}"?`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from('product_levels')
        .delete()
        .eq('id', lvl.id);
      if (error) throw error;
      toast.success('Đã xóa Level!');
      loadLevels(selectedProduct.code);
    } catch (err) {
      console.error('Lỗi xóa Level:', err);
      toast.error(err.message || 'Lỗi khi xóa Level');
    }
  };

  const resetLevelForm = () => {
    setLvlCode('');
    setLvlLabel('');
    setLvlColor('#6B7280');
    setLvlSort('0');
    setEditingLvlIndex(-1);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Product List Panel */}
      <div className="md:col-span-1 space-y-4">
        {/* Product Form */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
            <HiOutlineCollection className="w-4 h-4 text-primary-500" />
            {editingProd ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Mã sản phẩm (ví dụ: UCMAS, ROBOT) *</label>
              <input 
                type="text" 
                value={prodCode}
                onChange={(e) => setProdCode(e.target.value)}
                disabled={!!editingProd}
                className="input-field py-1.5 px-3 text-xs font-semibold" 
                placeholder="Mã SP"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Tên sản phẩm *</label>
              <input 
                type="text" 
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                className="input-field py-1.5 px-3 text-xs" 
                placeholder="Tên hiển thị"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button 
                onClick={handleSaveProduct}
                className="btn-primary text-xs py-1.5 px-3 flex-1 flex items-center justify-center gap-1"
              >
                <HiOutlineCheck className="w-3.5 h-3.5" />
                {editingProd ? 'Cập nhật' : 'Thêm'}
              </button>
              {editingProd && (
                <button 
                  onClick={() => { setEditingProd(null); setProdCode(''); setProdName(''); }}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Hủy
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Product Items */}
        <div className="glass-card overflow-hidden">
          <div className="p-3 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-surface-500">Danh sách sản phẩm</h3>
            <button onClick={loadProducts} className="btn-ghost p-1" aria-label="Làm mới"><HiOutlineRefresh className="w-3.5 h-3.5" /></button>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {loadingProducts ? (
              <div className="p-6 text-center">
                <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : products.length === 0 ? (
              <p className="p-4 text-xs text-surface-400 text-center">Chưa có sản phẩm nào</p>
            ) : (
              products.map((prod) => (
                <div 
                  key={prod.id} 
                  onClick={() => setSelectedProduct(prod)}
                  className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                    selectedProduct?.code === prod.code 
                      ? 'bg-primary-50/50 dark:bg-primary-500/10 border-l-3 border-primary-500' 
                      : 'hover:bg-surface-50 dark:hover:bg-surface-800/30'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-surface-800 dark:text-surface-100 truncate">{prod.name}</p>
                    <p className="text-[10px] font-mono text-primary-500 mt-0.5">{prod.code}</p>
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => { setEditingProd(prod.code); setProdCode(prod.code); setProdName(prod.name); }}
                      className="btn-ghost p-1 text-surface-500 hover:text-primary-500"
                    >
                      <HiOutlinePencil className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteProduct(prod)}
                      className="btn-ghost p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Levels Config Panel */}
      <div className="md:col-span-2 space-y-4">
        {selectedProduct ? (
          <>
            {/* Level Form */}
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
                <HiOutlineHashtag className="w-4 h-4 text-primary-500" />
                {editingLvlIndex > -1 
                  ? `Sửa Level cho sản phẩm ${selectedProduct.name}` 
                  : `Thêm Level mới cho sản phẩm ${selectedProduct.name}`}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Mã Level (ví dụ: L1, L4.1) *</label>
                  <input 
                    type="text" 
                    value={lvlCode}
                    onChange={(e) => setLvlCode(e.target.value)}
                    disabled={editingLvlIndex > -1}
                    className="input-field py-1.5 px-3 text-xs font-semibold"
                    placeholder="Mã Level"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Tên mô tả Level *</label>
                  <input 
                    type="text" 
                    value={lvlLabel}
                    onChange={(e) => setLvlLabel(e.target.value)}
                    className="input-field py-1.5 px-3 text-xs"
                    placeholder="Tên mô tả"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Mã màu (Hex) *</label>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={lvlColor}
                      onChange={(e) => setLvlColor(e.target.value)}
                      className="w-7 h-7 rounded border border-surface-300 dark:border-surface-600 p-0 cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={lvlColor}
                      onChange={(e) => setLvlColor(e.target.value)}
                      className="input-field py-1.5 px-2 text-xs font-mono w-20"
                      placeholder="#6B7280"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-surface-500 mb-0.5">Thứ tự sắp xếp *</label>
                  <input 
                    type="number" 
                    value={lvlSort}
                    onChange={(e) => setLvlSort(e.target.value)}
                    className="input-field py-1.5 px-3 text-xs font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="sm:col-span-3 flex gap-2 justify-end">
                  <button 
                    onClick={handleSaveLevel}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                  >
                    <HiOutlineCheck className="w-3.5 h-3.5" />
                    {editingLvlIndex > -1 ? 'Cập nhật' : 'Thêm Level'}
                  </button>
                  {editingLvlIndex > -1 && (
                    <button 
                      onClick={resetLevelForm}
                      className="btn-secondary text-xs py-2 px-3"
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Levels List */}
            <div className="glass-card overflow-hidden">
              <div className="p-3 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-surface-500">
                  Danh sách Level — {selectedProduct.name}
                </h3>
                <span className="text-[10px] text-surface-400">Được sắp xếp theo thứ tự ưu tiên</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th className="w-12">Thứ tự</th>
                      <th className="w-20">Mã</th>
                      <th>Tên mô tả</th>
                      <th className="w-24">Màu sắc</th>
                      <th className="w-20 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLevels ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8">
                          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        </td>
                      </tr>
                    ) : levels.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-surface-400">
                          Chưa cấu hình Level nào cho sản phẩm này
                        </td>
                      </tr>
                    ) : (
                      levels.map((lvl, idx) => (
                        <tr key={lvl.id}>
                          <td className="font-mono text-surface-500">{lvl.sort_order}</td>
                          <td>
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-white font-mono"
                              style={{ backgroundColor: lvl.color }}
                            >
                              {lvl.level_code}
                            </span>
                          </td>
                          <td className="font-semibold text-surface-800 dark:text-surface-200">{lvl.label}</td>
                          <td className="font-mono text-surface-500">{lvl.color}</td>
                          <td className="text-right">
                            <div className="flex justify-end gap-1">
                              <button 
                                onClick={() => handleEditLevel(idx)}
                                className="btn-ghost p-1 text-surface-500 hover:text-primary-500"
                                title="Sửa"
                              >
                                <HiOutlinePencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteLevel(lvl)}
                                className="btn-ghost p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                                title="Xóa"
                              >
                                <HiOutlineTrash className="w-3.5 h-3.5" />
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
          </>
        ) : (
          <div className="glass-card p-12 text-center text-surface-500">
            Hãy chọn một sản phẩm ở cột bên trái để thiết lập Level.
          </div>
        )}
      </div>
    </div>
  );
}
