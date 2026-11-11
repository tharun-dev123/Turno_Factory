import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * TEMPORARY local persistence for the mock data source. Deleted in Phase 2.
 * Keys are versioned so the stored shape can change during development.
 */
const KEYS = {
  cells: 'turno.mock.cells.v1',
  serialCounter: 'turno.mock.serialCounter.v1',
} as const;

export async function readCells<T>(): Promise<T[] | null> {
  const raw = await AsyncStorage.getItem(KEYS.cells);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export async function writeCells<T>(cells: T[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.cells, JSON.stringify(cells));
}

export async function readSerialCounter(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(KEYS.serialCounter);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function writeSerialCounter(value: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.serialCounter, String(value));
}

/** Remove all mock data (used to reset the development environment). */
export async function clearMockStorage(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.cells, KEYS.serialCounter]);
}
