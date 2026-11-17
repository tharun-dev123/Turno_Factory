import {
  DEFAULT_VISUAL_STATUS,
  VISUAL_INSPECTION_STATUSES,
  type CellRecord,
  type CreateCellInput,
  type EditableFieldKey,
  type UpdateCellInput,
  type VisualInspectionStatus,
} from '@/models/cell';
import { NUMERIC_FIELDS, TEXT_FIELDS } from '@/utils/validators';

import { ValidationError } from '../errors';
import type { ApiCell } from './types';

/** A missing or unknown status (for example from an older backend) reads as the default, never as free text. */
function toVisualStatus(value: unknown): VisualInspectionStatus {
  return VISUAL_INSPECTION_STATUSES.find((status) => status === value) ?? DEFAULT_VISUAL_STATUS;
}

/** Backend cell -> app model. QC / sync status are display-only defaults (not stored). */
export function toCellRecord(dto: ApiCell): CellRecord {
  return {
    id: dto.id,
    serialNumber: dto.serialNumber,
    batteryBarcode: dto.batteryBarcode,
    // Empty means "manually typed": there is no decoded payload.
    rawPayload: dto.rawPayload === '' ? null : dto.rawPayload,
    // Only a production-VERIFIED record counts as production data. Pilot (UNVERIFIED) maps to 'development'.
    validationMode: dto.validationMode === 'production' && dto.validationStatus === 'VERIFIED' ? 'production' : 'development',
    cellLocalNumber: dto.cellLocalNumber,
    cellWeightG: dto.cellWeightG,
    cellVoltageV: dto.cellVoltageV,
    acirMohm: dto.acirMohm,
    dischargeCapacity05CAh: dto.dischargeCapacity05CAh,
    dcir20Mohm: dto.dcir20Mohm,
    dcir50Mohm: dto.dcir50Mohm,
    dcir90Mohm: dto.dcir90Mohm,
    visualInspectionStatus: toVisualStatus(dto.visualInspectionStatus),
    remarks: dto.remarks ?? null,
    stationId: dto.stationId,
    lineId: dto.lineId,
    scannedAt: dto.scannedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    syncStatus: 'synced',
    qcStatus: 'pending',
    version: dto.version,
  };
}

const EDITABLE_KEYS: readonly EditableFieldKey[] = [...TEXT_FIELDS, ...NUMERIC_FIELDS, 'visualInspectionStatus', 'remarks'];

/** Registering a cell sends only the scanned code (+ scan time and station/line). */
export function toCreatePayload(input: CreateCellInput): Record<string, unknown> {
  const unexpected = EDITABLE_KEYS.filter((key) => input[key] !== undefined && input[key] !== null);
  if (unexpected.length > 0) {
    throw new ValidationError('Only the scanned code can be provided when registering a cell.', Object.fromEntries(unexpected.map((k) => [k, 'Not accepted when registering.'])));
  }
  return {
    // Manual entry has no decoded payload: the typed text is sent and recorded without a raw payload.
    payload: input.rawPayload ?? input.batteryBarcode,
    source: input.rawPayload === null ? 'manual' : 'scan',
    ...(input.scannedAt ? { scannedAt: input.scannedAt } : {}),
    ...(input.stationId ? { stationId: input.stationId } : {}),
    ...(input.lineId ? { lineId: input.lineId } : {}),
  };
}

export function toUpdatePayload(id: string, input: UpdateCellInput): Record<string, unknown> {
  if (typeof input.expectedVersion !== 'number') {
    throw new ValidationError('The cell version is missing. Reload the cell and try again.');
  }
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ValidationError('Please correct the highlighted fields.', { [key]: 'Must be a number.' });
    }
    patch[key] = value;
  }
  return {
    id,
    expectedVersion: input.expectedVersion,
    patch,
    ...(input.batteryBarcode !== undefined
      ? {
          newBarcode: {
            payload: input.rawPayload ?? input.batteryBarcode,
            source: input.rawPayload === null || input.rawPayload === undefined ? 'manual' : 'scan',
          },
        }
      : {}),
  };
}
