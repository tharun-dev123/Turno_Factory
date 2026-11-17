import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { CellRecord } from '@/models/cell';
import { getCell, peekCell } from '@/services/cellService';
import { getErrorMessage, NotFoundError } from '@/services/errors';

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

interface UseCellOptions {
  /**
   * Start from the last known copy of the cell (if any) instead of a loading spinner, and refresh it in the
   * background. For read-only screens only: a form must not have its data replaced while someone edits it.
   */
  showKnownFirst?: boolean;
}

/** Loads one cell by id (reloads when the screen regains focus, e.g. after editing). */
export function useCell(id: string | undefined, { showKnownFirst = false }: UseCellOptions = {}) {
  const [cell, setCell] = useState<CellRecord | null>(() => (showKnownFirst && id ? peekCell(id) : null));
  const [state, setState] = useState<LoadState>(() => (showKnownFirst && id && peekCell(id) ? 'ready' : 'loading'));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setState('not_found');
      return;
    }
    try {
      setCell(await getCell(id));
      setError(null);
      setState('ready');
    } catch (e) {
      if (e instanceof NotFoundError) {
        setCell(null);
        setState('not_found');
      } else if (showKnownFirst && peekCell(id)) {
        // A failed background refresh must not replace a cell that is already on screen with an error page.
        setError(getErrorMessage(e));
      } else {
        setError(getErrorMessage(e));
        setState('error');
      }
    }
  }, [id, showKnownFirst]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const retry = useCallback(() => {
    setState('loading');
    return load();
  }, [load]);

  return { cell, state, error, retry };
}
