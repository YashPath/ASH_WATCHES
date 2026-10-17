'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type AdminProductFull = {
  id: string; name: string; slug: string; sku: string; brandId: string; categoryId: string; shortDescription: string | null; description: string;
  gender: string; movement: string; caseSizeMm: string | number; caseThicknessMm: string | number | null; waterResistanceM: number;
  basePrice: number; compareAtPrice: number | null; status: string; isFeatured: boolean; tags: string[];
};
type Opt = { id: string; name: string };

const slugify = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const rupees = (paise: number | null | undefined) => (paise ? String(paise / 100) : '');

export function ProductForm({ product }: { product?: AdminProductFull }) {
  const router = useRouter();
  const [brands, setBrands] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [f, setF] = useState({
    name: product?.name ?? '', slug: product?.slug ?? '', sku: product?.sku ?? '', brandId: product?.brandId ?? '', categoryId: product?.categoryId ?? '',
    shortDescription: product?.shortDescription ?? '', description: product?.description ?? '', gender: product?.gender ?? 'UNISEX', movement: product?.movement ?? 'QUARTZ',
    caseSizeMm: product ? String(Number(product.caseSizeMm)) : '40', caseThicknessMm: product?.caseThicknessMm ? String(Number(product.caseThicknessMm)) : '', waterResistanceM: String(product?.waterResistanceM ?? 30),
    basePrice: rupees(product?.basePrice), compareAtPrice: rupees(product?.compareAtPrice), status: product?.status ?? 'DRAFT', isFeatured: product?.isFeatured ?? false, tags: product?.tags.join(', ') ?? ''
  });
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(cur => ({ ...cur, [k]: v }));

  useEffect(() => { api<{ brands: Opt[]; categories: Opt[] }>('/admin/catalog', { auth: true }).then(r => { setBrands(r.data.brands); setCategories(r.data.categories); }).catch(() => undefined); }, []);

  async function addOption(kind: 'brands' | 'categories') {
    const name = (kind === 'brands' ? newBrand : newCategory).trim(); if (name.length < 2) return;
    try {
      const { data } = await api<Opt>(`/admin/${kind}`, { method: 'POST', auth: true, body: { name } });
      if (kind === 'brands') { setBrands(b => [...b.filter(x => x.id !== data.id), data]); set('brandId', data.id); setNewBrand(''); }
      else { setCategories(c => [...c.filter(x => x.id !== data.id), data]); set('categoryId', data.id); setNewCategory(''); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not add' }); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const toPaise = (v: string) => Math.round(Number(v) * 100);
    const body = {
      brandId: f.brandId, categoryId: f.categoryId, name: f.name.trim(), slug: f.slug, sku: f.sku.trim(), shortDescription: f.shortDescription.trim() || undefined, description: f.description,
      gender: f.gender, movement: f.movement, caseSizeMm: Number(f.caseSizeMm), caseThicknessMm: f.caseThicknessMm ? Number(f.caseThicknessMm) : undefined, waterResistanceM: Math.round(Number(f.waterResistanceM)),
      basePrice: toPaise(f.basePrice), compareAtPrice: f.compareAtPrice ? toPaise(f.compareAtPrice) : undefined, status: f.status, isFeatured: f.isFeatured,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean)
    };
    try {
      if (product) { await api(`/admin/products/${product.id}`, { method: 'PATCH', auth: true, body }); setMsg({ ok: true, text: 'Saved.' }); }
      else { const { data } = await api<{ id: string }>('/admin/products', { method: 'POST', auth: true, body }); router.push(`/admin/products/${data.id}?created=1`); }
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save' }); } finally { setBusy(false); }
  }

  const Field = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => <div><label className="label" htmlFor={id}>{label}</label>{children}</div>;
  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="p-name" label="Name"><input id="p-name" className="input" required minLength={2} maxLength={180} value={f.name} onChange={e => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} /></Field>
        <Field id="p-slug" label="URL slug"><input id="p-slug" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} /></Field>
        <Field id="p-sku" label="SKU"><input id="p-sku" className="input" required minLength={2} maxLength={80} value={f.sku} onChange={e => set('sku', e.target.value)} /></Field>
        <Field id="p-status" label="Status"><select id="p-status" className="input" value={f.status} onChange={e => set('status', e.target.value)}><option value="DRAFT">Draft (hidden)</option><option value="ACTIVE">Active (visible)</option><option value="ARCHIVED">Archived</option></select></Field>
        <Field id="p-brand" label="Brand"><select id="p-brand" className="input" required value={f.brandId} onChange={e => set('brandId', e.target.value)}><option value="" disabled>Select…</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <div className="mt-2 flex gap-2"><input aria-label="New brand name" className="input !py-2" placeholder="Or add a new brand" value={newBrand} onChange={e => setNewBrand(e.target.value)} /><button type="button" className="btn-ghost !py-2" onClick={() => addOption('brands')}>Add</button></div></Field>
        <Field id="p-cat" label="Category"><select id="p-cat" className="input" required value={f.categoryId} onChange={e => set('categoryId', e.target.value)}><option value="" disabled>Select…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <div className="mt-2 flex gap-2"><input aria-label="New category name" className="input !py-2" placeholder="Or add a new category" value={newCategory} onChange={e => setNewCategory(e.target.value)} /><button type="button" className="btn-ghost !py-2" onClick={() => addOption('categories')}>Add</button></div></Field>
        <Field id="p-gender" label="For"><select id="p-gender" className="input" value={f.gender} onChange={e => set('gender', e.target.value)}><option value="MEN">Men</option><option value="WOMEN">Women</option><option value="UNISEX">Unisex</option></select></Field>
        <Field id="p-move" label="Movement"><select id="p-move" className="input" value={f.movement} onChange={e => set('movement', e.target.value)}>{['QUARTZ', 'AUTOMATIC', 'MANUAL', 'SOLAR', 'SMART'].map(m => <option key={m} value={m}>{m[0]}{m.slice(1).toLowerCase()}</option>)}</select></Field>
        <Field id="p-size" label="Case size (mm)"><input id="p-size" className="input" type="number" step="0.5" min="10" max="80" required value={f.caseSizeMm} onChange={e => set('caseSizeMm', e.target.value)} /></Field>
        <Field id="p-thick" label="Thickness (mm, optional)"><input id="p-thick" className="input" type="number" step="0.1" min="1" max="30" value={f.caseThicknessMm} onChange={e => set('caseThicknessMm', e.target.value)} /></Field>
        <Field id="p-wr" label="Water resistance (m)"><input id="p-wr" className="input" type="number" min="0" max="10000" required value={f.waterResistanceM} onChange={e => set('waterResistanceM', e.target.value)} /></Field>
        <Field id="p-price" label="Base price (₹)"><input id="p-price" className="input" type="number" min="1" step="1" required value={f.basePrice} onChange={e => set('basePrice', e.target.value)} /></Field>
        <Field id="p-cmp" label="Compare-at price (₹, optional)"><input id="p-cmp" className="input" type="number" min="1" step="1" value={f.compareAtPrice} onChange={e => set('compareAtPrice', e.target.value)} /></Field>
        <Field id="p-tags" label="Tags (comma separated)"><input id="p-tags" className="input" value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="dress, gift, automatic" /></Field>
      </div>
      <Field id="p-short" label="Short description"><input id="p-short" className="input" maxLength={500} value={f.shortDescription} onChange={e => set('shortDescription', e.target.value)} /></Field>
      <Field id="p-desc" label="Description"><textarea id="p-desc" className="input min-h-32" required minLength={10} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.isFeatured} onChange={e => set('isFeatured', e.target.checked)} /> Show on the home page as featured</label>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
      <button className="btn-gold" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}</button>
    </form>
  );
}
