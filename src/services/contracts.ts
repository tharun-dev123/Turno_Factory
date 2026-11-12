import type { CellRecord, CreateCellInput, UpdateCellInput } from '@/models/cell';

/**
 * Data-source contracts. `cellService` and `authService` depend only on these interfaces.
 * Phase 1 implements them with local mock storage; Phase 2 will implement them against Google Apps Script.
 */

export interface CellRepository {
  /** All cells (unsorted). */
  list(): Promise<CellRecord[]>;
  getById(id: string): Promise<CellRecord | null>;
  findByBarcode(barcode: string): Promise<CellRecord | null>;
  /**
   * Create a cell. Must atomically reject a duplicate barcode (throw DuplicateBarcodeError) and assign
   * the serial number and timestamps.
   */
  create(input: CreateCellInput): Promise<CellRecord>;
  /**
   * Update a cell. Must reject a barcode that belongs to another cell (DuplicateBarcodeError) and a stale
   * `expectedVersion` (ConflictError).
   */
  update(id: string, input: UpdateCellInput): Promise<CellRecord>;
  /** Delete a cell. `requestId` makes a retried delete idempotent. */
  remove(id: string, requestId?: string): Promise<void>;
}

export interface AuthTokenResult {
  token: string;
  /** ISO timestamp */
  expiresAt: string;
  username: string;
}

export interface AuthBackend {
  /** Validate shared factory credentials. Throws AuthError when invalid. */
  login(username: string, password: string): Promise<AuthTokenResult>;
}
