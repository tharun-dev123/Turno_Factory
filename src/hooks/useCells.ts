import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { CellRecord, CellStats } from '@/models/cell';
import { applyCellFilters, filterCells, getCellsOverview, type CellFilters } from '@/services/cellService';
import { getErrorMessage } from '@/services/errors';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Cell list + stats + search for the All Cells screen. Talks only to cellService.
 * The whole list is loaded once (and again on focus / pull-to-refresh). Searching filters that loaded list on
 * the phone, so typing never causes a request.
 */
export function useCells() {
  const [query, setQuery] = useState('');
  const [manufacturer, setManufacturer] = useState<CellFilters['manufacturer']>(null);
  const [status, setStatus] = useState<CellFilters['status']>(null);
  const [allCells, setAllCells] = useState<CellRecord[]>([]);
  const [stats, setStats] = useState<CellStats | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  // True once the list has loaded at least once; later reloads are silent so the list never blanks out.
  const hasLoaded = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'initial') setState('loading');
    if (mode === 'refresh') setRefreshing(true);
    try {
      const { cells: list, stats: nextStats } = await getCellsOverview('');
      if (id !== requestId.current) return; // a newer request superseded this one
      hasLoaded.current = true;
      setAllCells(list);
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

  // Reload whenever the screen gains focus (new scans, edits and deletes happen elsewhere).
  useFocusEffect(
    useCallback(() => {
      // Reload in the background on every focus; only the very first load shows the spinner.
      void load(hasLoaded.current ? 'silent' : 'initial');
    }, [load]),
  );

  // Search and both filters apply to the list already on the phone: changing any of them never causes a request.
  const cells = useMemo(() => applyCellFilters(filterCells(allCells, query), { manufacturer, status }), [allCells, query, manufacturer, status]);
  const filtersActive = manufacturer !== null || status !== null;
  const clearAll = useCallback(() => {
    setQuery('');
    setManufacturer(null);
    setStatus(null);
  }, []);

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);

  return { query, setQuery, manufacturer, setManufacturer, status, setStatus, filtersActive, clearAll, cells, stats, state, error, refreshing, refresh, retry };
}
