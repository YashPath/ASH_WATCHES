'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Item = { productId: string; product: { name: string; slug: string; basePrice: number; brand: { name: string }; images: Array<{ url: string; altText: string }> } };

export default function WishlistPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { if (user) api<Item[]>('/wishlist', { auth: true }).then(r => setItems(r.data)).catch(() => setItems([])); }, [user]);
  async function remove(id: string) { setItems(cur => cur?.filter(i => i.productId !== id) ?? null); await api(`/wishlist/${id}`, { method: 'DELETE', auth: true }).catch(() => undefined); }
  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!user) return <div className="container-x py-24 text-center"><Link href="/login?next=/wishlist" className="btn-gold">Sign in</Link></div>;
  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">Wishlist</h1>
      {items === null ? <div className="card mt-6 h-32 animate-pulse" /> : items.length === 0 ? <p className="card mt-6 p-8 text-center text-white/50">Nothing saved yet. <Link href="/shop" className="text-gold-400">Browse watches</Link></p> : (
        <ul className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">{items.map(i => (
          <li key={i.productId} className="card overflow-hidden">
            <Link href={`/product/${i.product.slug}`} className="block">
              {i.product.images[0] /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={i.product.images[0].url} alt={i.product.images[0].altText} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-ink-800" />}
              <div className="p-4"><p className="text-xs uppercase tracking-[0.2em] text-white/60">{i.product.brand.name}</p><p className="mt-1 font-medium">{i.product.name}</p><p className="mt-1 text-gold-300">{formatPrice(i.product.basePrice)}</p></div>
            </Link>
            <div className="px-4 pb-4"><button className="text-xs text-white/50 hover:text-red-300" onClick={() => remove(i.productId)}>Remove</button></div>
          </li>))}</ul>
      )}
    </div>
  );
}
