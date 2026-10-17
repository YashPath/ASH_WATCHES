'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

/** Only same-site relative paths are accepted as a post-login destination (prevents open redirects). */
function safeNext(value: string | null): string { return value && /^\/(?![/\\])[\w\-./?=&%]*$/.test(value) ? value : '/'; }

export function LoginForm() {
  const { login, completeMfa } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (challenge) { await completeMfa(challenge, code); router.push(next); return; }
      const result = await login(email, password);
      if (result.status === 'ok') router.push(next);
      else if (result.status === 'mfa') setChallenge(result.challengeToken);
      else setInfo(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); } finally { setBusy(false); }
  }

  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-8">
        <h1 className="font-display text-3xl">{challenge ? 'Two-factor code' : 'Welcome back'}</h1>
        {info ? <p role="status" className="text-sm text-gold-300">{info}</p> : challenge ? (
          <div><label className="label" htmlFor="code">6-digit code from your authenticator</label><input id="code" className="input tracking-[0.4em]" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        ) : (<>
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" required autoComplete="email" maxLength={320} value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" required autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></div>
        </>)}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {!info && <button className="btn-gold w-full" disabled={busy}>{busy ? 'Please wait…' : challenge ? 'Verify' : 'Sign in'}</button>}
        {!challenge && <p className="text-center text-sm text-white/50"><Link href="/forgot-password" className="text-gold-400 hover:text-gold-300">Forgot your password?</Link></p>}
        {!challenge && <p className="text-center text-sm text-white/50">New here? <Link href="/register" className="text-gold-400 hover:text-gold-300">Create an account</Link></p>}
      </form>
    </div>
  );
}
