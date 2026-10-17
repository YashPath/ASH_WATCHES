'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
const WatchCanvas = dynamic(() => import('@/components/WatchCanvas').then(m => m.WatchCanvas), { ssr: false, loading: () => <div className="h-full min-h-[320px] w-full animate-pulse rounded-2xl bg-ink-800" aria-hidden /> });
import { ProductCard } from '@/components/ProductCard';
import { api, type ProductCardData } from '@/lib/api';

const PALETTE = [
  { name: 'Midnight', dial: '#14264a', caseColor: '#c9ccd1', strap: '#16181c' },
  { name: 'Champagne', dial: '#d8c394', caseColor: '#c9a54f', strap: '#4a2f1d' },
  { name: 'Forest', dial: '#1f4d3a', caseColor: '#b7bcc4', strap: '#2a2f38' }
];

export default function Home() {
  const [featured, setFeatured] = useState<ProductCardData[] | null>(null);
  const [style, setStyle] = useState(0);
  useEffect(() => { api<ProductCardData[]>('/products?limit=8&sort=newest').then(r => setFeatured(r.data)).catch(() => setFeatured([])); }, []);
  const p = PALETTE[style]!;
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_40%,#1b5a42_0%,#0a2a1e_45%,#05110c_80%)]" />
        <div className="container-x grid min-h-[70vh] items-center gap-6 py-10 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-400">Hand-picked, honestly priced</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.08] sm:text-6xl">A watch is the one thing you wear <em className="text-gold-300">every day</em>.</h1>
            <p className="mt-6 max-w-md text-lg text-white/70">We pick each piece ourselves, and we would happily wear it. Zoom into any watch to see what is inside, and tell us what you like in your own words. A real person is a message away if you want a second opinion.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/shop" className="btn-gold">See the collection</Link><Link href="/shop?gender=WOMEN" className="btn-ghost">Gifts for her</Link><Link href="/shop?gender=MEN" className="btn-ghost">Gifts for him</Link></div>
            <div className="mt-10 flex items-center gap-3" role="group" aria-label="Preview colourway">
              {PALETTE.map((c, i) => <button key={c.name} onClick={() => setStyle(i)} aria-pressed={style === i} aria-label={c.name} className={`h-9 w-9 rounded-full border-2 ${style === i ? 'border-gold-300' : 'border-white/20'}`} style={{ background: c.dial }} />)}
              <span className="text-sm text-white/50">Try a colour: {p.name}</span>
            </div>
          </div>
          <div className="relative"><div className="pointer-events-none absolute inset-0 m-auto h-[70%] w-[70%] rounded-full bg-[radial-gradient(circle,#2f8a66_0%,transparent_65%)] opacity-40 blur-2xl" aria-hidden /><WatchCanvas className="relative h-[460px] w-full lg:h-[600px]" dial={p.dial} caseColor={p.caseColor} strap={p.strap} tilt={0.18} /></div>
        </div>
      </section>
      <section className="container-x -mt-2 grid gap-5 py-10 md:grid-cols-3">
        {[['Look inside', 'Open any watch page and zoom in. The crystal, bezel, dial, movement and case lift apart so you can see how it is made.'], ['Ask in plain words', '“Something dressy for my dad, under ₹30,000.” Type it the way you would say it to a friend.'], ['Pay safely', 'Card details go straight to Stripe. We never see them, and unpaid orders are released automatically.']].map(([t, d]) => (
          <div key={t} className="card p-6"><h2 className="font-display text-xl text-gold-300">{t}</h2><p className="mt-2 text-sm leading-relaxed text-white/60">{d}</p></div>))}
      </section>
      <section className="container-x mt-10">
        <div className="mb-8 flex items-end justify-between"><h2 className="font-display text-3xl">New arrivals</h2><Link href="/shop" className="text-sm text-gold-400 hover:text-gold-300">View all →</Link></div>
        {featured === null ? <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="card aspect-[3/4] animate-pulse" />)}</div>
          : featured.length === 0 ? <p className="card p-10 text-center text-white/50">The collection is being prepared. Please check back soon.</p>
          : <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">{featured.map(f => <ProductCard key={f.id} product={f} />)}</div>}
      </section>
      <section className="container-x mb-4 mt-20 grid items-center gap-10 lg:grid-cols-2">
        <div><p className="text-xs uppercase tracking-[0.3em] text-gold-400">A note from the founder</p>
          <h2 className="mt-3 font-display text-3xl">Why we started ASH_</h2>
          <p className="mt-4 leading-relaxed text-white/70">I wanted a good watch in college and could not tell which ones were worth the money. Every shop either buried me in specs or pushed the most expensive piece. So we built the store I wished existed: clear photos, a look at what is inside, and straight answers.</p>
          <p className="mt-4 font-display text-xl italic text-gold-300">— Yash, founder</p></div>
        <ul className="grid gap-4" aria-label="Sample customer quotes">{[['“Picked it for my brother’s graduation. He has not taken it off.”', 'Priya, Dehradun'], ['“The zoom-in view convinced me it was not a cheap build. It arrived exactly like that.”', 'Rohit, Pune'], ['“I asked for something slim under ₹25,000 and got three good options in seconds.”', 'Ananya, Delhi']].map(([q, who]) => (
          <li key={who} className="card p-5"><p className="text-white/80">{q}</p><p className="mt-2 text-xs uppercase tracking-[0.15em] text-white/60">{who}</p></li>))}</ul>
        <p className="text-xs text-white/50 lg:col-span-2 -mt-4">Sample quotes for this demo store.</p>
      </section>
    </>
  );
}
