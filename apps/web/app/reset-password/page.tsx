'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readHashToken } from '@/lib/hash-token';

export default function ResetPassword() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(readHashToken()), []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password } }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not reset password'); } finally { setBusy(false); }
  }
  if (token === undefined) return <div className="container-x py-24 text-center text-white/50">Loading…</div>;
  if (token === null && !done) return <div className="container-x py-24 text-center"><h1 className="font-display text-4xl">Link not valid</h1><p className="mt-4 text-white/60">This reset link is invalid or has expired.</p><Link href="/forgot-password" className="btn-gold mt-8">Request a new link</Link></div>;
  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-8">
        <h1 className="font-display text-3xl">Choose a new password</h1>
        {done ? <><p role="status" className="text-sm text-emerald-300">Password updated. Please sign in again.</p><Link href="/login" className="btn-gold w-full">Sign in</Link></> : (<>
          <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input" value={password} onChange={e => setPassword(e.target.value)} /><p className="mt-1.5 text-xs text-white/60">At least 12 characters.</p></div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button className="btn-gold w-full" disabled={busy || password.length < 12}>{busy ? 'Saving…' : 'Update password'}</button>
        </>)}
      </form>
    </div>
  );
}
