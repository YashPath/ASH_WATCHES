'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type ProductCardData } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';

const MOVEMENTS = ['AUTOMATIC', 'QUARTZ', 'MANUAL', 'SOLAR', 'SMART'];
const BUDGETS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'Any budget' }, { label: 'Under ₹10,000', max: 1_000_000 }, { label: '₹10,000 – ₹50,000', min: 1_000_000, max: 5_000_000 }, { label: 'Over ₹50,000', min: 5_000_000 }
];

export function ShopClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<ProductCardData[] | null>(null);
  const [pages, setPages] = useState(1);
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  function set(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.push(`/shop?${next.toString()}`);
  }

  useEffect(() => {
    const ctl = new AbortController();
    setItems(null); setError(null);
    const query = new URLSearchParams();
    for (const key of ['gender', 'movement', 'minPrice', 'maxPrice', 'sort']) { const v = params.get(key); if (v) query.set(key, v); }
    query.set('page', String(page));
    const searching = q.trim().length >= 2;
    if (searching) query.set('q', q.trim());
    if (searching) { query.delete('sort'); if (query.get('gender') === 'UNISEX') query.delete('gender'); }
    api<ProductCardData[]>(`${searching ? '/search' : '/products'}?${query.toString()}`, { signal: ctl.signal })
      .then(r => { setItems(r.data); setPages(r.pagination?.pages ?? 1); setMode((r.meta?.mode as string | undefined) ?? null); })
      .catch(e => { if (e?.name !== 'AbortError') { setError(e instanceof Error ? e.message : 'Could not load products'); setItems([]); } });
    return () => ctl.abort();
  }, [params, q, page]);

  const budgetKey = `${params.get('minPrice') ?? ''}-${params.get('maxPrice') ?? ''}`;
  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">{q ? <>Results for “{q}”</> : 'The collection'}</h1>
      {q && mode === 'keyword-only' && <p className="mt-2 text-sm text-white/60">Showing keyword matches (smart search is temporarily unavailable).</p>}
      <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-6 text-sm" aria-label="Filters">
          <div><label className="label" htmlFor="gender">For</label>
            <select id="gender" className="input" value={params.get('gender') ?? ''} onChange={e => set('gender', e.target.value || undefined)}><option value="">Everyone</option><option value="MEN">Men</option><option value="WOMEN">Women</option>{!q && <option value="UNISEX">Unisex</option>}</select></div>
          <div><label className="label" htmlFor="movement">Movement</label>
            <select id="movement" className="input" value={params.get('movement') ?? ''} onChange={e => set('movement', e.target.value || undefined)}><option value="">All</option>{MOVEMENTS.map(m => <option key={m} value={m}>{m[0]}{m.slice(1).toLowerCase()}</option>)}</select></div>
          <div><label className="label" htmlFor="budget">Budget</label>
            <select id="budget" className="input" value={BUDGETS.findIndex(b => `${b.min ?? ''}-${b.max ?? ''}` === budgetKey)} onChange={e => { const b = BUDGETS[Number(e.target.value)]!; const next = new URLSearchParams(params.toString()); next.delete('page'); next.delete('minPrice'); next.delete('maxPrice'); if (b.min) next.set('minPrice', String(b.min)); if (b.max) next.set('maxPrice', String(b.max)); router.push(`/shop?${next.toString()}`); }}>
              {BUDGETS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}</select></div>
          {!q && <div><label className="label" htmlFor="sort">Sort</label>
            <select id="sort" className="input" value={params.get('sort') ?? 'newest'} onChange={e => set('sort', e.target.value)}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select></div>}
        </aside>
        <section aria-live="polite">
          {error && <p role="alert" className="card p-6 text-red-300">{error}</p>}
          {items === null && <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card aspect-[3/4] animate-pulse" />)}</div>}
          {items && items.length === 0 && !error && <p className="card p-10 text-center text-white/50">No watches match. Try loosening a filter.</p>}
          {items && items.length > 0 && <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">{items.map(p => <ProductCard key={p.id} product={p} />)}</div>}
          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
              <button className="btn-ghost !py-2" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button>
              <span className="text-white/50">Page {page} of {pages}</span>
              <button className="btn-ghost !py-2" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
