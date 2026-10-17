'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Order = { id: string; orderNumber: string; status: string; totalAmount: number; createdAt: string; payments?: Array<{ provider: string }>; items: Array<{ id: string; productName: string; variantName: string; quantity: number; unitPrice: number }> };
const STATUS_STYLE: Record<string, string> = { PENDING: 'text-amber-300', PAID: 'text-emerald-300', CONFIRMED: 'text-emerald-300', SHIPPED: 'text-sky-300', DELIVERED: 'text-emerald-300', CANCELLED: 'text-white/60', REFUNDED: 'text-white/60' };

export default function AccountPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => api<Order[]>('/orders', { auth: true }).then(r => setOrders(r.data)).catch(e => { setError(e instanceof Error ? e.message : 'Could not load orders'); setOrders([]); }), []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user) return <div className="container-x py-24 text-center"><Link href="/login?next=/account" className="btn-gold">Sign in</Link></div>;

  async function act(id: string, kind: 'pay' | 'cancel') {
    setBusyId(id); setError(null);
    try {
      if (kind === 'cancel') { await api(`/orders/${id}/cancel`, { method: 'POST', auth: true, body: {} }); await load(); }
      else {
        const { data } = await api<{ checkoutUrl: string }>('/payments/checkout-session', { method: 'POST', auth: true, body: { orderId: id } });
        const url = new URL(data.checkoutUrl);
        if (url.protocol !== 'https:' || !url.hostname.endsWith('stripe.com')) throw new Error('Unexpected payment URL');
        window.location.assign(url.toString());
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusyId(null); }
  }

  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">Hello, {user.firstName}</h1>
      <p className="mt-1 text-sm text-white/60">{user.email}{!user.emailVerified && ' · email not verified'}</p>
      <h2 className="mt-10 font-display text-2xl">Your orders</h2>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {orders === null ? <div className="card mt-4 h-32 animate-pulse" /> : orders.length === 0 ? <p className="card mt-4 p-8 text-center text-white/50">No orders yet.</p> : (
        <ul className="mt-4 space-y-4">{orders.map(o => (
          <li key={o.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/account/orders/${o.id}`} className="font-medium hover:text-gold-300">{o.orderNumber}</Link><p className={`text-sm ${STATUS_STYLE[o.status] ?? ''}`}>{o.status[0]}{o.status.slice(1).toLowerCase()}{o.status === 'PENDING' && o.payments?.some(p => p.provider === 'COD') && ' · cash on delivery'}</p></div>
            <p className="text-xs text-white/60">{new Date(o.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
            <ul className="mt-3 space-y-1 text-sm text-white/70">{o.items.map(i => <li key={i.id} className="flex justify-between"><span>{i.quantity} × {i.productName} <span className="text-white/50">({i.variantName})</span></span><span>{formatPrice(i.unitPrice * i.quantity)}</span></li>)}</ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><span className="text-gold-300">{formatPrice(o.totalAmount)}</span>
              {o.status === 'PENDING' && <span className="flex gap-2">{!o.payments?.some(p => p.provider === 'COD') && <button className="btn-gold !py-2" disabled={busyId === o.id} onClick={() => act(o.id, 'pay')}>Pay now</button>}<button className="btn-ghost !py-2" disabled={busyId === o.id} onClick={() => act(o.id, 'cancel')}>Cancel</button></span>}</div>
          </li>))}</ul>
      )}
    </div>
  );
}
