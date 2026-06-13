/**
 * SharedDataProvider — Cache data dùng chung toàn app
 * Centers + AllStaff fetch 1 lần, share cho mọi page
 * Thay thế 5+ lần gọi fetchCenters() rải rác
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchCenters, fetchAllStaff } from '../services/api';

const SharedDataContext = createContext(null);

export function SharedDataProvider({ children }) {
  const [centers, setCenters] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
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

  useEffect(() => {
    Promise.all([loadCenters(), loadStaff()]).finally(() => setLoading(false));
  }, [loadCenters, loadStaff]);

  const refreshCenters = useCallback(() => loadCenters(), [loadCenters]);
  const refreshStaff = useCallback(() => loadStaff(), [loadStaff]);

  return (
    <SharedDataContext.Provider value={{
      centers,
      allStaff,
      loading,
      refreshCenters,
      refreshStaff,
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
