import { appConfig } from '@/config/appConfig';

import { createApiAuthBackend } from './apiAuthBackend';
import { createApiCellRepository } from './apiCellRepository';
import { createApiClient } from './httpClient';

/** The shared client, configured from `appConfig.api` (read lazily so tests can use their own). */
export const apiClient = createApiClient(() => appConfig.api);

export const apiCellRepository = createApiCellRepository(apiClient);
export const apiAuthBackend = createApiAuthBackend(apiClient);
