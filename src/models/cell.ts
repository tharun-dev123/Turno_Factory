/**
 * Common data model for a battery cell record.
 * Used by UI, services, the mock layer, and (later) the Google Apps Script API payloads.
 */

/** Which barcode validator accepted the record. Only `production` records are production-validated. */
export type ValidationMode = 'development' | 'production';

export type SyncStatus = 'synced' | 'pending' | 'error';

/** Display-only statuses (not editable; the factory has not defined this workflow yet). */
export type QcStatus = 'passed' | 'failed' | 'pending';

/** Visual inspection result. Every cell has exactly one. Only an Admin (the reviewer) can change it. */
export const VISUAL_INSPECTION_STATUSES = ['Good', 'Damaged', 'Under Review', 'Rejected'] as const;
export type VisualInspectionStatus = (typeof VISUAL_INSPECTION_STATUSES)[number];
/** New cells start here. */
export const DEFAULT_VISUAL_STATUS: VisualInspectionStatus = 'Under Review';
/** These statuses need an explanation in Remarks. */
export const REMARKS_REQUIRED_STATUSES: readonly VisualInspectionStatus[] = ['Damaged', 'Rejected'];
export const MAX_REMARKS_LENGTH = 500;

/** The cell manufacturers an admin can pick from (exact text, same list as the backend). */
export const MANUFACTURERS = ['GREAT POWER 100', 'EVE 230'] as const;
export type Manufacturer = (typeof MANUFACTURERS)[number];

/** Fields the operator may edit on an existing cell (Edit Cell screen). */
export interface EditableCellFields {
  /** Tray position, e.g. `L4-CELL-088` */
  cellLocalNumber: string | null;
  /** Grams */
  cellWeightG: number | null;
  /** Volts (open circuit) */
  cellVoltageV: number | null;
  /** Milliohms, 1 kHz */
  acirMohm: number | null;
  /** Ah, 0.5C discharge */
  dischargeCapacity05CAh: number | null;
  /** Milliohms @ 20% SOC */
  dcir20Mohm: number | null;
  /** Milliohms @ 50% SOC */
  dcir50Mohm: number | null;
  /** Milliohms @ 90% SOC */
  dcir90Mohm: number | null;
  /** Visual inspection result (never null: new cells are `Under Review`) */
  visualInspectionStatus: VisualInspectionStatus;
  /** Who made the cell. Empty until an admin chooses one */
  manufacturer: Manufacturer | null;
  /** Reviewer's note. Required when the status is Damaged or Rejected */
  remarks: string | null;
}

export interface CellRecord extends EditableCellFields {
  /** Internal stable id (not shown to operators) */
  id: string;
  /** System sequence number, read-only, never reused */
  serialNumber: number;
  /** 电池条码 / Battery barcode. Unique; primary duplicate key */
  batteryBarcode: string;
  /** Original decoded scan payload, preserved unchanged. Null for manually entered barcodes */
  rawPayload: string | null;
  /** Which validator accepted this record */
  validationMode: ValidationMode;
  stationId: string | null;
  lineId: string | null;
  /** ISO timestamps */
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  qcStatus: QcStatus;
  /** Optimistic-locking version; incremented by the data source on every update */
  version: number;
}

export type EditableFieldKey = keyof EditableCellFields;

/** Input for creating a cell. Measurements are optional and default to null. */
export interface CreateCellInput extends Partial<EditableCellFields> {
  batteryBarcode: string;
  rawPayload: string | null;
  validationMode: ValidationMode;
  stationId: string | null;
  lineId: string | null;
  /** ISO timestamp of the scan; defaults to now */
  scannedAt?: string;
  /** Idempotency key: a retry with the same id must not create a second record */
  requestId?: string;
}

/** Input for updating a cell. Only provided keys are changed. Serial number cannot be changed. */
export interface UpdateCellInput extends Partial<EditableCellFields> {
  batteryBarcode?: string;
  rawPayload?: string | null;
  validationMode?: ValidationMode;
  /** The `version` the editor loaded. A mismatch is rejected as a conflict. */
  expectedVersion?: number;
  /** Idempotency key for safe retries */
  requestId?: string;
}

export interface CellStats {
  total: number;
  /** Cells registered since local midnight */
  addedToday: number;
  /** Cells registered in the last 24 hours */
  addedLast24h: number;
}

export type ScanSource = 'scan' | 'manual';
