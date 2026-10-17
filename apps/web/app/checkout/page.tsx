'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';

type Address = { id: string; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; phone: string; isDefault: boolean };
const EMPTY = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', countryCode: 'IN' };

export default function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, refresh } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'online' | 'cod'>('online');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<Address[]>('/addresses', { auth: true });
    setAddresses(data); setAdding(data.length === 0);
    setSelected(s => s ?? data.find(a => a.isDefault)?.id ?? data[0]?.id ?? null);
  }, []);
  useEffect(() => { if (user) load().catch(() => setAddresses([])); }, [user, load]);

  if (authLoading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user) return <div className="container-x py-24 text-center"><Link href="/login?next=/checkout" className="btn-gold">Sign in to check out</Link></div>;
  if (!user.emailVerified) return <div className="container-x py-24 text-center"><p className="text-white/60">Please verify your email address before placing an order. Check your inbox for the verification link.</p></div>;
  if (!cart || cart.items.length === 0) return <div className="container-x py-24 text-center"><p className="text-white/60">Your cart is empty.</p><Link href="/shop" className="btn-gold mt-6">Browse watches</Link></div>;

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const body = { ...form, line2: form.line2 || undefined, isDefault: (addresses?.length ?? 0) === 0 };
      const { data } = await api<Address>('/addresses', { method: 'POST', auth: true, body });
      setForm(EMPTY); await load(); setSelected(data.id); setAdding(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save address'); } finally { setBusy(false); }
  }

  async function pay() {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const order = await api<{ id: string }>('/orders', { method: 'POST', auth: true, body: { shippingAddressId: selected } });
      await refresh();
      if (method === 'cod') {
        await api(`/orders/${order.data.id}/cod`, { method: 'POST', auth: true, body: {} });
        window.location.assign(`/account/orders/${order.data.id}`);
        return;
      }
      const session = await api<{ checkoutUrl: string }>('/payments/checkout-session', { method: 'POST', auth: true, body: { orderId: order.data.id } });
      const url = new URL(session.data.checkoutUrl);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('stripe.com')) throw new Error('Unexpected payment URL');
      window.location.assign(url.toString());
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start payment'); setBusy(false); }
  }

  const field = (key: keyof typeof EMPTY, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={key}>{label}</label><input id={key} className="input" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...props} /></div>
  );

  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="font-display text-2xl">Delivery address</h2>
          {addresses && addresses.length > 0 && (
            <ul className="mt-4 space-y-3">{addresses.map(a => (
              <li key={a.id}><label className={`card flex cursor-pointer gap-3 p-4 ${selected === a.id ? 'border-gold-400' : ''}`}>
                <input type="radio" name="address" checked={selected === a.id} onChange={() => setSelected(a.id)} className="mt-1 accent-[#c3a14d]" />
                <span className="text-sm"><span className="block font-medium">{a.fullName}</span><span className="text-white/60">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postalCode}</span><span className="block text-white/60">{a.phone}</span></span></label></li>))}</ul>
          )}
          {!adding && <button className="btn-ghost mt-4" onClick={() => setAdding(true)}>Add a new address</button>}
          {adding && (
            <form onSubmit={saveAddress} className="card mt-4 grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">{field('fullName', 'Full name', { required: true, maxLength: 150, autoComplete: 'name' })}</div>
              {field('phone', 'Phone', { required: true, minLength: 7, maxLength: 30, autoComplete: 'tel' })}
              {field('postalCode', 'PIN code', { required: true, minLength: 3, maxLength: 20, autoComplete: 'postal-code' })}
              <div className="sm:col-span-2">{field('line1', 'Address line 1', { required: true, maxLength: 200, autoComplete: 'address-line1' })}</div>
              <div className="sm:col-span-2">{field('line2', 'Address line 2 (optional)', { maxLength: 200, autoComplete: 'address-line2' })}</div>
              {field('city', 'City', { required: true, maxLength: 100, autoComplete: 'address-level2' })}
              {field('state', 'State', { required: true, maxLength: 100, autoComplete: 'address-level1' })}
              <div className="flex gap-3 sm:col-span-2"><button className="btn-gold" disabled={busy}>Save address</button>{addresses && addresses.length > 0 && <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>}</div>
            </form>
          )}
        </section>
        <aside className="card h-fit p-6">
          <h2 className="font-display text-2xl">Order</h2>
          <ul className="mt-4 space-y-2 text-sm">{cart.items.map(i => <li key={i.id} className="flex justify-between gap-3"><span className="text-white/70">{i.quantity} × {i.product.name}</span><span>{formatPrice(i.lineTotal)}</span></li>)}</ul>
          <p className="mt-4 flex justify-between border-t border-white/10 pt-4 text-lg"><span>Total</span><span className="text-gold-300">{formatPrice(cart.subtotal)}</span></p>
          <fieldset className="mt-5"><legend className="label">Payment method</legend>
            <label className={`card mt-2 flex cursor-pointer items-start gap-3 p-3 text-sm ${method === 'online' ? 'border-gold-400' : ''}`}><input type="radio" name="method" className="mt-1 accent-[#c3a14d]" checked={method === 'online'} onChange={() => setMethod('online')} /><span>Pay online<span className="block text-xs text-white/60">Card, UPI and more via Stripe</span></span></label>
            <label className={`card mt-2 flex cursor-pointer items-start gap-3 p-3 text-sm ${method === 'cod' ? 'border-gold-400' : ''}`}><input type="radio" name="method" className="mt-1 accent-[#c3a14d]" checked={method === 'cod'} onChange={() => setMethod('cod')} /><span>Cash on delivery<span className="block text-xs text-white/60">Pay when the watch arrives</span></span></label>
          </fieldset>
          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          <button className="btn-gold mt-6 w-full" disabled={busy || !selected} onClick={pay}>{busy ? 'Please wait…' : method === 'cod' ? 'Place order (pay on delivery)' : 'Pay securely with Stripe'}</button>
          <p className="mt-3 text-center text-xs text-white/50">{method === 'cod' ? 'No payment now. Keep the amount ready for the courier.' : 'You will be redirected to Stripe. We never see your card details.'}</p>
        </aside>
      </div>
    </div>
  );
}
