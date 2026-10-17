'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ProductForm, type AdminProductFull } from '@/components/admin/ProductForm';
import { ProductMedia, type AdminImage, type AdminVariant } from '@/components/admin/ProductMedia';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Full = AdminProductFull & { variants: AdminVariant[]; images: AdminImage[] };

function Editor() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get('created');
  const { user, loading } = useAuth();
  const [product, setProduct] = useState<Full | null | undefined>(undefined);
  const isAdmin = !!user && user.role !== 'CUSTOMER';
  const load = useCallback(() => api<Full[]>('/admin/products', { auth: true }).then(r => setProduct(r.data.find(p => p.id === id) ?? null)).catch(() => setProduct(null)), [id]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  if (loading) return <div className="container-x py-16 text-white/50">Loading…</div>;
  if (!isAdmin) return <div className="container-x py-24 text-center"><p className="text-white/60">This area is for administrators.</p><Link href="/login" className="btn-gold mt-6">Sign in</Link></div>;
  if (product === undefined) return <div className="container-x py-16"><div className="card h-64 animate-pulse" /></div>;
  if (product === null) return <div className="container-x py-24 text-center text-white/60">Product not found. <Link href="/admin" className="text-gold-400">Back</Link></div>;
  return (
    <div className="container-x max-w-4xl py-10">
      <Link href="/admin" className="text-sm text-white/50 hover:text-gold-300">← Administration</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><h1 className="font-display text-4xl">{product.name}</h1>{product.status === 'ACTIVE' && <Link href={`/product/${product.slug}`} className="btn-ghost !py-2">View in shop</Link>}</div>
      {created && <p role="status" className="mt-3 text-sm text-emerald-300">Product created. Now add at least one variant and a photo, then set the status to Active to publish it.</p>}
      <div className="mt-6"><ProductForm product={product} /></div>
      <ProductMedia productId={product.id} productName={product.name} variants={product.variants} images={product.images} onChange={load} />
    </div>
  );
}
export default function Page() { return <Suspense fallback={<div className="container-x py-16 text-white/50">Loading…</div>}><Editor /></Suspense>; }
