import type { AuthBackend, CellRepository } from './contracts';
import { mockAuthBackend } from './mock/mockAuthStore';
import { mockCellRepository } from './mock/mockCellRepository';

/**
 * SINGLE SELECTION POINT for the data source.
 *
 * Phase 1: local mock implementations (everything under `./mock`).
 * Phase 2: replace these two lines with the Google Apps Script implementations, then delete `./mock`.
 * No screen or component imports this file; only `cellService` and `authService` do.
 */
export const cellRepository: CellRepository = mockCellRepository;
export const authBackend: AuthBackend = mockAuthBackend;
