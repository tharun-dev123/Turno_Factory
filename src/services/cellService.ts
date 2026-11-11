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

import { DuplicateBarcodeError, NotFoundError, ValidationError } from './errors';
import { cellRepository } from './repository';

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
}

export type ScanOutcome =
  | { status: 'registered'; cell: CellRecord }
  | { status: 'duplicate'; barcode: string; rawPayload: string; existing: CellRecord | null }
  | { status: 'invalid'; reason: BarcodeRejectReason; message: string; rawPayload: string };

const sortNewestFirst = (a: CellRecord, b: CellRecord) => b.serialNumber - a.serialNumber;

/** Validate a raw payload with the active (development or production) validator. */
export function validateBarcode(rawPayload: string): BarcodeCheckResult {
  return checkScanPayload(rawPayload);
}

export async function listCells(): Promise<CellRecord[]> {
  const cells = await cellRepository.list();
  return cells.sort(sortNewestFirst);
}

export async function getCell(id: string): Promise<CellRecord> {
  const cell = await cellRepository.getById(id);
  if (!cell) throw new NotFoundError();
  return cell;
}

/** Case-insensitive partial match on barcode or serial number (`#001`, `001`, `1`). */
export async function searchCells(query: string): Promise<CellRecord[]> {
  const cells = await listCells();
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

export async function getStats(): Promise<CellStats> {
  const cells = await cellRepository.list();
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
  return cellRepository.create(input);
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
  const { newBarcode, ...fields } = request;
  const normalized = normalizeFields(fields);

  const fieldErrors = validateEditableFields(normalized);
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Please correct the highlighted fields.', fieldErrors);
  }

  const input: UpdateCellInput = { ...normalized };
  if (newBarcode) {
    const check = checkScanPayload(newBarcode.rawPayload);
    if (!check.ok) throw new ValidationError(check.message, { batteryBarcode: check.message });
    input.batteryBarcode = check.barcode;
    input.rawPayload = newBarcode.source === 'scan' ? check.rawPayload : null;
    input.validationMode = check.mode;
  }
  return cellRepository.update(id, input);
}

export async function deleteCell(id: string): Promise<void> {
  await cellRepository.remove(id);
}

/** Trim text fields and convert empty strings to null; leave numbers untouched. */
function normalizeFields(fields: Partial<EditableCellFields>): Partial<EditableCellFields> {
  const result: Partial<EditableCellFields> = { ...fields };
  if ('sortingGrade' in fields) result.sortingGrade = normalizeText(fields.sortingGrade);
  if ('cellLocalNumber' in fields) result.cellLocalNumber = normalizeText(fields.cellLocalNumber);
  return result;
}
