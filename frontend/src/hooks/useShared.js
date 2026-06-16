import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Debounce hook — returns debounced value
 * @param {any} value - Value to debounce
 * @param {number} delay - Delay in ms (default 400)
 */
export function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

/**
 * Supabase Realtime hook — subscribes to table changes with debounced reload
 * @param {string} table - Table name to listen to
 * @param {function} onChangeCallback - Callback when data changes
 * @param {object} options - { filter, debounceMs }
 */
export function useSupabaseRealtime(table, onChangeCallback, options = {}) {
  const { filter, debounceMs = 1000 } = options;
  const callbackRef = useRef(onChangeCallback);
  const debounceRef = useRef(null);

  useEffect(() => { callbackRef.current = onChangeCallback; }, [onChangeCallback]);

  useEffect(() => {
    const channelConfig = { event: '*', schema: 'public', table };
    if (filter) channelConfig.filter = filter;

    const channel = supabase
      .channel(`${table}-realtime`)
      .on('postgres_changes', channelConfig, () => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          callbackRef.current?.();
        }, debounceMs);
      })
      .subscribe();

    return () => {
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [table, filter, debounceMs]);
}

/**
 * API query hook — provides loading, error, data pattern
 * @param {function} queryFn - Async function that fetches data
 * @param {Array} deps - Dependencies array
 */
export function useApiQuery(queryFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bug3 fix: ref để luôn gọi queryFn mới nhất, tránh stale closure
  const queryFnRef = useRef(queryFn);
  useEffect(() => { queryFnRef.current = queryFn; }, [queryFn]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryFnRef.current();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
