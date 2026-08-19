import { publicUserSchema, type PublicUser } from '@groupchat/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

import { api, setAuthToken } from '../api/client';

const STORAGE_KEY = 'groupchat.session';

const sessionSchema = z.object({
  token: z.string().min(1),
  user: publicUserSchema,
});

type Session = z.infer<typeof sessionSchema>;

interface AuthContextValue {
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Reads the persisted session, tolerating anything malformed in storage —
 * localStorage is user-writable and survives across deploys, so its contents
 * are validated like any other untrusted input.
 */
function readStoredSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readStoredSession();
    // Seed the API client before the first render triggers any request.
    setAuthToken(stored?.token ?? null);
    return stored;
  });

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    setAuthToken(next?.token ?? null);
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      persist(await api.login({ email, password }));
    },
    [persist],
  );

  const signUp = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) => {
      persist(await api.signUp(input));
    },
    [persist],
  );

  const logout = useCallback(() => persist(null), [persist]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, token: session?.token ?? null, login, signUp, logout }),
    [session, login, signUp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
