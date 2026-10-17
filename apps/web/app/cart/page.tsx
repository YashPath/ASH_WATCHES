'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';

export default function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, loading, setQuantity, remove } = useCart();
  const [error, setError] = useState<string | null>(null);
  if (authLoading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user) return <div className="container-x py-24 text-center"><p className="text-white/60">Sign in to see your cart.</p><Link href="/login?next=/cart" className="btn-gold mt-6">Sign in</Link></div>;
  const run = async (fn: () => Promise<void>) => { setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } };
  const items = cart?.items ?? [];
  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">Your cart</h1>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {items.length === 0 ? (
        <div className="card mt-8 p-12 text-center">{loading ? <p className="text-white/50">Loading…</p> : <><p className="text-white/60">Your cart is empty.</p><Link href="/shop" className="btn-gold mt-6">Browse watches</Link></>}</div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-4">{items.map(i => (
            <li key={i.id} className="card flex gap-4 p-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-800">{/* eslint-disable-next-line @next/next/no-img-element */}{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex-1"><p className="text-xs uppercase tracking-[0.15em] text-white/60">{i.product.brand}</p>
                <Link href={`/product/${i.product.slug}`} className="font-display text-xl hover:text-gold-300">{i.product.name}</Link><p className="text-sm text-white/60">{i.variant.name}</p>
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <label className="sr-only" htmlFor={`q-${i.id}`}>Quantity</label>
                  <select id={`q-${i.id}`} className="input !w-20 !py-1.5" value={i.quantity} onChange={e => run(() => setQuantity(i.id, Number(e.target.value)))}>{Array.from({ length: Math.min(10, Math.max(i.variant.stockQuantity, i.quantity)) }, (_, n) => <option key={n + 1}>{n + 1}</option>)}</select>
                  <button className="text-white/60 hover:text-red-300" onClick={() => run(() => remove(i.id))}>Remove</button></div></div>
              <p className="text-gold-300">{formatPrice(i.lineTotal)}</p>
            </li>))}</ul>
          <aside className="card h-fit p-6"><h2 className="font-display text-2xl">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-white/50">Subtotal</dt><dd>{formatPrice(cart!.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-white/50">Shipping</dt><dd>Free</dd></div></dl>
            <p className="mt-4 flex justify-between border-t border-white/10 pt-4 text-lg"><span>Total</span><span className="text-gold-300">{formatPrice(cart!.subtotal)}</span></p>
            <Link href="/checkout" className="btn-gold mt-6 w-full">Checkout</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
