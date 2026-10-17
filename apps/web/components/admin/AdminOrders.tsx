'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';

type Order = { id: string; orderNumber: string; status: string; totalAmount: number; createdAt: string; user: { email: string; firstName: string }; items: Array<{ id: string; quantity: number; productName: string }>; payments?: Array<{ provider: string; status: string }> };
const isCod = (o: Order) => !!o.payments?.some(p => p.provider === 'COD');
const NEXT: Record<string, { to: 'SHIPPED' | 'DELIVERED'; label: string }> = { PAID: { to: 'SHIPPED', label: 'Mark shipped' }, SHIPPED: { to: 'DELIVERED', label: 'Mark delivered' } };

const nextStep = (o: Order) => (o.status === 'PENDING' && isCod(o) ? NEXT.PAID : NEXT[o.status]);

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<Order[]>(`/admin/orders${filter ? `?status=${filter}` : ''}`, { auth: true }).then(r => setOrders(r.data)).catch(e => setError(e instanceof Error ? e.message : 'Could not load orders')), [filter]);
  useEffect(() => { void load(); }, [load]);
  async function advance(o: Order) {
    const step = nextStep(o); if (!step) return;
    setBusy(o.id); setError(null);
    try { await api(`/admin/orders/${o.id}/status`, { method: 'PATCH', auth: true, body: { status: step.to } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); } finally { setBusy(null); }
  }
  return (
    <section className="mt-10" aria-labelledby="ord-h">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="ord-h" className="font-display text-2xl">Orders</h2>
        <select aria-label="Filter by status" className="input !w-auto !py-2" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All</option>{['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].map(s => <option key={s} value={s}>{s[0]}{s.slice(1).toLowerCase()}</option>)}</select></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.15em] text-white/60"><tr><th className="p-4">Order</th><th className="p-4">Customer</th><th className="p-4">Items</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4" /></tr></thead>
          <tbody>{(orders ?? []).map(o => (
            <tr key={o.id} className="border-t border-white/10">
              <td className="p-4">{o.orderNumber}<span className="block text-xs text-white/60">{new Date(o.createdAt).toLocaleDateString('en-IN')}</span></td>
              <td className="p-4 text-white/60">{o.user.firstName}<span className="block text-xs">{o.user.email}</span></td>
              <td className="p-4 text-white/60">{o.items.map(i => `${i.quantity}× ${i.productName}`).join(', ')}</td>
              <td className="p-4">{formatPrice(o.totalAmount)}</td><td className="p-4">{o.status}{isCod(o) && <span className="block text-xs text-white/60">COD</span>}</td>
              <td className="p-4 text-right">{nextStep(o) && <button className="btn-ghost !py-1.5 text-xs" disabled={busy === o.id} onClick={() => advance(o)}>{nextStep(o)!.label}</button>}</td>
            </tr>))}
            {orders?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-white/60">No orders.</td></tr>}</tbody></table>
      </div>
    </section>
  );
}
