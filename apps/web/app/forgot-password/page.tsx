'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/password-reset/request', { method: 'POST', body: { email } }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  }
  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-8">
        <h1 className="font-display text-3xl">Reset your password</h1>
        {done ? <p role="status" className="text-sm text-gold-300">If an account exists for that address, a reset link is on its way. It is valid for one hour.</p> : (<>
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required maxLength={320} autoComplete="email" className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button className="btn-gold w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </>)}
        <p className="text-center text-sm text-white/50"><Link href="/login" className="text-gold-400">Back to sign in</Link></p>
      </form>
    </div>
  );
}
