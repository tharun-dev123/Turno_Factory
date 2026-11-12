import * as SecureStore from 'expo-secure-store';

/**
 * Persistent session (token) storage shared by `authService` and the API client.
 * The token lives in the device's secure storage; it is never written anywhere else.
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

async function readRaw(): Promise<string | null> {
  try {
    if (await SecureStore.isAvailableAsync()) return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    // fall through to memory
  }
  return memorySession;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.token === 'string' && typeof v.username === 'string' && typeof v.expiresAt === 'string';
}

export async function writeSession(session: Session): Promise<void> {
  const raw = JSON.stringify(session);
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(SESSION_KEY, raw);
      return;
    }
  } catch {
    // fall through to memory
  }
  memorySession = raw;
}

export async function clearSession(): Promise<void> {
  memorySession = null;
  try {
    if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

/** Returns the stored session, or null when there is none or it has expired. */
export async function readSession(): Promise<Session | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed) || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await clearSession();
      return null;
    }
    return parsed;
  } catch {
    await clearSession();
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  return (await readSession())?.token ?? null;
}

// ---- Session-expired notifications (the backend rejected the token) ----

type Listener = () => void;
const expiredListeners = new Set<Listener>();

/** Subscribe to "the session is no longer valid". Returns an unsubscribe function. */
export function onSessionExpired(listener: Listener): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

/** Clears the stored session and tells the UI to return to Login. */
export async function expireSession(): Promise<void> {
  await clearSession();
  expiredListeners.forEach((listener) => listener());
}
