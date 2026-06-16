/**
 * SharedDataProvider — Cache data dùng chung toàn app
 * Centers, AllStaff, Products, ProductLevels, Settings → fetch 1 lần, share cho mọi page
 * Giảm API calls từ 5+/panel → chỉ fetch lead-specific data
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchCenters, fetchAllStaff, fetchProductLevels, fetchSettings } from '../services/api';
import { supabase } from '../lib/supabase';

const SharedDataContext = createContext(null);

export function SharedDataProvider({ children }) {
  const [centers, setCenters] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [productLevels, setProductLevels] = useState([]);
  const [customFieldsDef, setCustomFieldsDef] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCenters = useCallback(async () => {
    try {
      const data = await fetchCenters();
      setCenters(data);
    } catch (err) {
      console.error('SharedData: Error loading centers', err);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const data = await fetchAllStaff();
      setAllStaff(data);
    } catch (err) {
      console.error('SharedData: Error loading staff', err);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);
      setProducts(prods || []);
    } catch (err) {
      console.error('SharedData: Error loading products', err);
    }
  }, []);

  const loadProductLevels = useCallback(async () => {
    try {
      const data = await fetchProductLevels();
      setProductLevels(data);
    } catch (err) {
      console.error('SharedData: Error loading product levels', err);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      if (s.crm_custom_fields) {
        try { setCustomFieldsDef(JSON.parse(s.crm_custom_fields)); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('SharedData: Error loading settings', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      loadCenters(),
      loadStaff(),
      loadProducts(),
      loadProductLevels(),
      loadSettings(),
    ]).finally(() => setLoading(false));
  }, [loadCenters, loadStaff, loadProducts, loadProductLevels, loadSettings]);

  const refreshCenters = useCallback(() => loadCenters(), [loadCenters]);
  const refreshStaff = useCallback(() => loadStaff(), [loadStaff]);
  const refreshProducts = useCallback(async () => {
    await loadProducts();
    await loadProductLevels();
  }, [loadProducts, loadProductLevels]);
  const refreshSettings = useCallback(() => loadSettings(), [loadSettings]);

  return (
    <SharedDataContext.Provider value={{
      centers,
      allStaff,
      products,
      productLevels,
      customFieldsDef,
      loading,
      refreshCenters,
      refreshStaff,
      refreshProducts,
      refreshSettings,
    }}>
      {children}
    </SharedDataContext.Provider>
  );
}

export function useSharedData() {
  const ctx = useContext(SharedDataContext);
  if (!ctx) throw new Error('useSharedData must be used within SharedDataProvider');
  return ctx;
}
