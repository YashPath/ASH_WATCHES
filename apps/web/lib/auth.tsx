'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onTokenChange, refreshAccessToken, setAccessToken, getAccessToken } from './api';

export type User = { id: string; email: string; firstName: string; lastName: string; role: 'CUSTOMER' | 'ADMIN' | 'SUPER_ADMIN'; emailVerified: boolean };
export type LoginResult = { status: 'ok' } | { status: 'mfa'; challengeToken: string } | { status: 'mfa-enrollment'; message: string };

type AuthState = {
  user: User | null; loading: boolean;
  login(email: string, password: string): Promise<LoginResult>;
  completeMfa(challengeToken: string, code: string): Promise<void>;
  logout(): Promise<void>;
};
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try { setUser((await api<User>('/auth/me', { auth: true })).data); } catch { setUser(null); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getAccessToken()) await refreshAccessToken();
      if (getAccessToken()) await loadMe();
      if (alive) setLoading(false);
    })();
    const off = onTokenChange(token => { if (!token) setUser(null); });
    return () => { alive = false; off(); };
  }, [loadMe]);

  const value = useMemo<AuthState>(() => ({
    user, loading,
    async login(email, password) {
      const { data } = await api<{ accessToken?: string; mfaRequired?: boolean; challengeToken?: string; mfaEnrollmentRequired?: boolean; message?: string }>('/auth/login', { method: 'POST', body: { email, password } });
      if (data.mfaRequired && data.challengeToken) return { status: 'mfa', challengeToken: data.challengeToken };
      if (data.mfaEnrollmentRequired) return { status: 'mfa-enrollment', message: data.message ?? 'Check your email to set up two-factor authentication.' };
      if (!data.accessToken) throw new Error('Unexpected login response');
      setAccessToken(data.accessToken); await loadMe();
      return { status: 'ok' };
    },
    async completeMfa(challengeToken, code) {
      const { data } = await api<{ accessToken: string }>('/auth/mfa/challenge', { method: 'POST', body: { challengeToken, code } });
      setAccessToken(data.accessToken); await loadMe();
    },
    async logout() {
      try { await api('/auth/logout', { method: 'POST' }); } finally { setAccessToken(null); setUser(null); }
    }
  }), [user, loading, loadMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() { const ctx = useContext(Ctx); if (!ctx) throw new Error('useAuth outside AuthProvider'); return ctx; }
