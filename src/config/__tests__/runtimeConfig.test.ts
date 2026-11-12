import { resolveApiBaseUrl, resolveDataMode } from '../runtimeConfig';

describe('resolveDataMode', () => {
  it('accepts explicit live and mock values', () => {
    expect(resolveDataMode('live', false)).toBe('live');
    expect(resolveDataMode('mock', false)).toBe('mock');
    expect(resolveDataMode(' live ', true)).toBe('live');
  });

  it('defaults to mock only in development builds', () => {
    expect(resolveDataMode(undefined, true)).toBe('mock');
    expect(resolveDataMode('', true)).toBe('mock');
  });

  it('refuses to start a release build without an explicit mode (no silent mock fallback)', () => {
    expect(() => resolveDataMode(undefined, false)).toThrow(/EXPO_PUBLIC_DATA_MODE is not set/);
    expect(() => resolveDataMode('', false)).toThrow(/not set/);
  });

  it('rejects unknown values in every build', () => {
    expect(() => resolveDataMode('production', true)).toThrow(/must be "live" or "mock"/);
    expect(() => resolveDataMode('LIVE', false)).toThrow();
  });
});

describe('resolveApiBaseUrl', () => {
  const good = 'https://script.google.com/macros/s/AKfycbx_abc-123/exec';

  it('is empty in mock mode', () => {
    expect(resolveApiBaseUrl(undefined, 'mock')).toBe('');
    expect(resolveApiBaseUrl(good, 'mock')).toBe('');
  });

  it('accepts consumer and Workspace Apps Script /exec URLs in live mode', () => {
    expect(resolveApiBaseUrl(good, 'live')).toBe(good);
    expect(resolveApiBaseUrl('https://script.google.com/a/macros/example.com/s/AKfy-1_2/exec', 'live')).toContain('/a/macros/');
  });

  it('refuses a missing or malformed URL in live mode', () => {
    expect(() => resolveApiBaseUrl(undefined, 'live')).toThrow(/not set/);
    expect(() => resolveApiBaseUrl('', 'live')).toThrow(/not set/);
    for (const bad of [
      'http://script.google.com/macros/s/ID/exec',
      'https://evil.example.com/macros/s/ID/exec',
      'https://script.google.com/macros/s/ID/dev',
      'https://script.google.com/macros/s/ID/exec?x=1',
      'REPLACE_WITH_WEB_APP_URL',
    ]) {
      expect(() => resolveApiBaseUrl(bad, 'live')).toThrow(/Apps Script web app URL/);
    }
  });
});
