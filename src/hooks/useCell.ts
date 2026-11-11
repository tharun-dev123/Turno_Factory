import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { CellRecord } from '@/models/cell';
import { getCell } from '@/services/cellService';
import { getErrorMessage, NotFoundError } from '@/services/errors';

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

/** Loads one cell by id (reloads when the screen regains focus, e.g. after editing). */
export function useCell(id: string | undefined) {
  const [cell, setCell] = useState<CellRecord | null>(null);
  const [state, setState] = useState<LoadState>('loading');
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
      } else {
        setError(getErrorMessage(e));
        setState('error');
      }
    }
  }, [id]);

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
