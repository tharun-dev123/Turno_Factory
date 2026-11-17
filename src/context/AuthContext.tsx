import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as authService from '@/services/authService';
import type { Session } from '@/services/authService';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** Role of the signed-in user. `viewer` when signed out (fail closed). */
  role: 'admin' | 'viewer';
  /** True only for Admin. Controls the visibility of add, edit and delete UI. */
  canWrite: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Holds the signed-in session. All reads/writes go through `authService`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    authService
      .getSession()
      .then((stored) => {
        if (cancelled) return;
        setSession(stored);
        setStatus(stored ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The backend rejected our token (expired / invalidated): go back to the signed-out state.
  useEffect(
    () =>
      authService.onSessionExpired(() => {
        setSession(null);
        setStatus('unauthenticated');
      }),
    [],
  );

  const signIn = useCallback(async (username: string, password: string) => {
    const next = await authService.login(username, password);
    setSession(next);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await authService.logout();
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const role: 'admin' | 'viewer' = session?.role === 'admin' ? 'admin' : 'viewer';
  const value = useMemo(
    () => ({ status, session, role, canWrite: role === 'admin', signIn, signOut }),
    [status, session, role, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
