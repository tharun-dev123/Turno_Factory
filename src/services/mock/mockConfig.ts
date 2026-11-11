/**
 * TEMPORARY mock-mode settings. Deleted in Phase 2.
 *
 * EXPO_PUBLIC_MOCK_SEED=empty  -> start with no cells (to see empty states)
 * EXPO_PUBLIC_MOCK_SEED=full   -> start with ~20 dummy cells (default)
 *
 * The seed is applied only the first time (when nothing is stored yet). To re-seed, clear the app data.
 */
export type MockSeedMode = 'full' | 'empty';

export const mockSeedMode: MockSeedMode = process.env.EXPO_PUBLIC_MOCK_SEED === 'empty' ? 'empty' : 'full';

/** Simulated network latency range in ms, so loading states are visible during development. */
export const MOCK_LATENCY_MS = { min: 120, max: 320 } as const;

export function mockDelay(): Promise<void> {
  const ms = MOCK_LATENCY_MS.min + Math.random() * (MOCK_LATENCY_MS.max - MOCK_LATENCY_MS.min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
