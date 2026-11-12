import { appConfig } from '@/config/appConfig';

import { apiAuthBackend, apiCellRepository } from './api';
import type { AuthBackend, CellRepository } from './contracts';

/**
 * SINGLE SELECTION POINT for the data source.
 *
 * - live: Google Apps Script API (`./api`). Used by preview/production (factory) builds.
 * - mock: local dummy data (`./mock`). For development and tests only.
 *
 * The condition below is written with `__DEV__` and `process.env.EXPO_PUBLIC_DATA_MODE` inlined by Metro so
 * that, in a release build with EXPO_PUBLIC_DATA_MODE=live, the whole mock layer (including its placeholder
 * credentials) is removed from the bundle. A release build can never silently fall back to mock data:
 * `appConfig` refuses to start unless the data mode is set explicitly.
 *
 * No screen or component imports this file; only `cellService` and `authService` do.
 */
type MockModules = { cell: CellRepository; auth: AuthBackend };

let mock: MockModules | null = null;
if (__DEV__ || process.env.EXPO_PUBLIC_DATA_MODE === 'mock') {
  /* eslint-disable @typescript-eslint/no-require-imports -- conditional require keeps mock code out of live bundles */
  mock = {
    cell: require('./mock/mockCellRepository').mockCellRepository,
    auth: require('./mock/mockAuthStore').mockAuthBackend,
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function select(): MockModules {
  if (appConfig.dataMode === 'live') return { cell: apiCellRepository, auth: apiAuthBackend };
  if (!mock) throw new Error('Mock data mode is not available in this build.');
  return mock;
}

const selected = select();

export const cellRepository: CellRepository = selected.cell;
export const authBackend: AuthBackend = selected.auth;
