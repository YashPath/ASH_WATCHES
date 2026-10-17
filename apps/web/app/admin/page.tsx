'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminOrders } from '@/components/admin/AdminOrders';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminReviews } from '@/components/admin/AdminReviews';

type Status = { enabled: boolean; provider: { id: string; kind: string }; chroma: { reachable: boolean; circuitOpen: boolean; collection: string }; activeProducts: number; indexed: number | null; inSync: boolean; queue: Record<string, number> | null };
type AdminProduct = { id: string; name: string; slug: string; status: string; basePrice: number; brand: { name: string }; variants: Array<{ stockQuantity: number }> };

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, p] = await Promise.all([api<Status>('/admin/search/status', { auth: true }), api<AdminProduct[]>('/admin/products', { auth: true })]);
      setStatus(s.data); setProducts(p.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load admin data'); }
  }, []);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!isAdmin) return <div className="container-x py-24 text-center"><p className="text-white/60">This area is for administrators.</p><Link href="/login?next=/admin" className="btn-gold mt-6">Sign in</Link></div>;

  async function reindex() {
    setMessage(null);
    try { await api('/admin/search/reindex', { method: 'POST', auth: true, body: {} }); setMessage('Reindex queued. Refresh the status in a moment.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not queue reindex'); }
  }

  return (
    <div className="container-x py-10">
      <h1 className="font-display text-4xl">Administration</h1>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <AdminStats />
      <section className="card mt-8 p-6" aria-labelledby="search-h">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="search-h" className="font-display text-2xl">Search index</h2>
          <div className="flex gap-2"><button className="btn-ghost !py-2" onClick={load}>Refresh</button><button className="btn-gold !py-2" onClick={reindex}>Rebuild index</button></div></div>
        {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
        {status && (
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><dt className="label">Vector store</dt><dd className={status.chroma.reachable ? 'text-emerald-300' : 'text-red-300'}>{status.chroma.reachable ? 'Reachable' : 'Unreachable'}{status.chroma.circuitOpen && ' (breaker open)'}</dd></div>
            <div><dt className="label">Embeddings</dt><dd>{status.provider.id}<span className="block text-xs text-white/60">{status.provider.kind === 'lexical' ? 'keyword-style, not semantic' : 'semantic'}</span></dd></div>
            <div><dt className="label">Indexed / active</dt><dd className={status.inSync ? 'text-emerald-300' : 'text-amber-300'}>{status.indexed ?? '–'} / {status.activeProducts}</dd></div>
            <div><dt className="label">Queue</dt><dd>{status.queue ? Object.entries(status.queue).map(([k, v]) => `${k} ${v}`).join(' · ') : '–'}</dd></div>
          </dl>
        )}
      </section>
      <section className="mt-8" aria-labelledby="prod-h">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="prod-h" className="font-display text-2xl">Products</h2><Link href="/admin/products/new" className="btn-gold !py-2">+ Add product</Link></div>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.15em] text-white/60"><tr><th className="p-4">Name</th><th className="p-4">Brand</th><th className="p-4">Status</th><th className="p-4">Price</th><th className="p-4">Stock</th><th className="p-4" /></tr></thead>
            <tbody>{(products ?? []).map(p => <tr key={p.id} className="border-t border-white/10"><td className="p-4"><Link href={`/product/${p.slug}`} className="hover:text-gold-300">{p.name}</Link></td><td className="p-4 text-white/60">{p.brand.name}</td><td className="p-4">{p.status}</td><td className="p-4">{formatPrice(p.basePrice)}</td><td className="p-4">{p.variants.reduce((n, v) => n + v.stockQuantity, 0)}</td><td className="p-4 text-right"><Link href={`/admin/products/${p.id}`} className="text-gold-400 hover:text-gold-300">Edit</Link></td></tr>)}
              {products?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-white/60">No products yet.</td></tr>}</tbody></table>
        </div>
      </section>
      <AdminOrders />
      <AdminReviews />
    </div>
  );
}
