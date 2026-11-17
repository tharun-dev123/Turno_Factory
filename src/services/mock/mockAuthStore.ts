import { appConfig } from '@/config/appConfig';

import type { AuthBackend } from '../contracts';
import { AuthError } from '../errors';
import { mockDelay } from './mockConfig';

/**
 * TEMPORARY mock authentication. Deleted in Phase 2 (the Apps Script backend will validate the
 * shared factory credentials instead). These placeholder credentials exist ONLY for UI development.
 */
const MOCK_CREDENTIALS = {
  username: 'Admin',
  password: 'admin@123',
} as const;

/** Read-only account, so the Viewer UI can be tried in development. */
const MOCK_VIEWER_CREDENTIALS = {
  username: 'Viewer',
  password: 'viewer@123',
} as const;

function randomToken(): string {
  const part = () => Math.random().toString(36).slice(2, 12);
  return `mock-${part()}${part()}${part()}`;
}

export const mockAuthBackend: AuthBackend = {
  async login(username, password) {
    await mockDelay();
    const isAdmin = username.trim() === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password;
    const isViewer = username.trim() === MOCK_VIEWER_CREDENTIALS.username && password === MOCK_VIEWER_CREDENTIALS.password;
    if (!isAdmin && !isViewer) throw new AuthError();
    const expiresAt = new Date(Date.now() + appConfig.session.lifetimeHours * 3_600_000).toISOString();
    return isAdmin
      ? { token: randomToken(), expiresAt, username: MOCK_CREDENTIALS.username, role: 'admin' }
      : { token: randomToken(), expiresAt, username: MOCK_VIEWER_CREDENTIALS.username, role: 'viewer' };
  },
};
