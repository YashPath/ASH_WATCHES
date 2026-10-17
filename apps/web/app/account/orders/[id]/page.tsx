'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Order = {
  id: string; orderNumber: string; status: string; currency: string; subtotal: number; discountAmount: number; shippingAmount: number; taxAmount: number; totalAmount: number;
  createdAt: string; paidAt: string | null; shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  payments?: Array<{ provider: string; status: string }>;
  items: Array<{ id: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (user) api<Order>(`/orders/${encodeURIComponent(id)}`, { auth: true }).then(r => setOrder(r.data)).catch(() => setError('Order not found.')); }, [user, id]);

  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user) return <div className="container-x py-24 text-center"><Link href={`/login?next=/account/orders/${id}`} className="btn-gold">Sign in</Link></div>;
  if (error) return <div className="container-x py-24 text-center"><p className="text-white/60">{error}</p><Link href="/account" className="btn-ghost mt-6">Back to account</Link></div>;
  if (!order) return <div className="container-x py-16"><div className="card h-64 animate-pulse" /></div>;

  const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const steps: Array<[string, string | null]> = [['Placed', order.createdAt], ['Paid', order.paidAt], ['Shipped', order.shippedAt], ['Delivered', order.deliveredAt]];
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  return (
    <div className="container-x max-w-3xl py-10 print:text-black">
      <div className="flex items-center justify-between print:hidden"><Link href="/account" className="text-sm text-white/50 hover:text-gold-300">← All orders</Link><button className="btn-ghost !py-2" onClick={() => window.print()}>Print invoice</button></div>
      <h1 className="mt-4 font-display text-4xl">Order {order.orderNumber}</h1>
      <p className="mt-1 text-sm text-white/60">Placed {fmt(order.createdAt)} · {order.status[0]}{order.status.slice(1).toLowerCase()}{order.payments?.some(p => p.provider === 'COD') && ` · Cash on delivery (${order.payments.some(p => p.status === 'SUCCEEDED') ? 'paid' : 'pay on delivery'})`}</p>

      {cancelled ? <p className="card mt-6 p-4 text-sm text-white/60">This order was {order.status.toLowerCase()}{order.cancelledAt ? ` on ${fmt(order.cancelledAt)}` : ''}.{order.cancellationReason ? ` Reason: ${order.cancellationReason}` : ''}</p> : (
        <ol className="mt-6 grid grid-cols-4 gap-2 print:hidden" aria-label="Order progress">{steps.map(([label, at]) => (
          <li key={label} className={`rounded-xl border p-3 text-center text-sm ${at ? 'border-gold-400/50 text-gold-300' : 'border-white/10 text-white/50'}`}>{label}<span className="block text-xs">{at ? fmt(at) : '—'}</span></li>))}</ol>
      )}

      <div className="card mt-6 p-5">
        <ul className="divide-y divide-white/10">{order.items.map(i => (
          <li key={i.id} className="flex justify-between gap-4 py-3 text-sm"><span>{i.quantity} × {i.productName}<span className="block text-xs text-white/60">{i.variantName} · {i.sku}</span></span><span>{formatPrice(i.lineTotal)}</span></li>))}</ul>
        <dl className="mt-4 space-y-1 border-t border-white/10 pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-white/50">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
          {order.discountAmount > 0 && <div className="flex justify-between"><dt className="text-white/50">Discount</dt><dd>−{formatPrice(order.discountAmount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-white/50">Shipping</dt><dd>{order.shippingAmount ? formatPrice(order.shippingAmount) : 'Free'}</dd></div>
          <div className="flex justify-between"><dt className="text-white/50">Tax</dt><dd>{formatPrice(order.taxAmount)}</dd></div>
          <div className="flex justify-between border-t border-white/10 pt-2 text-base text-gold-300"><dt>Total</dt><dd>{formatPrice(order.totalAmount)}</dd></div>
        </dl>
      </div>
    </div>
  );
}
