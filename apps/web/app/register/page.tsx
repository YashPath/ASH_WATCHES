'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strong = form.password.length >= 12;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/register', { method: 'POST', body: form }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not register'); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  if (done) return <div className="container-x py-24 text-center"><h1 className="font-display text-4xl">Check your inbox</h1><p className="mx-auto mt-4 max-w-md text-white/60">If we can create the account, a verification link is on its way. You need to verify your email before placing orders.</p><Link href="/login" className="btn-gold mt-8">Go to sign in</Link></div>;
  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-8">
        <h1 className="font-display text-3xl">Create your account</h1>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label" htmlFor="fn">First name</label><input id="fn" className="input" required maxLength={100} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} /></div>
          <div><label className="label" htmlFor="ln">Last name</label><input id="ln" className="input" required maxLength={100} autoComplete="family-name" value={form.lastName} onChange={set('lastName')} /></div>
        </div>
        <div><label className="label" htmlFor="em">Email</label><input id="em" type="email" className="input" required maxLength={320} autoComplete="email" value={form.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" required minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} aria-describedby="pwhelp" />
          <p id="pwhelp" className={`mt-1.5 text-xs ${strong ? 'text-emerald-300' : 'text-white/60'}`}>At least 12 characters. A passphrase works well.</p></div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button className="btn-gold w-full" disabled={busy || !strong}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-white/50">Already registered? <Link href="/login" className="text-gold-400">Sign in</Link></p>
      </form>
    </div>
  );
}
