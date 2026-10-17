'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Review = { id: string; rating: number; title: string | null; body: string; product: { name: string }; user: { firstName: string; lastName: string } };

export function AdminReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Review[]>('/admin/reviews?status=pending', { auth: true }).then(r => setReviews(r.data)).catch(e => setError(e instanceof Error ? e.message : 'Could not load reviews')), []);
  useEffect(() => { void load(); }, [load]);
  async function moderate(id: string, publish: boolean) {
    setError(null);
    try { await api(`/admin/reviews/${id}/moderate`, { method: 'PATCH', auth: true, body: { publish } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update review'); }
  }
  return (
    <section className="mt-10" aria-labelledby="rev-h">
      <h2 id="rev-h" className="font-display text-2xl">Reviews awaiting approval</h2>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {reviews?.length === 0 && <p className="card mt-4 p-6 text-center text-sm text-white/60">Nothing to review.</p>}
      <ul className="mt-4 space-y-3">{(reviews ?? []).map(r => (
        <li key={r.id} className="card p-5">
          <p className="text-xs text-white/60">{r.product.name} · {r.user.firstName} {r.user.lastName}</p>
          <p className="mt-1 text-gold-400">{'★'.repeat(r.rating)}<span className="text-white/20">{'★'.repeat(5 - r.rating)}</span> <span className="text-white">{r.title}</span></p>
          <p className="mt-1 text-sm text-white/60 [overflow-wrap:anywhere]">{r.body}</p>
          <div className="mt-3 flex gap-2"><button className="btn-gold !py-1.5 text-xs" onClick={() => moderate(r.id, true)}>Publish</button></div>
        </li>))}</ul>
    </section>
  );
}
