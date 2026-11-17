import { appConfig } from '@/config/appConfig';
import type {
  CellRecord,
  CellStats,
  CreateCellInput,
  EditableCellFields,
  ScanSource,
  UpdateCellInput,
} from '@/models/cell';
import { normalizeText, validateEditableFields } from '@/utils/validators';
import { checkScanPayload, type BarcodeCheckResult, type BarcodeRejectReason } from '@/validation/barcodeValidation';

import { DuplicateBarcodeError, isTransientError, NotFoundError, ValidationError } from './errors';
import { cellRepository } from './repository';
import { newRequestId } from './requestId';

/**
 * Cell service: the ONLY way screens and components read or change battery cell records.
 * It holds the business rules (barcode validation, duplicate handling, search, field validation)
 * and talks to the data source through `CellRepository` only.
 */

export interface NewCellRequest extends Partial<EditableCellFields> {
  /** Raw decoded payload from the scanner, or the barcode typed in manually */
  rawPayload: string;
  source: ScanSource;
}

export interface UpdateCellRequest extends Partial<EditableCellFields> {
  /** Provide to change the barcode (Rescan / manual entry). Validated and checked for duplicates. */
  newBarcode?: { rawPayload: string; source: ScanSource };
  /** The `version` of the cell as loaded. A stale version is rejected with a ConflictError. */
  expectedVersion?: number;
}

export type ScanOutcome =
  | { status: 'registered'; cell: CellRecord }
  | { status: 'duplicate'; barcode: string; rawPayload: string; existing: CellRecord | null }
  | { status: 'invalid'; reason: BarcodeRejectReason; message: string; rawPayload: string };

const sortNewestFirst = (a: CellRecord, b: CellRecord) => b.serialNumber - a.serialNumber;

// ---------------------------------------------------------------------------------------------
// Pending write requests.
// When a write ends in an unknown/temporary state (timeout, offline, busy server) the operator will try
// the same thing again. Re-using the SAME requestId lets the backend recognise the retry, so the first
// attempt is never applied twice and a retried scan never shows up as its own "duplicate".
// ---------------------------------------------------------------------------------------------

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingRequests = new Map<string, { requestId: string; at: number }>();

function acquireRequestId(key: string): { requestId: string; resumed: boolean } {
  const now = Date.now();
  for (const [k, v] of pendingRequests) if (now - v.at > PENDING_TTL_MS) pendingRequests.delete(k);
  const existing = pendingRequests.get(key);
  if (existing) return { requestId: existing.requestId, resumed: true };
  const requestId = newRequestId();
  pendingRequests.set(key, { requestId, at: now });
  return { requestId, resumed: false };
}

/** Keep the pending id only while the outcome is unknown or temporary; any definite answer settles it. */
function settleRequest(key: string, error?: unknown): void {
  if (error !== undefined && isTransientError(error)) return;
  pendingRequests.delete(key);
}

/** Test hook: forget pending requests. */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/** Validate a raw payload with the active (development or production) validator. */
export function validateBarcode(rawPayload: string): BarcodeCheckResult {
  return checkScanPayload(rawPayload);
}

// ---------------------------------------------------------------------------------------------
// Last known copy of each cell. Screens use it to show a cell instantly while the fresh copy loads
// (the backend takes seconds to answer). It is only a display shortcut: every write still checks the
// cell's version on the server, and it is cleared on sign-out.
// ---------------------------------------------------------------------------------------------

const knownCells = new Map<string, CellRecord>();

function remember(cell: CellRecord): CellRecord {
  knownCells.set(cell.id, cell);
  return cell;
}

/** The last known copy of a cell, or null. Synchronous, never touches the network. */
export function peekCell(id: string): CellRecord | null {
  return knownCells.get(id) ?? null;
}

/** Test hook: pretend this copy is the last known one (for example an out-of-date copy). */
export function seedCellCache(cell: CellRecord): void {
  remember(cell);
}

