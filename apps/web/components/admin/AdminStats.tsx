'use client';
import { useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';

type Stats = { periodDays: number; revenueMinorUnits: number; paidOrderCount: number; topProducts: Array<{ productId: string; productName: string; _sum: { quantity: number | null; lineTotal: number | null } }>; ordersPerDay: Array<{ date: string; orders: number; revenue: number }> };

export function AdminStats() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api<Stats>('/admin/analytics', { auth: true }).then(r => setS(r.data)).catch(() => setErr(true)); }, []);
  if (err) return null;
  if (!s) return <div className="card mt-8 h-40 animate-pulse" aria-hidden />;
  const max = Math.max(1, ...s.ordersPerDay.map(d => d.revenue));
  const avg = s.paidOrderCount ? Math.round(s.revenueMinorUnits / s.paidOrderCount) : 0;
  return (
    <section className="mt-8" aria-labelledby="stats-h">
      <h2 id="stats-h" className="font-display text-2xl">Last {s.periodDays} days</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-5"><dt className="label">Revenue</dt><dd className="mt-1 font-display text-2xl text-gold-300">{formatPrice(s.revenueMinorUnits)}</dd></div>
        <div className="card p-5"><dt className="label">Orders</dt><dd className="mt-1 font-display text-2xl">{s.paidOrderCount}</dd></div>
        <div className="card p-5"><dt className="label">Average order</dt><dd className="mt-1 font-display text-2xl">{formatPrice(avg)}</dd></div>
        <div className="card p-5"><dt className="label">Best seller</dt><dd className="mt-1 truncate font-display text-2xl">{s.topProducts[0]?.productName ?? '–'}</dd></div>
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h3 className="label">Revenue per day</h3>
          {s.ordersPerDay.length === 0 ? <p className="mt-4 text-sm text-white/60">No orders in this period yet.</p> : (
            <div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label="Revenue per day bar chart">{s.ordersPerDay.map(d => <div key={d.date} title={`${d.date}: ${formatPrice(d.revenue)}`} className="w-full max-w-10 flex-1 rounded-t bg-gold-400/80" style={{ height: `${Math.max(4, (d.revenue / max) * 100)}%` }} />)}</div>)}</div>
        <div className="card p-5"><h3 className="label">Top products</h3>
          {s.topProducts.length === 0 ? <p className="mt-4 text-sm text-white/60">Nothing sold yet.</p> : <ol className="mt-3 space-y-2 text-sm">{s.topProducts.slice(0, 5).map(p => <li key={p.productId} className="flex justify-between gap-3"><span className="truncate">{p.productName}</span><span className="text-white/60">{p._sum.quantity ?? 0} sold</span></li>)}</ol>}</div>
      </div>
    </section>
  );
}
