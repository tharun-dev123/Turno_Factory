import Constants from 'expo-constants';

import type { ValidationMode } from '@/models/cell';

/**
 * Centralized application configuration.
 * Screens and components must read station/line/version/labels from here and never hardcode them.
 */

/** `mock` = local dummy data (Phase 1). `live` = Google Apps Script backend (Phase 2). */
export type DataMode = 'mock' | 'live';

const dataMode: DataMode = 'mock';
const validationMode: ValidationMode = dataMode === 'mock' ? 'development' : 'production';

export const appConfig = {
  appName: 'Turno Battery Scanner',
  tagline: 'Smart Battery Cell Registration & Management',
  footerTagline: 'Industrial Asset Management',
  version: Constants.expoConfig?.version ?? '1.0.0',
  buildNumber: Constants.expoConfig?.android?.versionCode ?? 1,

  dataMode,
  /** Which barcode validator is active. Development validation is only allowed in mock mode. */
  validationMode,
  environmentLabel: dataMode === 'mock' ? 'DEV' : 'PROD',

  /** Storage wording shown in status pills. Replaced when the backend is connected. */
  storage: {
    name: dataMode === 'mock' ? 'Local Mock Data' : 'Google Sheets',
    statusOnline: dataMode === 'mock' ? 'Ready' : 'Connected',
    savedBadge: dataMode === 'mock' ? 'MOCK' : 'LIVE',
  },

  station: {
    id: 'A-12',
    name: 'Station A-12',
  },
  line: {
    id: '04',
    label: 'Line #04',
    description: 'Prismatic Cell Line',
  },

  session: {
    /** Mock session lifetime in hours */
    lifetimeHours: 12,
  },

  scanner: {
    /** Primary expected format (visually identified on the label; not yet confirmed by decoding) */
    barcodeTypes: ['qr'] as ('qr' | 'datamatrix')[],
    /** DataMatrix is optional and must be verified on target devices before enabling */
    enableDataMatrix: false,
    /** Ignore the same payload for this long to avoid repeated processing */
    cooldownMs: 2500,
    /** Alignment hint under the frame. Text is config-driven until the real format is confirmed. */
    alignHint: 'ALIGN QR CODE',
    /** Hint chip text; reflects the active validation mode honestly */
    formatHint:
      dataMode === 'mock' ? 'Dev mode: any QR payload accepted' : 'Production validation active',
  },

  list: {
    /** Page size shown on the All Cells screen before "load more" */
    previewCount: 50,
  },

  /**
   * Sorting grade options for the Edit Cell dropdown.
   * PLACEHOLDER list taken from the design; the real grade list is still to be confirmed.
   */
  sortingGrades: [
    'Grade A1 (Standard) - High Precision',
    'Grade A2 (Standard)',
    'Grade B1 (Reduced)',
    'Grade C (Reject)',
  ],
} as const;

/** Barcode types handed to the camera, honoring the optional DataMatrix flag. */
export function getScannerBarcodeTypes(): ('qr' | 'datamatrix')[] {
  const types = [...appConfig.scanner.barcodeTypes];
  if (appConfig.scanner.enableDataMatrix && !types.includes('datamatrix')) {
    types.push('datamatrix');
  }
  return types;
}
