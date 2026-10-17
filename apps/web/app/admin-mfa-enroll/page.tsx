'use client';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readHashToken } from '@/lib/hash-token';

export default function AdminMfaEnroll() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(readHashToken()), []);

  async function start() {
    setBusy(true); setError(null);
    try {
      const { data } = await api<{ secret: string; otpauthUrl: string }>('/auth/mfa/enroll/initial', { method: 'POST', body: { enrollmentToken: token } });
      setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 220 }) });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start setup'); } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/mfa/confirm-initial', { method: 'POST', body: { enrollmentToken: token, code } }); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Invalid code'); } finally { setBusy(false); }
  }

  if (token === undefined) return <div className="container-x py-24 text-center text-white/50">Loading…</div>;
  if (!token) return <div className="container-x py-24 text-center"><h1 className="font-display text-4xl">Link not valid</h1><p className="mt-4 text-white/60">This setup link is invalid or has expired. Sign in as an administrator to receive a new one.</p><Link href="/login" className="btn-gold mt-8">Sign in</Link></div>;
  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <div className="card w-full max-w-md space-y-5 p-8">
        <h1 className="font-display text-3xl">Set up two-factor authentication</h1>
        {done ? <><p role="status" className="text-sm text-emerald-300">Two-factor authentication is on. Sign in again and enter the code from your app.</p><Link href="/login" className="btn-gold w-full">Sign in</Link></> : !setup ? (<>
          <p className="text-sm text-white/60">Administrator accounts need an authenticator app (Google Authenticator, Authy, 1Password…). You will scan a QR code once.</p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button className="btn-gold w-full" onClick={start} disabled={busy}>{busy ? 'Preparing…' : 'Start setup'}</button>
        </>) : (
          <form onSubmit={confirm} className="space-y-5">
            <p className="text-sm text-white/60">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="Authenticator QR code" className="mx-auto h-[220px] w-[220px] rounded-xl bg-white p-2" />
            <p className="break-all text-center text-xs text-white/60">Can’t scan? Enter this key manually: <span className="font-mono text-white/70">{setup.secret}</span></p>
            <div><label className="label" htmlFor="code">6-digit code</label><input id="code" className="input tracking-[0.4em]" inputMode="numeric" maxLength={6} pattern="\d{6}" required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button className="btn-gold w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-factor'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
