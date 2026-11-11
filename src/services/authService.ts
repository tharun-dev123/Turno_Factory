import * as SecureStore from 'expo-secure-store';

import { ValidationError } from './errors';
import { authBackend } from './repository';

/**
 * Auth service: the ONLY way screens read or change the signed-in session.
 * Credentials are validated by the auth backend (mock now, Google Apps Script later).
 * The session token is kept in the device's secure storage.
 */

export interface Session {
  token: string;
  username: string;
  /** ISO timestamp */
  expiresAt: string;
}

const SESSION_KEY = 'turno.session.v1';

// Fallback for platforms without SecureStore support (for example web previews).
let memorySession: string | null = null;

async function readStoredSession(): Promise<string | null> {
  try {
    if (await SecureStore.isAvailableAsync()) return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    // fall through to memory
  }
  return memorySession;
}

async function writeStoredSession(value: string): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SESSION_KEY, value);
      return;
    }
  } catch {
    // fall through to memory
  }
  memorySession = value;
}

async function clearStoredSession(): Promise<void> {
  memorySession = null;
  try {
    if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.token === 'string' && typeof v.username === 'string' && typeof v.expiresAt === 'string';
}

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
  await writeStoredSession(JSON.stringify(session));
  return session;
}

export async function logout(): Promise<void> {
  await clearStoredSession();
}

/** Returns the stored session, or null when there is none or it has expired. */
export async function getSession(): Promise<Session | null> {
  const raw = await readStoredSession();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed) || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await clearStoredSession();
      return null;
    }
    return parsed;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

