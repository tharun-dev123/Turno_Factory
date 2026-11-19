import type { CellRecord, Manufacturer, QcStatus, VisualInspectionStatus } from '@/models/cell';

/**
 * TEMPORARY dummy data for UI development. Deleted in Phase 2.
 *
 * ~20 realistic cells: complete records, records with missing measurements, and a mix of QC /
 * inspection statuses. The first 8 barcodes come from the factory's sample Excel; the rest follow the
 * same visual style but are invented. None of this confirms the real QR payload format.
 */

const STATION_ID = 'A-12';
const LINE_ID = '04';


interface Seed {
  barcode: string;
  /** Hours before "now" this cell was scanned */
  hoursAgo: number;
  local?: string | null;
  weight?: number | null;
  voltage?: number | null;
  acir?: number | null;
  capacity?: number | null;
  dcir20?: number | null;
  dcir50?: number | null;
  dcir90?: number | null;
  qc: QcStatus;
  visual?: VisualInspectionStatus;
  maker?: Manufacturer;
  remarks?: string;
  /** true -> entered manually (no raw payload) */
  manual?: boolean;
}

const SEEDS: Seed[] = [
  // --- Oldest (2 days ago): complete records based on the sample Excel ---
  { barcode: '02KCBE516100DHG702113060', hoursAgo: 52, local: 'L4-CELL-088', weight: 3120.4, voltage: 3.652, acir: 0.42, capacity: 50.2, dcir20: 0.68, dcir50: 0.65, dcir90: 0.63, visual: 'Good', maker: 'GREAT POWER 100', qc: 'passed' },
  { barcode: '02KCBE516100CHG702021596', hoursAgo: 51.5, local: 'L4-CELL-089', weight: 3118.9, voltage: 3.274, acir: 0.39, capacity: 50.1, dcir20: 0.69, dcir50: 0.66, dcir90: 0.64, visual: 'Good', maker: 'EVE 230', qc: 'passed' },
  { barcode: '02KCBE516100CHG702020802', hoursAgo: 51, local: 'L4-CELL-090', weight: 3121.2, voltage: 3.274, acir: 0.38, capacity: 50.3, dcir20: 0.67, dcir50: 0.64, dcir90: 0.62, visual: 'Good', maker: 'GREAT POWER 100', qc: 'passed' },
  { barcode: '02KCBE516100CHG702022741', hoursAgo: 50.5, local: 'L4-CELL-268', weight: 3122.6, voltage: 3.273, acir: 0.39, capacity: 49.8, dcir20: 0.7, dcir50: 0.67, dcir90: 0.65, visual: 'Good', maker: 'EVE 230', qc: 'passed' },
  { barcode: '02KCBE516100CHG702022758', hoursAgo: 50, local: 'L4-CELL-037', weight: 3119.7, voltage: 3.274, acir: 0.39, capacity: 50.0, dcir20: 0.68, dcir50: 0.65, dcir90: 0.63, maker: 'GREAT POWER 100', qc: 'passed' },
  { barcode: '02KCBE516100CHG702022765', hoursAgo: 49.5, local: 'L4-CELL-038', weight: 3115.3, voltage: 3.274, acir: 0.4, capacity: 48.9, dcir20: 0.74, dcir50: 0.71, dcir90: 0.69, maker: 'EVE 230', qc: 'passed' },
  { barcode: '02KCBE516100CHG702128993', hoursAgo: 49, local: 'L4-CELL-039', weight: 3123.1, voltage: 3.274, acir: 0.33, capacity: 50.4, dcir20: 0.66, dcir50: 0.63, dcir90: 0.61, maker: 'GREAT POWER 100', qc: 'passed' },
  { barcode: '02KCBE516100CHG702020800', hoursAgo: 48.5, local: 'L4-CELL-290', weight: 3120.0, voltage: 3.274, acir: 0.39, capacity: 49.9, dcir20: 0.69, dcir50: 0.66, dcir90: 0.64, maker: 'EVE 230', qc: 'passed' },

  // --- Yesterday: mix of complete and partially measured ---
  { barcode: '02KCBE516100CHG702023891', hoursAgo: 30, local: 'L4-CELL-091', weight: 3121.8, voltage: 3.271, acir: 0.41, capacity: 50.2, dcir20: 0.68, dcir50: 0.65, dcir90: 0.63, qc: 'passed' },
  { barcode: '02KCBE516100CHG702023904', hoursAgo: 29, local: 'L4-CELL-092', weight: 3101.4, voltage: 3.198, acir: 0.78, capacity: 46.1, dcir20: 1.05, dcir50: 0.99, dcir90: 0.95, visual: 'Damaged', remarks: 'Dent on the can near the negative terminal.', qc: 'failed' },
  { barcode: '02KCBE516100DHG702113077', hoursAgo: 28, local: 'L4-CELL-093', weight: 3120.9, voltage: 3.275, acir: 0.4, capacity: 50.1, dcir20: null, dcir50: null, dcir90: null, visual: 'Rejected', remarks: 'Electrolyte residue on the top cover.', qc: 'pending' },
  { barcode: '02KCBE516100DHG702113084', hoursAgo: 27, local: null, weight: 3119.2, voltage: 3.269, acir: 0.4, capacity: null, dcir20: null, dcir50: null, dcir90: null, qc: 'pending' },
  { barcode: '02KCBE516100CHG702023918', hoursAgo: 26, local: 'L4-CELL-094', weight: 3114.8, voltage: 3.266, acir: 0.46, capacity: 49.0, dcir20: 0.75, dcir50: 0.72, dcir90: 0.7, qc: 'passed' },
  { barcode: '02KCBE516100CHG702023925', hoursAgo: 25, local: 'L4-CELL-095', weight: null, voltage: null, acir: null, capacity: null, dcir20: null, dcir50: null, dcir90: null, qc: 'pending' },

  // --- Today: freshly scanned, mostly barcode only ---
  { barcode: '02KCBE516100CHG702023932', hoursAgo: 5, qc: 'pending' },
  { barcode: '02KCBE516100CHG702023949', hoursAgo: 4, qc: 'pending' },
  { barcode: '02KCBE516100DHG702113091', hoursAgo: 3, local: 'L4-CELL-096', weight: 3120.6, voltage: 3.272, acir: 0.4, capacity: 50.0, dcir20: 0.69, dcir50: 0.66, dcir90: 0.64, qc: 'passed' },
  { barcode: '02KCBE516100CHG702023956', hoursAgo: 2, qc: 'pending', manual: true },
  { barcode: '02KCBE516100CHG702023963', hoursAgo: 1, qc: 'pending' },
  { barcode: '02KCBE516100CHG702023970', hoursAgo: 0.25, qc: 'pending' },
];

