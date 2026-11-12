import Constants from 'expo-constants';

import { resolveApiBaseUrl, resolveDataMode, type DataMode } from './runtimeConfig';

/**
 * Centralized application configuration.
 * Screens and components must read station/line/version/labels from here and never hardcode them.
 *
 * Data source (read at build time):
 *   EXPO_PUBLIC_DATA_MODE = "mock" | "live"   (release builds must set it explicitly)
 *   EXPO_PUBLIC_API_URL   = Apps Script web app URL (required when live)
 * Both are public, non-secret values.
 */

export type { DataMode };

/** Which barcode validator the app uses: development (mock only), server (live, server decides), production (strict, client-side). */
export type ClientValidationMode = 'development' | 'server' | 'production';

const dataMode: DataMode = resolveDataMode(process.env.EXPO_PUBLIC_DATA_MODE, __DEV__);
const apiBaseUrl = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, dataMode);
const validationMode: ClientValidationMode = dataMode === 'mock' ? 'development' : 'server';

export const appConfig = {
  appName: 'Turno Battery Scanner',
  tagline: 'Smart Battery Cell Registration & Management',
  footerTagline: 'Industrial Asset Management',
  version: Constants.expoConfig?.version ?? '1.0.0',
  buildNumber: Constants.expoConfig?.android?.versionCode ?? 1,

  dataMode,
  /** Which barcode validator is active. Development validation is only allowed in mock mode. */
  validationMode: validationMode as ClientValidationMode,
  environmentLabel: dataMode === 'mock' ? 'DEV' : 'LIVE',

  /** Storage wording shown in status pills. */
  storage: {
    name: dataMode === 'mock' ? 'Local Mock Data' : 'Google Sheets',
    statusOnline: 'Ready',
    savedBadge: dataMode === 'mock' ? 'MOCK' : 'LIVE',
  },

  /** Backend API (live mode). The URL is public; secrets never live in the app. */
  api: {
    baseUrl: apiBaseUrl,
    readTimeoutMs: 20_000,
    writeTimeoutMs: 30_000,
    loginTimeoutMs: 20_000,
    /** Extra attempts after the first for transient failures */
    maxRetries: 2,
    retryBackoffMs: [800, 2000] as readonly number[],
    /** Stop retrying once this much total time has been spent */
    readBudgetMs: 45_000,
    writeBudgetMs: 95_000,
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
    formatHint: dataMode === 'mock' ? 'Dev mode: any QR payload accepted' : 'Server validation active',
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
