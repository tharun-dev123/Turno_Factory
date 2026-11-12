/**
 * Pure helpers that turn build-time environment variables into validated configuration.
 * Kept separate from `appConfig` so they can be unit tested without reading the real environment.
 *
 * Only NON-secret values may be configured through `EXPO_PUBLIC_*` variables: they are embedded in the
 * app bundle and visible to anyone who has the APK. Credentials and signing secrets belong in the Apps
 * Script Script Properties, never here.
 */

export type DataMode = 'mock' | 'live';

/**
 * `EXPO_PUBLIC_DATA_MODE` must be "live" or "mock".
 * When it is missing, development builds default to mock, but release builds (preview/production APKs)
 * refuse to start so they can never silently fall back to mock data.
 */
export function resolveDataMode(raw: string | undefined, isDev: boolean): DataMode {
  const value = (raw ?? '').trim();
  if (value === 'mock' || value === 'live') return value;
  if (value === '') {
    if (isDev) return 'mock';
    throw new Error(
      'EXPO_PUBLIC_DATA_MODE is not set. Release builds must set it to "live" (or "mock" for an explicit test build).',
    );
  }
  throw new Error(`EXPO_PUBLIC_DATA_MODE must be "live" or "mock" (received "${value}").`);
}

/** Apps Script web app URLs, for consumer accounts and for Google Workspace domains. */
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/;

/** Returns '' in mock mode. In live mode the URL must be a real Apps Script /exec URL. */
export function resolveApiBaseUrl(raw: string | undefined, mode: DataMode): string {
  if (mode === 'mock') return '';
  const value = (raw ?? '').trim();
  if (value === '') {
    throw new Error('EXPO_PUBLIC_API_URL is not set. Live builds need the deployed Apps Script web app URL.');
  }
  if (!APPS_SCRIPT_URL.test(value)) {
    throw new Error(
      'EXPO_PUBLIC_API_URL must be an Apps Script web app URL ending in /exec (https://script.google.com/macros/s/<id>/exec).',
    );
  }
  return value;
}
