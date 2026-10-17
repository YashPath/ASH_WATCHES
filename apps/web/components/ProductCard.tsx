import Link from 'next/link';
import { WatchThumb } from './WatchThumb';
import { formatPrice, type ProductCardData } from '@/lib/api';

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images.find(i => i.isPrimary) ?? product.images[0];
  const inStock = product.inStock ?? (product.variants ? product.variants.some(v => v.stockQuantity > 0) : true);
  return (
    <Link href={`/product/${product.slug}`} className="group card block overflow-hidden transition hover:border-gold-500/60">
      <div className="relative aspect-square overflow-hidden bg-ink-800">
        {image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image.url} alt={image.altText} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          : <div className="h-full w-full bg-[radial-gradient(circle_at_50%_40%,#1d4a38,#0a1a13)] p-6"><WatchThumb seed={product.slug} /></div>}
        {!inStock && <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white/80">Sold out</span>}
        {product.isFeatured && <span className="absolute right-3 top-3 rounded-full bg-gold-500 px-3 py-1 text-xs font-medium text-ink-950">Featured</span>}
      </div>
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">{product.brand.name}</p>
        <h3 className="mt-1 font-display text-xl">{product.name}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-gold-300">{formatPrice(product.basePrice)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.basePrice && <span className="text-sm text-white/50 line-through">{formatPrice(product.compareAtPrice)}</span>}
        </div>
      </div>
    </Link>
  );
}
