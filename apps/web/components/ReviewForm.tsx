'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

export function ReviewForm({ productId, signedIn }: { productId: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <p className="mt-4 text-sm text-white/50"><Link href="/login" className="text-gold-400">Sign in</Link> to review a watch you have bought.</p>;
  if (!open) return <button className="btn-ghost mt-4" onClick={() => setOpen(true)}>Write a review</button>;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api('/reviews', { method: 'POST', auth: true, body: { productId, rating, title, body } }); setMsg({ ok: true, text: 'Thank you. Your review will appear once it has been checked.' }); setOpen(false); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not submit review' }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card mt-4 max-w-xl space-y-4 p-5">
      <fieldset><legend className="label">Rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? 'text-gold-400' : 'text-white/20'}`}>★</button>)}</div></fieldset>
      <div><label className="label" htmlFor="rv-title">Title</label><input id="rv-title" className="input" required minLength={2} maxLength={150} value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><label className="label" htmlFor="rv-body">Your review</label><textarea id="rv-body" className="input min-h-28" required minLength={10} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} /></div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      <div className="flex gap-2"><button className="btn-gold" disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