/** Forget every remembered cell (sign-out, tests). */
export function clearCellCache(): void {
  knownCells.clear();
}

export async function listCells(): Promise<CellRecord[]> {
  const cells = await cellRepository.list();
  // Replace the whole cache: cells deleted elsewhere must not linger.
  knownCells.clear();
  cells.forEach(remember);
  return cells.sort(sortNewestFirst);
}

export async function getCell(id: string): Promise<CellRecord> {
  const cell = await cellRepository.getById(id);
  if (!cell) {
    knownCells.delete(id);
    throw new NotFoundError();
  }
  return remember(cell);
}

/**
 * Case-insensitive partial match on barcode or serial number (`#001`, `001`, `1`). Pure and synchronous, so a
 * screen that already holds the list can search it without another request.
 */
export function filterCells(cells: CellRecord[], query: string): CellRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return cells;

  const serialNeedle = needle.replace(/^(serial\s*)?#?/, '');
  const serialDigits = /^\d+$/.test(serialNeedle) ? Number(serialNeedle) : null;

  return cells.filter((cell) => {
    if (cell.batteryBarcode.toLowerCase().includes(needle)) return true;
    if (serialDigits !== null) {
      return (
        cell.serialNumber === serialDigits || String(cell.serialNumber).padStart(3, '0').includes(serialNeedle)
      );
    }
    return false;
  });
}

function computeStats(cells: CellRecord[]): CellStats {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let addedToday = 0;
  let addedLast24h = 0;
  for (const cell of cells) {
    const created = new Date(cell.createdAt).getTime();
    if (created >= startOfToday.getTime()) addedToday += 1;
    if (now - created <= 24 * 3_600_000) addedLast24h += 1;
  }
  return { total: cells.length, addedToday, addedLast24h };
}

export async function searchCells(query: string): Promise<CellRecord[]> {
  return filterCells(await listCells(), query);
}

export async function getStats(): Promise<CellStats> {
  return computeStats(await cellRepository.list());
}

/**
 * Matching cells plus the overall stats from ONE read of the data source. The All Cells screen uses this so a
 * reload or search makes a single request instead of two.
 */
export async function getCellsOverview(query: string): Promise<{ cells: CellRecord[]; stats: CellStats }> {
  const all = await listCells();
  return { cells: filterCells(all, query), stats: computeStats(all) };
}

/** Most recently registered cell, or null when there are none. */
export async function getLatestCell(): Promise<CellRecord | null> {
  const cells = await cellRepository.list();
  if (cells.length === 0) return null;
  return cells.reduce((latest, cell) => (cell.createdAt >= latest.createdAt ? cell : latest));
}

export type BarcodeAvailability =
  | { ok: true; barcode: string }
  | { ok: false; reason: 'invalid' | 'duplicate'; message: string };

/**
 * Pre-check a payload for the Rescan flow: is it valid, and is it free (ignoring the cell being edited)?
 * The authoritative duplicate check still happens on save.
 */
export async function checkBarcodeAvailable(rawPayload: string, excludeCellId?: string): Promise<BarcodeAvailability> {
  const check = checkScanPayload(rawPayload);
  if (!check.ok) return { ok: false, reason: 'invalid', message: check.message };
  const existing = await cellRepository.findByBarcode(check.barcode);
  if (existing && existing.id !== excludeCellId) {
    return {
      ok: false,
      reason: 'duplicate',
      message: `Already registered as Serial #${String(existing.serialNumber).padStart(3, '0')}.`,
    };
  }
  return { ok: true, barcode: check.barcode };
}

export async function isBarcodeRegistered(barcode: string): Promise<boolean> {
  return (await cellRepository.findByBarcode(barcode)) !== null;
}

/**
 * Create a cell. Throws ValidationError for an invalid barcode/fields and DuplicateBarcodeError when the
 * barcode already exists.
 */
