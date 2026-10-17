import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-x py-28 text-center">
      <p className="text-sm uppercase tracking-[0.25em] text-white/60">Error 404</p>
      <h1 className="mt-3 font-display text-5xl">This page is not here</h1>
      <p className="mt-4 text-white/60">The link may be old or mistyped.</p>
      <Link href="/shop" className="btn-gold mt-8">Browse watches</Link>
    </div>
  );
}
