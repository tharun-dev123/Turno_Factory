import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CellRecord, CellStats } from '@/models/cell';
import { getStats, searchCells } from '@/services/cellService';
import { getErrorMessage } from '@/services/errors';

type LoadState = 'loading' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 250;

/** Cell list + stats + search for the All Cells screen. Talks only to cellService. */
export function useCells() {
  const [query, setQuery] = useState('');
  const [cells, setCells] = useState<CellRecord[]>([]);
  const [stats, setStats] = useState<CellStats | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const load = useCallback(async (search: string, mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'initial') setState('loading');
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [list, nextStats] = await Promise.all([searchCells(search), getStats()]);
      if (id !== requestId.current) return; // a newer request superseded this one
      setCells(list);
      setStats(nextStats);
      setError(null);
      setState('ready');
    } catch (e) {
      if (id !== requestId.current) return;
      setError(getErrorMessage(e));
      if (mode !== 'silent') setState('error');
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  // Debounced search.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => void load(query, 'silent'), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, load]);

  // Reload whenever the screen gains focus (new scans, edits and deletes happen elsewhere).
  useFocusEffect(
    useCallback(() => {
      void load(queryRef.current, state === 'loading' ? 'initial' : 'silent');
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to focus changes
    }, [load]),
  );

  const refresh = useCallback(() => load(queryRef.current, 'refresh'), [load]);
  const retry = useCallback(() => load(queryRef.current, 'initial'), [load]);

  return { query, setQuery, cells, stats, state, error, refreshing, refresh, retry };
}
