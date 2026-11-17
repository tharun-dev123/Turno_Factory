/** Wire format of the Apps Script backend (see backend/apps-script). */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** A cell as returned by the backend. */
export interface ApiCell {
  id: string;
  serialNumber: number;
  batteryBarcode: string;
  rawPayload: string;
  /** 'pilot' | 'production' | '' (unknown) */
  validationMode: string;
  /** 'UNVERIFIED' | 'VERIFIED' */
  validationStatus: string;
  cellWeightG: number | null;
  cellVoltageV: number | null;
  acirMohm: number | null;
  cellLocalNumber: string | null;
  dischargeCapacity05CAh: number | null;
  dcir20Mohm: number | null;
  dcir50Mohm: number | null;
  dcir90Mohm: number | null;
  /** 'Good' | 'Damaged' | 'Under Review' | 'Rejected' */
  visualInspectionStatus: string;
  remarks: string | null;
  stationId: string | null;
  lineId: string | null;
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