/** Build the dummy records relative to `now` so "added today" statistics stay realistic. */
export function buildDummyCells(now: Date = new Date()): CellRecord[] {
  return SEEDS.map((seed, index): CellRecord => {
    const scannedAt = new Date(now.getTime() - seed.hoursAgo * 3_600_000).toISOString();
    const serialNumber = index + 1;
    return {
      id: `dummy-${String(serialNumber).padStart(3, '0')}`,
      serialNumber,
      batteryBarcode: seed.barcode,
      rawPayload: seed.manual ? null : seed.barcode,
      validationMode: 'development',
      cellLocalNumber: seed.local ?? null,
      cellWeightG: seed.weight ?? null,
      cellVoltageV: seed.voltage ?? null,
      acirMohm: seed.acir ?? null,
      dischargeCapacity05CAh: seed.capacity ?? null,
      dcir20Mohm: seed.dcir20 ?? null,
      dcir50Mohm: seed.dcir50 ?? null,
      dcir90Mohm: seed.dcir90 ?? null,
      stationId: STATION_ID,
      lineId: LINE_ID,
      scannedAt,
      createdAt: scannedAt,
      updatedAt: scannedAt,
      syncStatus: 'synced',
      qcStatus: seed.qc,
      visualInspectionStatus: seed.visual ?? 'Under Review',
      remarks: seed.remarks ?? null,
      manufacturer: seed.maker ?? null,
      version: 1,
    };
  });
}
