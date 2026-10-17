'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { readHashToken } from '@/lib/hash-token';

export function VerifyEmail() {
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = readHashToken();
    if (!token) { setState('bad'); return; }
    api('/auth/verify-email', { method: 'POST', body: { token } }).then(() => setState('ok')).catch(() => setState('bad'));
  }, []);
  return (
    <div className="container-x py-24 text-center">
      <h1 className="font-display text-4xl">{state === 'working' ? 'Verifying…' : state === 'ok' ? 'Email verified' : 'Link not valid'}</h1>
      <p className="mt-4 text-white/60">{state === 'ok' ? 'You can now sign in and place orders.' : state === 'bad' ? 'This link is invalid or has expired. Sign in and we will send a new one.' : 'One moment.'}</p>
      {state !== 'working' && <Link href="/login" className="btn-gold mt-8">Sign in</Link>}
    </div>
  );
}
