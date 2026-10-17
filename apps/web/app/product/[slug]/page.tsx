'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, formatPrice, type ProductCardData, type ProductDetail } from '@/lib/api';
import dynamic from 'next/dynamic';
const WatchCanvas = dynamic(() => import('@/components/WatchCanvas').then(m => m.WatchCanvas), { ssr: false, loading: () => <div className="h-full min-h-[320px] w-full animate-pulse rounded-2xl bg-ink-800" aria-hidden /> });
import { ProductCard } from '@/components/ProductCard';
import { colorFromName, watchStyleFor } from '@/lib/colors';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { ReviewForm } from '@/components/ReviewForm';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const cart = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [similar, setSimilar] = useState<ProductCardData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [view, setView] = useState<'3d' | 'photos'>('3d');
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [wished, setWished] = useState(false);

  useEffect(() => {
    let alive = true;
    setProduct(null); setError(null);
    api<ProductDetail>(`/products/${encodeURIComponent(slug)}`).then(r => { if (!alive) return; setProduct(r.data); setVariantId(r.data.variants.find(v => v.stockQuantity > 0)?.id ?? r.data.variants[0]?.id ?? null); })
      .catch(e => alive && setError(e instanceof ApiError && e.status === 404 ? 'This watch is not available.' : 'Could not load this watch.'));
    api<ProductCardData[]>(`/products/${encodeURIComponent(slug)}/similar`).then(r => alive && setSimilar(r.data)).catch(() => undefined);
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!user || !product) { setWished(false); return; }
    let alive = true;
    api<Array<{ productId: string }>>('/wishlist', { auth: true }).then(r => alive && setWished(r.data.some(i => i.productId === product.id))).catch(() => undefined);
    return () => { alive = false; };
  }, [user, product]);

  const variant = useMemo(() => product?.variants.find(v => v.id === variantId) ?? null, [product, variantId]);
  if (error) return <div className="container-x py-24 text-center"><p className="text-white/60">{error}</p><Link href="/shop" className="btn-ghost mt-6">Back to shop</Link></div>;
  if (!product) return <div className="container-x py-16"><div className="card h-[560px] animate-pulse" /></div>;

  const model = product.models3D[0];
  const price = variant?.price ?? product.basePrice;
  const rating = product.reviews.length ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length : null;

  async function addToCart() {
    if (!variant) return;
    if (!user) { router.push(`/login?next=/product/${product!.slug}`); return; }
    setBusy(true); setNotice(null);
    try { await cart.add(variant.id, 1); setNotice({ kind: 'ok', text: 'Added to your cart.' }); }
    catch (e) { setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Could not add to cart.' }); }
    finally { setBusy(false); }
  }

  async function toggleWish() {
    if (!user) { router.push(`/login?next=/product/${product!.slug}`); return; }
    const next = !wished; setWished(next);
    try { if (next) await api('/wishlist', { method: 'POST', auth: true, body: { productId: product!.id } }); else await api(`/wishlist/${product!.id}`, { method: 'DELETE', auth: true }); }
    catch { setWished(!next); setNotice({ kind: 'err', text: 'Could not update your wishlist.' }); }
  }

  const specs: Array<[string, string]> = [
    ['Movement', product.movement[0] + product.movement.slice(1).toLowerCase()], ['Case size', `${Number(product.caseSizeMm)} mm`],
    ...(product.caseThicknessMm ? [['Thickness', `${Number(product.caseThicknessMm)} mm`] as [string, string]] : []),
    ['Water resistance', `${product.waterResistanceM} m`], ...(product.crystal ? [['Crystal', product.crystal] as [string, string]] : []),
    ...(product.powerReserveHours ? [['Power reserve', `${product.powerReserveHours} h`] as [string, string]] : [])
  ];

  return (
    <div className="container-x py-10">
      <nav className="mb-6 text-sm text-white/60"><Link href="/shop" className="hover:text-gold-300">Shop</Link> / {product.brand.name}</nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="card relative overflow-hidden">
            {view === '3d'
              ? <WatchCanvas className="h-[460px] w-full sm:h-[560px]" dial={colorFromName(variant?.dialColor)} caseColor={colorFromName(variant?.caseColor, '#c9ccd1')} strap={colorFromName(variant?.strapColor)} glbUrl={model?.glbUrl ?? null} watchStyle={watchStyleFor(product)} explodable />
              : product.images[photo]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={product.images[photo]!.url} alt={product.images[photo]!.altText} className="h-[460px] w-full object-cover sm:h-[560px]" />
                : <div className="flex h-[460px] items-center justify-center text-white/60 sm:h-[560px]">No photos yet</div>}
            <div className="absolute left-4 top-4 flex gap-2 text-xs" role="tablist" aria-label="Media">
              <button role="tab" aria-selected={view === '3d'} onClick={() => setView('3d')} className={`rounded-full px-4 py-1.5 ${view === '3d' ? 'bg-gold-500 text-ink-950' : 'bg-black/50 text-white/70'}`}>3D view</button>
              <button role="tab" aria-selected={view === 'photos'} onClick={() => setView('photos')} className={`rounded-full px-4 py-1.5 ${view === 'photos' ? 'bg-gold-500 text-ink-950' : 'bg-black/50 text-white/70'}`}>Photos</button>
            </div>
            {view === '3d' && <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-white/60">Drag to rotate · zoom in to see the parts separate{!model && ' · illustrative model'}</p>}
          </div>
          {view === 'photos' && product.images.length > 1 && (
            <ul className="mt-3 flex gap-2">{product.images.map((im, i) => <li key={im.url}><button onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`h-16 w-16 overflow-hidden rounded-lg border ${photo === i ? 'border-gold-400' : 'border-white/10'}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={im.url} alt="" className="h-full w-full object-cover" /></button></li>)}</ul>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">{product.brand.name} · {product.category.name}</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">{product.name}</h1>
          {rating && <p className="mt-2 text-sm text-gold-400">{'★'.repeat(Math.round(rating))}<span className="text-white/20">{'★'.repeat(5 - Math.round(rating))}</span> <span className="text-white/60">({product.reviews.length})</span></p>}
          <p className="mt-5 text-3xl text-gold-300">{formatPrice(price)} {product.compareAtPrice && product.compareAtPrice > price && <span className="ml-2 text-base text-white/50 line-through">{formatPrice(product.compareAtPrice)}</span>}</p>
          <p className="mt-5 leading-relaxed text-white/70">{product.description}</p>

          {product.variants.length > 0 && (
            <fieldset className="mt-8"><legend className="label">Choose a variant</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map(v => (
                  <button key={v.id} onClick={() => setVariantId(v.id)} disabled={v.stockQuantity === 0} aria-pressed={variantId === v.id}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${variantId === v.id ? 'border-gold-400 bg-gold-500/10 text-gold-300' : 'border-white/15 text-white/70 hover:border-white/40'} disabled:opacity-40`}>
                    <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: colorFromName(v.dialColor) }} />{v.name}{v.stockQuantity === 0 && ' (sold out)'}
                  </button>
                ))}
              </div>
              {variant && <p className="mt-3 text-xs text-white/60">{variant.strapMaterial} strap, {variant.strapColor} · {variant.caseMaterial} case · {variant.dialColor} dial{variant.stockQuantity > 0 && variant.stockQuantity <= 5 ? ` · Only ${variant.stockQuantity} left` : ''}</p>}
            </fieldset>
          )}

          <div className="mt-8 flex gap-3">
            <button className="btn-gold flex-1" disabled={busy || !variant || variant.stockQuantity === 0} onClick={addToCart}>{!variant || variant.stockQuantity === 0 ? 'Sold out' : busy ? 'Adding…' : 'Add to cart'}</button>
            <button type="button" onClick={toggleWish} aria-pressed={wished} aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'} className={`btn-ghost !px-4 text-xl ${wished ? '!border-gold-400 text-gold-300' : ''}`}>{wished ? '♥' : '♡'}</button>
          </div>
          {notice && <p role="status" className={`mt-3 text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{notice.text} {notice.kind === 'ok' && <Link href="/cart" className="underline">View cart</Link>}</p>}

          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-sm">
            {specs.map(([k, v]) => <div key={k} className="bg-ink-900 p-4"><dt className="text-xs uppercase tracking-[0.15em] text-white/60">{k}</dt><dd className="mt-1">{v}</dd></div>)}
          </dl>
        </div>
      </div>

      <section className="mt-16"><h2 className="font-display text-3xl">Reviews</h2>
        {product.reviews.length === 0 && <p className="mt-4 text-sm text-white/50">No reviews yet.</p>}
        <ReviewForm productId={product.id} signedIn={!!user} />
          <ul className="mt-6 grid gap-4 md:grid-cols-2">{product.reviews.map(r => (
            <li key={r.id} className="card p-5"><p className="text-gold-400">{'★'.repeat(r.rating)}</p>{r.title && <p className="mt-1 font-medium">{r.title}</p>}<p className="mt-1 text-sm text-white/60">{r.body}</p>
              <p className="mt-3 text-xs text-white/50">{r.user.firstName}{r.isVerified && ' · Verified purchase'}</p></li>))}</ul></section>
      {similar.length > 0 && (
        <section className="mt-16"><h2 className="font-display text-3xl">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">{similar.slice(0, 4).map(p => <ProductCard key={p.id} product={p} />)}</div></section>
      )}
    </div>
  );
}
