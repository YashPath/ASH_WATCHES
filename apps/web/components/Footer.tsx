import Link from 'next/link';

const LINKS = [['Shipping', '/legal/shipping'], ['Returns', '/legal/returns'], ['Warranty', '/legal/warranty'], ['Privacy', '/legal/privacy'], ['Terms', '/legal/terms'], ['Contact', '/contact']] as const;

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10 py-10 text-sm text-white/70">
      <div className="container-x flex flex-col justify-between gap-6 sm:flex-row">
        <div><p className="font-display text-xl text-white">ASH_</p><p className="mt-1 text-white/60">Considered timepieces. Prices in INR.</p></div>
        <nav aria-label="Store policies"><ul className="flex flex-wrap gap-x-5 gap-y-2">{LINKS.map(([label, href]) => <li key={href}><Link href={href} className="hover:text-gold-300">{label}</Link></li>)}</ul></nav>
      </div>
      <div className="container-x mt-6 text-xs text-white/60"><p>© {new Date().getFullYear()} ASH_ Watches. Pay online with Stripe or cash on delivery.</p></div>
    </footer>
  );
}
