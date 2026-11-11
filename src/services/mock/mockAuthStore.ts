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

function randomToken(): string {
  const part = () => Math.random().toString(36).slice(2, 12);
  return `mock-${part()}${part()}${part()}`;
}

export const mockAuthBackend: AuthBackend = {
  async login(username, password) {
    await mockDelay();
    if (username.trim() !== MOCK_CREDENTIALS.username || password !== MOCK_CREDENTIALS.password) {
      throw new AuthError();
    }
    const expiresAt = new Date(Date.now() + appConfig.session.lifetimeHours * 3_600_000).toISOString();
    return { token: randomToken(), expiresAt, username: MOCK_CREDENTIALS.username };
  },
};
