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

/**
 * Removes whitespace (spaces, tabs, line breaks) at the start and end of a credential.
 * Pasting a password on a phone often brings an invisible line break or spaces with it. Whitespace INSIDE the
 * value is kept: it is a real part of the password. The backend never stores passwords with edge whitespace,
 * so trimming can never turn a correct password into a wrong one.
 */
export function normalizeCredential(value: string): string {
  return value.replace(/^\s+|\s+$/g, '');
}

export async function login(username: string, password: string): Promise<Session> {
  const user = normalizeCredential(username);
  const pass = normalizeCredential(password);
  if (user === '' || pass === '') {
    throw new ValidationError('Enter your username and password.', {
      ...(user === '' ? { username: 'Username is required.' } : {}),
      ...(pass === '' ? { password: 'Password is required.' } : {}),
    });
  }
  const result = await authBackend.login(user, pass);
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
