'use client';
import { useState } from 'react';
import { api, apiUpload, formatPrice } from '@/lib/api';

export type AdminVariant = { id: string; sku: string; name: string; price: number; stockQuantity: number };
export type AdminImage = { id: string; url: string; altText: string };

export function ProductMedia({ productId, productName, variants, images, onChange }: { productId: string; productName: string; variants: AdminVariant[]; images: AdminImage[]; onChange: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [v, setV] = useState({ sku: '', name: '', strapMaterial: 'Leather', strapColor: '', dialColor: '', caseMaterial: 'Stainless steel', caseColor: '', price: '', stock: '10' });
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });

  async function addVariant(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api(`/admin/products/${productId}/variants`, { method: 'POST', auth: true, body: { sku: v.sku.trim(), name: v.name.trim(), strapMaterial: v.strapMaterial, strapColor: v.strapColor, dialColor: v.dialColor, caseMaterial: v.caseMaterial, caseColor: v.caseColor, price: Math.round(Number(v.price) * 100), stockQuantity: Math.round(Number(v.stock)) } });
      setV({ ...v, sku: '', name: '', price: '' }); setMsg({ ok: true, text: 'Variant added.' }); onChange();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }
  async function setStockFor(id: string) {
    const n = Number(stock[id]); if (!Number.isInteger(n) || n < 0) return;
    try { await api(`/admin/variants/${id}/inventory`, { method: 'PATCH', auth: true, body: { setTo: n } }); setMsg({ ok: true, text: 'Stock updated.' }); onChange(); } catch (err) { fail(err); }
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const { data } = await apiUpload<{ id: string }>('/admin/uploads/image', 'image', file);
      await api(`/admin/products/${productId}/images/attach`, { method: 'POST', auth: true, body: { assetId: data.id, altText: productName, sortOrder: images.length, isPrimary: images.length === 0 } });
      setMsg({ ok: true, text: 'Photo added.' }); onChange();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  return (
    <div className="mt-8 space-y-8">
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      <section className="card p-6" aria-labelledby="img-h">
        <h2 id="img-h" className="font-display text-2xl">Photos</h2>
        <ul className="mt-4 flex flex-wrap gap-3">{images.map(i => <li key={i.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.url} alt={i.altText} className="h-24 w-24 rounded-lg border border-white/10 object-cover" /></li>)}{images.length === 0 && <li className="text-sm text-white/60">No photos yet. The first one you add becomes the main photo.</li>}</ul>
        <label className="btn-ghost mt-4 cursor-pointer">Add photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={upload} disabled={busy} /></label>
        <p className="mt-2 text-xs text-white/60">JPEG, PNG or WebP. Files are checked and re-encoded on the server.</p>
      </section>
      <section className="card p-6" aria-labelledby="var-h">
        <h2 id="var-h" className="font-display text-2xl">Variants and stock</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.15em] text-white/60"><tr><th className="py-2 pr-4">Variant</th><th className="py-2 pr-4">SKU</th><th className="py-2 pr-4">Price</th><th className="py-2 pr-4">Stock</th><th /></tr></thead>
          <tbody>{variants.map(x => <tr key={x.id} className="border-t border-white/10"><td className="py-3 pr-4">{x.name}</td><td className="py-3 pr-4 text-white/50">{x.sku}</td><td className="py-3 pr-4">{formatPrice(x.price)}</td>
            <td className="py-3 pr-4"><input aria-label={`Stock for ${x.name}`} className="input !w-24 !py-1.5" type="number" min="0" value={stock[x.id] ?? String(x.stockQuantity)} onChange={e => setStock(s => ({ ...s, [x.id]: e.target.value }))} /></td>
            <td className="py-3"><button className="btn-ghost !py-1.5 text-xs" onClick={() => setStockFor(x.id)}>Set stock</button></td></tr>)}
            {variants.length === 0 && <tr><td colSpan={5} className="py-4 text-white/60">No variants yet. A product needs at least one to be bought.</td></tr>}</tbody></table></div>
        <form onSubmit={addVariant} className="mt-6 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <h3 className="font-medium sm:col-span-2 lg:col-span-3">Add a variant</h3>
          {([['sku', 'SKU'], ['name', 'Variant name (e.g. Blue dial / Black strap)'], ['dialColor', 'Dial colour'], ['strapColor', 'Strap colour'], ['strapMaterial', 'Strap material'], ['caseMaterial', 'Case material'], ['caseColor', 'Case colour']] as const).map(([k, label]) => (
            <div key={k}><label className="label" htmlFor={`v-${k}`}>{label}</label><input id={`v-${k}`} className="input" required value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>))}
          <div><label className="label" htmlFor="v-price">Price (₹)</label><input id="v-price" className="input" type="number" min="1" required value={v.price} onChange={e => setV({ ...v, price: e.target.value })} /></div>
          <div><label className="label" htmlFor="v-stock">Opening stock</label><input id="v-stock" className="input" type="number" min="0" required value={v.stock} onChange={e => setV({ ...v, stock: e.target.value })} /></div>
          <div className="flex items-end"><button className="btn-gold w-full" disabled={busy}>Add variant</button></div>
        </form>
      </section>
    </div>
  );
}
