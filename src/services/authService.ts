import { ValidationError } from './errors';
import { authBackend } from './repository';
import { clearSession, readSession, writeSession, type Session } from './sessionStore';

/**
 * Auth service: the ONLY way screens read or change the signed-in session.
 * Credentials are validated by the auth backend (mock in development, Google Apps Script when live).
 * The session token is kept in the device's secure storage (see sessionStore).
 */

export type { Session };
export { onSessionExpired } from './sessionStore';

export async function login(username: string, password: string): Promise<Session> {
  const user = username.trim();
  if (user === '' || password === '') {
    throw new ValidationError('Enter your username and password.', {
      ...(user === '' ? { username: 'Username is required.' } : {}),
      ...(password === '' ? { password: 'Password is required.' } : {}),
    });
  }
  const result = await authBackend.login(user, password);
  const session: Session = { token: result.token, username: result.username, expiresAt: result.expiresAt };
  await writeSession(session);
  return session;
}

export async function logout(): Promise<void> {
  await clearSession();
}

/** Returns the stored session, or null when there is none or it has expired. */
export async function getSession(): Promise<Session | null> {
  return readSession();
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}
