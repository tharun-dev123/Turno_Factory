import {
  DEFAULT_VISUAL_STATUS,
  REMARKS_REQUIRED_STATUSES,
  type CellRecord,
  type CreateCellInput,
  type UpdateCellInput,
} from '@/models/cell';

import type { CellRepository } from '../contracts';
import { ConflictError, DuplicateBarcodeError, NotFoundError, ValidationError } from '../errors';
import { buildDummyCells } from './dummyCells';
import { mockDelay, mockSeedMode } from './mockConfig';
import { readCells, readSerialCounter, writeCells, writeSerialCounter } from './mockStorage';

/**
 * TEMPORARY mock implementation of CellRepository, backed by AsyncStorage. Deleted in Phase 2.
 *
 * Behaves like the future backend: asynchronous, atomic duplicate check on create/update,
 * server-assigned serial numbers (never reused) and timestamps.
 */

let cache: CellRecord[] | null = null;
let serialCounter = 0;
let loading: Promise<void> | null = null;
let lock: Promise<unknown> = Promise.resolve();

async function load(): Promise<void> {
  const stored = await readCells<CellRecord>();
  if (stored) {
    // Records saved before versioning existed get version 1; records saved before visual inspection existed
    // start as Under Review.
    cache = stored.map((cell) => {
      const { inspectionStatus: _legacy, ...rest } = cell as CellRecord & { inspectionStatus?: unknown };
      return {
        ...rest,
        version: cell.version ?? 1,
        visualInspectionStatus: cell.visualInspectionStatus ?? DEFAULT_VISUAL_STATUS,
        remarks: cell.remarks ?? null,
      };
    });
    const storedCounter = await readSerialCounter();
    const maxSerial = stored.reduce((max, cell) => Math.max(max, cell.serialNumber), 0);
    serialCounter = Math.max(storedCounter ?? 0, maxSerial);
    return;
  }

  // First run: seed.
  cache = mockSeedMode === 'empty' ? [] : buildDummyCells();
  serialCounter = cache.reduce((max, cell) => Math.max(max, cell.serialNumber), 0);
  await writeCells(cache);
  await writeSerialCounter(serialCounter);
}

async function ensureLoaded(): Promise<CellRecord[]> {
  if (cache === null) {
    loading ??= load().finally(() => {
      loading = null;
    });
    await loading;
  }
  return cache as CellRecord[];
}

/** Serialise mutations so the duplicate check + write is atomic (like the future backend). */
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lock.then(task, task);
  lock = run.catch(() => undefined);
  return run;
}

async function persist(): Promise<void> {
  await writeCells(cache ?? []);
  await writeSerialCounter(serialCounter);
}

function newId(): string {
  return `cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const mockCellRepository: CellRepository = {
  async list() {
    await mockDelay();
    const cells = await ensureLoaded();
    return cells.map((cell) => ({ ...cell }));
  },

  async getById(id) {
    await mockDelay();
    const cells = await ensureLoaded();
    const found = cells.find((cell) => cell.id === id);
    return found ? { ...found } : null;
  },

  async findByBarcode(barcode) {
    await mockDelay();
    const cells = await ensureLoaded();
    const found = cells.find((cell) => cell.batteryBarcode === barcode);
    return found ? { ...found } : null;
  },

  create(input: CreateCellInput) {
    return withLock(async () => {
      await mockDelay();
      const cells = await ensureLoaded();

      const existing = cells.find((cell) => cell.batteryBarcode === input.batteryBarcode);
      if (existing) throw new DuplicateBarcodeError(input.batteryBarcode, existing);

      const now = new Date().toISOString();
      serialCounter += 1;
      const record: CellRecord = {
        id: newId(),
        serialNumber: serialCounter,
        batteryBarcode: input.batteryBarcode,
        rawPayload: input.rawPayload,
        validationMode: input.validationMode,
        cellLocalNumber: input.cellLocalNumber ?? null,
        cellWeightG: input.cellWeightG ?? null,
        cellVoltageV: input.cellVoltageV ?? null,
        acirMohm: input.acirMohm ?? null,
        dischargeCapacity05CAh: input.dischargeCapacity05CAh ?? null,
        dcir20Mohm: input.dcir20Mohm ?? null,
        dcir50Mohm: input.dcir50Mohm ?? null,
        dcir90Mohm: input.dcir90Mohm ?? null,
        stationId: input.stationId,
        lineId: input.lineId,
        scannedAt: input.scannedAt ?? now,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        // Display-only status: new cells start unassessed. Visual inspection always starts as Under Review.
        qcStatus: 'pending',
        visualInspectionStatus: DEFAULT_VISUAL_STATUS,
        remarks: null,
        version: 1,
      };
      cells.push(record);
      await persist();
      return { ...record };
    });
  },

  update(id: string, input: UpdateCellInput) {
    return withLock(async () => {
      await mockDelay();
      const cells = await ensureLoaded();
      const index = cells.findIndex((cell) => cell.id === id);
      if (index === -1) throw new NotFoundError();

      if (input.batteryBarcode !== undefined) {
        const clash = cells.find((cell) => cell.id !== id && cell.batteryBarcode === input.batteryBarcode);
        if (clash) throw new DuplicateBarcodeError(input.batteryBarcode, clash);
      }

      const current = cells[index];
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new ConflictError();
      }
      const { expectedVersion: _expected, requestId: _requestId, ...changes } = input;
      const updated: CellRecord = {
        ...current,
        ...stripUndefined(changes),
        // Immutable fields can never be changed through an update.
        id: current.id,
        serialNumber: current.serialNumber,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
        version: current.version + 1,
      };
      // Same rule as the backend, applied to the resulting record.
      if (REMARKS_REQUIRED_STATUSES.includes(updated.visualInspectionStatus) && (updated.remarks ?? '').trim() === '') {
        const message = `Remarks are required when the status is ${updated.visualInspectionStatus}.`;
        throw new ValidationError(message, { remarks: message });
      }
      cells[index] = updated;
      await persist();
      return { ...updated };
    });
  },

  remove(id: string, _requestId?: string) {
    return withLock(async () => {
      await mockDelay();
      const cells = await ensureLoaded();
      const index = cells.findIndex((cell) => cell.id === id);
      if (index === -1) throw new NotFoundError();
      cells.splice(index, 1);
      await persist();
    });
  },
};

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
