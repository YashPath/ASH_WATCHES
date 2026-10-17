'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ name: string; slug: string }>>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try { const { data } = await api<Array<{ name: string; slug: string }>>(`/search/suggest?q=${encodeURIComponent(q.trim())}`); if (mine === seq.current) setSuggestions(data); } catch { /* suggestions are optional */ }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <form role="search" className="relative hidden md:block" onSubmit={e => { e.preventDefault(); if (q.trim().length >= 2) { setOpen(false); router.push(`/shop?q=${encodeURIComponent(q.trim())}`); } }}>
      <input aria-label="Search watches" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Search watches…" className="input w-64 !rounded-full !py-2" maxLength={120} />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl">
          {suggestions.map(s => <li key={s.slug}><Link href={`/product/${s.slug}`} className="block px-4 py-2.5 text-sm hover:bg-ink-700" onClick={() => setOpen(false)}>{s.name}</Link></li>)}
        </ul>
      )}
    </form>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Link href="/" className="font-display text-2xl tracking-[0.3em] text-gold-300">ASH<span className="text-gold-500">_</span></Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-white/70 md:flex">
          <Link href="/shop" className="hover:text-gold-300">Shop</Link>
          <Link href="/shop?gender=MEN" className="hover:text-gold-300">Men</Link>
          <Link href="/shop?gender=WOMEN" className="hover:text-gold-300">Women</Link>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <SearchBox />
          {user?.role && user.role !== 'CUSTOMER' && <Link href="/admin" className="text-gold-400 hover:text-gold-300">Admin</Link>}
          {user ? (
            <>
              <Link href="/wishlist" className="text-white/60 hover:text-gold-300">Wishlist</Link>
              <Link href="/account" className="text-white/80 hover:text-gold-300">{user.firstName}</Link>
              <button className="text-white/50 hover:text-white" onClick={async () => { await logout(); router.push('/'); }}>Sign out</button>
            </>
          ) : <Link href="/login" className="text-white/80 hover:text-gold-300">Sign in</Link>}
          <Link href="/cart" aria-label={`Cart, ${count} items`} className="relative rounded-full border border-white/15 px-4 py-2 hover:border-gold-400">
            Cart{count > 0 && <span className="ml-2 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-semibold text-ink-950">{count}</span>}
          </Link>
        </div>
      </div>
    </header>
  );
}
