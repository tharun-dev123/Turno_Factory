import type { AuthBackend, AuthTokenResult } from '../contracts';
import type { ApiClient } from './httpClient';

/** AuthBackend backed by the Apps Script `auth.login` action. No credentials are stored in the app. */
export function createApiAuthBackend(client: ApiClient): AuthBackend {
  return {
    async login(username: string, password: string): Promise<AuthTokenResult> {
      return client.call<AuthTokenResult>('auth.login', { username, password }, { kind: 'login', auth: false });
    },
  };
}