export async function createCell(request: NewCellRequest): Promise<CellRecord> {
  const check = checkScanPayload(request.rawPayload);
  if (!check.ok) throw new ValidationError(check.message, { barcode: check.message });

  const { rawPayload: _raw, source, ...fields } = request;
  const normalized = normalizeFields(fields);
  const fieldErrors = validateEditableFields(normalized);
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Please correct the highlighted fields.', fieldErrors);
  }

  const input: CreateCellInput = {
    ...normalized,
    batteryBarcode: check.barcode,
    // Preserve the original decoded payload; manual entry has none.
    rawPayload: source === 'scan' ? check.rawPayload : null,
    validationMode: check.mode,
    stationId: appConfig.station.id,
    lineId: appConfig.line.id,
  };

  const key = `create:${request.source}:${request.rawPayload}`;
  const { requestId } = acquireRequestId(key);
  try {
    const cell = await cellRepository.create({ ...input, requestId });
    settleRequest(key);
    return remember(cell);
  } catch (error) {
    settleRequest(key, error);
    throw error;
  }
}

/**
 * Register a scanned (or manually entered) code and report the outcome without throwing for the three
 * expected scan results. Network and unexpected errors still throw.
 */
export async function registerScan(rawPayload: string, source: ScanSource): Promise<ScanOutcome> {
  const check = checkScanPayload(rawPayload);
  if (!check.ok) {
    return { status: 'invalid', reason: check.reason, message: check.message, rawPayload };
  }
  try {
    const cell = await createCell({ rawPayload, source });
    return { status: 'registered', cell };
  } catch (error) {
    if (error instanceof DuplicateBarcodeError) {
      const existing = await cellRepository.findByBarcode(check.barcode);
      return { status: 'duplicate', barcode: check.barcode, rawPayload, existing };
    }
    throw error;
  }
}

export async function updateCell(id: string, request: UpdateCellRequest): Promise<CellRecord> {
  const { newBarcode, expectedVersion, ...fields } = request;
  const normalized = normalizeFields(fields);

  const fieldErrors = validateEditableFields(normalized);
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Please correct the highlighted fields.', fieldErrors);
  }

  const input: UpdateCellInput = { ...normalized };
  if (expectedVersion !== undefined) input.expectedVersion = expectedVersion;
  if (newBarcode) {
    const check = checkScanPayload(newBarcode.rawPayload);
    if (!check.ok) throw new ValidationError(check.message, { batteryBarcode: check.message });
    input.batteryBarcode = check.barcode;
    input.rawPayload = newBarcode.source === 'scan' ? check.rawPayload : null;
    input.validationMode = check.mode;
  }

  // Identical re-submissions of the same edit share one requestId (see "Pending write requests").
  const key = `update:${id}:${JSON.stringify(input)}`;
  const { requestId } = acquireRequestId(key);
  try {
    const cell = await cellRepository.update(id, { ...input, requestId });
    settleRequest(key);
    return remember(cell);
  } catch (error) {
    settleRequest(key, error);
    throw error;
  }
}

export async function deleteCell(id: string): Promise<void> {
  const key = `delete:${id}`;
  const { requestId, resumed } = acquireRequestId(key);
  try {
    await cellRepository.remove(id, requestId);
    knownCells.delete(id);
    settleRequest(key);
  } catch (error) {
    // A repeated delete that finds nothing, after an earlier attempt whose outcome was unknown, means the
    // earlier attempt did go through: that is a success, not an error.
    if (resumed && error instanceof NotFoundError) {
      knownCells.delete(id);
      settleRequest(key);
      return;
    }
    settleRequest(key, error);
    throw error;
  }
}

/** Trim text fields and convert empty strings to null; leave numbers untouched. */
function normalizeFields(fields: Partial<EditableCellFields>): Partial<EditableCellFields> {
  const result: Partial<EditableCellFields> = { ...fields };
  if ('cellLocalNumber' in fields) result.cellLocalNumber = normalizeText(fields.cellLocalNumber);
  if ('remarks' in fields) result.remarks = normalizeText(fields.remarks);
  return result;
}
